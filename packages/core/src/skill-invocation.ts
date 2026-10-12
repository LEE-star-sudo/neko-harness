/**
 * `/skill:` 展开块的解析器（expandSkillCommand 输出的逆变换）。零 Node 依赖的叶模块，
 * Web 浏览器端经 `@neko-harness/core/skill-invocation` 子路径引入，避免把 core 根模块图
 * （node:os 等顶层副作用）拖进浏览器 bundle。
 */

/** Parsed form of an expanded `/skill:` user message (the inverse of expandSkillCommand's output shape). */
export type SkillInvocation = {
	readonly name: string;
	readonly location: string;
	/** Everything between the opening tag and the final closing tag, frontmatter already stripped by expansion. */
	readonly body: string;
	/** Text after the closing tag ("" when the invocation carried no args). */
	readonly args: string;
};

const unescapeXml = (value: string): string =>
	value
		.replace(/&apos;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&gt;/g, ">")
		.replace(/&lt;/g, "<")
		.replace(/&amp;/g, "&");

/**
 * Recognize expandSkillCommand's output: `<skill name="..." location="...">…</skill>` optionally followed by
 * `\n\n` + args. Attribute values are escapeXml-encoded, so a raw `"` cannot appear inside them. The closing
 * match is the LAST `</skill>`, tolerating a literal closing tag inside a skill body. Anything that does not
 * match the full shape returns null; callers fall back to rendering the text as-is.
 */
export const parseSkillInvocation = (text: string): SkillInvocation | null => {
	const open = /^<skill name="([^"]*)" location="([^"]*)">/.exec(text);
	if (!open) return null;
	const close = text.lastIndexOf("</skill>");
	if (close < open[0].length) return null;
	const rest = text.slice(close + "</skill>".length);
	if (rest !== "" && !rest.startsWith("\n\n")) return null;
	return {
		name: unescapeXml(open[1]!),
		location: unescapeXml(open[2]!),
		body: text.slice(open[0].length, close),
		args: rest.slice(2),
	};
};
