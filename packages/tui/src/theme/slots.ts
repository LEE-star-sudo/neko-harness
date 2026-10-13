import {
	backgroundAnsi,
	type Color,
	foregroundAnsi,
	getTerminalColorMode,
	parseColor,
	styleText,
} from "@earendil-works/pi-tui";
import { DARK_PALETTE, LIGHT_PALETTE, SLOT_NAMES, type SlotStyle, type ThemeSlotName } from "./palette.ts";

export type { ThemeSlotName } from "./palette.ts";

export type ThemeMode = "light" | "dark";
/** 主题偏好:明确明暗,或跟随终端(自动检测)。 */
export type ThemePreference = ThemeMode | "auto";

export type ThemeSlot = (text: string) => string;
export type NekoTheme = Record<ThemeSlotName, ThemeSlot>;

/** Restore surface defaults after nested SGR resets, without overwriting explicit inner colors. */
function surfaceText(text: string, fg: string, bg: string): string {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: parse terminal SGR escapes
	return text.replace(/\x1b\[([0-9;:]*)m/g, (sequence, parameters: string) => {
		const codes = parameters.split(";");
		let resetFg = false;
		let resetBg = false;
		for (let i = 0; i < codes.length; i++) {
			const code = Number(codes[i]!.split(":")[0]);
			if (code === 0) {
				resetFg = true;
				resetBg = true;
			} else if (code === 39) resetFg = true;
			else if (code === 49) resetBg = true;
			else if (code === 38 || code === 48) {
				if (code === 38) resetFg = false;
				else resetBg = false;
				if (!codes[i]!.includes(":")) i += codes[i + 1] === "2" ? 4 : codes[i + 1] === "5" ? 2 : 0;
			} else if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97)) resetFg = false;
			else if ((code >= 40 && code <= 47) || (code >= 100 && code <= 107)) resetBg = false;
		}
		return sequence + (resetFg ? fg : "") + (resetBg ? bg : "");
	});
}

function createTheme(palette: Record<ThemeSlotName, SlotStyle>): NekoTheme {
	const colorCache = new Map<string, Color>();
	const colorOf = (hex: string): Color => {
		let color = colorCache.get(hex);
		if (color === undefined) {
			color = parseColor(hex);
			colorCache.set(hex, color);
		}
		return color;
	};
	const theme = {} as Record<ThemeSlotName, ThemeSlot>;
	for (const name of SLOT_NAMES) {
		const style = palette[name];
		theme[name] = (text: string) => {
			const mode = getTerminalColorMode();
			if (palette === DARK_PALETTE && style.fg && style.bg)
				text = surfaceText(text, foregroundAnsi(colorOf(style.fg), mode), backgroundAnsi(colorOf(style.bg), mode));
			return styleText(
				text,
				{
					...(style.fg !== undefined ? { fg: colorOf(style.fg) } : {}),
					...(style.bg !== undefined ? { bg: colorOf(style.bg) } : {}),
					...(style.bold !== undefined ? { bold: style.bold } : {}),
					...(style.italic !== undefined ? { italic: style.italic } : {}),
					...(style.strikethrough !== undefined ? { strikethrough: style.strikethrough } : {}),
					...(style.underline !== undefined ? { underline: style.underline } : {}),
				},
				mode,
			);
		};
	}
	return theme as NekoTheme;
}

/** 独立冷灰蓝深色主题与原 sakura-day 浅色主题。 */
export const darkTheme: NekoTheme = createTheme(DARK_PALETTE);
export const lightTheme: NekoTheme = createTheme(LIGHT_PALETTE);

const THEMES: Record<ThemeMode, NekoTheme> = { dark: darkTheme, light: lightTheme };

let activeMode: ThemeMode = "dark";
let activeTheme: NekoTheme = darkTheme;

/** 切换当前主题;返回是否发生变化。已渲染组件需 invalidate 后重绘。 */
export function setActiveTheme(mode: ThemeMode): boolean {
	if (mode === activeMode) return false;
	activeMode = mode;
	activeTheme = THEMES[mode];
	return true;
}

export function getActiveThemeMode(): ThemeMode {
	return activeMode;
}

function delegate(name: ThemeSlotName): ThemeSlot {
	return (text: string) => activeTheme[name](text);
}

/** 组件使用的动态主题入口:槽位委托到当前激活主题,切换后自动生效。 */
export const theme: NekoTheme = Object.fromEntries(SLOT_NAMES.map((name) => [name, delegate(name)])) as NekoTheme;

// bold/italic/strikethrough/underline 是无色属性:SGR 开关不随主题变化,本地实现。
const sgr =
	(attrs: SlotStyle): ThemeSlot =>
	(text) =>
		styleText(
			text,
			{
				...(attrs.bold !== undefined ? { bold: attrs.bold } : {}),
				...(attrs.italic !== undefined ? { italic: attrs.italic } : {}),
				...(attrs.strikethrough !== undefined ? { strikethrough: attrs.strikethrough } : {}),
				...(attrs.underline !== undefined ? { underline: attrs.underline } : {}),
			},
			getTerminalColorMode(),
		);

const boldText = sgr({ bold: true });
const italicText = sgr({ italic: true });
const strikethroughText = sgr({ strikethrough: true });
const underlineText = sgr({ underline: true });

/** 无色 SGR 属性助手(不随主题变化)。 */
export const style = {
	bold: boldText,
	italic: italicText,
	strikethrough: strikethroughText,
	underline: underlineText,
};
