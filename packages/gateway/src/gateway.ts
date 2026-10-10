import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { Context } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { ModelThinkingLevel, Provider } from "@earendil-works/pi-ai";
import type { Extension } from "@earendil-works/pi-durable";
import { isServerId } from "@earendil-works/pi-protocol";
import { Server, type ServerListener, SessionNotFoundError } from "@earendil-works/pi-server";
import { createUnixListener } from "@earendil-works/pi-server/unix";
import {
	createNekoRuntime,
	DEFAULT_MODEL,
	DEFAULT_STORAGE_PATH,
	loadNekoConfig,
	type NekoModelRef,
	type NekoRuntime,
} from "@neko-harness/core";
import { createNekoServerServices, toConversationId } from "./server-services.ts";
import { openNekoSessionHandle } from "./session-host.ts";
import { createWsListener, type WsListener } from "./ws-listener.ts";

/** startGateway 选项：CLI flag > neko.config.json > 内置默认；runtime 透传字段见 core。 */
export type NekoGatewayOptions = {
	readonly context?: Context;
	/** neko.config.json 查找起始目录；默认 process.cwd()。 */
	readonly configDir?: string;
	// —— runtime 透传 ——
	readonly storage?: "sqlite" | "memory";
	readonly storagePath?: string;
	readonly apiKey?: string;
	readonly model?: NekoModelRef;
	readonly thinkingLevel?: ModelThinkingLevel;
	readonly cwd?: string;
	readonly providers?: readonly Provider[];
	readonly extensions?: readonly Extension[];
	// —— 网关监听地址 ——
	readonly host?: string;
	/** WebSocket 端口；0 = 随机分配；null = 禁用 WS 传输。 */
	readonly port?: number | null;
	/** Unix socket 路径；null = 禁用 Unix 传输。 */
	readonly socketPath?: string | null;
	/** 逻辑服务器身份（pi 握手校验）；默认读取/生成 <数据目录>/gateway-server-id。 */
	readonly serverId?: string;
	readonly onError?: (error: Error) => void;
};

export type NekoGateway = {
	readonly serverId: string;
	readonly socketPath: string | undefined;
	readonly wsUrl: string | undefined;
	readonly port: number | undefined;
	readonly runtime: NekoRuntime;
	close(): Promise<void>;
};

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8321;
const SERVER_ID_FILENAME = "gateway-server-id";

/**
 * 启动 neko 会话网关：打开 core runtime，以 pi-server 宿主模型托管全部会话，
 * 同时提供 Unix socket（本地客户端）与 WebSocket（浏览器/脚本）两种传输，
 * 上传同一份 neko 服务契约（design D3）。
 *
 * 单实例约束（design Risks）：Unix 路径或端口被活跃网关占用时拒绝启动并给出提示；
 * 进程死亡遗留的 stale socket 由 pi-server Unix listener 自动识别并接管。
 */
export async function startGateway(options: NekoGatewayOptions = {}): Promise<NekoGateway> {
	const context = options.context ?? BACKGROUND_CONTEXT;
	const fileConfig = loadNekoConfig(options.configDir);
	const model = options.model ?? fileConfig.defaultModel ?? DEFAULT_MODEL;
	const storagePath = options.storagePath ?? fileConfig.storagePath ?? DEFAULT_STORAGE_PATH;
	const host = options.host ?? fileConfig.gateway?.host ?? DEFAULT_HOST;
	const port = options.port !== undefined ? options.port : (fileConfig.gateway?.port ?? DEFAULT_PORT);
	const nekoDir = dirname(storagePath);
	const serverId = options.serverId ?? (await loadOrCreateServerId(nekoDir));
	const socketPath =
		options.socketPath !== undefined
			? options.socketPath
			: (fileConfig.gateway?.socketPath ?? join(nekoDir, `${serverId}.sock`));

	const runtime = await createNekoRuntime({
		context,
		storage: options.storage ?? "sqlite",
		...(options.storage !== "memory" ? { storagePath } : {}),
		...(options.apiKey !== undefined ? { apiKey: options.apiKey } : {}),
		model,
		...(options.thinkingLevel !== undefined ? { thinkingLevel: options.thinkingLevel } : {}),
		...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
		...(options.providers !== undefined ? { providers: options.providers } : {}),
		...(options.extensions !== undefined ? { extensions: options.extensions } : {}),
	});
	try {
		return await bindGateway(runtime, {
			context,
			host,
			port,
			socketPath,
			serverId,
			model,
			cwd: options.cwd,
			onError: options.onError,
		});
	} catch (error) {
		await runtime.close().catch(() => {});
		throw error;
	}
}

type BindOptions = {
	readonly context: Context;
	readonly host: string;
	readonly port: number | null;
	readonly socketPath: string | null;
	readonly serverId: string;
	readonly model: NekoModelRef;
	readonly cwd: string | undefined;
	readonly onError: ((error: Error) => void) | undefined;
};

async function bindGateway(runtime: NekoRuntime, options: BindOptions): Promise<NekoGateway> {
	const { context, host, port, socketPath, serverId, model, cwd } = options;
	const modelLabel = `${model.provider}/${model.modelId}`;
	const sessionCwd = cwd ?? process.cwd();

	const serverServices = await createNekoServerServices({ runtime, context });
	let wsListener: WsListener | undefined;
	const listeners: ServerListener[] = [];
	if (socketPath !== null) {
		listeners.push(createUnixListener({ path: socketPath, onError: options.onError }));
	}
	if (port !== null) {
		wsListener = createWsListener({ host, port, onError: options.onError });
		listeners.push(wsListener);
	}

	const server = new Server(
		{
			serverServices: serverServices.host,
			async resolveSession(sessionId) {
				const session = await runtime.getConversation(toConversationId(sessionId));
				if (session === undefined) throw new SessionNotFoundError(`Unknown session: ${sessionId}`);
				return { id: sessionId };
			},
			async openSession(metadata) {
				const session = await runtime.getConversation(toConversationId(metadata.id));
				if (session === undefined) throw new SessionNotFoundError(`Unknown session: ${metadata.id}`);
				return openNekoSessionHandle({ session, modelLabel, cwd: sessionCwd, context });
			},
		},
		{ listeners, serverId, onError: options.onError },
	);
	try {
		await server.start();
	} catch (error) {
		await serverServices.dispose().catch(() => {});
		throw toStartupError(error, { socketPath, port, host, serverId });
	}

	let closed = false;
	return {
		serverId,
		socketPath: socketPath ?? undefined,
		wsUrl: wsListener === undefined ? undefined : `ws://${host}:${wsListener.port}`,
		port: wsListener?.port,
		runtime,
		async close() {
			if (closed) return;
			closed = true;
			await server.close();
			await serverServices.dispose();
			await runtime.close();
		},
	};
}

/** 活跃实例占用/stale 识别由 pi-server Unix listener 负责；此处把错误翻译为可操作的提示。 */
function toStartupError(
	error: unknown,
	info: { socketPath: string | null; port: number | null; host: string; serverId: string },
): Error {
	const message = error instanceof Error ? error.message : String(error);
	// 默认 socket 命名为 <serverId>.sock：占用方能从文件名推出现有实例的 serverId。
	const existingServerId = info.socketPath === null ? undefined : serverIdFromSocketPath(info.socketPath);
	const connectHint =
		existingServerId !== undefined
			? `如需连接已有实例：Unix socket ${info.socketPath}（serverId: ${existingServerId}），或停掉占用方后重试。`
			: `如需连接已有实例：Unix socket ${info.socketPath ?? "（未启用）"}，或停掉占用方后重试。`;
	if (message.includes("already running")) {
		return new Error(
			`neko gateway 启动失败：${message}\n该地址已被一个活跃网关占用，不能启动第二个实例。\n${connectHint}`,
		);
	}
	if ("code" in (error as object) && (error as { code?: string }).code === "EADDRINUSE") {
		return new Error(
			`neko gateway 启动失败：${info.host}:${info.port ?? "?"} 已被占用（EADDRINUSE）。\n${connectHint}`,
		);
	}
	return error instanceof Error ? error : new Error(message);
}

function serverIdFromSocketPath(socketPath: string): string | undefined {
	const name = basename(socketPath);
	if (!name.endsWith(".sock")) return undefined;
	const candidate = name.slice(0, -".sock".length);
	return isServerId(candidate) ? candidate : undefined;
}

async function loadOrCreateServerId(nekoDir: string): Promise<string> {
	const file = join(nekoDir, SERVER_ID_FILENAME);
	try {
		const existing = (await readFile(file, "utf8")).trim();
		if (existing !== "") return existing;
	} catch {
		// 首次启动：生成并持久化，重启后保持逻辑身份稳定（stale socket 识别依赖它）。
	}
	const created = randomUUID();
	await mkdir(nekoDir, { recursive: true, mode: 0o700 });
	await writeFile(file, `${created}\n`, { mode: 0o600 });
	return created;
}
