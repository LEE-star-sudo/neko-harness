/**
 * 主题色板:浅色与 Web(packages/web/src/client/styles.css)共享 sakura/tianyi/ink
 * 色阶 hex 快照;深色独立使用冷灰蓝配色。组件不直接引用本文件,
 * 一律经 slots.ts 的语义槽位取色;调整配色只改这里。
 */

/** sakura(樱花粉,主色)、tianyi(天依蓝,辅色)、ink(紫调中性)色阶,与 Web token 一致。 */
export const sakura = {
	s50: "#FFF1F3",
	s100: "#FFE5EA",
	s200: "#FFD1DA",
	s300: "#FFB7C5",
	s400: "#ED9BAC",
	s500: "#DA7F93",
	s600: "#C26279",
	s700: "#A74660",
	s800: "#8B314A",
	s900: "#6E1D36",
} as const;

export const tianyi = {
	s50: "#EFF8FE",
	s100: "#DCF3FF",
	s200: "#B4E6FF",
	s300: "#66CCFF",
	s400: "#3DB5EB",
	s500: "#059FD7",
	s600: "#0086BF",
	s700: "#006EA7",
	s800: "#00598F",
	s900: "#004778",
} as const;

export const ink = {
	s50: "#F7F4F8",
	s100: "#F0EBF1",
	s200: "#E2DBE4",
	s300: "#C9BFCB",
	s400: "#9E95A0",
	s500: "#7A717C",
	s600: "#6A5F6C",
	s700: "#554857",
	s800: "#443947",
	s900: "#322B34",
} as const;

/** 语义槽位清单:表面 / 文本层级与品牌 / 语义状态 / 组件 / diff / 语法高亮(design D2)。 */
export const SLOT_NAMES = [
	// 表面(底色为主)
	"panel",
	"selection",
	"userBg",
	"toolPendingBg",
	"toolSuccessBg",
	"toolErrorBg",
	"codeBg",
	// 文本层级与品牌
	"accent",
	"model",
	"muted",
	"dim",
	"thinking",
	// 语义状态
	"ok",
	"warning",
	"error",
	// 组件
	"userText",
	"toolTitle",
	"toolOutput",
	"codeFg",
	"border",
	"borderMuted",
	// diff
	"diffAdded",
	"diffRemoved",
	"diffContext",
	// 语法高亮
	"syntaxComment",
	"syntaxKeyword",
	"syntaxFunction",
	"syntaxVariable",
	"syntaxString",
	"syntaxNumber",
	"syntaxType",
	"syntaxOperator",
	"syntaxPunctuation",
] as const;

export type ThemeSlotName = (typeof SLOT_NAMES)[number];

export type SlotStyle = {
	readonly fg?: string;
	readonly bg?: string;
	readonly bold?: boolean;
	readonly italic?: boolean;
	readonly strikethrough?: boolean;
	readonly underline?: boolean;
};

/** Dark: Tokyo Night-derived colors, adjusted for readable TUI surfaces. See LICENSE. */
export const DARK_PALETTE: Record<ThemeSlotName, SlotStyle> = {
	panel: { bg: "#24283B", fg: "#C0CAF5" },
	selection: { bg: "#343B58", fg: "#E1E7FF", bold: true },
	userBg: { bg: "#292E42", fg: "#C0CAF5" },
	toolPendingBg: { bg: "#222638", fg: "#C0CAF5" },
	toolSuccessBg: { bg: "#232C32", fg: "#C0CAF5" },
	toolErrorBg: { bg: "#302735", fg: "#C0CAF5" },
	codeBg: { bg: "#1A1B26", fg: "#C0CAF5" },
	accent: { fg: "#7AA2F7" },
	model: { fg: "#7DCFFF" },
	muted: { fg: "#A9B1D6" },
	dim: { fg: "#9AA5CE" },
	thinking: { fg: "#9AA5CE", italic: true },
	ok: { fg: "#9ECE6A" },
	warning: { fg: "#E0AF68" },
	error: { fg: "#F7768E" },
	userText: { fg: "#C0CAF5" },
	toolTitle: { fg: "#7AA2F7" },
	toolOutput: { fg: "#C0CAF5" },
	codeFg: { fg: "#C0CAF5" },
	border: { fg: "#737DA2" },
	borderMuted: { fg: "#545E7C" },
	diffAdded: { fg: "#9ECE6A", bg: "#232C32" },
	diffRemoved: { fg: "#F7768E", bg: "#302735" },
	diffContext: { fg: "#9AA5CE" },
	syntaxComment: { fg: "#8993B3", italic: true },
	syntaxKeyword: { fg: "#BB9AF7", bold: true },
	syntaxFunction: { fg: "#7AA2F7" },
	syntaxVariable: { fg: "#C0CAF5" },
	syntaxString: { fg: "#9ECE6A" },
	syntaxNumber: { fg: "#FF9E64" },
	syntaxType: { fg: "#7DCFFF" },
	syntaxOperator: { fg: "#89DDFF" },
	syntaxPunctuation: { fg: "#A9B1D6" },
};

/** 浅色 sakura-day(design D1 表;syntax 浅色档与 Web hljs 映射同色相,已实测 AA)。 */
export const LIGHT_PALETTE: Record<ThemeSlotName, SlotStyle> = {
	panel: { bg: ink.s50 },
	selection: { bg: sakura.s100, fg: sakura.s900, bold: true },
	userBg: { bg: tianyi.s100 },
	toolPendingBg: { bg: ink.s100 },
	toolSuccessBg: { bg: "#E4F3E8" },
	toolErrorBg: { bg: "#FBE7EC" },
	codeBg: { bg: tianyi.s50 },
	accent: { fg: sakura.s700 },
	model: { fg: tianyi.s700 },
	muted: { fg: ink.s600 },
	dim: { fg: ink.s400 },
	thinking: { fg: "#7E8AA0", italic: true },
	ok: { fg: "#1A7F37" },
	warning: { fg: "#B45309" },
	error: { fg: sakura.s800 },
	userText: { fg: tianyi.s900 },
	toolTitle: { fg: sakura.s600 },
	toolOutput: { fg: ink.s700 },
	codeFg: { fg: sakura.s800 },
	border: { fg: ink.s300 },
	borderMuted: { fg: ink.s200 },
	diffAdded: { fg: "#1A7F37", bg: "#E4F3E8" },
	diffRemoved: { fg: sakura.s800, bg: "#FBE7EC" },
	diffContext: { fg: ink.s400 },
	syntaxComment: { fg: ink.s600, italic: true },
	syntaxKeyword: { fg: sakura.s800 },
	syntaxFunction: { fg: sakura.s700 },
	syntaxVariable: { fg: ink.s900 },
	syntaxString: { fg: tianyi.s800 },
	syntaxNumber: { fg: tianyi.s700 },
	syntaxType: { fg: tianyi.s700 },
	syntaxOperator: { fg: ink.s700 },
	syntaxPunctuation: { fg: ink.s500 },
};
