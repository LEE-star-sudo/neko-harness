import DOMPurify from "dompurify";
import { marked } from "marked";
import { useMemo } from "react";
import { isHighlightable, renderCodeHtml } from "../lib/highlight";

// 自定义代码块渲染：highlight.js 语法高亮（span 标记经 DOMPurify 保留）。
marked.use({
	renderer: {
		code({ text, lang }) {
			const languageClass = isHighlightable(lang) ? `hljs language-${lang ?? ""}` : "hljs";
			return `<pre><code class="${languageClass}">${renderCodeHtml(text, lang)}</code></pre>`;
		},
	},
});

/** Markdown 渲染：marked 解析（含代码块语法高亮）+ DOMPurify 消毒（spec：模型输出必须消毒）。 */
export function Markdown({ text }: { text: string }) {
	const html = useMemo(() => {
		const raw = marked.parse(text, { async: false, gfm: true, breaks: true });
		return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
	}, [text]);
	// biome-ignore lint/security/noDangerouslySetInnerHtml: Markdown 已经过 DOMPurify.sanitize 消毒（无脚本/事件属性）。
	return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />;
}
