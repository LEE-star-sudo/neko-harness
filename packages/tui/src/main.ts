// neko TUI 入口：npx tsx packages/tui/src/main.ts [--cwd <dir>] [--model provider/modelId] [--storage <path>]
import { runTui } from "./tui.ts";

const USAGE = `用法: main.ts [--cwd <dir>] [--model <provider/modelId>] [--storage <sqlite路径>]

选项:
  --cwd <dir>       会话工具的工作目录（默认当前目录）
  --model <ref>     模型，格式 provider/modelId（默认 deepseek/deepseek-flash）
  --storage <path>  SQLite 存储文件（默认 ~/.neko/neko.sqlite）
  -h, --help        显示此帮助

需要环境变量 DEEPSEEK_API_KEY。`;

function parseArgs(argv: readonly string[]): {
	cwd?: string;
	model?: { provider: string; modelId: string };
	storagePath?: string;
} {
	let cwd: string | undefined;
	let model: { provider: string; modelId: string } | undefined;
	let storagePath: string | undefined;
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const next = argv[i + 1];
		switch (arg) {
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
		...(cwd !== undefined ? { cwd } : {}),
		...(model !== undefined ? { model } : {}),
		...(storagePath !== undefined ? { storagePath } : {}),
	};
}

try {
	const options = parseArgs(process.argv.slice(2));
	await runTui(options);
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}
