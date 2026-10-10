import {
	type Color,
	type EditorTheme,
	getTerminalColorMode,
	type MarkdownTheme,
	parseColor,
	type SelectListTheme,
	styleText,
} from "@earendil-works/pi-tui";

/**
 * 配色：假设深色终端（与 pi 默认主题一致）。用户 = 蓝底、助手 = 默认前景 + 蓝色强调、
 * 工具 = 琥珀色标题 + 状态底色（待执行/成功/错误），thinking 弱化灰。
 */
const hexColors: Record<string, Color> = {};

function colorOf(hex: string): Color {
	let color = hexColors[hex];
	if (color === undefined) {
		color = parseColor(hex);
		hexColors[hex] = color;
	}
	return color;
}

function accent(text: string): string {
	return styleText(text, { fg: colorOf("#82AAFF") }, getTerminalColorMode());
}

function purple(text: string): string {
	return styleText(text, { fg: colorOf("#BB9AF7") }, getTerminalColorMode());
}

function dimColor(text: string): string {
	return styleText(text, { fg: colorOf("#6C738A") }, getTerminalColorMode());
}

function thinkingColor(text: string): string {
	return styleText(text, { fg: colorOf("#7A8199"), italic: true }, getTerminalColorMode());
}

function errorColor(text: string): string {
	return styleText(text, { fg: colorOf("#F7768E") }, getTerminalColorMode());
}

function okColor(text: string): string {
	return styleText(text, { fg: colorOf("#A3BE8C") }, getTerminalColorMode());
}

function bold(text: string): string {
	return styleText(text, { bold: true }, getTerminalColorMode());
}

function italic(text: string): string {
	return styleText(text, { italic: true }, getTerminalColorMode());
}

function strikethrough(text: string): string {
	return styleText(text, { strikethrough: true }, getTerminalColorMode());
}

function underline(text: string): string {
	return styleText(text, { underline: true }, getTerminalColorMode());
}

function userTextColor(text: string): string {
	return styleText(text, { fg: colorOf("#E5E9F0") }, getTerminalColorMode());
}

function userBgColor(text: string): string {
	return styleText(text, { bg: colorOf("#2A3150") }, getTerminalColorMode());
}

function toolTitleColor(text: string): string {
	return styleText(text, { fg: colorOf("#E0AF68") }, getTerminalColorMode());
}

function toolPendingBg(text: string): string {
	return styleText(text, { bg: colorOf("#262A3A") }, getTerminalColorMode());
}

function toolSuccessBg(text: string): string {
	return styleText(text, { bg: colorOf("#232D26") }, getTerminalColorMode());
}

function toolErrorBg(text: string): string {
	return styleText(text, { bg: colorOf("#332430") }, getTerminalColorMode());
}

function codeFg(text: string): string {
	return styleText(text, { fg: colorOf("#A3BE8C") }, getTerminalColorMode());
}

function codeBg(text: string): string {
	return styleText(text, { bg: colorOf("#1F2233") }, getTerminalColorMode());
}

export const theme = {
	accent,
	model: purple,
	dim: dimColor,
	thinking: thinkingColor,
	error: errorColor,
	ok: okColor,
	bold,
	userText: userTextColor,
	userBg: userBgColor,
	toolTitle: toolTitleColor,
	toolPendingBg,
	toolSuccessBg,
	toolErrorBg,
};

export function getMarkdownTheme(): MarkdownTheme {
	return {
		heading: (text) => accent(bold(text)),
		link: accent,
		linkUrl: dimColor,
		code: (text) => codeFg(codeBg(text)),
		codeBlock: (text) => codeFg(codeBg(text)),
		codeBlockBorder: dimColor,
		quote: dimColor,
		quoteBorder: dimColor,
		hr: dimColor,
		listBullet: accent,
		bold,
		italic,
		strikethrough,
		underline,
	};
}

export function getEditorTheme(): EditorTheme {
	return {
		borderColor: dimColor,
		selectList: getSelectListTheme(),
	};
}

export function getSelectListTheme(): SelectListTheme {
	return {
		selectedPrefix: accent,
		selectedText: accent,
		description: dimColor,
		scrollInfo: dimColor,
		noMatch: errorColor,
	};
}
