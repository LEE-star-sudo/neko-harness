import type { Context, ReplicatedState } from "@earendil-works/chord";
import { defineService } from "@earendil-works/chord";
import type { ModelThinkingLevel } from "@earendil-works/pi-ai";
import type { ChatView, NekoConversationChange, NekoModelInfo, NekoModelRef, UsageTotals } from "@neko-harness/core";

/**
 * neko 网关应用层服务契约的浏览器镜像（packages/gateway/src/contract.ts 的逐字拷贝，
 * 服务 id 必须一致才能路由到同一实现）。网关包带 node 依赖（pi-server/ws），
 * 不能进浏览器 bundle，故在客户端按 ID 重新定义；类型全部 import type，构建时擦除。
 */

export type NekoSessionSummary = {
	readonly workspaceRoot: string;
	readonly lastUsedAt: number;
	readonly id: string;
};

export type NekoDirectoryState = {
	readonly revision: number;
	readonly sessions: readonly NekoSessionSummary[];
};

export interface NekoSessionDirectory {
	readonly state: ReplicatedState<NekoDirectoryState>;
}

export const NekoSessionDirectory = defineService<NekoSessionDirectory>("neko.session-directory");

export type NekoCreateSessionOptions = {
	readonly model?: NekoModelRef;
	readonly thinkingLevel?: ModelThinkingLevel;
	readonly cwd?: string;
};

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
