/**
 * Markdown 代码块语法高亮(design D4):highlight.js core + 常用语言 eager 注册,
 * 其余语言首帧后懒加载(与 core 共享同一 CJS 单例,注册即生效)。hljs 输出的
 * `<span class="hljs-*">` 按 Web styles.css 的 class 分组映射到 syntax 槽位;
 * 未知语言与未映射 scope 回退平涂,绝不高亮失败。
 */

import { visibleWidth } from "@earendil-works/pi-tui";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import dart from "highlight.js/lib/languages/dart";
import diff from "highlight.js/lib/languages/diff";
import go from "highlight.js/lib/languages/go";
import groovy from "highlight.js/lib/languages/groovy";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import kotlin from "highlight.js/lib/languages/kotlin";
import lua from "highlight.js/lib/languages/lua";
import markdown from "highlight.js/lib/languages/markdown";
import nix from "highlight.js/lib/languages/nix";
import perl from "highlight.js/lib/languages/perl";
import php from "highlight.js/lib/languages/php";
import python from "highlight.js/lib/languages/python";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import scala from "highlight.js/lib/languages/scala";
import swift from "highlight.js/lib/languages/swift";
import typescript from "highlight.js/lib/languages/typescript";
import yaml from "highlight.js/lib/languages/yaml";
import type { ThemeSlotName } from "./palette.ts";
import { theme } from "./slots.ts";

const EAGER_LANGUAGES = {
	bash,
	c,
	cpp,
	csharp,
	dart,
	diff,
	go,
	groovy,
	java,
	javascript,
	json,
	kotlin,
	lua,
	markdown,
	nix,
	perl,
	php,
	python,
	ruby,
	rust,
	scala,
	swift,
	typescript,
	yaml,
};

for (const [name, language] of Object.entries(EAGER_LANGUAGES)) {
	hljs.registerLanguage(name, language);
}

/** hljs 自带大多数别名,"shell" 等除外,在此归一。 */
const LANG_ALIASES: Readonly<Record<string, string>> = { shell: "bash" };

let allLanguagesPromise: Promise<void> | undefined;

/**
 * 首帧后注册其余全部语言;失败容忍(保留 eager 子集)。
 * es/index.js 与 es/core.js 共用 lib/core.js 单例,注册对既有 hljs 实例生效。
 */
export function loadAllHighlightLanguages(): Promise<void> {
	if (!allLanguagesPromise) {
		allLanguagesPromise = new Promise((resolve) => {
			setImmediate(() => {
				void import("highlight.js").then(
					() => resolve(),
					() => resolve(),
				);
			});
		});
	}
	return allLanguagesPromise;
}

/** hljs class → 语义槽位(分组与 Web styles.css 一致;addition/deletion 走 diff 槽)。 */
const SCOPE_SLOTS: Readonly<Record<string, ThemeSlotName>> = {
	comment: "syntaxComment",
	quote: "syntaxComment",
	keyword: "syntaxKeyword",
	"selector-tag": "syntaxKeyword",
	literal: "syntaxKeyword",
	tag: "syntaxKeyword",
	name: "syntaxKeyword",
	title: "syntaxFunction",
	section: "syntaxFunction",
	attr: "syntaxFunction",
	string: "syntaxString",
	doctag: "syntaxString",
	regexp: "syntaxString",
	number: "syntaxNumber",
	symbol: "syntaxNumber",
	bullet: "syntaxNumber",
	link: "syntaxNumber",
	built_in: "syntaxType",
	type: "syntaxType",
	attribute: "syntaxType",
	"selector-class": "syntaxType",
	"selector-id": "syntaxType",
	meta: "syntaxType",
	variable: "syntaxVariable",
	"template-variable": "syntaxVariable",
	params: "syntaxVariable",
	subst: "syntaxVariable",
	operator: "syntaxOperator",
	punctuation: "syntaxPunctuation",
	addition: "diffAdded",
	deletion: "diffRemoved",
};

function slotFor(scope: string | undefined): ThemeSlotName {
	if (scope === undefined) return "syntaxVariable";
	const exact = SCOPE_SLOTS[scope];
	if (exact !== undefined) return exact;
	// hljs 复合 class 形如 "title function_"、"meta string":取首段与前缀再查。
	const dot = scope.indexOf(".");
	if (dot !== -1) {
		const prefix = SCOPE_SLOTS[scope.slice(0, dot)];
		if (prefix !== undefined) return prefix;
	}
	const dash = scope.indexOf("-");
	if (dash !== -1) {
		const prefix = SCOPE_SLOTS[scope.slice(0, dash)];
		if (prefix !== undefined) return prefix;
	}
	return "syntaxVariable";
}

function decodeEntityAt(html: string, index: number): { text: string; length: number } | undefined {
	const rest = html.slice(index, index + 10);
	const named =
		(rest.startsWith("&amp;") && { text: "&", length: 5 }) ||
		(rest.startsWith("&lt;") && { text: "<", length: 4 }) ||
		(rest.startsWith("&gt;") && { text: ">", length: 4 }) ||
		(rest.startsWith("&quot;") && { text: '"', length: 6 }) ||
		(rest.startsWith("&#x27;") && { text: "'", length: 6 }) ||
		(rest.startsWith("&#39;") && { text: "'", length: 5 });
	if (named) return named;
	const numeric = /^&#(x?[0-9a-fA-F]+);/.exec(rest);
	if (numeric?.[1] !== undefined) {
		const value = numeric[1].startsWith("x")
			? Number.parseInt(numeric[1].slice(1), 16)
			: Number.parseInt(numeric[1], 10);
		if (Number.isFinite(value)) return { text: String.fromCodePoint(value), length: numeric[0].length };
	}
	return undefined;
}

const SPAN_CLOSE = "</span>";

/** 代码块行:着色内容 + 纯文本宽度(用于块内等宽补齐)。 */
type CodeLine = { styled: string; width: number };

/** 块内各行用 codeBg 空格补齐:至少与最宽行同宽;给定 fullWidth 时铺满该宽度。 */
function solidBlock(lines: CodeLine[], fullWidth?: number): string[] {
	const max = Math.max(fullWidth ?? 0, ...lines.map((line) => line.width));
	return lines.map((line) => theme.codeBg(line.styled + " ".repeat(Math.max(0, max - line.width))));
}

/** hljs HTML → 按 scope 着色的行数组;段内着色(scope 槽位),空白段走 codeFg,整体 codeBg 矩形。 */
function renderHighlighted(html: string, fullWidth?: number): string[] {
	const segments: Array<{ slot: ThemeSlotName | "plain"; text: string }> = [];
	const scopes: Array<string | undefined> = [];
	let textBuffer = "";

	const flushText = () => {
		if (textBuffer === "") return;
		let slot: ThemeSlotName | "plain" = "plain";
		for (let i = scopes.length - 1; i >= 0; i--) {
			const scope = scopes[i];
			if (scope !== undefined) {
				slot = slotFor(scope);
				break;
			}
		}
		segments.push({ slot, text: textBuffer });
		textBuffer = "";
	};

	let index = 0;
	while (index < html.length) {
		if (html.startsWith("<span", index)) {
			const tagEnd = html.indexOf(">", index + 5);
			if (tagEnd !== -1) {
				flushText();
				const tag = html.slice(index, tagEnd + 1);
				const classMatch = /\sclass\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(tag);
				const classValue = classMatch?.[1] ?? classMatch?.[2] ?? "";
				const scope = classValue
					.split(/\s+/)
					.find((name) => name.startsWith("hljs-"))
					?.slice("hljs-".length);
				scopes.push(scope);
				index = tagEnd + 1;
				continue;
			}
		}
		if (html.startsWith(SPAN_CLOSE, index)) {
			flushText();
			scopes.pop();
			index += SPAN_CLOSE.length;
			continue;
		}
		const char = html[index];
		if (char === "&") {
			const decoded = decodeEntityAt(html, index);
			if (decoded !== undefined) {
				textBuffer += decoded.text;
				index += decoded.length;
				continue;
			}
		}
		textBuffer += char;
		index++;
	}
	flushText();

	// 按行重组:段跨界时拆分,保持每行独立包底。
	const lines: CodeLine[] = [];
	let current = "";
	let currentWidth = 0;
	for (const segment of segments) {
		const parts = segment.text.split("\n");
		for (const [i, part] of parts.entries()) {
			if (i > 0) {
				lines.push({ styled: current, width: currentWidth });
				current = "";
				currentWidth = 0;
			}
			if (part === "") continue;
			currentWidth += visibleWidth(part);
			current += segment.slot === "plain" ? theme.codeFg(part) : theme[segment.slot](part);
		}
	}
	lines.push({ styled: current, width: currentWidth });
	return solidBlock(lines, fullWidth);
}

function normalizeLang(lang: string | undefined): string {
	if (lang === undefined) return "";
	const lowered = lang.trim().toLowerCase();
	return LANG_ALIASES[lowered] ?? lowered;
}

/**
 * MarkdownTheme.highlightCode 实现:已注册语言按 scope 着色,否则 codeFg/codeBg 平涂;
 * 两种路径的底色都补齐为等宽矩形,给定 fullWidth 时铺满该宽度。
 */
export function highlightCodeToAnsiLines(code: string, lang: string | undefined, fullWidth?: number): string[] {
	const normalized = normalizeLang(lang);
	if (normalized !== "" && hljs.getLanguage(normalized) !== undefined) {
		try {
			return renderHighlighted(hljs.highlight(code, { language: normalized }).value, fullWidth);
		} catch {
			// 高亮失败退回平涂
		}
	}
	return solidBlock(
		code.split("\n").map((line) => ({ styled: theme.codeFg(line), width: visibleWidth(line) })),
		fullWidth,
	);
}
