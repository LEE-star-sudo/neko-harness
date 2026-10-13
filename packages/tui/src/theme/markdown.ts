import type { EditorTheme, MarkdownTheme, SelectListTheme } from "@earendil-works/pi-tui";
import { style, theme } from "./slots.ts";
import { highlightCodeToAnsiLines } from "./syntax.ts";

/**
 * Markdown 主题。highlightWidth:代码块底色要铺满的内容宽度(不含 Markdown 左右
 * padding 与代码缩进),由组件在 render 时提供;缺省退化为块内最宽行。
 */
export function getMarkdownTheme(highlightWidth?: () => number): MarkdownTheme {
	return {
		heading: (text) => theme.accent(style.bold(text)),
		link: theme.accent,
		linkUrl: theme.dim,
		code: (text) => theme.codeFg(theme.codeBg(text)),
		codeBlock: (text) => theme.codeFg(theme.codeBg(text)),
		codeBlockBorder: theme.dim,
		quote: theme.muted,
		quoteBorder: theme.border,
		hr: theme.borderMuted,
		listBullet: theme.accent,
		bold: style.bold,
		italic: style.italic,
		strikethrough: style.strikethrough,
		underline: style.underline,
		highlightCode: (code, lang) => highlightCodeToAnsiLines(code, lang, highlightWidth?.()),
		// 缩进格一并铺底色,代码块左缘与内容连成矩形。
		codeBlockIndent: theme.codeBg("  "),
	};
}

export function getEditorTheme(): EditorTheme {
	return {
		borderColor: theme.borderMuted,
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
