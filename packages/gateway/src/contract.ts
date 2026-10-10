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
import type { ChatView, NekoModelRef, UsageTotals } from "@neko-harness/core";

/** 目录条目：非归档会话（含 root），id 为十进制字符串形式的 ConversationId。 */
export type NekoSessionSummary = {
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
}

export const NekoSessionManagement = defineService<NekoSessionManagement>("neko.session-management");

export type NekoSubmitInput = {
	readonly content: string;
	readonly requestId?: string;
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
}

export const NekoChat = defineService<NekoChat>("neko.chat");
