import DOMPurify from "dompurify";
import katex from "katex";
import type { TokenizerAndRendererExtension } from "marked";

const CACHE_LIMIT = 500;
const cache = new Map<string, string | null>();

/** KaTeX 渲染并单独消毒；公式非法或被拒绝（如 \href）时返回 null。结果按 (模式, 源码) 做小型 LRU 缓存。 */
export function renderMath(tex: string, display: boolean): string | null {
	const key = `${display ? 1 : 0}:${tex}`;
	if (cache.has(key)) {
		const hit = cache.get(key) ?? null;
		cache.delete(key);
		cache.set(key, hit);
		return hit;
	}
	let html: string | null;
	try {
		const raw = katex.renderToString(tex, {
			displayMode: display,
			output: "htmlAndMathml",
			throwOnError: true,
			trust: false,
			strict: "ignore",
			maxExpand: 1000,
			maxSize: 50,
		});
		html = DOMPurify.sanitize(raw, { USE_PROFILES: { html: true, svg: true, mathMl: true } });
	} catch {
		html = null;
	}
	cache.set(key, html);
	if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
	return html;
}

/** 一次 Markdown 渲染内收集公式 HTML；marked 输出占位符，消毒整体 HTML 之后再回填。 */
export interface MathSink {
	nonce: string;
	items: string[];
}

let sink: MathSink | null = null;

export function withMathSink<T>(next: MathSink, run: () => T): T {
	const previous = sink;
	sink = next;
	try {
		return run();
	} finally {
		sink = previous;
	}
}

export function fillMath(html: string, filled: MathSink): string {
	const pattern = new RegExp(`<span data-math="${filled.nonce}:(\\d+)"></span>`, "g");
	return html.replace(pattern, (whole, index: string) => filled.items[Number(index)] ?? whole);
}

function escapeText(text: string): string {
	return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function place(tex: string, display: boolean, raw: string): string {
	const html = renderMath(tex, display);
	if (html === null || sink === null) return escapeText(raw);
	sink.items.push(html);
	return `<span data-math="${sink.nonce}:${sink.items.length - 1}"></span>`;
}

// 块级 $$ / \[ 必须独占行首且结束定界符在行尾；行内 $..$ 要求起始后非空白、结尾前非空白且后随非数字，避免把 "$5 和 $10" 当公式，
// 内容不含反引号，避免货币符号与后面行内代码里的 $ 配成公式；\(..\) 为行内公式。
const blockRules = [
	/^\$\$[ \t]*\n?([\s\S]+?)\n?[ \t]*\$\$[ \t]*(?:\n|$)/,
	/^\\\[[ \t]*\n?([\s\S]+?)\n?[ \t]*\\\][ \t]*(?:\n|$)/,
];
const inlineRule = /^(?:\\\(([\s\S]+?)\\\)|(\$\$?)(?![\s$])((?:\\[\s\S]|[^$\\`])+?)(?<!\s)\2(?!\d))/;
// 未成对的 \( \) \[ \] 保持原文（marked 默认转义规则会吞掉反斜杠）。
const literalRule = /^\\[()[\]]/;

function indexOf(src: string, pattern: RegExp): number | undefined {
	const index = src.search(pattern);
	return index < 0 ? undefined : index;
}

// marked 对后注册的扩展优先尝试，因此兜底的 mathLiteral 必须排在最前。
export const mathExtensions: TokenizerAndRendererExtension[] = [
	{
		name: "mathLiteral",
		level: "inline",
		start: (src) => indexOf(src, /\\[()[\]]/),
		tokenizer(src) {
			const match = literalRule.exec(src);
			return match ? { type: "mathLiteral", raw: match[0] } : undefined;
		},
		renderer: (token) => escapeText(token.raw),
	},
	{
		name: "mathBlock",
		level: "block",
		start: (src) => src.match(/^(?:\$\$|\\\[)/m)?.index,
		tokenizer(src) {
			for (const rule of blockRules) {
				const match = rule.exec(src);
				if (match?.[1]?.trim()) return { type: "mathBlock", raw: match[0], text: match[1].trim() };
			}
			return undefined;
		},
		renderer: (token) => `<p>${place(token.text as string, true, token.raw.trimEnd())}</p>\n`,
	},
	{
		name: "mathInline",
		level: "inline",
		start: (src) => indexOf(src, /\$|\\\(/),
		tokenizer(src) {
			const match = inlineRule.exec(src);
			const tex = match?.[1] ?? match?.[3];
			if (!match || !tex?.trim()) return undefined;
			return { type: "mathInline", raw: match[0], text: tex.trim(), display: match[2] === "$$" };
		},
		renderer: (token) => place(token.text as string, token.display as boolean, token.raw),
	},
];
