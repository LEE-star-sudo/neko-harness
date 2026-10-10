/**
 * neko web 的 WebSocket 协议（v1，单会话）。
 *
 * 客户端 → 服务器: {@link ClientMessage}
 * 服务器 → 客户端: {@link ServerMessage}
 *
 * 数据流只推"提交后的状态"投影（design D4）：服务器每次把 viewState 投影成
 * {@link ChatView} 全量快照广播，不做增量重放；断线重连 = 重连后收最新快照。
 * ChatView 等投影类型已上挪至 @neko-harness/core（与 gateway 共用）。
 */

// ChatView 投影类型上挪至 core（gateway 与 web 共用），此处 re-export 保持导入路径不变。
import type { ChatView } from "@neko-harness/core";

export type { ChatItem, ChatView, StreamingToolCall, StreamingView, UsageTotals } from "@neko-harness/core";

/** 客户端 → 服务器。 */
export type ClientMessage = { type: "submit"; content: string } | { type: "abort" };

/** 服务器 → 客户端。 */
export type ServerMessage =
	| { type: "hello"; model: string; cwd: string }
	| { type: "snapshot"; view: ChatView }
	| { type: "notice"; level: "info" | "error"; text: string };
