import { useMemo } from "react";
import { renderMarkdownHtml } from "../lib/markdown-html";

/** Markdown 渲染：marked 解析（含代码块语法高亮与公式）+ DOMPurify 消毒（spec：模型输出必须消毒）。 */
export function Markdown({ text }: { text: string }) {
	const html = useMemo(() => renderMarkdownHtml(text), [text]);
	// biome-ignore lint/security/noDangerouslySetInnerHtml: Markdown 已经过 DOMPurify.sanitize 消毒（无脚本/事件属性），公式经 KaTeX（trust:false）渲染并单独消毒。
	return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />;
}
