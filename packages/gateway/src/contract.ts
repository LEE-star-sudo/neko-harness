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
import type {
	ChatView,
	CredentialProviderId,
	CredentialStatus,
	NekoConversationChange,
	NekoModelInfo,
	NekoModelRef,
	NekoSkillInfo,
	UsageTotals,
} from "@neko-harness/core";

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
	readonly images?: readonly string[];
	readonly requestId?: string;
	/** 忙碌时 admission 策略：steer 插入当前工具轮后；followUp 排队等当前 run 结束。缺省由 pi-durable 排队。 */
	readonly whenBusy?: "steer" | "followUp";
};

/**
 * 会话级聊天服务。view 订阅：attach 即得当前快照（"提交后的状态"投影，design D4），
 * 此后每次 commit 推送更新；不做历史重放，重连 = 重新 attach + 取最新快照。
 */
export interface NekoChat {
	importImage(path: string, context: Context): Promise<{ id: string; name: string }>;
	draftImage(
		input: { id: string; offset: number },
		context: Context,
	): Promise<{ data: string; total: number; mimeType: string }>;
	readonly view: ReplicatedState<ChatView>;
	compact(input: { instructions?: string }, context: Context): Promise<void>;
	beginImage(input: { name: string; mimeType: string; size: number }, context: Context): Promise<string>;
	appendImage(input: { id: string; offset: number; data: string }, context: Context): Promise<void>;
	finishImage(id: string, context: Context): Promise<void>;
	releaseImage(id: string, context: Context): Promise<void>;
	getImage(
		input: { entryId: number; contentIndex: number; offset: number },
		context: Context,
	): Promise<{ data: string; total: number; mimeType: string }>;
	submit(input: NekoSubmitInput, context: Context): Promise<void>;
	abort(context: Context): Promise<void>;
	usage(context: Context): Promise<UsageTotals>;
	/** 当前会话工作区可用的技能列表（两级合并，含禁用模型调用的技能），供前端 `/skill:` 补全。 */
	skills(context: Context): Promise<readonly NekoSkillInfo[]>;
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

export type NekoCredentialState = {
	readonly revision: number;
	readonly statuses: Record<CredentialProviderId, CredentialStatus>;
};
export interface NekoCredentials {
	readonly state: ReplicatedState<NekoCredentialState>;
	save(input: { provider: CredentialProviderId; key: string }, context: Context): Promise<void>;
	remove(input: { provider: CredentialProviderId }, context: Context): Promise<void>;
}
export const NekoCredentials = defineService<NekoCredentials>("neko.credentials");

export interface NekoWorkspaceFiles {
	search(
		input: { workspaceRoot: string; query: string },
		context: Context,
	): Promise<import("@neko-harness/core/file-mentions").FileCandidates>;
}
export const NekoWorkspaceFiles = defineService<NekoWorkspaceFiles>("neko.workspace-files");

/** 市场技能条目 + 本地三级安装状态（list/detail 返回同一形态）。 */
export type NekoMarketSkill = {
	readonly name: string;
	readonly description: string;
	readonly category: string;
	readonly source: string;
	readonly license: string;
	readonly version: string;
	readonly sha256: string;
	readonly sizeBytes: number;
	readonly uploadedAt: string;
	readonly installed: { readonly project: boolean; readonly user: boolean; readonly builtin: boolean };
	readonly activeLevel: "project" | "user" | "builtin" | null;
};

export type NekoMarketPreview = {
	readonly body: string;
	readonly files: readonly string[];
};

export type NekoMarketInstallResult = {
	readonly name: string;
	readonly scope: "user" | "project";
	readonly path: string;
	readonly shadowedBy?: "user" | "project";
};

/**
 * 服务器级技能市场服务（design D1）：只读代理市场 API 并合并本地安装状态。
 * workspaceRoot 缺省时项目级状态按 runtime 默认工作区判定。市场错误经 RemoteServiceError 传递：
 * chord 错误码为固定集合，市场错误码（skill_exists / skill_not_installed / market_unavailable 等）
 * 以 `[code] ` 前缀编入 message，前端解析前缀识别。
 */
export interface NekoSkillMarket {
	list(input: { query?: string; workspaceRoot?: string }, context: Context): Promise<readonly NekoMarketSkill[]>;
	detail(input: { name: string; workspaceRoot?: string }, context: Context): Promise<NekoMarketSkill>;
	preview(input: { name: string }, context: Context): Promise<NekoMarketPreview>;
	install(
		input: { name: string; scope: "user" | "project"; workspaceRoot?: string; overwrite?: boolean },
		context: Context,
	): Promise<NekoMarketInstallResult>;
	uninstall(
		input: { name: string; scope: "user" | "project"; workspaceRoot?: string },
		context: Context,
	): Promise<void>;
}
export const NekoSkillMarket = defineService<NekoSkillMarket>("neko.skill-market");
