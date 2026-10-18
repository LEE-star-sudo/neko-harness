import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_STORAGE_PATH, normalizeWorkspace } from "@neko-harness/core";
import { installedVersion } from "@neko-harness/core/application-updates";
import { ApplicationProtocolError, RUNNING_VERSION } from "@neko-harness/core/application-version";
import { connectNekoGateway, readGatewayPortFile } from "@neko-harness/gateway";
import { ensureNekoGateway, type GatewayEnsureOptions, type GatewayHandle } from "./gateway-spawn.ts";
import { createMobileAdminContext, handleMobileAdminRequest, type MobileAdminProxyContext } from "./mobile-admin.ts";
import { handleOpenRequest } from "./open-api.ts";
import { createOpenService, type OpenService } from "./open-target.ts";

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
	readonly versionOptions?: { runningVersion?: string; manifest?: string };
	readonly gateway?: Omit<GatewayEnsureOptions, "storagePath" | "signal"> & { readonly storagePath?: string };
	/** 启动阶段被中断（如 Ctrl+C）时终止已拉起的 gateway 并放弃启动。 */
	readonly signal?: AbortSignal;
	/** 打开工作区的本机启动能力；默认探测系统，测试可注入。 */
	readonly openService?: OpenService;
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
const DEFAULT_STATIC_DIR = fileURLToPath(
	new URL(process.env.NEKO_RELEASE_BUILD === "1" ? "./client" : "../dist/client", import.meta.url),
);

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
	const workspaceRoot = normalizeWorkspace(options.gateway?.cwd ?? process.cwd());
	const storagePath = options.gateway?.storagePath ?? DEFAULT_STORAGE_PATH;
	const gateway = await ensureNekoGateway({
		...(options.gateway ?? {}),
		storagePath,
		...(options.signal !== undefined ? { signal: options.signal } : {}),
	});

	const openService = options.openService ?? createOpenService();
	let mobileAdmin: MobileAdminProxyContext | undefined;
	let closing: Promise<void> | undefined;
	const server: Server = createServer((request, response) => {
		const context = mobileAdmin;
		if (context === undefined) {
			response.writeHead(503, { "cache-control": "no-store" });
			response.end("web server starting");
			return;
		}
		void handleHttp(request, response, {
			staticDir,
			gateway,
			workspaceRoot,
			storagePath,
			versionOptions: options.versionOptions,
			mobileAdmin: context,
			openService,
		}).catch((error: unknown) => {
			if (!response.headersSent) response.writeHead(500);
			response.end(error instanceof Error ? error.message : String(error));
		});
	});
	const sockets = new Set<Socket>();
	server.on("connection", (socket) => {
		sockets.add(socket);
		socket.once("close", () => sockets.delete(socket));
	});
	const port = options.port ?? DEFAULT_PORT;
	const host = options.host ?? DEFAULT_HOST;
	try {
		await new Promise<void>((resolveListen, rejectListen) => {
			server.once("error", rejectListen);
			server.listen(port, host, resolveListen);
		});
	} catch (error) {
		// 端口被占用等启动失败时不得遗留自己拉起的 gateway。
		await gateway.close().catch(() => undefined);
		throw error;
	}
	const address = server.address();
	const actualPort = typeof address === "object" && address !== null ? address.port : port;
	mobileAdmin = createMobileAdminContext({
		gateway,
		nekoDir: dirname(storagePath),
		webHost: host,
		webPort: actualPort,
	});

	return {
		url: `http://${host === "0.0.0.0" ? "127.0.0.1" : host === "::" ? "[::1]" : host.includes(":") && !host.startsWith("[") ? `[${host}]` : host}:${actualPort}`,
		port: actualPort,
		gateway,
		close() {
			closing ??= (async () => {
				mobileAdmin?.caller.abortAll?.();
				const closed = new Promise<void>((resolveClose) => server.close(() => resolveClose()));
				// 空闲 keep-alive 与进行中的请求都不应拖住退出。
				for (const socket of sockets) socket.destroy();
				await closed;
				await gateway.close();
			})();
			return closing;
		},
	};
}

async function handleHttp(
	request: IncomingMessage,
	response: ServerResponse,
	info: {
		staticDir: string;
		gateway: GatewayHandle;
		workspaceRoot: string;
		storagePath: string;
		versionOptions?: { runningVersion?: string; manifest?: string };
		mobileAdmin: MobileAdminProxyContext;
		openService: OpenService;
	},
): Promise<void> {
	if (await handleMobileAdminRequest(request, response, info.mobileAdmin)) return;
	if (await handleOpenRequest(request, response, info.mobileAdmin, info.openService)) return;
	const url = new URL(request.url ?? "/", "http://localhost");
	if (url.pathname === "/api/info") {
		const wsUrl =
			process.platform === "win32"
				? await readGatewayPortFile(dirname(info.storagePath), info.gateway.serverId)
				: info.gateway.wsUrl;
		if (!wsUrl) {
			response.writeHead(503, { "cache-control": "no-store" });
			response.end("Gateway unavailable");
			return;
		}
		let protocolCompatible = true;
		try {
			const probe = await connectNekoGateway(
				{ transport: "ws", url: wsUrl, serverId: info.gateway.serverId },
				AbortSignal.timeout(5000),
			);
			await probe.close();
		} catch (error) {
			if (error instanceof ApplicationProtocolError) protocolCompatible = false;
			else throw error;
		}
		response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
		response.end(
			JSON.stringify({
				gatewayWs: wsUrl,
				protocolCompatible,
				webVersion: info.versionOptions?.runningVersion ?? RUNNING_VERSION,
				installedVersion: await installedVersion(info.versionOptions?.manifest),
				workspaceRoot: info.workspaceRoot,
				serverId: info.gateway.serverId,
				socketPath: info.gateway.socketPath,
				gatewaySpawned: info.gateway.spawned !== null,
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
		...(extname(file) === ".html" ? { "cache-control": "no-store" } : {}),
	});
	if (method === "HEAD") {
		response.end();
		return;
	}
	await new Promise<void>((resolvePipe, rejectPipe) => {
		createReadStream(file).on("error", rejectPipe).on("end", resolvePipe).pipe(response);
	});
}
