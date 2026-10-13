/**
 * 品牌色板:与 Web(packages/web/src/client/styles.css)共享的 sakura/tianyi/ink
 * 色阶 hex 快照,以及明暗双主题的槽位配色表(design D1/D2)。组件不直接引用本文件,
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

/** 暗色 sakura-night(design D1 表;对比度验收后允许微调 hex,不动槽位结构)。 */
export const DARK_PALETTE: Record<ThemeSlotName, SlotStyle> = {
	panel: { bg: "#38313C" },
	selection: { bg: "#523349", fg: "#FFFFFF", bold: true },
	userBg: { bg: tianyi.s900 },
	toolPendingBg: { bg: "#2C2733" },
	toolSuccessBg: { bg: "#223128" },
	toolErrorBg: { bg: "#382631" },
	codeBg: { bg: "#222A38" },
	accent: { fg: sakura.s300 },
	model: { fg: tianyi.s300 },
	muted: { fg: ink.s400 },
	dim: { fg: ink.s500 },
	thinking: { fg: "#93A1B5", italic: true },
	ok: { fg: "#9DCB9A" },
	warning: { fg: "#FFC79B" },
	error: { fg: "#FF8FA3" },
	userText: { fg: ink.s50 },
	toolTitle: { fg: sakura.s200 },
	toolOutput: { fg: ink.s400 },
	codeFg: { fg: sakura.s200 },
	border: { fg: ink.s600 },
	borderMuted: { fg: ink.s700 },
	diffAdded: { fg: "#9DCB9A" },
	diffRemoved: { fg: "#FF8FA3" },
	diffContext: { fg: ink.s500 },
	syntaxComment: { fg: ink.s500, italic: true },
	syntaxKeyword: { fg: sakura.s300, bold: true },
	syntaxFunction: { fg: sakura.s200 },
	syntaxVariable: { fg: ink.s100 },
	syntaxString: { fg: tianyi.s200 },
	syntaxNumber: { fg: tianyi.s300 },
	syntaxType: { fg: tianyi.s300 },
	syntaxOperator: { fg: ink.s300 },
	syntaxPunctuation: { fg: ink.s400 },
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
	diffAdded: { fg: "#1A7F37" },
	diffRemoved: { fg: sakura.s800 },
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
