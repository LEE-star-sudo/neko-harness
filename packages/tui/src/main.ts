// neko TUI 入口：npx tsx packages/tui/src/main.ts [--cwd <dir>] [--model provider/modelId] [--storage <path>] [--theme light|dark|auto]
// 选项优先级：CLI flag > neko.config.json（向上查找，兜底 ~/.neko/neko.config.json）> 内置默认。
import { loadNekoConfig } from "@neko-harness/core";
import type { ThemePreference } from "./theme.ts";
import { runTui } from "./tui.ts";

const USAGE = `用法: main.ts [--cwd <dir>] [--model <provider/modelId>] [--storage <sqlite路径>] [--theme light|dark|auto]

选项:
  --cwd <dir>       会话工具的工作目录（默认当前目录）
  --model <ref>     模型，格式 provider/modelId（默认 deepseek/deepseek-flash）
  --storage <path>  SQLite 存储文件（默认 ~/.neko/neko.sqlite）
  --theme <mode>    主题：light / dark / auto（默认 auto；也可用环境变量 NEKO_THEME，--theme 优先）
  -h, --help        显示此帮助

配置文件 neko.config.json（从当前目录向上查找，兜底 ~/.neko/）可提供 defaultModel、
storagePath、theme 等；CLI flag 始终优先。需要环境变量 DEEPSEEK_API_KEY。`;

type CliOptions = {
	cwd?: string;
	model?: { provider: string; modelId: string };
	storagePath?: string;
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
		...(theme !== undefined ? { theme } : {}),
	};
}

try {
	const cli = parseArgs(process.argv.slice(2));
	// CLI flag 优先，其次 neko.config.json；未指定的项保持 undefined，由 runTui 用内置默认。
	const config = await loadNekoConfig();
	const options = {
		...(cli.cwd !== undefined ? { cwd: cli.cwd } : {}),
		...(cli.model !== undefined || config.defaultModel !== undefined
			? { model: cli.model ?? config.defaultModel }
			: {}),
		...(cli.storagePath !== undefined || config.storagePath !== undefined
			? { storagePath: cli.storagePath ?? config.storagePath }
			: {}),
		...(cli.theme !== undefined || config.theme !== undefined
			? { theme: (cli.theme ?? config.theme) as ThemePreference }
			: {}),
	};
	await runTui(options);
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}
