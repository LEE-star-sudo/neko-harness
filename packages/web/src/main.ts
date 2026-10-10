// neko web 入口：npx tsx packages/web/src/main.ts [--port <n>] [--host <ip>] [--cwd <dir>] [--model provider/modelId] [--storage <path>]
// 选项优先级：CLI flag > neko.config.json（向上查找，兜底 ~/.neko/neko.config.json）> 内置默认。

import { DEFAULT_MODEL, loadNekoConfig, type NekoModelRef } from "@neko-harness/core";
import { startWebServer } from "./server.ts";

const USAGE = `用法: main.ts [--port <n>] [--host <ip>] [--cwd <dir>] [--model <provider/modelId>] [--storage <sqlite路径>]

选项:
  --port <n>        监听端口（默认 8321）
  --host <ip>       监听地址（默认 127.0.0.1，仅本机）
  --cwd <dir>       会话工具的工作目录（默认当前目录）
  --model <ref>     模型，格式 provider/modelId（默认 deepseek/deepseek-flash）
  --storage <path>  SQLite 存储文件（默认 ~/.neko/neko.sqlite）
  -h, --help        显示此帮助

配置文件 neko.config.json（从当前目录向上查找，兜底 ~/.neko/）可提供 defaultModel、
storagePath、gateway.host/port 等；CLI flag 始终优先。需要环境变量 DEEPSEEK_API_KEY。`;

type CliOptions = {
	port?: number;
	host?: string;
	cwd?: string;
	model?: NekoModelRef;
	storagePath?: string;
};

function parseArgs(argv: readonly string[]): CliOptions {
	let port: number | undefined;
	let host: string | undefined;
	let cwd: string | undefined;
	let model: NekoModelRef | undefined;
	let storagePath: string | undefined;
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const next = argv[i + 1];
		switch (arg) {
			case "--port": {
				if (next === undefined) throw new Error("--port 需要参数");
				port = Number(next);
				if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`--port 非法: ${next}`);
				i++;
				break;
			}
			case "--host":
				if (next === undefined) throw new Error("--host 需要参数");
				host = next;
				i++;
				break;
			case "--cwd":
				if (next === undefined) throw new Error("--cwd 需要参数");
				cwd = next;
				i++;
				break;
			case "--model": {
				if (next === undefined) throw new Error("--model 需要参数");
				const separator = next.indexOf("/");
				if (separator <= 0 || separator === next.length - 1) {
					throw new Error(`--model 格式应为 provider/modelId，收到: ${next}`);
				}
				model = { provider: next.slice(0, separator), modelId: next.slice(separator + 1) };
				i++;
				break;
			}
			case "--storage":
				if (next === undefined) throw new Error("--storage 需要参数");
				storagePath = next;
				i++;
				break;
			case "-h":
			case "--help":
				console.log(USAGE);
				process.exit(0);
				break;
			default:
				throw new Error(`未知参数: ${arg ?? ""}`);
		}
	}
	return {
		...(port !== undefined ? { port } : {}),
		...(host !== undefined ? { host } : {}),
		...(cwd !== undefined ? { cwd } : {}),
		...(model !== undefined ? { model } : {}),
		...(storagePath !== undefined ? { storagePath } : {}),
	};
}

try {
	const cli = parseArgs(process.argv.slice(2));
	// CLI flag 优先，其次 neko.config.json（gateway.host/port 段）；未指定的项保持 undefined。
	const config = await loadNekoConfig();
	const options = {
		...(cli.port !== undefined || config.gateway?.port !== undefined ? { port: cli.port ?? config.gateway?.port } : {}),
		...(cli.host !== undefined || config.gateway?.host !== undefined ? { host: cli.host ?? config.gateway?.host } : {}),
		...(cli.cwd !== undefined ? { cwd: cli.cwd } : {}),
		...(cli.model !== undefined || config.defaultModel !== undefined
			? { model: cli.model ?? config.defaultModel }
			: {}),
		...(cli.storagePath !== undefined || config.storagePath !== undefined
			? { storagePath: cli.storagePath ?? config.storagePath }
			: {}),
	};
	const server = await startWebServer(options);
	const model = options.model ?? DEFAULT_MODEL;
	console.log(`neko web 已启动: ${server.url}  （模型 ${model.provider}/${model.modelId}）`);
	console.log("按 Ctrl+C 停止。");
	const shutdown = (): void => {
		console.log("\n正在关闭…");
		server
			.close()
			.then(() => process.exit(0))
			.catch((error: unknown) => {
				console.error(error instanceof Error ? error.message : String(error));
				process.exit(1);
			});
	};
	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}
