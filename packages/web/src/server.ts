import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { AttachedReplicatedState } from "@earendil-works/chord";
import type { ConversationView } from "@earendil-works/pi-durable";
import { createNekoRuntime, type NekoModelRef, type NekoRuntime } from "@neko-harness/core";
import { WebSocket, WebSocketServer } from "ws";
import { projectChatView } from "./project.ts";
import type { ClientMessage, ServerMessage } from "./protocol.ts";

export type NekoWebOptions = {
	/** 监听端口；默认 8321。传 0 则随机分配（以返回值为准）。 */
	readonly port?: number;
	/** 监听地址；默认 127.0.0.1（仅本机）。 */
	readonly host?: string;
	/** 会话工具的工作目录；默认 process.cwd()。 */
	readonly cwd?: string;
	/** SQLite 存储路径；默认 ~/.neko/neko.sqlite。 */
	readonly storagePath?: string;
	/** 运行模型；默认内置 DeepSeek 模型。 */
	readonly model?: NekoModelRef;
	/** 静态资源目录；默认 <packages/web>/dist/client（Vite 产物）。 */
	readonly staticDir?: string;
};

export type NekoWebServer = {
	readonly url: string;
	readonly port: number;
	close(): Promise<void>;
};

const DEFAULT_PORT = 8321;
const DEFAULT_HOST = "127.0.0.1";
/** src/ 与 dist/ 下都解析到 packages/web/dist/client。 */
const DEFAULT_STATIC_DIR = fileURLToPath(new URL("../dist/client", import.meta.url));
/** 同一 tick 内多次 commit 合并为一次广播。 */
const BROADCAST_COALESCE_MS = 80;

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

/**
 * 启动 neko web 服务器：一个进程同时托管 Vite 构建产物（静态资源 + /api/info）
 * 与 /ws WebSocket（桥接 core runtime 的 root conversation，v1 单会话）。
 */
export async function startWebServer(options: NekoWebOptions = {}): Promise<NekoWebServer> {
	const cwd = options.cwd ?? process.cwd();
	const model: NekoModelRef = options.model ?? { provider: "deepseek", modelId: "deepseek-flash" };
	const modelLabel = `${model.provider}/${model.modelId}`;
	const staticDir = resolve(options.staticDir ?? DEFAULT_STATIC_DIR);

	const runtime = await createNekoRuntime({
		cwd,
		...(options.storagePath !== undefined ? { storagePath: options.storagePath } : {}),
		model,
	});
	try {
		return await bind(runtime, { ...options, cwd, model, modelLabel, staticDir });
	} catch (error) {
		await runtime.close().catch(() => {});
		throw error;
	}
}

type BindOptions = NekoWebOptions & { cwd: string; model: NekoModelRef; modelLabel: string; staticDir: string };

async function bind(runtime: NekoRuntime, options: BindOptions): Promise<NekoWebServer> {
	const view: AttachedReplicatedState<ConversationView> = await runtime.viewState();
	const sockets = new Set<WebSocket>();
	let coalesceTimer: ReturnType<typeof setTimeout> | undefined;
	let closed = false;

	const broadcast = (message: ServerMessage): void => {
		const data = JSON.stringify(message);
		for (const socket of sockets) {
			if (socket.readyState === WebSocket.OPEN) socket.send(data);
		}
	};
	const currentView = () => projectChatView(view.value, options.modelLabel, options.cwd);
	const scheduleBroadcast = (): void => {
		if (coalesceTimer !== undefined || closed) return;
		coalesceTimer = setTimeout(() => {
			coalesceTimer = undefined;
			if (!closed) broadcast({ type: "snapshot", view: currentView() });
		}, BROADCAST_COALESCE_MS);
	};
	const unsubscribe = view.subscribe(scheduleBroadcast);

	const wss = new WebSocketServer({ noServer: true });
	wss.on("connection", (socket) => {
		sockets.add(socket);
		socket.send(JSON.stringify({ type: "hello", model: options.modelLabel, cwd: options.cwd } satisfies ServerMessage));
		socket.send(JSON.stringify({ type: "snapshot", view: currentView() } satisfies ServerMessage));
		socket.on("message", (raw) => {
			let message: ClientMessage;
			try {
				message = JSON.parse(String(raw)) as ClientMessage;
			} catch {
				return;
			}
			if (message.type === "submit") {
				if (typeof message.content !== "string" || message.content.trim() === "") return;
				runtime.submit(message.content).catch((error: unknown) => {
					broadcast({
						type: "notice",
						level: "error",
						text: error instanceof Error ? error.message : String(error),
					});
				});
			} else if (message.type === "abort") {
				runtime.abort().catch((error: unknown) => {
					broadcast({
						type: "notice",
						level: "error",
						text: error instanceof Error ? error.message : String(error),
					});
				});
			}
		});
		socket.on("close", () => sockets.delete(socket));
		socket.on("error", () => sockets.delete(socket));
	});

	const server: Server = createServer((request, response) => {
		void handleHttp(request, response, {
			staticDir: options.staticDir,
			model: options.modelLabel,
			cwd: options.cwd,
		}).catch((error: unknown) => {
			if (!response.headersSent) response.writeHead(500);
			response.end(error instanceof Error ? error.message : String(error));
		});
	});
	server.on("upgrade", (request, socket, head) => {
		const path = request.url === undefined ? "" : new URL(request.url, "http://localhost").pathname;
		if (path !== "/ws") {
			socket.destroy();
			return;
		}
		wss.handleUpgrade(request, socket, head, (ws) => wss.emit("connection", ws, request));
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
		async close() {
			if (closed) return;
			closed = true;
			if (coalesceTimer !== undefined) clearTimeout(coalesceTimer);
			unsubscribe();
			for (const socket of sockets) socket.terminate();
			sockets.clear();
			await new Promise<void>((resolveClose) => wss.close(() => resolveClose()));
			await new Promise<void>((resolveClose, rejectClose) => {
				server.close((error) => (error ? rejectClose(error) : resolveClose()));
			});
			view.dispose();
			await runtime.close();
		},
	};
}

async function handleHttp(
	request: IncomingMessage,
	response: ServerResponse,
	info: { staticDir: string; model: string; cwd: string },
): Promise<void> {
	const url = new URL(request.url ?? "/", "http://localhost");
	if (url.pathname === "/api/info") {
		response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
		response.end(JSON.stringify({ model: info.model, cwd: info.cwd }));
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
