/** Browser-safe Chord 1.3 contracts. All wire values are validated schemas. */
import { type HostNamed, hostNamed, method, type Ref, type RemoteContract, remote } from "@earendil-works/chord";
import { type Static, type TSchema, Type } from "typebox";

/** Every gateway service lives on the one host that serves it; the server id is verified through application info. */
export const GATEWAY_HOST = "neko";
// Chord does not export MethodSpec; keep public schema tuples so emitted declarations stay portable.
export type Definition = {
	version: number;
	input: TSchema;
	variants: Record<string, { state?: Record<string, TSchema>; methods?: Record<string, readonly [TSchema, TSchema]> }>;
};
export type WireDef<D extends Definition> = {
	version: D["version"];
	input: D["input"];
	host: HostNamed;
	variants: {
		[K in keyof D["variants"]]: {
			state: D["variants"][K] extends { state: infer S extends Record<string, TSchema> } ? S : Record<never, never>;
			methods: D["variants"][K] extends { methods: infer M extends Record<string, readonly [TSchema, TSchema]> }
				? { [P in keyof M]: ReturnType<typeof method<M[P][0], M[P][1]>> }
				: Record<never, never>;
		};
	};
};
export const rpc = <A extends TSchema, R extends TSchema>(args: A, result: R): readonly [A, R] => [args, result];
export function contract<const D extends Definition>(name: string, def: D): RemoteContract<WireDef<D>> {
	const variants = Object.fromEntries(
		Object.entries(def.variants).map(([key, value]) => [
			key,
			{
				...value,
				methods: Object.fromEntries(
					Object.entries(value.methods ?? {}).map(([member, [args, result]]) => [member, method(args, result)]),
				),
			},
		]),
	);
	return remote(name, { ...def, host: hostNamed(GATEWAY_HOST), variants } as unknown as Parameters<
		typeof remote
	>[1]) as unknown as RemoteContract<WireDef<D>>;
}
const str = Type.String();
const num = Type.Number();
const bool = Type.Boolean();
const nil = Type.Null();
const integer = Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER });
const nullableString = Type.Union([str, nil]);
const phase = Type.Enum(["pending", "running", "done"]);
const level = Type.Enum(["project", "user", "builtin"]);
const thinking = Type.Enum(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);
const model = Type.Object({ provider: str, modelId: str });
const change = Type.Object(
	{ model: Type.Optional(model), thinkingLevel: Type.Optional(thinking) },
	{ additionalProperties: false },
);
const usage = Type.Object({ input: num, output: num, cacheRead: num, cacheWrite: num, cost: num });
const image = Type.Object({
	name: str,
	mimeType: str,
	width: integer,
	height: integer,
	bytes: integer,
	entryId: integer,
	contentIndex: integer,
});
const skill = Type.Object({ name: str, location: str, body: str, args: str });
const call = Type.Object({
	callId: str,
	name: str,
	summary: str,
	detail: nullableString,
	phase,
	output: nullableString,
	diff: nullableString,
	diffAdded: Type.Union([num, nil]),
	diffRemoved: Type.Union([num, nil]),
	diffTruncated: Type.Optional(bool),
});
export const DelegationSchema = Type.Object({
	parentId: integer,
	agentId: Type.Optional(str),
	round: Type.Optional(integer),
	runnerId: Type.Optional(integer),
	inputEntryId: Type.Optional(integer),
	answerEntryId: Type.Optional(integer),
	roundUsage: Type.Optional(Type.Union([usage, nil])),
	taskId: integer,
	callId: str,
	childId: integer,
	role: Type.Enum(["explore", "plan", "coder"]),
	title: str,
	createdAt: num,
	startedAt: Type.Union([num, nil]),
	endedAt: Type.Union([num, nil]),
	status: Type.Enum(["queued", "running", "completed", "failed", "cancelled"]),
	report: nullableString,
	approvalCount: Type.Optional(integer),
	historyThrough: Type.Optional(integer),
	historyUsage: Type.Optional(usage),
});
export const SubagentSummarySchema = Type.Object({
	agentId: str,
	parentId: integer,
	childId: integer,
	role: Type.Enum(["explore", "plan", "coder"]),
	title: str,
	status: Type.Enum(["idle", "queued", "running"]),
	activeRoundId: Type.Union([integer, nil]),
	lastRoundId: integer,
	lastReport: Type.Optional(nullableString),
	roundCount: integer,
	taskTitle: str,
	approvalCount: integer,
	createdAt: num,
	historyThrough: Type.Optional(integer),
	historyUsage: Type.Optional(usage),
});
const jobStatus = Type.Enum(["running", "exited", "failed", "stopped", "lost"]);
/** One background job without its output; `command` is clipped by the host so the list stays bounded. */
export const JobSummarySchema = Type.Object({
	jobId: str,
	title: str,
	command: str,
	cwd: str,
	status: jobStatus,
	startedAt: num,
	endedAt: Type.Union([num, nil]),
	exitCode: Type.Union([num, nil]),
	reason: Type.Optional(Type.Enum(["timeout", "spawn-error", "restart", "aborted"])),
	timeoutSeconds: Type.Optional(num),
	outputBytes: integer,
});
export const JobOutputSchema = Type.Object({
	job: JobSummarySchema,
	text: str,
	/** Pass back as `since` to continue reading. */
	offset: integer,
	truncated: bool,
	dropped: integer,
});
export const ChatViewSchema = Type.Object({
	historyBefore: Type.Optional(Type.Union([integer, nil])),
	agents: Type.Optional(Type.Array(SubagentSummarySchema)),
	/** Absent on a gateway without background jobs; empty means supported with none. */
	jobs: Type.Optional(Type.Array(JobSummarySchema)),
	rounds: Type.Optional(Type.Array(DelegationSchema)),
	subagents: Type.Optional(Type.Array(DelegationSchema)),
	taskUsage: Type.Optional(usage),
	model: str,
	agent: Type.Object({ model: Type.Union([model, nil]), thinkingLevel: Type.Union([thinking, nil]) }),
	cwd: str,
	busy: bool,
	status: nullableString,
	usage,
	contextUsage: Type.Optional(
		Type.Object({ tokens: Type.Union([num, nil]), window: num, percent: Type.Union([num, nil]) }),
	),
	compaction: Type.Optional(
		Type.Object({
			failure: Type.Optional(
				Type.Object({ taskId: integer, reason: Type.Enum(["manual", "threshold", "overflow"]), error: str }),
			),
			active: Type.Array(
				Type.Object({
					taskId: integer,
					reason: Type.Enum(["manual", "threshold", "overflow"]),
					blocking: bool,
					attempt: integer,
					retry: Type.Optional(Type.Object({ at: num, error: str })),
				}),
			),
			latest: Type.Union([
				nil,
				Type.Object({
					taskId: integer,
					phase: Type.Enum(["summarizing", "waiting-to-apply", "applied", "nothing", "skipped", "cancelled", "failed"]),
					at: num,
				}),
			]),
		}),
	),
	items: Type.Array(
		Type.Union([
			Type.Object({
				type: Type.Literal("user"),
				order: Type.Optional(num),
				key: str,
				id: integer,
				text: str,
				images: Type.Optional(Type.Array(image)),
				skill: Type.Optional(skill),
				defaultImagePrompt: Type.Optional(Type.Object({ version: Type.Integer({ minimum: 1 }), text: str })),
			}),
			Type.Object({
				type: Type.Literal("assistant"),
				order: Type.Optional(num),
				key: str,
				id: integer,
				thinking: str,
				text: str,
				stopReason: nullableString,
				errorMessage: nullableString,
				note: nullableString,
			}),
			Type.Object({
				type: Type.Literal("tool"),
				order: Type.Optional(num),
				key: str,
				images: Type.Optional(Type.Array(image)),
				callId: str,
				name: str,
				summary: str,
				detail: nullableString,
				phase,
				isError: bool,
				output: nullableString,
				result: nullableString,
				durationMs: Type.Union([num, nil]),
				note: nullableString,
				diff: nullableString,
				diffAdded: Type.Union([num, nil]),
				diffRemoved: Type.Union([num, nil]),
				diffTruncated: Type.Optional(bool),
			}),
			Type.Object({
				type: Type.Literal("system"),
				order: Type.Optional(num),
				key: str,
				id: integer,
				text: str,
				jobId: Type.Optional(str),
			}),
		]),
	),
	streaming: Type.Union([nil, Type.Object({ thinking: str, text: str, toolCalls: Type.Array(call) })]),
});
export const SessionSummarySchema = Type.Object({
	workspaceRoot: str,
	lastUsedAt: num,
	title: str,
	firstPromptPreview: str,
	createdAt: num,
	lastMessageAt: Type.Union([num, nil]),
	model: Type.Union([model, nil]),
	status: Type.Enum(["idle", "running", "error"]),
	id: str,
});
export const DirectoryStateSchema = Type.Object({ revision: integer, sessions: Type.Array(SessionSummarySchema) });
export const WorkspaceSummarySchema = Type.Object({ path: str, createdAt: num });
export const WorkspaceStateSchema = Type.Object({ revision: integer, workspaces: Type.Array(WorkspaceSummarySchema) });
const credentialStatus = Type.Object({
	savedConfigured: bool,
	environmentConfigured: bool,
	source: Type.Enum(["saved", "environment", "runtime", "keyless", "none"]),
});
export const CredentialStateSchema = Type.Object({
	revision: integer,
	statuses: Type.Object({ deepseek: credentialStatus, tavily: credentialStatus }),
});
export const AttachmentSchema = Type.Object({ sessionId: str, attachmentId: str });
const chatInput = Type.Object({ sessionId: str, attachmentId: str }, { additionalProperties: false });
export const NekoSessionDirectory = contract("neko.session-directory", {
	version: 1,
	input: Type.Object({}, { additionalProperties: false }),
	variants: { ready: { state: { state: DirectoryStateSchema } } },
});
export const NekoSessionManagement = contract("neko.session-management", {
	version: 1,
	input: Type.Object({}, { additionalProperties: false }),
	variants: {
		ready: {
			methods: {
				create: rpc(
					Type.Object({ ...change.properties, cwd: Type.Optional(str) }, { additionalProperties: false }),
					SessionSummarySchema,
				),
				archive: rpc(str, nil),
				attach: rpc(str, AttachmentSchema),
				detach: rpc(nil, nil),
				fork: rpc(str, SessionSummarySchema),
			},
		},
	},
});
const resize = Type.Object({
	maxWidth: Type.Optional(integer),
	maxHeight: Type.Optional(integer),
	maxBytes: Type.Optional(integer),
	jpegQuality: Type.Optional(integer),
});
const inputLimits = Type.Object({
	maxRequestBytes: Type.Optional(integer),
	images: Type.Optional(
		Type.Object({
			resize: Type.Optional(resize),
			maxPerMessage: Type.Optional(integer),
			maxPerRequest: Type.Optional(integer),
		}),
	),
});
const modelInfo = Type.Object({
	provider: str,
	modelId: str,
	name: str,
	contextWindow: num,
	input: Type.Array(str),
	inputLimits: Type.Optional(inputLimits),
	reasoning: bool,
	supportedThinkingLevels: Type.Array(thinking),
	thinkingLevelAdjustments: Type.Object({
		off: thinking,
		minimal: thinking,
		low: thinking,
		medium: thinking,
		high: thinking,
		xhigh: thinking,
		max: thinking,
	}),
});
export const NekoModels = contract("neko.models", {
	version: 1,
	input: Type.Object({}, { additionalProperties: false }),
	variants: { ready: { methods: { list: rpc(nil, Type.Array(modelInfo)) } } },
});
const imageChunk = Type.Object({ data: str, total: integer, mimeType: str });
export const NekoSubagent = contract("neko.subagent", {
	version: 1,
	input: Type.Object({
		sessionId: str,
		attachmentId: str,
		taskId: Type.Optional(integer),
		agentId: Type.Optional(str),
	}),
	variants: {
		ready: {
			state: { revision: integer },
			methods: {
				chunk: rpc(
					Type.Object({
						kind: Type.Enum(["view", "history"]),
						before: Type.Optional(integer),
						token: Type.Optional(integer),
						offset: integer,
					}),
					Type.Object({ token: integer, data: str, next: Type.Union([integer, nil]) }),
				),
				getImage: rpc(Type.Object({ entryId: integer, contentIndex: integer, offset: integer }), imageChunk),
				decideApproval: rpc(
					Type.Object({ id: integer, version: str, decision: Type.Enum(["allowed", "denied"]) }),
					Type.Enum(["pending", "allowed", "denied", "cancelled"]),
				),
				stop: rpc(Type.Union([nil, Type.Object({ taskId: integer })]), nil),
			},
		},
	},
});
export type NekoSubagent = Ref<typeof NekoSubagent>;
export const NekoChat = contract("neko.chat", {
	version: 1,
	input: chatInput,
	variants: {
		ready: {
			state: { view: ChatViewSchema },
			methods: {
				submit: rpc(
					Type.Object(
						{
							content: str,
							images: Type.Optional(Type.Array(str, { maxItems: 4 })),
							requestId: Type.Optional(str),
							whenBusy: Type.Optional(Type.Enum(["steer", "followUp"])),
						},
						{ additionalProperties: false },
					),
					nil,
				),
				abort: rpc(nil, nil),
				usage: rpc(nil, usage),
				skills: rpc(nil, Type.Array(Type.Object({ name: str, description: str, location: str, level }))),
				jobOutput: rpc(
					Type.Object({ jobId: str, since: Type.Optional(integer) }, { additionalProperties: false }),
					JobOutputSchema,
				),
				jobStop: rpc(Type.Object({ jobId: str }, { additionalProperties: false }), JobSummarySchema),
				configure: rpc(change, nil),
				compact: rpc(Type.Object({ instructions: Type.Optional(str) }, { additionalProperties: false }), nil),
				importImage: rpc(str, Type.Object({ id: str, name: str })),
				draftImage: rpc(Type.Object({ id: str, offset: integer }, { additionalProperties: false }), imageChunk),
				beginImage: rpc(
					Type.Object(
						{ name: str, mimeType: str, size: Type.Integer({ minimum: 1, maximum: 20971520 }) },
						{ additionalProperties: false },
					),
					str,
				),
				appendImage: rpc(
					Type.Object(
						{ id: str, offset: integer, data: Type.String({ maxLength: 350000 }) },
						{ additionalProperties: false },
					),
					nil,
				),
				finishImage: rpc(str, nil),
				releaseImage: rpc(str, nil),
				getImage: rpc(
					Type.Object({ entryId: integer, contentIndex: integer, offset: integer }, { additionalProperties: false }),
					imageChunk,
				),
			},
		},
	},
});
const browse = Type.Object(
	{ path: str, query: Type.Optional(str), showHidden: Type.Optional(bool), cursor: Type.Optional(str) },
	{ additionalProperties: false },
);
const page = Type.Object({
	path: str,
	parent: nullableString,
	entries: Type.Array(Type.Object({ name: str, path: str, error: Type.Optional(str) })),
	next: nullableString,
});
export const NekoWorkspaces = contract("neko.workspaces", {
	version: 1,
	input: Type.Object({}, { additionalProperties: false }),
	variants: {
		ready: {
			state: { state: WorkspaceStateSchema },
			methods: {
				add: rpc(Type.Object({ path: str }, { additionalProperties: false }), WorkspaceSummarySchema),
				browse: rpc(browse, page),
			},
		},
	},
});
const provider = Type.Enum(["deepseek", "tavily"]);
export const NekoCredentials = contract("neko.credentials", {
	version: 1,
	input: Type.Object({}, { additionalProperties: false }),
	variants: {
		ready: {
			state: { state: CredentialStateSchema },
			methods: {
				save: rpc(
					Type.Object(
						{ provider, key: Type.String({ minLength: 1, maxLength: 8192 }) },
						{ additionalProperties: false },
					),
					nil,
				),
				remove: rpc(Type.Object({ provider }, { additionalProperties: false }), nil),
			},
		},
	},
});
export const FileCandidatesSchema = Type.Object({
	entries: Type.Array(Type.Object({ name: str, path: str, kind: Type.Enum(["file", "directory"]) }), { maxItems: 100 }),
	limited: bool,
	incomplete: bool,
});
export const NekoWorkspaceFiles = contract("neko.workspace-files", {
	version: 1,
	input: Type.Object({}, { additionalProperties: false }),
	variants: {
		ready: {
			methods: {
				search: rpc(
					Type.Object({ workspaceRoot: str, query: str }, { additionalProperties: false }),
					FileCandidatesSchema,
				),
			},
		},
	},
});
const marketSkill = Type.Object({
	name: str,
	description: str,
	category: str,
	source: str,
	license: str,
	version: str,
	sha256: str,
	sizeBytes: integer,
	uploadedAt: str,
	installed: Type.Object({ project: bool, user: bool, builtin: bool }),
	activeLevel: Type.Union([level, nil]),
});
const preview = Type.Object({ body: str, files: Type.Array(str) });
const scope = Type.Enum(["user", "project"]);
const installResult = Type.Object({ name: str, scope, path: str, shadowedBy: Type.Optional(scope) });
export const NekoSkillMarket = contract("neko.skill-market", {
	version: 1,
	input: Type.Object({}, { additionalProperties: false }),
	variants: {
		ready: {
			methods: {
				list: rpc(
					Type.Object(
						{ query: Type.Optional(str), workspaceRoot: Type.Optional(str) },
						{ additionalProperties: false },
					),
					Type.Array(marketSkill),
				),
				detail: rpc(
					Type.Object({ name: str, workspaceRoot: Type.Optional(str) }, { additionalProperties: false }),
					marketSkill,
				),
				preview: rpc(Type.Object({ name: str }, { additionalProperties: false }), preview),
				install: rpc(
					Type.Object(
						{ name: str, scope, workspaceRoot: Type.Optional(str), overwrite: Type.Optional(bool) },
						{ additionalProperties: false },
					),
					installResult,
				),
				uninstall: rpc(
					Type.Object({ name: str, scope, workspaceRoot: Type.Optional(str) }, { additionalProperties: false }),
					nil,
				),
			},
		},
	},
});
export type NekoSessionDirectory = Ref<typeof NekoSessionDirectory>;
export type NekoSessionManagement = Ref<typeof NekoSessionManagement>;
export type NekoModels = Ref<typeof NekoModels>;
export type NekoChat = Ref<typeof NekoChat>;
export type WireJobSummary = Static<typeof JobSummarySchema>;
export type WireJobOutput = Static<typeof JobOutputSchema>;
export type NekoWorkspaces = Ref<typeof NekoWorkspaces>;
export type NekoWorkspaceFiles = Ref<typeof NekoWorkspaceFiles>;
export type NekoCredentials = Ref<typeof NekoCredentials>;
export type NekoSkillMarket = Ref<typeof NekoSkillMarket>;
export type NekoSessionSummary = Static<typeof SessionSummarySchema>;
export type NekoDirectoryState = Static<typeof DirectoryStateSchema>;
export type NekoWorkspaceSummary = Static<typeof WorkspaceSummarySchema>;
export type NekoWorkspaceState = Static<typeof WorkspaceStateSchema>;
export type NekoCredentialState = Static<typeof CredentialStateSchema>;
export type NekoAttachment = Static<typeof AttachmentSchema>;
export type NekoBrowseOptions = Static<typeof browse>;
export type NekoDirectoryPage = Static<typeof page>;
export type NekoMarketSkill = Static<typeof marketSkill>;
export type NekoMarketPreview = Static<typeof preview>;
export type NekoMarketInstallResult = Static<typeof installResult>;
export type NekoCreateSessionOptions = Parameters<NekoSessionManagement["create"]>[0];
export type NekoSubmitInput = Parameters<NekoChat["submit"]>[0];

/** Stable bootstrap contract: keep this available even when business protocol changes. */
export const ApplicationInfoSchema = Type.Object({
	runningVersion: str,
	installedVersion: nullableString,
	protocolVersion: Type.Integer({ minimum: 1 }),
	latestVersion: nullableString,
	checkedAt: Type.Union([integer, nil]),
	checkState: Type.Enum(["unknown", "checking", "ok", "failed", "development"]),
	serverId: str,
});
export const NekoApplicationInfo = contract("neko.application-info", {
	version: 1,
	input: Type.Object({}),
	variants: {
		ready: { state: { info: ApplicationInfoSchema }, methods: { check: rpc(nil, ApplicationInfoSchema) } },
	},
});
export type NekoApplicationInfo = Ref<typeof NekoApplicationInfo>;
