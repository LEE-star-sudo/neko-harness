import type { Usage, UserMessage } from "@earendil-works/pi-ai";
import type { UsageState } from "@earendil-works/pi-durable";

/** 1234 -> "1.2k", 3456000 -> "3.5M"。 */
export function formatTokens(tokens: number): string {
	if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
	if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
	return String(tokens);
}

/** UserMessage.content -> 纯文本。 */
export function userText(content: UserMessage["content"]): string {
	if (typeof content === "string") return content;
	return content
		.filter((block) => block.type === "text")
		.map((block) => block.text)
		.join("");
}

/** 单行截断（截断点加 "…"）。 */
export function truncateMiddle(text: string, maxWidth: number): string {
	if (text.length <= maxWidth) return text;
	if (maxWidth <= 1) return "…";
	const half = Math.floor((maxWidth - 1) / 2);
	return `${text.slice(0, half)}…${text.slice(text.length - (maxWidth - 1 - half))}`;
}

export type ToolSummary = {
	/** 参数摘要，单行。 */
	readonly args: string;
	/** 参数展开详情（可选多行）。 */
	readonly detail?: string;
};

/** 内置工具的参数摘要；未知工具退回 JSON。 */
export function summarizeToolCall(name: string, args: unknown): ToolSummary {
	const record = (args ?? {}) as Record<string, unknown>;
	switch (name) {
		case "bash": {
			const command = typeof record.command === "string" ? record.command : "";
			const firstLine = command.split("\n", 1)[0] ?? "";
			return { args: truncateMiddle(firstLine, 100), detail: command };
		}
		case "write": {
			const path = typeof record.path === "string" ? record.path : "";
			const content = typeof record.content === "string" ? record.content : "";
			return { args: truncateMiddle(path, 100), detail: `${path}\n${content}` };
		}
		case "edit": {
			const path = typeof record.path === "string" ? record.path : "";
			const edits = Array.isArray(record.edits) ? record.edits.length : 0;
			return { args: `${truncateMiddle(path, 88)} (${edits} edits)` };
		}
		case "read": {
			const path = typeof record.path === "string" ? record.path : "";
			const offset = typeof record.offset === "number" ? ` offset ${record.offset}` : "";
			const limit = typeof record.limit === "number" ? ` limit ${record.limit}` : "";
			return { args: truncateMiddle(`${path}${offset}${limit}`, 100) };
		}
		default: {
			const json = JSON.stringify(record) ?? "";
			return { args: truncateMiddle(json, 100), detail: json };
		}
	}
}

/** 工具结果内容的纯文本（text blocks 拼接）。 */
export function toolResultText(content: ReadonlyArray<{ type: string; text?: string }>): string {
	return content
		.filter((block) => block.type === "text" && typeof block.text === "string")
		.map((block) => block.text ?? "")
		.join("\n");
}

/** 汇总 pi.usage 的模型与工具用量。 */
export function totalUsage(state: UsageState): Usage {
	const total: Usage = {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
	for (const usage of [...Object.values(state.models), ...Object.values(state.tools)]) {
		total.input += usage.input;
		total.output += usage.output;
		total.cacheRead += usage.cacheRead;
		total.cacheWrite += usage.cacheWrite;
		total.totalTokens += usage.totalTokens;
		total.cost.total += usage.cost.total;
	}
	return total;
}
