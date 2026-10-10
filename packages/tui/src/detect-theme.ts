import type { RgbColor, TerminalColors, TUI } from "@earendil-works/pi-tui";
import type { ThemeMode } from "./theme.ts";

/**
 * 终端背景明暗检测的回退链（与 pi coding-agent 同一思路）：
 * OSC 11 颜色查询（pi-tui queryTerminalColors，超时 100ms，不阻塞启动）
 * → COLORFGBG 环境变量 → 默认浅色。
 */

export const THEME_QUERY_TIMEOUT_MS = 100;

/**
 * `COLORFGBG` 的 `fg;bg`（或 rxvt `fg;xpm;bg`）背景索引分类，按 Vim 的方式：
 * 0-6 与 8（如 Solarized Dark 的亮黑底）为深，7、9-15 为浅。
 */
export function detectColorFgBgMode(env: NodeJS.ProcessEnv = process.env): ThemeMode | undefined {
	const bg = env.COLORFGBG?.split(";").at(-1)?.trim();
	if (bg === undefined || !/^\d{1,2}$/.test(bg)) return undefined;
	const index = Number(bg);
	if (index > 15) return undefined;
	return index <= 6 || index === 8 ? "dark" : "light";
}

function relativeLuminance({ r, g, b }: RgbColor): number {
	const linear = (channel: number): number => {
		const value = channel / 255;
		return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG 对比度，1-21。 */
function contrastRatio(first: RgbColor, second: RgbColor): number {
	const a = relativeLuminance(first);
	const b = relativeLuminance(second);
	return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * 由终端报告的前景/背景色判断明暗：前景与背景亮度可分时随前景，
 * 否则比较白字/黑字在背景上的对比度。
 */
export function appearanceFromBackground(background: RgbColor, foreground?: RgbColor): ThemeMode {
	if (foreground !== undefined) {
		const backgroundL = relativeLuminance(background);
		const foregroundL = relativeLuminance(foreground);
		if (Math.abs(foregroundL - backgroundL) > 0.05) {
			return foregroundL > backgroundL ? "dark" : "light";
		}
	}
	const whiteContrast = contrastRatio({ r: 255, g: 255, b: 255 }, background);
	const blackContrast = contrastRatio({ r: 0, g: 0, b: 0 }, background);
	return whiteContrast >= blackContrast ? "dark" : "light";
}

export function modeFromColors(colors: TerminalColors): ThemeMode | undefined {
	return colors.background === undefined ? undefined : appearanceFromBackground(colors.background, colors.foreground);
}

/**
 * auto 模式的终端明暗查询。异步、带快速超时：终端通常在 DA1 哨兵前即应答，
 * 不应答的终端（含管道/CI）最多等待 `THEME_QUERY_TIMEOUT_MS`。
 * `onLateReply` 收到超时后才到的应答（如慢速链路），调用方可用它修正主题。
 */
export async function queryTerminalMode(ui: TUI, onLateReply?: (mode: ThemeMode) => void): Promise<ThemeMode> {
	let colors: TerminalColors;
	try {
		colors = await ui.queryTerminalColors({
			timeoutMs: THEME_QUERY_TIMEOUT_MS,
			onLateReply: (late) => {
				const mode = modeFromColors(late);
				if (mode !== undefined) onLateReply?.(mode);
			},
		});
	} catch {
		colors = {};
	}
	return modeFromColors(colors) ?? detectColorFgBgMode() ?? "light";
}
