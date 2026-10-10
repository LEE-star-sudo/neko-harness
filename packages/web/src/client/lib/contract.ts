import type { Context, ReplicatedState } from "@earendil-works/chord";
import { defineService } from "@earendil-works/chord";
import type { ModelThinkingLevel } from "@earendil-works/pi-ai";
import type { ChatView, NekoModelRef, UsageTotals } from "@neko-harness/core";

/**
 * neko 网关应用层服务契约的浏览器镜像（packages/gateway/src/contract.ts 的逐字拷贝，
 * 服务 id 必须一致才能路由到同一实现）。网关包带 node 依赖（pi-server/ws），
 * 不能进浏览器 bundle，故在客户端按 ID 重新定义；类型全部 import type，构建时擦除。
 */

export type NekoSessionSummary = {
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
}

export const NekoSessionManagement = defineService<NekoSessionManagement>("neko.session-management");

export type NekoSubmitInput = {
	readonly content: string;
	readonly requestId?: string;
};

export interface NekoChat {
	readonly view: ReplicatedState<ChatView>;
	submit(input: NekoSubmitInput, context: Context): Promise<void>;
	abort(context: Context): Promise<void>;
	usage(context: Context): Promise<UsageTotals>;
}

export const NekoChat = defineService<NekoChat>("neko.chat");
