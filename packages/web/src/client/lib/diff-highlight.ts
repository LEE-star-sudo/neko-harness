import hljs from "highlight.js/lib/core";
import { escapeHtml, isHighlightable } from "./highlight.ts";

/** 一条待渲染的 diff 行：增删种类、弱化行号、行内容 HTML。 */
export type DiffRow = {
	kind: "added" | "removed" | "context";
	/** 原始行号文本（"+123"/"-45"/" 12"；write 行仅 "+"），渲染时弱化显示。 */
	gutter: string;
	/** 行内容 HTML：语法高亮 span 标记或转义纯文本；注入前需经 DOMPurify 消毒。 */
	html: string;
};

/** highlighted=两层着色（语法 token + 增删底色）；plain=仅增删着色（语言不可识别/高亮失败回退）。 */
export type DiffRows = { kind: "highlighted" | "plain"; rows: DiffRow[] };

/**
 * 解析单条 diff 行："+123 content"/"-45 content"/" 12 content"（edit 上游格式）
 * write 投影合成仅移除单个 "+ " 前缀；必须按工具名指定格式，避免把内容识别为行号。
 */
export function parseDiffLine(
	line: string,
	format: "edit" | "write" = "edit",
): { prefix: "+" | "-" | " "; lineNum: string; content: string } | null {
	if (format === "write") {
		return line.startsWith("+ ") ? { prefix: "+", lineNum: "", content: line.slice(2) } : null;
	}
	const match = line.match(/^([+\- ])( *\d+) (.*)$/);
	const prefix = match?.[1];
	if (prefix !== "+" && prefix !== "-" && prefix !== " ") return null;
	return { prefix, lineNum: match?.[2] ?? "", content: match?.[3] ?? "" };
}

/** 从工具名与参数摘要取目标文件路径（edit/write）；其余工具或取不到返回 null。 */
export function diffPathFromSummary(name: string, summary: string): string | null {
	if (name === "write") {
		const path = summary.trim();
		return path === "" ? null : path;
	}
	if (name === "edit") {
		const match = summary.match(/^(.*) \(\d+ edits\)$/);
		const path = (match?.[1] ?? "").trim();
		return path === "" ? null : path;
	}
	return null;
}

/** 按文件路径扩展名推断 hljs 语言（已注册别名如 ts/py/sh 可解析）；不可识别返回 undefined。 */
export function languageFromPath(path: string | null | undefined): string | undefined {
	if (path == null) return undefined;
	const base = path.split("/").pop() ?? "";
	const dot = base.lastIndexOf(".");
	if (dot <= 0) return undefined;
	const ext = base
		.slice(dot + 1)
		.trim()
		.toLowerCase();
	return isHighlightable(ext) ? ext : undefined;
}

/**
 * 展示型 diff → 按行渲染模型。
 * 重组「新文件」（context+新增行）与「旧文件」（context+删除行），按语言对完整文档
 * 整体高亮（保留跨行字符串/块注释上下文），高亮 HTML 按行切分（跨行开标签延续到下一行），
 * 再映射回 diff 行：新增行取新文件 token、删除行取旧文件 token、context 行取新文件。
 * 语言不可识别或高亮失败回退为仅增删着色（html 为转义纯文本），不报错、不缺失内容。
 */
export function renderDiffRows(
	diff: string,
	language: string | undefined,
	format: "edit" | "write" = "edit",
): DiffRows {
	const rawLines = diff.split("\n");
	const parsed = rawLines.map((line) => parseDiffLine(line, format));

	const newDoc: string[] = [];
	const oldDoc: string[] = [];
	const newAt: number[] = [];
	const oldAt: number[] = [];
	for (let i = 0; i < parsed.length; i++) {
		const p = parsed[i];
		if (p === undefined || p === null) {
			newAt.push(-1);
			oldAt.push(-1);
			continue;
		}
		if (p.prefix !== "-") {
			newAt.push(newDoc.length);
			newDoc.push(p.content);
		} else {
			newAt.push(-1);
		}
		if (p.prefix !== "+") {
			oldAt.push(oldDoc.length);
			oldDoc.push(p.content);
		} else {
			oldAt.push(-1);
		}
	}

	const lang = language !== undefined && isHighlightable(language) ? language : undefined;
	if (lang !== undefined) {
		try {
			const newHtml = splitHighlightedLines(hljs.highlight(newDoc.join("\n"), { language: lang }).value);
			const oldHtml = splitHighlightedLines(hljs.highlight(oldDoc.join("\n"), { language: lang }).value);
			return { kind: "highlighted", rows: mapRows(rawLines, parsed, newAt, oldAt, newHtml, oldHtml) };
		} catch {
			// 高亮失败回退纯文本行
		}
	}
	return {
		kind: "plain",
		rows: mapRows(rawLines, parsed, newAt, oldAt, newDoc.map(escapeHtml), oldDoc.map(escapeHtml)),
	};
}

function mapRows(
	rawLines: string[],
	parsed: ReadonlyArray<{ prefix: "+" | "-" | " "; lineNum: string; content: string } | null>,
	newAt: readonly number[],
	oldAt: readonly number[],
	newHtml: readonly string[],
	oldHtml: readonly string[],
): DiffRow[] {
	return parsed.map((p, i) => {
		if (p === null) return { kind: "context", gutter: "", html: escapeHtml(rawLines[i] ?? "") };
		const gutter = `${p.prefix}${p.lineNum}`;
		if (p.prefix === "-") return { kind: "removed", gutter, html: oldHtml[oldAt[i] ?? -1] ?? "" };
		const html = newHtml[newAt[i] ?? -1] ?? "";
		return p.prefix === "+" ? { kind: "added", gutter, html } : { kind: "context", gutter, html };
	});
}

/** 把 hljs 输出的高亮 HTML 按行切分：行尾补齐未闭合的 span，下一行重新打开（标签栈延续）。 */
function splitHighlightedLines(html: string): string[] {
	const lines: string[] = [];
	const stack: string[] = [];
	const re = /<span class="([^"]*)">|<\/span>|\n/g;
	let current = "";
	let last = 0;
	for (const match of html.matchAll(re)) {
		const index = match.index;
		current += html.slice(last, index);
		last = index + match[0].length;
		if (match[0] === "\n") {
			lines.push(current + stack.map(() => "</span>").join(""));
			current = stack.map((cls) => `<span class="${cls}">`).join("");
		} else if (match[1] !== undefined) {
			stack.push(match[1]);
			current += match[0];
		} else {
			stack.pop();
			current += match[0];
		}
	}
	lines.push(current + html.slice(last));
	return lines;
}
