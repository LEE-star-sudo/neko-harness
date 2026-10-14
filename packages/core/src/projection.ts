import type { AssistantMessage, ModelThinkingLevel, Usage, UserMessage } from "@earendil-works/pi-ai";
import type { ConversationView, LiveState, ToolDiagnostic, ToolSlot, UsageState } from "@earendil-works/pi-durable";
import type { CompactionRecord } from "./compaction.ts";
import type { ImageMetadata } from "./image-metadata.ts";
import { type DefaultImagePrompt, savedDefaultImagePrompt } from "./image-prompt.ts";
import type { ImageInfo } from "./images.ts";
import { type InputData, NekoInput } from "./input.ts";
import type { NekoModelInfo, NekoModelRef } from "./runtime.ts";
import type { SkillInvocation } from "./skill-invocation.ts";
import type { Delegation } from "./subagents.ts";
import type { ToolApproval } from "./tool-approvals.ts";
import { savedWorkspace } from "./workspace.ts";

/**
 * ConversationView → 前端投影 ChatView（每次 commit 后重算，v1 全量快照）。
 *
 * 该投影由 gateway 与 web 共用：gateway 把每个会话的 viewState 投影成 ChatView 复制状态推给
 * 前端订阅，web 的进程内 WS 服务器走同一函数（见 design D4）。
 */

/** 一次提交的用量合计（pi.usage 汇总）。 */
export type UsageTotals = {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	/** 美元计价合计。 */
	cost: number;
};

/** 前端渲染所需的会话视图投影。 */
export type ChatView = {
	historyBefore?: number | null;
	approvals?: ToolApproval[];
	subagents?: Delegation[];
	taskUsage?: UsageTotals;
	/** Latest successful answer in the active context; unknown after compaction until a new answer. */
	contextUsage?: { tokens: number | null; window: number; percent: number | null };
	compaction?: {
		active: (Omit<NonNullable<LiveState["compactions"]>[number], "taskId"> & { taskId: number })[];
		latest: CompactionRecord | null;
		failure?: Omit<NonNullable<LiveState["compactionFailure"]>, "taskId"> & { taskId: number };
	};
	/** 模型标签，如 "deepseek/deepseek-flash"；pi.agent 有显式模型时取自它（切换后立即更新）。 */
	model: string;
	/** 当前会话生效的代理配置（pi.agent doc 投影，configure 提交后随视图推送更新）。 */
	agent: {
		/** 生效模型（provider/modelId）；未设置时为 null。 */
		model: NekoModelRef | null;
		thinkingLevel: ModelThinkingLevel | null;
	};
	/** 会话工具的工作目录。 */
	cwd: string;
	/** 是否有运行中的 run（live.run !== undefined）。 */
	busy: boolean;
	/** 忙碌状态描述（思考中… / 运行 bash… / 重试中…）；不忙为 null。 */
	status: string | null;
	usage: UsageTotals;
	/** 已提交的转录条目（含系统行与工具卡片），按序渲染。 */
	items: ChatItem[];
	/** 正在生成的内容（live.generation）；无则为 null。 */
	streaming: StreamingView | null;
};

/** 已提交条目投影；`key` 是稳定的 React key。 */
export type ChatImage = ImageInfo & { entryId: number; contentIndex: number };
export type ChatItem = { order?: number } & (
	| {
			type: "user";
			key: string;
			id: number;
			text: string;
			images?: ChatImage[];
			skill?: SkillInvocation;
			defaultImagePrompt?: DefaultImagePrompt;
	  }
	| {
			type: "assistant";
			key: string;
			id: number;
			/** thinking blocks 合并文本；无则为 ""。 */
			thinking: string;
			text: string;
			stopReason: string | null;
			errorMessage: string | null;
			/** 回答被中断/出错时的提示行；无则为 null。 */
			note: string | null;
	  }
	| {
			type: "tool";
			key: string;
			images?: ChatImage[];
			callId: string;
			name: string;
			/** 单行参数摘要。 */
			summary: string;
			/** 参数详情（多行）；无则为 null。 */
			detail: string | null;
			/** pending=待结果; running=有 pi.live 运行输出; done=已有结果。 */
			phase: "pending" | "running" | "done";
			isError: boolean;
			/** 运行中的部分输出（pi.live ToolSlot.output）。 */
			output: string | null;
			/** 最终结果文本（pi.tool-result entry）。 */
			result: string | null;
			durationMs: number | null;
			/** 补充说明（如"Not run: response interrupted."）；无则为 null。 */
			note: string | null;
	  }
	| { type: "system"; key: string; id: number; text: string }
);

/** 正在生成的一轮（live.generation.message + live.tools 的合并投影）。 */
export type StreamingView = {
	thinking: string;
	text: string;
	toolCalls: StreamingToolCall[];
};

export type StreamingToolCall = {
	callId: string;
	name: string;
	summary: string;
	detail: string | null;
	/** pending=排队; running=正在执行（可能有 output）; done=槽位已结束。 */
	phase: "pending" | "running" | "done";
	output: string | null;
};

export type ToolSummary = {
	/** 参数摘要，单行。 */
	readonly args: string;
	/** 参数展开详情（可选多行）。 */
	readonly detail?: string;
};

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

/** 内置工具的参数摘要；未知工具退回 JSON。 */
export function summarizeToolCall(name: string, args: unknown): ToolSummary {
	const record = (args ?? {}) as Record<string, unknown>;
	switch (name) {
		case "subagent":
			return { args: `${record.type}: ${record.title}`, detail: String(record.task ?? "") };
		case "find_files":
		case "search_text":
			return {
				args: truncateMiddle(`${record.path ?? "."} ${record.pattern ?? record.query ?? ""}`, 100),
				detail: JSON.stringify(args, null, 2),
			};
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

/** pi.agent doc 在 ConversationView.docs 里的 JSON 形状（AgentState 的视图表示）。 */
type AgentDocView = {
	readonly cwd?: string;
	readonly model?: NekoModelRef;
	readonly thinkingLevel?: ModelThinkingLevel;
};

/** ConversationView → 前端投影 ChatView（服务器每次 commit 后调用）。 */
export function projectChatView(
	view: ConversationView,
	modelLabel: string,
	options: {
		models?: readonly NekoModelInfo[];
		contextEntries?: ConversationView["entries"];
		compaction?: CompactionRecord | null;
	} = {},
): ChatView {
	const live = (view.docs["pi.live"] ?? {}) as LiveState;
	const usage = totalUsage((view.docs["pi.usage"] ?? { models: {}, tools: {} }) as UsageState);
	// pi.agent 随每次 configure 提交进视图：投影同步读出生效模型/thinkingLevel，无竞态。
	const agent = view.docs["pi.agent"] as AgentDocView | undefined;
	const agentModel = agent?.model ?? null;

	const contextWindow =
		options.models?.find(
			(m) =>
				`${m.provider}/${m.modelId}` === (agentModel ? `${agentModel.provider}/${agentModel.modelId}` : modelLabel),
		)?.contextWindow ?? 0;
	const tokens = contextTokens(options.contextEntries ?? view.entries);

	// 先按 callId 收集工具结果（pi.tool-result entry），再按序展开条目。
	const results = new Map<string, Extract<ChatItem, { type: "tool" }>>();
	for (const entry of view.entries) {
		for (const message of entry.model ?? []) {
			if (message.role !== "toolResult") continue;
			const diagnostics = (entry.data as { diagnostics?: ToolDiagnostic[] } | undefined)?.diagnostics ?? [];
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
				result: [
					toolResultText(diagnostics.length ? message.content.slice(0, -1) : message.content),
					...diagnostics.map((d) => `[${d.severity}] ${d.message}`),
				]
					.filter(Boolean)
					.join("\n"),
				durationMs: message.durationMs ?? null,
				note: null,
			});
		}
	}

	const imageDescriptors = (
		entryId: number,
		content: UserMessage["content"],
		metadata: readonly ImageMetadata[] = [],
	): ChatImage[] => {
		if (typeof content === "string") return [];
		return content.flatMap((b, contentIndex) =>
			b.type !== "image"
				? []
				: [
						{
							entryId,
							contentIndex,
							...(metadata.find((info) => info.contentIndex === contentIndex) ?? {
								name: "Image",
								mimeType: b.mimeType,
								width: 0,
								height: 0,
								bytes: Math.floor((b.data.length * 3) / 4),
							}),
						},
					],
		);
	};
	for (const entry of view.entries)
		for (const message of entry.model ?? [])
			if (message.role === "toolResult") {
				const item = results.get(message.toolCallId);
				if (item)
					item.images = imageDescriptors(
						entry.id,
						message.content,
						(message.details as { neko?: { images?: ImageMetadata[] } } | undefined)?.neko?.images,
					);
			}
	const items: ChatItem[] = [];
	for (const entry of view.entries) {
		const message = entry.model?.[0];
		if (message?.role === "user") {
			const defaultImagePrompt =
				entry.kind === NekoInput.kind
					? savedDefaultImagePrompt(message.content, (entry.data as InputData | undefined)?.defaultImagePrompt)
					: undefined;
			items.push({
				type: "user",
				key: `e${entry.id}`,
				id: entry.id,
				text:
					defaultImagePrompt && Array.isArray(message.content)
						? userText(message.content.slice(1))
						: userText(message.content),
				...(defaultImagePrompt ? { defaultImagePrompt } : {}),
				images: imageDescriptors(entry.id, message.content, (entry.data as InputData | undefined)?.images),
				...((entry.data as InputData | undefined)?.skill ? { skill: (entry.data as InputData).skill! } : {}),
			});
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
					const slot = live.tools?.find((s) => s.callId === block.id);
					items.push({
						type: "tool",
						key: `t${block.id}`,
						callId: block.id,
						name: block.name,
						summary: summary.args,
						detail: summary.detail ?? null,
						phase: slot?.status ?? "done",
						isError: false,
						output: slot?.output ?? null,
						result: null,
						durationMs: null,
						note: ran ? null : "Not run: response interrupted.",
					});
				}
			}
			continue;
		}
		if (entry.kind === "pi.tool-result") continue; // 已合入对应工具卡片
		if (entry.kind === "pi.compaction") {
			items.push({ type: "system", key: `e${entry.id}`, id: entry.id, text: "[context compacted]" });
		} else if (entry.kind === "pi.reset") {
			items.push({ type: "system", key: `e${entry.id}`, id: entry.id, text: "[new context]" });
		}
	}

	const runningTool = live.tools?.find((slot) => slot.status === "running");
	const status =
		live.run === undefined
			? null
			: live.generation?.retry !== undefined
				? `Retrying (attempt ${live.generation.attempt + 1})...`
				: runningTool !== undefined
					? `Running ${runningTool.name}...`
					: "Thinking...";

	return {
		contextUsage: {
			tokens,
			window: contextWindow,
			percent: tokens !== null && contextWindow > 0 ? (tokens / contextWindow) * 100 : null,
		},
		compaction: {
			active: [...(live.compactions ?? [])],
			latest: options.compaction ?? null,
			...(live.compactionFailure ? { failure: live.compactionFailure } : {}),
		},
		model: agentModel !== null ? `${agentModel.provider}/${agentModel.modelId}` : modelLabel,
		agent: {
			model: agentModel,
			thinkingLevel: agent?.thinkingLevel ?? "off",
		},
		cwd: savedWorkspace(agent?.cwd),
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
			? "Response truncated before completion."
			: !hasToolCalls && message.stopReason === "aborted"
				? "Stopped."
				: !hasToolCalls && message.stopReason === "error"
					? `Error: ${message.errorMessage ?? "Unknown error"}`
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

/** Match Pi durable's footer: use the latest successful answer after the newest compaction. */
export function contextTokens(entries: ConversationView["entries"]): number | null {
	const compacted = entries.reduce((id, entry) => (entry.kind === "pi.compaction" ? Math.max(id, entry.id) : id), 0);
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i]!;
		const message = entry.model?.[0];
		if (entry.id < compacted || entry.kind !== "pi.assistant" || message?.role !== "assistant") continue;
		if (message.stopReason === "aborted" || message.stopReason === "error") continue;
		const usage = message.usage;
		return usage.totalTokens || usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
	}
	return null;
}
