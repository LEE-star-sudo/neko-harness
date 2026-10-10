/**
 * neko 网关的应用层服务契约（design D3）：Chord 服务，经 pi-server 路由给各前端。
 *
 * - 服务器级：neko.session-directory（目录订阅，变化实时推送）+ neko.session-management（创建/归档/attach/detach）
 * - 会话级：neko.chat（submit/abort/usage 方法 + ChatView 快照订阅）
 *
 * 路由与 attachment 语义（幂等 attach、服务端分配 attachmentId、断连延迟释放）由 pi-server 的
 * SessionRouter 继承，不在此重复实现。
 */
import type { Context, ReplicatedState } from "@earendil-works/chord";
import { defineService } from "@earendil-works/chord";
import type { ModelThinkingLevel } from "@earendil-works/pi-ai";
import type { ChatView, NekoConversationChange, NekoModelInfo, NekoModelRef, UsageTotals } from "@neko-harness/core";

/** 目录条目：非归档会话（含 root），id 为十进制字符串形式的 ConversationId。 */
export type NekoSessionSummary = {
	readonly workspaceRoot: string;
	readonly lastUsedAt: number;
	readonly title: string;
	readonly firstPromptPreview: string;
	readonly createdAt: number;
	readonly lastMessageAt: number | null;
	readonly model: { readonly provider: string; readonly modelId: string } | null;
	readonly status: "idle" | "running" | "error";
	readonly id: string;
};

/** 目录复制状态；revision 单调递增，变化即推送给所有订阅前端。 */
export type NekoDirectoryState = {
	readonly revision: number;
	readonly sessions: readonly NekoSessionSummary[];
};

/** 服务器级目录服务：订阅 state 即得当前目录，此后每次创建/归档都推送更新。 */
export interface NekoSessionDirectory {
	readonly state: ReplicatedState<NekoDirectoryState>;
}

export const NekoSessionDirectory = defineService<NekoSessionDirectory>("neko.session-directory");

export type NekoCreateSessionOptions = {
	readonly model?: NekoModelRef;
	readonly thinkingLevel?: ModelThinkingLevel;
	readonly cwd?: string;
};

/**
 * 服务器级管理服务。attach 幂等（同一连接重复 attach 同一会话无副作用）；
 * attachmentId 由服务端分配并经客户端 attachment 路由 out-of-band 下发。
 */
export interface NekoSessionManagement {
	create(options: NekoCreateSessionOptions, context: Context): Promise<NekoSessionSummary>;
	archive(sessionId: string, context: Context): Promise<void>;
	attach(sessionId: string, context: Context): Promise<void>;
	detach(context: Context): Promise<void>;
	/** 从会话当前状态分叉出新会话（pi-durable conversation.fork）；空会话退化为新建。 */
	fork(sessionId: string, context: Context): Promise<NekoSessionSummary>;
}

export const NekoSessionManagement = defineService<NekoSessionManagement>("neko.session-management");

/**
 * 服务器级模型目录服务：Models registry 的全局快照（模型选择器数据源）。
 * 模型列表是全局的，故放服务器级而非会话级。
 */
export interface NekoModels {
	list(context: Context): Promise<readonly NekoModelInfo[]>;
}

export const NekoModels = defineService<NekoModels>("neko.models");

export type NekoSubmitInput = {
	readonly content: string;
	readonly requestId?: string;
	/** 忙碌时 admission 策略：steer 插入当前工具轮后；followUp 排队等当前 run 结束。缺省由 pi-durable 排队。 */
	readonly whenBusy?: "steer" | "followUp";
};

/**
 * 会话级聊天服务。view 订阅：attach 即得当前快照（"提交后的状态"投影，design D4），
 * 此后每次 commit 推送更新；不做历史重放，重连 = 重新 attach + 取最新快照。
 */
export interface NekoChat {
	readonly view: ReplicatedState<ChatView>;
	submit(input: NekoSubmitInput, context: Context): Promise<void>;
	abort(context: Context): Promise<void>;
	usage(context: Context): Promise<UsageTotals>;
	/** 会话级切换模型/thinkingLevel；从下一次请求起生效。会话未知或已归档时抛远程错误。 */
	configure(change: NekoConversationChange, context: Context): Promise<void>;
}

export const NekoChat = defineService<NekoChat>("neko.chat");

export type NekoWorkspaceSummary = { readonly path: string; readonly createdAt: number };
export type NekoWorkspaceState = { readonly revision: number; readonly workspaces: readonly NekoWorkspaceSummary[] };
export type NekoBrowseOptions = {
	readonly path: string;
	readonly query?: string;
	readonly showHidden?: boolean;
	readonly cursor?: string;
};
export type NekoDirectoryPage = {
	readonly path: string;
	readonly parent: string | null;
	readonly entries: readonly { readonly name: string; readonly path: string; readonly error?: string }[];
	readonly next: string | null;
};
export interface NekoWorkspaces {
	readonly state: ReplicatedState<NekoWorkspaceState>;
	add(input: { path: string }, context: Context): Promise<NekoWorkspaceSummary>;
	browse(input: NekoBrowseOptions, context: Context): Promise<NekoDirectoryPage>;
}
export const NekoWorkspaces = defineService<NekoWorkspaces>("neko.workspaces");
