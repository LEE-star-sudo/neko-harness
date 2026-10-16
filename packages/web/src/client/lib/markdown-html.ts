import DOMPurify from "dompurify";
import { Marked } from "marked";
import { isHighlightable, renderCodeHtml } from "./highlight.ts";
import { fillMath, mathExtensions, withMathSink } from "./math.ts";

// 自定义代码块渲染：highlight.js 语法高亮（span 标记经 DOMPurify 保留）；公式扩展在转义处理前截取 $ 片段。
const parser = new Marked({
	extensions: mathExtensions,
	renderer: {
		code({ text, lang }) {
			const languageClass = isHighlightable(lang) ? `hljs language-${lang ?? ""}` : "hljs";
			return `<pre><code class="${languageClass}">${renderCodeHtml(text, lang)}</code></pre>`;
		},
	},
});

/** marked 解析 + DOMPurify 消毒（spec：模型输出必须消毒）；公式由 KaTeX 单独渲染消毒后在整体消毒之后回填。 */
export function renderMarkdownHtml(text: string): string {
	const sink = { nonce: crypto.randomUUID(), items: [] as string[] };
	const raw = withMathSink(sink, () => parser.parse(text, { async: false, gfm: true, breaks: true }));
	return fillMath(DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } }), sink);
}
