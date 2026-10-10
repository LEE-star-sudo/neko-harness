import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { NekoModelRef } from "@neko-harness/core";
import { connectNekoGateway } from "@neko-harness/gateway";

/**
 * 确保一个 neko gateway 在运行：serverId/socket 确定后先探活（Unix socket 上跑一遍
 * pi 握手 + 服务绑定），不通则 spawn gateway 子进程（tsx packages/gateway/src/main.ts）
 * 并轮询探活直到就绪。socket 文件存在但无响应时直接 spawn——pi-server 的 Unix
 * listener 会识别并接管 stale socket。
 */

export type GatewayEnsureOptions = {
	/** WebSocket 监听地址（默认 127.0.0.1）。 */
	readonly host?: string;
	/** WebSocket 监听端口（默认 8321）。 */
	readonly port?: number;
	/** Unix socket 路径（默认 <storageDir>/<serverId>.sock）。 */
	readonly socketPath?: string;
	/** SQLite 存储文件（决定数据目录与默认 socket 位置）。 */
	readonly storagePath: string;
	readonly cwd?: string;
	readonly model?: NekoModelRef;
	/** 逻辑服务器身份（默认读取/生成 <storageDir>/gateway-server-id）。 */
	readonly serverId?: string;
	readonly spawnTimeoutMs?: number;
	/** 网关子进程 stdout/stderr 行回调（main.ts 用于打印）。 */
	readonly onLog?: (line: string) => void;
};

export type GatewayHandle = {
	readonly serverId: string;
	readonly socketPath: string;
	/** 浏览器连接的网关 WebSocket 地址。 */
	readonly wsUrl: string;
	/** 本进程 spawn 的网关子进程；接入既有网关时为 null。 */
	readonly spawned: ChildProcess | null;
	close(): Promise<void>;
};

const SERVER_ID_FILENAME = "gateway-server-id";
const PROBE_INTERVAL_MS = 400;

export async function ensureNekoGateway(options: GatewayEnsureOptions): Promise<GatewayHandle> {
	const nekoDir = dirname(options.storagePath);
	const serverId = options.serverId ?? (await loadOrCreateServerId(nekoDir));
	const socketPath = options.socketPath ?? join(nekoDir, `${serverId}.sock`);
	const host = options.host ?? "127.0.0.1";
	const port = options.port ?? 8321;

	if (await probeGateway(socketPath, serverId)) {
		return makeHandle(serverId, socketPath, host, port, null);
	}

	const child = spawnGatewayProcess(options, socketPath, serverId);
	pipeChildLogs(child, options.onLog);
	const timeoutAt = Date.now() + (options.spawnTimeoutMs ?? 30_000);
	// 让子进程有机会打印启动错误再报错。
	let lastError: unknown = new Error("gateway 未就绪");
	while (Date.now() < timeoutAt) {
		if (child.exitCode !== null) {
			throw new Error(`neko gateway 子进程提前退出（code ${child.exitCode}），详见上方日志。地址可能被其他实例占用。`);
		}
		try {
			if (await probeGateway(socketPath, serverId)) return makeHandle(serverId, socketPath, host, port, child);
		} catch (error) {
			lastError = error;
		}
		await sleep(PROBE_INTERVAL_MS);
	}
	stopChild(child);
	throw new Error(
		`等待 neko gateway 就绪超时（${options.spawnTimeoutMs ?? 30_000}ms）：${lastError instanceof Error ? lastError.message : String(lastError)}`,
	);
}

function spawnGatewayProcess(options: GatewayEnsureOptions, socketPath: string, serverId: string): ChildProcess {
	// src/ 与 dist/ 下相对深度一致：packages/web/{src,dist} → 仓库根 / packages/gateway。
	const tsxBin = fileURLToPath(new URL("../../../node_modules/.bin/tsx", import.meta.url));
	const gatewayMain = fileURLToPath(new URL("../../gateway/src/main.ts", import.meta.url));
	const args = [
		gatewayMain,
		"--host",
		options.host ?? "127.0.0.1",
		"--port",
		String(options.port ?? 8321),
		"--socket-path",
		socketPath,
		"--server-id",
		serverId,
		"--storage",
		options.storagePath,
		...(options.cwd !== undefined ? ["--cwd", options.cwd] : []),
		...(options.model !== undefined ? ["--model", `${options.model.provider}/${options.model.modelId}`] : []),
	];
	return spawn(tsxBin, args, { env: process.env, stdio: ["ignore", "pipe", "pipe"] });
}

function pipeChildLogs(child: ChildProcess, onLog: ((line: string) => void) | undefined): void {
	if (onLog === undefined) return;
	child.stdout?.on("data", (chunk: Buffer) => {
		for (const line of chunk.toString("utf8").split("\n")) {
			if (line.trim() !== "") onLog(line);
		}
	});
	child.stderr?.on("data", (chunk: Buffer) => {
		for (const line of chunk.toString("utf8").split("\n")) {
			if (line.trim() !== "") onLog(line);
		}
	});
}

/** 探活：在 Unix socket 上完成 pi 握手 + 服务目录绑定即认为网关存活且身份匹配。 */
async function probeGateway(socketPath: string, serverId: string): Promise<boolean> {
	try {
		const probe = await connectNekoGateway({ transport: "unix", socketPath, serverId });
		await probe.close();
		return true;
	} catch {
		return false;
	}
}

function makeHandle(
	serverId: string,
	socketPath: string,
	host: string,
	port: number,
	spawned: ChildProcess | null,
): GatewayHandle {
	return {
		serverId,
		socketPath,
		wsUrl: `ws://${host}:${port}`,
		spawned,
		async close() {
			if (spawned === null) return;
			await new Promise<void>((resolve) => {
				const timer = setTimeout(() => {
					stopChild(spawned);
					resolve();
				}, 3_000);
				spawned.once("exit", () => {
					clearTimeout(timer);
					resolve();
				});
				stopChildGracefully(spawned);
			});
		},
	};
}

function stopChildGracefully(child: ChildProcess): void {
	if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
}

function stopChild(child: ChildProcess): void {
	if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
}

async function loadOrCreateServerId(nekoDir: string): Promise<string> {
	const file = join(nekoDir, SERVER_ID_FILENAME);
	try {
		const existing = (await readFile(file, "utf8")).trim();
		if (existing !== "") return existing;
	} catch {
		// 首次启动：生成并持久化，与 gateway 的逻辑一致。
	}
	const created = randomUUID();
	await mkdir(nekoDir, { recursive: true, mode: 0o700 });
	await writeFile(file, `${created}\n`, { mode: 0o600 });
	return created;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
