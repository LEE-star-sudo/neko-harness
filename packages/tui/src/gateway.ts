import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { DEFAULT_STORAGE_PATH, loadNekoConfig, type NekoModelRef } from "@neko-harness/core";
import { ApplicationProtocolError } from "@neko-harness/core/application-version";
import {
	connectNekoGateway,
	gatewayCommand,
	isServerId,
	type NekoGatewayClient,
	readGatewayPortFile,
	removeGatewayPortFile,
	stopGatewayProcess,
} from "@neko-harness/gateway";

/**
 * TUI 的 gateway 接入层（design D3）：POSIX 连接 Unix socket 上的网关；Windows 无 Unix
 * 传输，经端口文件（<数据目录>/<serverId>.port）发现 ws 地址。
 * 地址不存在或已死时自动 spawn gateway 子进程并等待其就绪。
 * TUI 从此不再打开 SQLite——存储与单实例语义都在 gateway 进程内。
 */

export type NekoTuiGatewayOptions = {
	/** 显式 socket 路径（--socket-path）；最高优先。 */
	readonly socketPath?: string;
	/** 存储文件路径：解析默认 socket 位置 + 透传给拉起的 gateway（--storage）。 */
	readonly storagePath?: string;
	readonly credentialsPath?: string;
	/** 模型：透传给拉起的 gateway（--model）。 */
	readonly model?: NekoModelRef;
	/** neko.config.json 查找起始目录（默认 process.cwd()）。 */
	readonly configDir?: string;
	/** 等待 gateway 就绪的超时。 */
	readonly spawnTimeoutMs?: number;
};

export type NekoTuiGateway = {
	readonly client: NekoGatewayClient;
	/** Unix socket 路径；Windows（无 Unix 传输）为 undefined。 */
	readonly socketPath: string | undefined;
	readonly serverId: string;
	/** TUI 是否自行拉起了 gateway 子进程（是则退出时负责关停）。 */
	readonly spawned: boolean;
	close(): Promise<void>;
};

const SERVER_ID_FILENAME = "gateway-server-id";
const SOCKET_POLL_MS = 50;
const CONNECT_RETRY_MS = 100;
const CONNECT_RETRIES = 20;

export async function connectToGateway(options: NekoTuiGatewayOptions = {}): Promise<NekoTuiGateway> {
	// 与 gateway 的解析保持一致（CLI > neko.config.json > 默认）：socket 默认名依赖数据目录与 serverId 文件。
	const config = loadNekoConfig(options.configDir);
	const storagePath = options.storagePath ?? config.storagePath ?? DEFAULT_STORAGE_PATH;
	const nekoDir = dirname(storagePath);
	const fileServerId = readServerId(join(nekoDir, SERVER_ID_FILENAME));

	if (process.platform === "win32") {
		// Windows 无 Unix socket：读端口文件发现 ws 地址；文件过期（连接失败）按无活跃网关处理。
		if (fileServerId !== undefined) {
			const wsUrl = await readGatewayPortFile(nekoDir, fileServerId);
			if (wsUrl !== undefined) {
				try {
					const client = await connectNekoGateway({ transport: "ws", url: wsUrl, serverId: fileServerId });
					return { client, socketPath: undefined, serverId: fileServerId, spawned: false, close: () => client.close() };
				} catch (error) {
					if (error instanceof ApplicationProtocolError) throw error;
					// stale 端口文件：落入 spawn 流程。
				}
			}
		}
		return spawnAndConnect({ ...options, storagePath, socketPath: undefined, nekoDir, fileServerId });
	}

	const socketPath =
		options.socketPath ??
		config.gateway?.socketPath ??
		(fileServerId !== undefined ? join(nekoDir, `${fileServerId}.sock`) : undefined);

	const serverIdFor = (path: string): string | undefined =>
		fileServerId ?? serverIdFromSocketPath(path) ?? readServerId(join(nekoDir, SERVER_ID_FILENAME));

	if (socketPath !== undefined && existsSync(socketPath)) {
		const serverId = serverIdFor(socketPath);
		if (serverId !== undefined) {
			try {
				const client = await connectNekoGateway({ transport: "unix", socketPath, serverId });
				return { client, socketPath, serverId, spawned: false, close: () => client.close() };
			} catch (error) {
				if (error instanceof ApplicationProtocolError) throw error;
				// socket 已死（占用进程消失等）：spawn 新网关，网关会识别并接管 stale socket。
			}
		}
	}

	return spawnAndConnect({ ...options, storagePath, socketPath, nekoDir, fileServerId });
}

type SpawnPlan = {
	readonly configDir?: string;
	readonly storagePath: string;
	readonly credentialsPath?: string;
	readonly socketPath: string | undefined;
	readonly nekoDir: string;
	readonly fileServerId: string | undefined;
	readonly model?: NekoModelRef;
	readonly spawnTimeoutMs?: number;
};

async function spawnAndConnect(plan: SpawnPlan): Promise<NekoTuiGateway> {
	const command = gatewayCommand(gatewayArgs(plan));
	const child = spawn(command.binary, command.args, { stdio: ["ignore", "pipe", "pipe"] });
	const outputTail = captureOutput(child);
	// spawn 本身的失败（Bun/入口缺失等）以 error 事件报告，不进入 exit 流程。
	let spawnError: Error | undefined;
	child.on("error", (error: Error) => {
		spawnError = error;
	});
	try {
		return await connectSpawned(plan, child, outputTail, () => spawnError);
	} catch (error) {
		await stopGatewayProcess(child);
		throw error;
	}
}

async function connectSpawned(
	plan: SpawnPlan,
	child: ChildProcess,
	outputTail: OutputTail,
	spawnError: () => Error | undefined,
): Promise<NekoTuiGateway> {
	const timeoutMs = plan.spawnTimeoutMs ?? 20_000;

	if (process.platform === "win32") {
		// Windows：等 serverId 文件 → 读端口文件 → ws 连接。
		const serverId =
			plan.fileServerId ??
			(await waitForValue(
				() => readServerId(join(plan.nekoDir, SERVER_ID_FILENAME)),
				"gateway serverId file",
				timeoutMs,
				child,
				outputTail,
				spawnError,
			));
		const wsUrl = await waitForValue(
			() => readGatewayPortFile(plan.nekoDir, serverId),
			"gateway ready (port file)",
			timeoutMs,
			child,
			outputTail,
			spawnError,
		);
		let lastError: unknown;
		for (let attempt = 0; attempt < CONNECT_RETRIES; attempt++) {
			if (child.exitCode !== null || spawnError() !== undefined) break;
			try {
				const client = await connectNekoGateway({ transport: "ws", url: wsUrl, serverId });
				return {
					client,
					socketPath: undefined,
					serverId,
					spawned: true,
					async close() {
						await client.close().catch(() => {});
						await stopGatewayProcess(child);
						// Windows 的 kill 是 TerminateProcess，网关 close（含端口文件删除）不会执行，这里补删。
						await removeGatewayPortFile(plan.nekoDir, serverId).catch(() => {});
					},
				};
			} catch (error) {
				if (error instanceof ApplicationProtocolError) throw error;
				lastError = error;
				await sleep(CONNECT_RETRY_MS);
			}
		}
		throw new Error(
			`Gateway connection failed: ${lastError instanceof Error ? lastError.message : String(lastError)}\n${outputTail()}`,
		);
	}

	let socketPath = plan.socketPath;

	// 未显式指定 socket 时，serverId 由 gateway 生成：等文件出现后再算出 socket 路径。
	if (socketPath === undefined) {
		const generated = await waitForValue(
			() => readServerId(join(plan.nekoDir, SERVER_ID_FILENAME)),
			"gateway serverId file",
			timeoutMs,
			child,
			outputTail,
			spawnError,
		);
		socketPath = join(plan.nekoDir, `${generated}.sock`);
	}

	await waitForValue(
		() => (existsSync(socketPath) ? true : undefined),
		`gateway ready (socket: ${socketPath})`,
		timeoutMs,
		child,
		outputTail,
		spawnError,
	);

	const serverId =
		plan.fileServerId ?? serverIdFromSocketPath(socketPath) ?? readServerId(join(plan.nekoDir, SERVER_ID_FILENAME));
	if (serverId === undefined) {
		throw new Error(`Cannot determine gateway serverId (socket: ${socketPath})`);
	}

	let lastError: unknown;
	for (let attempt = 0; attempt < CONNECT_RETRIES; attempt++) {
		if (child.exitCode !== null || spawnError() !== undefined) break;
		try {
			const client = await connectNekoGateway({ transport: "unix", socketPath, serverId });
			return {
				client,
				socketPath,
				serverId,
				spawned: true,
				async close() {
					await client.close().catch(() => {});
					await stopGatewayProcess(child);
				},
			};
		} catch (error) {
			if (error instanceof ApplicationProtocolError) throw error;
			lastError = error;
			await sleep(CONNECT_RETRY_MS);
		}
	}
	throw new Error(
		`Gateway connection failed: ${lastError instanceof Error ? lastError.message : String(lastError)}\n${outputTail()}`,
	);
}

/** CLI options shared by source and compiled gateway entrypoints. */
function gatewayArgs(plan: SpawnPlan): string[] {
	if (process.platform === "win32") {
		// Windows：仅 WS（--no-socket），不传 --port 走 win32 默认的随机端口，地址经端口文件发现。
		return [
			"--no-socket",
			"--storage",
			plan.storagePath,
			...(plan.credentialsPath ? ["--credentials", plan.credentialsPath] : []),
			...(plan.configDir ? ["--cwd", plan.configDir, "--config", plan.configDir] : []),
			...(plan.model !== undefined ? ["--model", `${plan.model.provider}/${plan.model.modelId}`] : []),
		];
	}
	return [
		// 保留 gateway 配置/默认 WS 监听，让后启动的 Web 也能复用；TUI 自身仍走 Unix socket。
		"--storage",
		plan.storagePath,
		...(plan.credentialsPath ? ["--credentials", plan.credentialsPath] : []),
		...(plan.configDir ? ["--cwd", plan.configDir, "--config", plan.configDir] : []),
		...(plan.socketPath !== undefined ? ["--socket-path", plan.socketPath] : []),
		...(plan.model !== undefined ? ["--model", `${plan.model.provider}/${plan.model.modelId}`] : []),
	];
}

function readServerId(file: string): string | undefined {
	try {
		const value = readFileSync(file, "utf8").trim();
		return isServerId(value) ? value : undefined;
	} catch {
		return undefined;
	}
}

function serverIdFromSocketPath(socketPath: string): string | undefined {
	const name = basename(socketPath);
	if (!name.endsWith(".sock")) return undefined;
	const candidate = name.slice(0, -".sock".length);
	return isServerId(candidate) ? candidate : undefined;
}

type OutputTail = () => string;

/** 收集子进程输出尾部，spawn 失败时给出可操作的错误信息。 */
function captureOutput(child: ChildProcess): OutputTail {
	let stdout = "";
	let stderr = "";
	child.stdout?.on("data", (chunk: Buffer) => {
		stdout = (stdout + chunk.toString()).slice(-2_000);
	});
	child.stderr?.on("data", (chunk: Buffer) => {
		stderr = (stderr + chunk.toString()).slice(-2_000);
	});
	return () => [stdout.trimEnd(), stderr.trimEnd()].filter((part) => part !== "").join("\n");
}

/** 轮询 value 直到非 undefined；子进程 spawn 失败/提前退出/超时则以输出尾部报错。 */
async function waitForValue<T>(
	poll: () => T | undefined | Promise<T | undefined>,
	what: string,
	timeoutMs: number,
	child: ChildProcess,
	outputTail: OutputTail,
	spawnError: () => Error | undefined,
): Promise<T> {
	const start = Date.now();
	for (;;) {
		const error = spawnError();
		if (error !== undefined)
			throw new Error(`Gateway process failed to start: ${error.message}${formatTail(outputTail())}`);
		const value = await poll();
		if (value !== undefined) return value;
		if (child.exitCode !== null) {
			throw new Error(`Gateway process exited early (exit ${child.exitCode})${formatTail(outputTail())}`);
		}
		if (Date.now() - start > timeoutMs) {
			child.kill("SIGTERM");
			throw new Error(`Timed out waiting for ${what} (${timeoutMs}ms)${formatTail(outputTail())}`);
		}
		await sleep(SOCKET_POLL_MS);
	}
}

function formatTail(tail: string): string {
	return tail === "" ? "" : `\n--- gateway output ---\n${tail}`;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
