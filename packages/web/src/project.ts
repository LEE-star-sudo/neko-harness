import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ConversationView, LiveState, ToolSlot, UsageState } from "@earendil-works/pi-durable";
import { summarizeToolCall, toolResultText, totalUsage, userText } from "./format.ts";
import type { ChatItem, ChatView, StreamingToolCall, StreamingView } from "./protocol.ts";

/** ConversationView → 前端投影 ChatView（服务器每次 commit 后调用）。 */
export function projectChatView(view: ConversationView, modelLabel: string, cwd: string): ChatView {
	const live = (view.docs["pi.live"] ?? {}) as LiveState;
	const usage = totalUsage((view.docs["pi.usage"] ?? { models: {}, tools: {} }) as UsageState);

	// 先按 callId 收集工具结果（pi.tool-result entry），再按序展开条目。
	const results = new Map<string, Extract<ChatItem, { type: "tool" }>>();
	for (const entry of view.entries) {
		for (const message of entry.model ?? []) {
			if (message.role !== "toolResult") continue;
			results.set(message.toolCallId, {
				type: "tool",
				key: `t${message.toolCallId}`,
				callId: message.toolCallId,
				name: message.toolName,
				summary: "",
				detail: null,
				phase: "done",
				isError: message.isError,
				output: null,
				result: toolResultText(message.content),
				durationMs: message.durationMs ?? null,
				note: null,
			});
		}
	}

	const items: ChatItem[] = [];
	for (const entry of view.entries) {
		const message = entry.model?.[0];
		if (entry.kind === "pi.user" && message?.role === "user") {
			items.push({ type: "user", key: `e${entry.id}`, id: entry.id, text: userText(message.content) });
			continue;
		}
		if (entry.kind === "pi.assistant" && message?.role === "assistant") {
			const assistant = message as AssistantMessage;
			items.push(assistantItem(assistant, entry.id));
			// 以 toolUse 结束的回答才会真正执行工具；其余只保留已流式展示过的卡片（note 标记未运行）。
			const ran = assistant.stopReason === "toolUse";
			for (const block of assistant.content) {
				if (block.type !== "toolCall") continue;
				const result = results.get(block.id);
				if (result !== undefined) {
					items.push(withArgs(result, block.name, block.arguments));
				} else {
					const summary = summarizeToolCall(block.name, block.arguments);
					items.push({
						type: "tool",
						key: `t${block.id}`,
						callId: block.id,
						name: block.name,
						summary: summary.args,
						detail: summary.detail ?? null,
						phase: "done",
						isError: false,
						output: null,
						result: null,
						durationMs: null,
						note: ran ? null : "未运行：回答被中断。",
					});
				}
			}
			continue;
		}
		if (entry.kind === "pi.tool-result") continue; // 已合入对应工具卡片
		if (entry.kind === "pi.compaction") {
			items.push({ type: "system", key: `e${entry.id}`, id: entry.id, text: "[context 已压缩]" });
		} else if (entry.kind === "pi.reset") {
			items.push({ type: "system", key: `e${entry.id}`, id: entry.id, text: "[new context]" });
		}
	}

	const runningTool = live.tools?.find((slot) => slot.status === "running");
	const status =
		live.run === undefined
			? null
			: live.generation?.retry !== undefined
				? `重试中（第 ${live.generation.attempt + 1} 次）…`
				: runningTool !== undefined
					? `运行 ${runningTool.name}…`
					: "思考中…";

	return {
		model: modelLabel,
		cwd,
		busy: live.run !== undefined,
		status,
		usage: {
			input: usage.input,
			output: usage.output,
			cacheRead: usage.cacheRead,
			cacheWrite: usage.cacheWrite,
			cost: usage.cost.total,
		},
		items,
		streaming: projectStreaming(live),
	};
}

function withArgs(item: Extract<ChatItem, { type: "tool" }>, name: string, args: unknown): ChatItem {
	const summary = summarizeToolCall(name, args);
	return { ...item, name, summary: summary.args, detail: summary.detail ?? null };
}

function assistantItem(message: AssistantMessage, id: number): Extract<ChatItem, { type: "assistant" }> {
	let thinking = "";
	let text = "";
	for (const block of message.content) {
		if (block.type === "thinking" && block.thinking.trim() !== "") {
			thinking = thinking === "" ? block.thinking : `${thinking}\n\n${block.thinking}`;
		}
		if (block.type === "text" && block.text.trim() !== "") {
			text = text === "" ? block.text : `${text}\n\n${block.text}`;
		}
	}
	const hasToolCalls = message.content.some((block) => block.type === "toolCall");
	const note =
		message.stopReason === "length"
			? "回答在完成前被截断。"
			: !hasToolCalls && message.stopReason === "aborted"
				? "已中止。"
				: !hasToolCalls && message.stopReason === "error"
					? `出错：${message.errorMessage ?? "未知错误"}`
					: null;
	return {
		type: "assistant",
		key: `e${id}`,
		id,
		thinking,
		text,
		stopReason: message.stopReason ?? null,
		errorMessage: message.errorMessage ?? null,
		note,
	};
}

function projectStreaming(live: LiveState): StreamingView | null {
	const message = live.generation?.message as AssistantMessage | undefined;
	if (message === undefined) return null;
	let thinking = "";
	let text = "";
	const toolCalls: StreamingToolCall[] = [];
	for (const block of message.content) {
		if (block.type === "thinking" && block.thinking.trim() !== "") {
			thinking = thinking === "" ? block.thinking : `${thinking}\n\n${block.thinking}`;
			continue;
		}
		if (block.type === "text" && block.text.trim() !== "") {
			text = text === "" ? block.text : `${text}\n\n${block.text}`;
			continue;
		}
		if (block.type === "toolCall") {
			const slot = live.tools?.find((candidate) => candidate.callId === block.id) as ToolSlot | undefined;
			const summary = summarizeToolCall(block.name, block.arguments);
			toolCalls.push({
				callId: block.id,
				name: block.name,
				summary: summary.args,
				detail: summary.detail ?? null,
				phase: slot === undefined || slot.status === "pending" ? "pending" : slot.status,
				output: slot?.status === "running" ? (slot.output ?? null) : null,
			});
		}
	}
	return { thinking, text, toolCalls };
}
