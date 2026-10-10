/**
 * neko web 的 WebSocket 协议（v1，单会话）。
 *
 * 客户端 → 服务器: {@link ClientMessage}
 * 服务器 → 客户端: {@link ServerMessage}
 *
 * 数据流只推"提交后的状态"投影（design D4）：服务器每次把 viewState 投影成
 * {@link ChatView} 全量快照广播，不做增量重放；断线重连 = 重连后收最新快照。
 */

/** 客户端 → 服务器。 */
export type ClientMessage = { type: "submit"; content: string } | { type: "abort" };

/** 服务器 → 客户端。 */
export type ServerMessage =
	| { type: "hello"; model: string; cwd: string }
	| { type: "snapshot"; view: ChatView }
	| { type: "notice"; level: "info" | "error"; text: string };

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
	/** 模型标签，如 "deepseek/deepseek-flash"。 */
	model: string;
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
export type ChatItem =
	| { type: "user"; key: string; id: number; text: string }
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
			/** 补充说明（如"未运行：回答被中断。"）；无则为 null。 */
			note: string | null;
	  }
	| { type: "system"; key: string; id: number; text: string };

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
