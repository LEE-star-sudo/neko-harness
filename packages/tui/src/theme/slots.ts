import { type Color, getTerminalColorMode, parseColor, styleText } from "@earendil-works/pi-tui";
import { DARK_PALETTE, LIGHT_PALETTE, SLOT_NAMES, type SlotStyle, type ThemeSlotName } from "./palette.ts";

export type { ThemeSlotName } from "./palette.ts";

export type ThemeMode = "light" | "dark";
/** 主题偏好:明确明暗,或跟随终端(自动检测)。 */
export type ThemePreference = ThemeMode | "auto";

export type ThemeSlot = (text: string) => string;
export type NekoTheme = Record<ThemeSlotName, ThemeSlot>;

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
		theme[name] = (text: string) =>
			styleText(
				text,
				{
					...(style.fg !== undefined ? { fg: colorOf(style.fg) } : {}),
					...(style.bg !== undefined ? { bg: colorOf(style.bg) } : {}),
					...(style.bold !== undefined ? { bold: style.bold } : {}),
					...(style.italic !== undefined ? { italic: style.italic } : {}),
					...(style.strikethrough !== undefined ? { strikethrough: style.strikethrough } : {}),
					...(style.underline !== undefined ? { underline: style.underline } : {}),
				},
				getTerminalColorMode(),
			);
	}
	return theme as NekoTheme;
}

/** 深色主题 sakura-night 与浅色主题 sakura-day:同一品牌色阶的两个切片。 */
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
