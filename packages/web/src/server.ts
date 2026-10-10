import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_STORAGE_PATH } from "@neko-harness/core";
import { ensureNekoGateway, type GatewayEnsureOptions, type GatewayHandle } from "./gateway-spawn.ts";

/**
 * neko web 服务器（静态托管形态）：确保 gateway 在运行（不在则 spawn 子进程），
 * 浏览器经 /api/info 拿到 gateway WebSocket 地址后直连 pi 协议（design D3），
 * 本进程只提供静态资源与网关发现信息。
 */

export type NekoWebOptions = {
	/** 静态 HTTP 监听端口；默认 8322。传 0 随机分配（以返回值为准）。 */
	readonly port?: number;
	readonly host?: string;
	/** 静态资源目录；默认 <packages/web>/dist/client（Vite 产物）。 */
	readonly staticDir?: string;
	/** 网关选项（默认 ~/.neko/neko.sqlite 数据目录）。 */
	readonly gateway?: Omit<GatewayEnsureOptions, "storagePath"> & { readonly storagePath?: string };
};

export type NekoWebServer = {
	readonly url: string;
	readonly port: number;
	readonly gateway: GatewayHandle;
	close(): Promise<void>;
};

const DEFAULT_PORT = 8322;
const DEFAULT_HOST = "127.0.0.1";
/** src/ 与 dist/ 下都解析到 packages/web/dist/client。 */
const DEFAULT_STATIC_DIR = fileURLToPath(new URL("../dist/client", import.meta.url));

const MIME: Readonly<Record<string, string>> = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".ico": "image/x-icon",
	".woff2": "font/woff2",
	".map": "application/json; charset=utf-8",
};

export async function startWebServer(options: NekoWebOptions = {}): Promise<NekoWebServer> {
	const staticDir = resolve(options.staticDir ?? DEFAULT_STATIC_DIR);
	const gateway = await ensureNekoGateway({
		...(options.gateway ?? {}),
		storagePath: options.gateway?.storagePath ?? DEFAULT_STORAGE_PATH,
	});

	const server: Server = createServer((request, response) => {
		void handleHttp(request, response, { staticDir, gateway }).catch((error: unknown) => {
			if (!response.headersSent) response.writeHead(500);
			response.end(error instanceof Error ? error.message : String(error));
		});
	});
	const port = options.port ?? DEFAULT_PORT;
	const host = options.host ?? DEFAULT_HOST;
	await new Promise<void>((resolveListen, rejectListen) => {
		server.once("error", rejectListen);
		server.listen(port, host, resolveListen);
	});
	const address = server.address();
	const actualPort = typeof address === "object" && address !== null ? address.port : port;

	return {
		url: `http://${host}:${actualPort}`,
		port: actualPort,
		gateway,
		async close() {
			await new Promise<void>((resolveClose, rejectClose) => {
				server.close((error) => (error ? rejectClose(error) : resolveClose()));
			});
			await gateway.close();
		},
	};
}

async function handleHttp(
	request: IncomingMessage,
	response: ServerResponse,
	info: { staticDir: string; gateway: GatewayHandle },
): Promise<void> {
	const url = new URL(request.url ?? "/", "http://localhost");
	if (url.pathname === "/api/info") {
		response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
		response.end(
			JSON.stringify({
				gatewayWs: info.gateway.wsUrl,
				serverId: info.gateway.serverId,
				socketPath: info.gateway.socketPath,
			}),
		);
		return;
	}
	if (request.method !== "GET" && request.method !== "HEAD") {
		response.writeHead(405);
		response.end();
		return;
	}
	await serveStatic(url.pathname, request.method, response, info.staticDir);
}

/** SPA 静态托管：优先精确文件，无扩展名路径回退 index.html。 */
async function serveStatic(
	pathname: string,
	method: string | undefined,
	response: ServerResponse,
	staticDir: string,
): Promise<void> {
	const cleanPath = decodeURIComponent(pathname);
	const candidate = resolve(staticDir, `.${cleanPath}`);
	if (candidate !== staticDir && !candidate.startsWith(staticDir + sep)) {
		response.writeHead(403);
		response.end();
		return;
	}
	let file = candidate;
	let stats = await stat(file).catch(() => undefined);
	if (stats?.isDirectory()) {
		file = resolve(file, "index.html");
		stats = await stat(file).catch(() => undefined);
	}
	if (stats === undefined && extname(candidate) === "") {
		// SPA 路由回退
		file = resolve(staticDir, "index.html");
		stats = await stat(file).catch(() => undefined);
	}
	if (stats === undefined) {
		response.writeHead(404);
		response.end("not found");
		return;
	}
	response.writeHead(200, {
		"content-type": MIME[extname(file)] ?? "application/octet-stream",
		"content-length": stats.size,
	});
	if (method === "HEAD") {
		response.end();
		return;
	}
	await new Promise<void>((resolvePipe, rejectPipe) => {
		createReadStream(file).on("error", rejectPipe).on("end", resolvePipe).pipe(response);
	});
}
