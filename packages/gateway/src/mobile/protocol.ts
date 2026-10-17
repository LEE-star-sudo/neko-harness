import { RUNNING_VERSION } from "@neko-harness/core/application-version";
import { type Static, Type } from "typebox";
import { Check } from "typebox/value";

export const MOBILE_LIMITS = {
	maxFrameBytes: 262_144,
	maxPayloadBytes: 131_072,
	pageItems: 50,
	chunkBytes: 65_536,
	maxConcurrentRequests: 8,
	maxSendBufferBytes: 2_097_152,
} as const;

export const MOBILE_API_VERSIONS: readonly number[] = [1];
/** 能力随实现追加；命名以 design D6 为准。 */
export const MOBILE_CAPABILITIES: readonly string[] = [
	"workspaces",
	"sessions",
	"chat",
	"subagents",
	"approvals",
	"media",
];
export const MOBILE_CLOSE_REVOKED = 4401;
export const MOBILE_CLOSE_INCOMPATIBLE = 4402;
export const MOBILE_CLOSE_SLOW_CONSUMER = 4408;

export const MobileHelloParams = Type.Object({
	apiVersions: Type.Array(Type.Integer(), { minItems: 1 }),
	app: Type.Object({
		version: Type.String({ minLength: 1, maxLength: 64 }),
		platform: Type.String({ minLength: 1, maxLength: 64 }),
		build: Type.String({ maxLength: 128 }),
	}),
});

export type MobileHelloParamsType = Static<typeof MobileHelloParams>;

export type JsonRpcId = number | string;

export type JsonRpcRequest = {
	readonly jsonrpc: "2.0";
	readonly id: JsonRpcId;
	readonly method: string;
	readonly params?: unknown;
};

export function asJsonRpcRequest(value: unknown): JsonRpcRequest | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const record = value as Record<string, unknown>;
	if (record.jsonrpc !== "2.0") return undefined;
	if (typeof record.id !== "string" && typeof record.id !== "number") return undefined;
	if (typeof record.method !== "string" || record.method === "") return undefined;
	return { jsonrpc: "2.0", id: record.id, method: record.method, params: record.params };
}

export type MobileErrorCode =
	| "unauthorized"
	| "revoked"
	| "incompatible"
	| "invalid_params"
	| "not_found"
	| "gone"
	| "stale_ref"
	| "content_changed"
	| "busy_limit"
	| "rejected"
	| "internal";

export function isMobileHelloParams(value: unknown): value is MobileHelloParamsType {
	return Check(MobileHelloParams, value);
}

export function negotiateApiVersion(clientVersions: readonly number[]): number | undefined {
	let best: number | undefined;
	for (const version of MOBILE_API_VERSIONS) {
		if (clientVersions.includes(version) && (best === undefined || version > best)) best = version;
	}
	return best;
}

export function incompatibleNeeds(clientVersions: readonly number[]): "app" | "computer" {
	const serverMax = Math.max(...MOBILE_API_VERSIONS);
	return clientVersions.length > 0 && clientVersions.every((version) => version > serverMax) ? "computer" : "app";
}

export function buildHelloResult(serverId: string, serverName: string, apiVersion: number): Record<string, unknown> {
	return {
		apiVersion,
		serverId,
		serverName,
		gatewayVersion: RUNNING_VERSION,
		capabilities: MOBILE_CAPABILITIES,
		limits: MOBILE_LIMITS,
	};
}

// ——— mobile-api-v1 业务方法 schemas（fixtures 契约锚点；形状与 docs/mobile-api-v1.md 一致） ———

const opt = Type.Optional;
const str = Type.String();
const int = Type.Integer({ minimum: 0 });
const nullable = <T extends Parameters<typeof Type.Union>[0][number]>(schema: T) => Type.Union([schema, Type.Null()]);

/** 大字段引用：`agentId` 存在时指向子 agent 视图，否则指向主会话。 */
export const MobileContentRefSchema = Type.Object({
	sessionId: str,
	agentId: opt(str),
	key: str,
	field: str,
	digest: str,
	bytes: int,
});

export const MobileImageRefSchema = Type.Object({
	name: str,
	mimeType: str,
	width: int,
	height: int,
	bytes: int,
	entryId: int,
	contentIndex: int,
});

export const MobileToolItemSchema = Type.Object({
	callId: str,
	name: str,
	summary: str,
	status: Type.Union([Type.Literal("running"), Type.Literal("done"), Type.Literal("error")]),
	detail: opt(str),
	output: opt(str),
	result: opt(str),
	diff: opt(str),
	diffAdded: opt(Type.Number()),
	diffRemoved: opt(Type.Number()),
	diffTruncated: opt(Type.Boolean()),
	durationMs: opt(Type.Number()),
	note: opt(str),
});

/** 超过 8 KiB 的字符串字段只留 2 KiB 预览，并在 `refs` 中给出完整内容引用（每个字段至多一个）。 */
export const MobileChatItemSchema = Type.Object({
	key: str,
	type: Type.Union([
		Type.Literal("user"),
		Type.Literal("assistant"),
		Type.Literal("tool"),
		Type.Literal("error"),
		Type.Literal("system"),
	]),
	text: opt(str),
	thinking: opt(str),
	note: opt(str),
	/** assistant 的失败原因；与已生成文本并存。 */
	error: opt(str),
	skill: opt(str),
	jobId: opt(str),
	tool: opt(MobileToolItemSchema),
	images: opt(Type.Array(MobileImageRefSchema)),
	refs: opt(Type.Array(MobileContentRefSchema)),
});

export const MobileStreamingSchema = Type.Object({
	text: str,
	thinking: str,
	/** 快照只携带尾部；被省略的前缀 UTF-16 长度。 */
	textOmitted: int,
	thinkingOmitted: int,
	toolCalls: Type.Array(
		Type.Object({
			callId: str,
			name: str,
			summary: str,
			status: Type.Union([Type.Literal("running"), Type.Literal("done")]),
		}),
	),
});

export const MobileUsageSchema = Type.Object({
	input: int,
	output: int,
	cacheRead: int,
	cacheWrite: int,
	totalTokens: int,
	cost: Type.Number({ minimum: 0 }),
});

export const MobileSubagentRoundSchema = Type.Object({
	taskId: int,
	/** 主会话中发起委派的工具调用，用于把工具卡关联到子详情。 */
	callId: str,
	agentId: str,
	round: opt(int),
	role: str,
	title: str,
	status: Type.Union([
		Type.Literal("queued"),
		Type.Literal("running"),
		Type.Literal("completed"),
		Type.Literal("failed"),
		Type.Literal("cancelled"),
	]),
	approvalCount: int,
	readonly: Type.Boolean(),
	createdAt: Type.Number(),
	endedAt: nullable(Type.Number()),
	usage: opt(MobileUsageSchema),
});

export const MobileAgentSchema = Type.Object({
	agentId: str,
	role: str,
	title: str,
	status: Type.Union([Type.Literal("idle"), Type.Literal("queued"), Type.Literal("running")]),
	activeRoundId: nullable(int),
	lastRoundId: int,
	roundCount: int,
	approvalCount: int,
});

export const MobileQueuedSchema = Type.Object({
	id: int,
	mode: Type.Union([Type.Literal("steer"), Type.Literal("followUp")]),
	preview: Type.String(),
	images: int,
});

export const MobileChatStatusSchema = Type.Object({
	busy: Type.Boolean(),
	/** Absent on a computer without queue visibility; empty means supported with none. */
	queued: opt(Type.Array(MobileQueuedSchema)),
	status: nullable(str),
	usage: MobileUsageSchema,
	taskUsage: opt(MobileUsageSchema),
	contextUsage: opt(
		Type.Object({ tokens: nullable(Type.Number()), window: Type.Number(), percent: nullable(Type.Number()) }),
	),
	agent: Type.Object({ model: nullable(str), thinkingLevel: nullable(str) }),
	subagents: Type.Array(MobileSubagentRoundSchema),
	agents: Type.Array(MobileAgentSchema),
	approvalCount: int,
	compaction: opt(Type.Object({ phase: str, at: Type.Number() })),
	readonly: opt(Type.Boolean()),
});

export const MobileChatSnapshotSchema = Type.Object({
	...MobileChatStatusSchema.properties,
	items: Type.Array(MobileChatItemSchema),
	historyBefore: nullable(str),
	streaming: nullable(MobileStreamingSchema),
});

export const MobileWorkspaceSchema = Type.Object({ root: str, name: str });

export const MobileSessionSummarySchema = Type.Object({
	id: str,
	workspace: str,
	title: str,
	preview: str,
	lastUsedAt: Type.Integer(),
	lastMessageAt: Type.Integer(),
	archived: Type.Boolean(),
});

export const MobileApprovalSchema = Type.Object({
	id: int,
	version: str,
	taskId: int,
	agentId: opt(str),
	title: opt(str),
	command: str,
	cwd: str,
	timeoutSeconds: opt(Type.Number({ minimum: 0 })),
	requestedAt: Type.Number(),
});

const sessionListParams = Type.Object({
	workspace: str,
	query: opt(str),
	cursor: opt(str),
});
const sessionListResult = Type.Object({
	sessions: Type.Array(MobileSessionSummarySchema),
	nextCursor: opt(str),
});
const subscription = { subscriptionId: Type.String({ minLength: 1 }) };
const pageResult = Type.Object({ items: Type.Array(MobileChatItemSchema), historyBefore: nullable(str) });
const pageParams = Type.Object({
	...subscription,
	before: Type.String({ minLength: 1 }),
	limit: opt(Type.Integer({ minimum: 1, maximum: 50 })),
});
const chunkResult = Type.Object({ data: str, nextOffset: int, total: int, done: Type.Boolean() });

export const MOBILE_API_V1_METHODS: Readonly<Record<string, { readonly params: unknown; readonly result: unknown }>> = {
	"server.hello": { params: MobileHelloParams, result: buildHelloResultSchema() },
	"workspaces.list": { params: Type.Null(), result: Type.Object({ workspaces: Type.Array(MobileWorkspaceSchema) }) },
	"sessions.list": { params: sessionListParams, result: sessionListResult },
	"sessions.create": { params: Type.Object({ workspace: str }), result: MobileSessionSummarySchema },
	"chat.attach": {
		params: Type.Object({ sessionId: Type.String({ minLength: 1 }) }),
		result: Type.Object({ subscriptionId: str, sessionId: str, snapshot: MobileChatSnapshotSchema }),
	},
	"chat.detach": { params: Type.Object(subscription), result: Type.Null() },
	"chat.history": { params: pageParams, result: pageResult },
	"chat.content": {
		params: Type.Object({ ref: MobileContentRefSchema, offset: int }),
		result: chunkResult,
	},
	"chat.submit": {
		params: Type.Object({
			...subscription,
			requestId: Type.String({ minLength: 1, maxLength: 128 }),
			text: Type.String({ minLength: 1, maxLength: 65_536 }),
			mode: opt(Type.Literal("steer")),
		}),
		result: Type.Object({ accepted: Type.Literal(true), queued: Type.Boolean() }),
	},
	"chat.submissionStatus": {
		params: Type.Object({ ...subscription, requestId: Type.String({ minLength: 1, maxLength: 128 }) }),
		result: Type.Object({ status: Type.Union([Type.Literal("accepted"), Type.Literal("unknown")]) }),
	},
	"chat.steer": {
		params: Type.Object({ ...subscription, id: int }),
		result: Type.Object({
			result: Type.Union([
				Type.Literal("steered"),
				Type.Literal("withdrawn"),
				Type.Literal("placed"),
				Type.Literal("settled"),
				Type.Literal("unknown"),
			]),
			id: opt(int),
			text: opt(Type.String()),
			images: opt(int),
		}),
	},
	"chat.withdraw": {
		params: Type.Object({ ...subscription, id: int }),
		result: Type.Object({
			result: Type.Union([
				Type.Literal("withdrawn"),
				Type.Literal("placed"),
				Type.Literal("settled"),
				Type.Literal("unknown"),
			]),
			text: opt(Type.String()),
			images: opt(int),
		}),
	},
	"chat.abort": { params: Type.Object(subscription), result: Type.Object({ accepted: Type.Boolean() }) },
	"subagents.open": {
		params: Type.Object({ ...subscription, agentId: opt(Type.String({ minLength: 1 })), taskId: opt(int) }),
		result: Type.Object({
			subagentSubscriptionId: str,
			agentId: str,
			snapshot: MobileChatSnapshotSchema,
		}),
	},
	"subagents.history": {
		params: Type.Object({
			subagentSubscriptionId: Type.String({ minLength: 1 }),
			before: Type.String({ minLength: 1 }),
			limit: opt(Type.Integer({ minimum: 1, maximum: 50 })),
		}),
		result: pageResult,
	},
	"subagents.close": {
		params: Type.Object({ subagentSubscriptionId: Type.String({ minLength: 1 }) }),
		result: Type.Null(),
	},
	"subagents.stop": {
		params: Type.Object({ ...subscription, taskId: int }),
		result: Type.Object({ stopped: Type.Boolean() }),
	},
	"approvals.list": {
		params: Type.Object(subscription),
		result: Type.Object({ approvals: Type.Array(MobileApprovalSchema) }),
	},
	"approvals.get": { params: Type.Object({ ...subscription, id: int }), result: MobileApprovalSchema },
	"approvals.decide": {
		params: Type.Object({
			...subscription,
			taskId: int,
			id: int,
			version: Type.String({ minLength: 1 }),
			decision: Type.Union([Type.Literal("allow"), Type.Literal("deny")]),
		}),
		result: Type.Object({
			status: Type.Union([
				Type.Literal("pending"),
				Type.Literal("allowed"),
				Type.Literal("denied"),
				Type.Literal("cancelled"),
			]),
		}),
	},
	"media.read": {
		params: Type.Object({
			...subscription,
			agentId: opt(Type.String({ minLength: 1 })),
			entryId: int,
			contentIndex: int,
			offset: int,
		}),
		result: Type.Object({ ...chunkResult.properties, mimeType: str }),
	},
};

function buildHelloResultSchema() {
	return Type.Object({
		apiVersion: Type.Integer({ minimum: 1 }),
		serverId: str,
		serverName: str,
		gatewayVersion: str,
		capabilities: Type.Array(str),
		limits: Type.Object({
			maxFrameBytes: Type.Integer(),
			maxPayloadBytes: Type.Integer(),
			pageItems: Type.Integer(),
			chunkBytes: Type.Integer(),
			maxConcurrentRequests: Type.Integer(),
			maxSendBufferBytes: Type.Integer(),
		}),
	});
}

const patchBody = {
	seq: Type.Integer({ minimum: 1 }),
	upserts: Type.Array(MobileChatItemSchema),
	status: opt(MobileChatStatusSchema),
	/** 整段替换流式区（含结束时置 null）。 */
	streaming: opt(nullable(MobileStreamingSchema)),
	/** 在当前流式文本末尾追加。 */
	streamingAppend: opt(Type.Object({ text: opt(str), thinking: opt(str) })),
};

export const MOBILE_API_V1_NOTIFICATIONS: Readonly<Record<string, unknown>> = {
	"workspaces.changed": Type.Object({ revision: Type.Integer({ minimum: 1 }) }),
	"sessions.changed": Type.Object({ revision: Type.Integer({ minimum: 1 }) }),
	"chat.patch": Type.Object({ subscriptionId: str, ...patchBody }),
	"chat.reset": Type.Object({ subscriptionId: str, seq: Type.Integer({ minimum: 1 }) }),
	"subagents.patch": Type.Object({ subagentSubscriptionId: str, ...patchBody }),
	"subagents.reset": Type.Object({ subagentSubscriptionId: str, seq: Type.Integer({ minimum: 1 }) }),
	"approvals.changed": Type.Object({ subscriptionId: str, revision: Type.Integer({ minimum: 1 }) }),
};
