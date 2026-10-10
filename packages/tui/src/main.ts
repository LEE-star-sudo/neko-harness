// neko TUI 入口：bun --conditions=neko-source packages/tui/src/main.ts [选项]
import type { ThemePreference } from "./theme.ts";
import { runTui } from "./tui.ts";

const USAGE = `用法: main.ts [--cwd <dir>] [--model <provider/modelId>] [--storage <sqlite路径>] [--socket-path <path>] [--theme light|dark|auto]

选项:
  --cwd <dir>          新会话工具的工作目录（默认当前目录）
  --model <ref>        模型，格式 provider/modelId（默认 deepseek/deepseek-flash；透传给拉起的 gateway）
  --storage <path>     存储文件（默认 ~/.neko/neko.sqlite 同规则；解析 socket 位置并透传给 gateway）
  --socket-path <path> gateway Unix socket 路径（默认按配置/数据目录解析）
  --theme <mode>       主题：light / dark / auto（默认 auto；也可用环境变量 NEKO_THEME，--theme 优先）
  -h, --help           显示此帮助

无 gateway 时自动拉起 gateway 子进程；退出时关停由本进程拉起的 gateway。
需要环境变量 DEEPSEEK_API_KEY。`;

type CliOptions = {
	cwd?: string;
	model?: { provider: string; modelId: string };
	storagePath?: string;
	socketPath?: string;
	theme?: ThemePreference;
};

function parseTheme(value: string): ThemePreference {
	if (value === "light" || value === "dark" || value === "auto") return value;
	throw new Error(`--theme 只支持 light / dark / auto，收到: ${value}`);
}

function parseArgs(argv: readonly string[]): CliOptions {
	let cwd: string | undefined;
	let model: { provider: string; modelId: string } | undefined;
	let storagePath: string | undefined;
	let socketPath: string | undefined;
	let theme: ThemePreference | undefined;
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
			case "--socket-path":
				if (next === undefined) throw new Error("--socket-path 需要参数");
				socketPath = next;
				i++;
				break;
			case "--theme":
				if (next === undefined) throw new Error("--theme 需要参数");
				theme = parseTheme(next);
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
	// --theme 优先，其次环境变量 NEKO_THEME，默认 auto。
	theme ??= process.env.NEKO_THEME === undefined ? undefined : parseTheme(process.env.NEKO_THEME);
	return {
		...(cwd !== undefined ? { cwd } : {}),
		...(model !== undefined ? { model } : {}),
		...(storagePath !== undefined ? { storagePath } : {}),
		...(socketPath !== undefined ? { socketPath } : {}),
		...(theme !== undefined ? { theme } : {}),
	};
}

try {
	const options = parseArgs(process.argv.slice(2));
	await runTui(options);
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}
