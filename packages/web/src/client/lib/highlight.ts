import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import diff from "highlight.js/lib/languages/diff";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import typescript from "highlight.js/lib/languages/typescript";
import yaml from "highlight.js/lib/languages/yaml";

// 按需注册语言（highlight.js/lib/core），控制 bundle 体积。
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("diff", diff);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("python", python);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("yaml", yaml);

// fenced code block 的语言别名归一（hljs 自带大多数别名，"shell" 除外）。
const LANG_ALIASES: Readonly<Record<string, string>> = { shell: "bash" };

/** 该语言是否已注册（可高亮）。 */
export function isHighlightable(lang: string | undefined): boolean {
	if (lang === undefined) return false;
	const normalized = LANG_ALIASES[lang.trim().toLowerCase()] ?? lang.trim().toLowerCase();
	return normalized !== "" && hljs.getLanguage(normalized) !== undefined;
}

/**
 * 代码块 → 高亮 HTML（hljs 输出已转义的 span 标记）。
 * 未注册/无语言标识：退回纯文本（手动转义），不出错、无高亮类名。
 */
export function renderCodeHtml(source: string, lang: string | undefined): string {
	const normalized = lang === undefined ? "" : (LANG_ALIASES[lang.trim().toLowerCase()] ?? lang.trim().toLowerCase());
	if (normalized !== "" && hljs.getLanguage(normalized) !== undefined) {
		try {
			return hljs.highlight(source, { language: normalized }).value;
		} catch {
			// 高亮失败退回纯文本
		}
	}
	return escapeHtml(source);
}

export function escapeHtml(text: string): string {
	return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
