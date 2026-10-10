#!/usr/bin/env node
// neko 网关独立入口（供后续 `neko serve` 接入）：
//   tsx packages/gateway/src/main.ts [选项]
// 选项优先级：CLI flag > neko.config.json（向上查找，兜底 ~/.neko/） > 内置默认。
import type { NekoModelRef } from "@neko-harness/core";
import { startGateway } from "./gateway.ts";

const USAGE = `用法: main.ts [选项]

选项:
  --host <ip>          WebSocket 监听地址（默认 127.0.0.1，仅本机；0/null 禁用 WS）
  --port <n>           WebSocket 监听端口（默认 8321；0 = 随机分配）
  --socket-path <path> Unix socket 路径（默认 <数据目录>/<serverId>.sock）
  --server-id <id>     逻辑服务器身份（默认读取/生成 <数据目录>/gateway-server-id）
  --cwd <dir>          会话工具的工作目录（默认当前目录）
  --model <ref>        模型，格式 provider/modelId（默认 deepseek/deepseek-flash）
  --storage <path>     SQLite 存储文件（默认 ~/.neko/neko.sqlite）
  --config <dir>       neko.config.json 查找起始目录（默认当前目录）
  -h, --help           显示此帮助

需要环境变量 DEEPSEEK_API_KEY（除非配置其他 provider）。`;

type CliOptions = {
	host?: string;
	port?: number | null;
	socketPath?: string;
	serverId?: string;
	cwd?: string;
	model?: NekoModelRef;
	storagePath?: string;
	configDir?: string;
};

function parseArgs(argv: readonly string[]): CliOptions {
	let port: number | null | undefined;
	const options: CliOptions = {};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const next = argv[i + 1];
		switch (arg) {
			case "--host":
				if (next === undefined) throw new Error("--host 需要参数");
				options.host = next;
				i++;
				break;
			case "--port": {
				if (next === undefined) throw new Error("--port 需要参数");
				if (next === "0" || next === "null") {
					port = null;
				} else {
					const parsed = Number(next);
					if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
						throw new Error(`--port 需要 0-65535 的整数: ${next}`);
					}
					port = parsed;
				}
				i++;
				break;
			}
			case "--socket-path":
				if (next === undefined) throw new Error("--socket-path 需要参数");
				options.socketPath = next;
				i++;
				break;
			case "--server-id":
				if (next === undefined) throw new Error("--server-id 需要参数");
				options.serverId = next;
				i++;
				break;
			case "--cwd":
				if (next === undefined) throw new Error("--cwd 需要参数");
				options.cwd = next;
				i++;
				break;
			case "--model": {
				if (next === undefined) throw new Error("--model 需要参数");
				const slash = next.indexOf("/");
				if (slash <= 0 || slash === next.length - 1) throw new Error(`--model 格式为 provider/modelId: ${next}`);
				options.model = { provider: next.slice(0, slash), modelId: next.slice(slash + 1) };
				i++;
				break;
			}
			case "--storage":
				if (next === undefined) throw new Error("--storage 需要参数");
				options.storagePath = next;
				i++;
				break;
			case "--config":
				if (next === undefined) throw new Error("--config 需要参数");
				options.configDir = next;
				i++;
				break;
			case "-h":
			case "--help":
				console.log(USAGE);
				process.exit(0);
				break;
			default:
				throw new Error(`未知选项: ${arg}`);
		}
	}
	if (port !== undefined) options.port = port;
	return options;
}

const options = parseArgs(process.argv.slice(2));
const gateway = await startGateway({
	...options,
	onError: (error) => console.error("gateway error:", error.message),
});
console.log(`neko gateway 已启动（serverId: ${gateway.serverId}）`);
if (gateway.socketPath !== undefined) console.log(`  Unix socket: ${gateway.socketPath}`);
if (gateway.wsUrl !== undefined) console.log(`  WebSocket:   ${gateway.wsUrl}`);
console.log("Ctrl-C 停止。");

let stopping = false;
const stop = (): void => {
	if (stopping) return;
	stopping = true;
	gateway
		.close()
		.then(() => process.exit(0))
		.catch((error: unknown) => {
			console.error("关闭失败:", error instanceof Error ? error.message : String(error));
			process.exit(1);
		});
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
