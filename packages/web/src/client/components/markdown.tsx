import DOMPurify from "dompurify";
import { marked } from "marked";
import { useMemo } from "react";

/** Markdown 渲染：marked 解析 + DOMPurify 消毒（spec：模型输出必须消毒）。 */
export function Markdown({ text }: { text: string }) {
	const html = useMemo(() => {
		const raw = marked.parse(text, { async: false, gfm: true, breaks: true });
		return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
	}, [text]);
	// biome-ignore lint/security/noDangerouslySetInnerHtml: Markdown 已经过 DOMPurify.sanitize 消毒（无脚本/事件属性）。
	return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />;
}
