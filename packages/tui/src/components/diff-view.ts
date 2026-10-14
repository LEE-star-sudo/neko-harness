/**
 * 工具卡 diff 两层高亮(add-code-diff-display 3.1):解析展示型 diff 行,
 * 重组新/旧文档后按目标语言整篇 hljs 高亮(保留跨行字符串/块注释的 token 状态),
 * 再把高亮段映射回 diff 行(语法色前景 + 增删行底色);语言不可识别或高亮失败
 * 回退为仅增删着色,不报错、不缺失内容。
 */

import { diffBackgroundAnsi, theme } from "../theme/slots.ts";
import { type HighlightSegment, highlightCodeToAnsiLines, highlightCodeToSegments } from "../theme/syntax.ts";

/** 解析后的 diff 行:add/del/context 保留原行号文本(含上游 padding)与内容;raw 为无法解析的行。 */
export type ParsedDiffLine =
	| { readonly kind: "add" | "del" | "context"; readonly lineNum: string; readonly content: string }
	| { readonly kind: "raw"; readonly text: string };

/**
 * 解析单条 diff 行:`+123 content` / `-45 content` / ` 12 content`(edit 上游 generateDiffString)
 * write 投影合成仅移除单个 `+ ` 前缀;按工具名指定格式,保留代码缩进和前导数字。
 */
export function parseDiffLine(
	line: string,
	format: "edit" | "write" = "edit",
): { prefix: "+" | "-" | " "; lineNum: string; content: string } | null {
	if (format === "write") {
		return line.startsWith("+ ") ? { prefix: "+", lineNum: "", content: line.slice(2) } : null;
	}
	const match = /^([+\- ])( *\d+) (.*)$/.exec(line);
	if (match === null) return null;
	const first = match[1]!;
	const prefix: "+" | "-" | " " = first === "+" || first === "-" ? first : " ";
	return { prefix, lineNum: match[2] ?? "", content: match[3] ?? "" };
}

/** 逐行解析;解析失败的行保留为 raw(渲染时原样输出,不丢内容)。 */
export function parseDiffLines(diff: string, format: "edit" | "write" = "edit"): ParsedDiffLine[] {
	return diff.split("\n").map((line) => {
		const parsed = parseDiffLine(line, format);
		if (parsed === null) return { kind: "raw", text: line } as const;
		const kind = parsed.prefix === "+" ? "add" : parsed.prefix === "-" ? "del" : "context";
		return { kind, lineNum: parsed.lineNum, content: parsed.content } as const;
	});
}

/**
 * 从工具卡 summary/detail 提取目标文件路径(语言推断用):
 * edit 摘要形如 `path (N edits)`(路径可能被 truncateMiddle,扩展名保留在尾部);
 * write 详情首行即完整路径(detail = `${path}\n${content}`),无 detail 回退摘要。
 */
export function diffTargetPath(name: string, summary: string, detail: string | null): string | undefined {
	if (name === "edit") {
		const path = summary.replace(/ \(\d+ edits?\)$/, "");
		return path === "" ? undefined : path;
	}
	if (name === "write") {
		if (detail !== null) {
			const first = detail.split("\n", 1)[0] ?? "";
			if (first !== "") return first;
		}
		return summary === "" ? undefined : summary;
	}
	return undefined;
}

/** 重组新文档(context+add)与旧文档(context+del)并按语言整篇高亮;语言不可识别/失败返回 null。 */
function highlightDocuments(
	parsed: readonly ParsedDiffLine[],
	lang: string | undefined,
): { newLines: HighlightSegment[][]; oldLines: HighlightSegment[][] } | null {
	const newContents: string[] = [];
	const oldContents: string[] = [];
	for (const line of parsed) {
		if (line.kind === "raw") continue;
		if (line.kind !== "del") newContents.push(line.content);
		if (line.kind !== "add") oldContents.push(line.content);
	}
	const newLines = highlightCodeToSegments(newContents.join("\n"), lang);
	const oldLines = highlightCodeToSegments(oldContents.join("\n"), lang);
	if (newLines === null || oldLines === null) return null;
	return { newLines, oldLines };
}

/** 段 → ANSI:plain 走 codeFg,其余走语法槽位;均只发 39 前景重置,行底色跨段保持。 */
function styleSegments(segments: readonly HighlightSegment[]): string {
	return segments.map((s) => (s.slot === "plain" ? theme.codeFg(s.text) : theme[s.slot](s.text))).join("");
}

/** 增删行:弱化 gutter + 行底色(tint)上的语法段;gutter 的 49 重置后在内容前重铺底色。 */
function paintChangedLine(kind: "add" | "del", gutter: string, content: string): string {
	const bg = diffBackgroundAnsi(kind === "add" ? "added" : "removed");
	return `${bg}${theme.dim(gutter)}${bg}${content}\x1b[49m`;
}

/**
 * 两层高亮渲染 diff 为 ANSI 行数组:语法 token 前景色(整篇高亮后按行映射回新增/删除/context)
 * + 增删行底色(diffAdded/diffRemoved 槽位)。语言不可识别或高亮失败时回退
 * `highlightCodeToAnsiLines(diff, "diff")`(仅增删着色)。
 */
export function highlightDiffLines(
	diff: string,
	lang: string | undefined,
	format: "edit" | "write" = "edit",
): string[] {
	const parsed = parseDiffLines(diff, format);
	const documents = highlightDocuments(parsed, lang);
	if (documents === null) return highlightCodeToAnsiLines(diff, "diff");
	const rendered: string[] = [];
	let newIndex = 0;
	let oldIndex = 0;
	for (const line of parsed) {
		if (line.kind === "raw") {
			rendered.push(theme.dim(line.text));
			continue;
		}
		const sign = line.kind === "add" ? "+" : line.kind === "del" ? "-" : " ";
		const gutter = `${sign}${line.lineNum} `;
		if (line.kind === "del") {
			rendered.push(paintChangedLine("del", gutter, styleSegments(documents.oldLines[oldIndex++] ?? [])));
			continue;
		}
		if (line.kind === "add") {
			rendered.push(paintChangedLine("add", gutter, styleSegments(documents.newLines[newIndex++] ?? [])));
			continue;
		}
		rendered.push(`${theme.dim(gutter)}${styleSegments(documents.newLines[newIndex++] ?? [])}`);
		oldIndex++;
	}
	return rendered;
}
