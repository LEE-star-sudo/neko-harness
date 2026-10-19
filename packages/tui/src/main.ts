// neko TUI 入口：bun --conditions=neko-source packages/tui/src/main.ts [选项]
import type { ThemePreference } from "./theme/index.ts";
import { runTui } from "./tui.ts";

const USAGE = `用法: neko tui [选项]

选项:
  --cwd <dir>          工作目录（默认启动目录；非访问沙箱）
  --model <ref>        模型，格式 provider/modelId（用于拉起的网关）
  --storage <path>     SQLite 存储文件（默认 ~/.neko/neko.sqlite）
  --socket-path <path> 网关 Unix socket 路径（仅 POSIX；Windows 经端口文件发现 ws 地址）
  --theme <mode>       主题 light / dark / auto（覆盖 NEKO_THEME）
  -h, --help           显示此帮助

恢复当前工作目录最近使用的会话，不存在则创建。
按需拉起网关，属主 TUI 退出时随之停止。
可用 /login 或 DEEPSEEK_API_KEY 等环境变量配置凭据（除 DeepSeek 外的 provider 需先在 /login 启用）；/search 选择联网搜索服务（tavily / deepseek，默认 tavily）；/context 调整上下文压缩与工具结果裁剪；/model 中可把可选模型「设为默认」，优先级低于 --model、高于配置文件 defaultModel。`;

type CliOptions = {
	cwd?: string;
	model?: { provider: string; modelId: string };
	storagePath?: string;
	socketPath?: string;
	theme?: ThemePreference;
};

function parseTheme(value: string): ThemePreference {
	if (value === "light" || value === "dark" || value === "auto") return value;
	throw new Error(`--theme must be light / dark / auto; received: ${value}`);
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
				if (next === undefined) throw new Error("--cwd requires a value");
				cwd = next;
				i++;
				break;
			case "--model": {
				if (next === undefined) throw new Error("--model requires a value");
				const separator = next.indexOf("/");
				if (separator <= 0 || separator === next.length - 1) {
					throw new Error(`--model must be provider/modelId; received: ${next}`);
				}
				model = { provider: next.slice(0, separator), modelId: next.slice(separator + 1) };
				i++;
				break;
			}
			case "--storage":
				if (next === undefined) throw new Error("--storage requires a value");
				storagePath = next;
				i++;
				break;
			case "--socket-path":
				if (next === undefined) throw new Error("--socket-path requires a value");
				socketPath = next;
				i++;
				break;
			case "--theme":
				if (next === undefined) throw new Error("--theme requires a value");
				theme = parseTheme(next);
				i++;
				break;
			case "-h":
			case "--help":
				console.log(USAGE);
				process.exit(0);
				break;
			default:
				throw new Error(`Unknown option: ${arg ?? ""}`);
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
