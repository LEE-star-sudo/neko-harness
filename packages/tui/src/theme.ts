import {
	type Color,
	type EditorTheme,
	getTerminalColorMode,
	type MarkdownTheme,
	parseColor,
	type SelectListTheme,
	styleText,
} from "@earendil-works/pi-tui";

export type ThemeMode = "light" | "dark";
/** 主题偏好：明确明暗，或跟随终端（自动检测）。 */
export type ThemePreference = ThemeMode | "auto";

/**
 * 语义槽位：明暗两套主题共享同一组槽位，组件只依赖槽位不感知具体主题。
 * 浅色主题参照 Web UI 蓝粉白风格（樱花粉主色 / 天依蓝辅色），文本色均按白底对比度加深。
 */
const SLOT_NAMES = [
	"panel",
	"selection",
	"accent",
	"model",
	"dim",
	"thinking",
	"error",
	"ok",
	"userText",
	"userBg",
	"toolTitle",
	"toolPendingBg",
	"toolSuccessBg",
	"toolErrorBg",
	"codeFg",
	"codeBg",
] as const;

export type ThemeSlotName = (typeof SLOT_NAMES)[number];
export type ThemeSlot = (text: string) => string;
export type NekoTheme = Record<ThemeSlotName, ThemeSlot>;

type SlotStyle = {
	readonly fg?: string;
	readonly bg?: string;
	readonly bold?: boolean;
	readonly italic?: boolean;
	readonly strikethrough?: boolean;
	readonly underline?: boolean;
};

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

/** 深色主题（默认终端假定，Tokyo Night 风）。 */
export const darkTheme: NekoTheme = createTheme({
	panel: { bg: "#1F2335" },
	selection: { bg: "#33476B", fg: "#FFFFFF", bold: true },
	accent: { fg: "#82AAFF" },
	model: { fg: "#BB9AF7" },
	dim: { fg: "#6C738A" },
	thinking: { fg: "#7A8199", italic: true },
	error: { fg: "#F7768E" },
	ok: { fg: "#A3BE8C" },
	userText: { fg: "#E5E9F0" },
	userBg: { bg: "#2A3150" },
	toolTitle: { fg: "#E0AF68" },
	toolPendingBg: { bg: "#262A3A" },
	toolSuccessBg: { bg: "#232D26" },
	toolErrorBg: { bg: "#332430" },
	codeFg: { fg: "#A3BE8C" },
	codeBg: { bg: "#1F2233" },
});

/**
 * 浅色主题：蓝粉白。accent 用樱花粉加深档 #B0456B（白底对比度 ~4.3）、
 * 用户气泡用天依蓝系（底 #DCEEFF / 字 #14324A，对比度 >10）、
 * 工具标题琥珀加深 #B45309；工具卡片用浅 tinted 底，状态字色保持深色高对比。
 */
export const lightTheme: NekoTheme = createTheme({
	panel: { bg: "#F2F5FA" },
	selection: { bg: "#D0E2F7", fg: "#16365B", bold: true },
	accent: { fg: "#B0456B" },
	model: { fg: "#1B7AB8" },
	dim: { fg: "#6E7781" },
	thinking: { fg: "#757C87", italic: true },
	error: { fg: "#CF222E" },
	ok: { fg: "#1A7F37" },
	userText: { fg: "#14324A" },
	userBg: { bg: "#DCEEFF" },
	toolTitle: { fg: "#B45309" },
	toolPendingBg: { bg: "#ECEFF4" },
	toolSuccessBg: { bg: "#E6F4EC" },
	toolErrorBg: { bg: "#FDECEF" },
	codeFg: { fg: "#123B7B" },
	codeBg: { bg: "#E4EAF2" },
});

const THEMES: Record<ThemeMode, NekoTheme> = { dark: darkTheme, light: lightTheme };

let activeMode: ThemeMode = "dark";
let activeTheme: NekoTheme = darkTheme;

/** 切换当前主题；返回是否发生变化。已渲染组件需 invalidate 后重绘。 */
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

/** 组件使用的动态主题入口：槽位委托到当前激活主题，切换后自动生效。 */
export const theme: NekoTheme = {
	panel: delegate("panel"),
	selection: delegate("selection"),
	accent: delegate("accent"),
	model: delegate("model"),
	dim: delegate("dim"),
	thinking: delegate("thinking"),
	error: delegate("error"),
	ok: delegate("ok"),
	userText: delegate("userText"),
	userBg: delegate("userBg"),
	toolTitle: delegate("toolTitle"),
	toolPendingBg: delegate("toolPendingBg"),
	toolSuccessBg: delegate("toolSuccessBg"),
	toolErrorBg: delegate("toolErrorBg"),
	codeFg: delegate("codeFg"),
	codeBg: delegate("codeBg"),
};

// bold/italic/strikethrough/underline 是无色属性：SGR 开关不随主题变化，本地实现。
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

/** 无色 SGR 属性助手（不随主题变化）。 */
export const style = {
	bold: boldText,
	italic: italicText,
	strikethrough: strikethroughText,
	underline: underlineText,
};

export function getMarkdownTheme(): MarkdownTheme {
	return {
		heading: (text) => theme.accent(boldText(text)),
		link: theme.accent,
		linkUrl: theme.dim,
		code: (text) => theme.codeFg(theme.codeBg(text)),
		codeBlock: (text) => theme.codeFg(theme.codeBg(text)),
		codeBlockBorder: theme.dim,
		quote: theme.dim,
		quoteBorder: theme.dim,
		hr: theme.dim,
		listBullet: theme.accent,
		bold: boldText,
		italic: italicText,
		strikethrough: strikethroughText,
		underline: underlineText,
	};
}

export function getEditorTheme(): EditorTheme {
	return {
		borderColor: theme.dim,
		selectList: getSelectListTheme(),
	};
}

export function getSelectListTheme(): SelectListTheme {
	return {
		selectedPrefix: theme.accent,
		selectedText: theme.accent,
		description: theme.dim,
		scrollInfo: theme.dim,
		noMatch: theme.error,
	};
}
