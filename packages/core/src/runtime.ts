import { homedir } from "node:os";
import { join } from "node:path";
import type { AttachedReplicatedState, Context } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type {
	CredentialStore,
	ModelInputLimits,
	ModelThinkingLevel,
	Provider,
	UserMessage,
} from "@earendil-works/pi-ai";
import { clampThinkingLevel, createModels, getSupportedThinkingLevels } from "@earendil-works/pi-ai/models";
import { deepseekProvider } from "@earendil-works/pi-ai/providers/deepseek";
import {
	type AgentEventStream,
	AssistantEntry,
	type Conversation,
	type ConversationId,
	type ConversationRecord,
	type ConversationView,
	type ConversationWatch,
	type Cursor,
	createRegistry,
	defineDoc,
	type Extension,
	Harness,
	LiveDoc as importLiveDoc,
	MemoryStorage,
	type Submission,
	UsageDoc,
	type UsageState,
	watchEvents,
} from "@earendil-works/pi-durable";
import { createNodePhotonImages } from "@earendil-works/pi-durable/images/node";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { createCodingTools } from "@earendil-works/pi-durable/tools";
import { AgentFileSearch } from "./agent-file-search.ts";
import { type CompactionRecord, readCompaction } from "./compaction.ts";
import {
	type CredentialProviderId,
	type CredentialStatus,
	credentialProvider,
	FileCredentialStore,
	InMemoryCredentialStore,
} from "./credentials.ts";
import { ImageDetails } from "./image-metadata.ts";
import { addDefaultImagePrompt } from "./image-prompt.ts";
import { imagePrompt, prepareInput } from "./images.ts";
import { type InputData, NekoInput } from "./input.ts";
import { totalUsage } from "./projection.ts";
import { expandSkillCommand } from "./prompt/invoke.ts";
import { createNekoPrompt } from "./prompt/prompt.ts";
import { createResourceLoader, scanSkillsByLevel } from "./prompt/resources.ts";
import type { SkillLevel } from "./prompt/skills.ts";
import { createResourceSnapshots } from "./prompt/snapshots.ts";
import { mergeUsage, SessionMetadataDoc, SessionMetadataManager } from "./session-metadata.ts";
import { subagentUsageTotals, subtractSubagentUsage } from "./subagent-usage.ts";
import {
	createSubagentExtension,
	DelegationsDoc,
	installSubagentCoordinator,
	refreshDelegations,
} from "./subagents.ts";
import { createApprovalExtension, prepareApprovalConversations, ToolApprovals } from "./tool-approvals.ts";
import { createWebSearchTools } from "./web-search.ts";
import {
	accessibleWorkspace,
	executionWorkspace,
	type NekoWorkspace,
	normalizeWorkspace,
	savedWorkspace,
} from "./workspace.ts";
import { WorkspaceFiles } from "./workspace-files.ts";

/** The built-in DeepSeek chat model used when the caller does not choose one. */
export const DEFAULT_MODEL = { provider: "deepseek", modelId: "deepseek-flash" } as const;

/** Default SQLite storage file: ~/.neko/neko.sqlite. */
export const DEFAULT_STORAGE_PATH = join(homedir(), ".neko", "neko.sqlite");

export type NekoModelRef = {
	readonly provider: string;
	readonly modelId: string;
};

export type NekoRuntimeOptions = {
	/** Chord context for every runtime call; default `BACKGROUND_CONTEXT` (never cancels). */
	readonly context?: Context;
	readonly onReport?: (error: unknown) => void;
	/** "sqlite" persists to disk (default); "memory" keeps everything in process, for tests. */
	readonly storage?: "sqlite" | "memory";
	/** SQLite file path; default `~/.neko/neko.sqlite`. */
	readonly storagePath?: string;
	/** Explicit in-memory DeepSeek override; never persisted or written to process.env. */
	readonly apiKey?: string;
	/** Explicit in-memory Tavily override for the web-search tools; never persisted or written to process.env. */
	readonly tavilyApiKey?: string;
	readonly credentials?: CredentialStore;
	readonly credentialsPath?: string;
	/** Model the root conversation runs with; default the built-in DeepSeek chat model. */
	readonly model?: NekoModelRef;
	readonly thinkingLevel?: ModelThinkingLevel;
	/** Working directory of the conversation's tools; default `process.cwd()`. */
	readonly cwd?: string;
	/** Extra pi-ai providers registered next to the built-in DeepSeek one. */
	readonly providers?: readonly Provider[];
	/** Extra extensions installed after CodingTools, e.g. custom tools; tests use this with the faux provider. */
	readonly extensions?: readonly Extension[];
	/** User-level resources root for the prompt extension (`<home>/.agents`); defaults to the OS home. Tests override for isolation. */
	readonly promptHome?: string;
};

export type NekoSubmitOptions = {
	readonly requestId?: string;
	readonly imageNames?: readonly string[];
	readonly whenBusy?: "steer" | "followUp" | "reject";
};

/** Terminal outcome of one submitted input, with the answer text already extracted. */
export type NekoAnswer =
	| { readonly status: "done"; readonly text: string }
	| { readonly status: "unanswered"; readonly reason: string; readonly detail?: string };

/** One conversation of a runtime: the handle plus the per-session operations frontends subscribe to. */
export type NekoSession = {
	/** Conversation identity; compare by `id`. */
	readonly id: ConversationId;
	/** The underlying pi-durable conversation. */
	readonly conversation: Conversation;
	/** Durably admit user input; the returned submission settles when the run answers it. */
	submit(content: UserMessage["content"], options?: NekoSubmitOptions): Promise<Submission>;
	/** Wait for a submission and extract the answer text. */
	waitAnswer(submission: Submission): Promise<NekoAnswer>;
	/** The conversation's structural view as a read-only Chord state, updated after every commit. */
	viewState(): Promise<AttachedReplicatedState<ConversationView>>;
	/** The structural view as a serialized exact-frame watch with bounded pending frames. */
	watch(): Promise<ConversationWatch>;
	/** Coding-agent style agent events (message/tool deltas) for this conversation. */
	events(): Promise<AgentEventStream>;
	/** Token and cost totals of this conversation's `pi.usage`. */
	usage(): Promise<UsageState>;
	/** Withdraw queued inputs and abort the current run. */
	abort(): Promise<void>;
	compact(instructions?: string): Promise<void>;
	compactionRecord(): Promise<CompactionRecord | null>;
};

/** Directory entry of `listConversations()`. */
export type NekoConversationInfo = {
	readonly id: ConversationId;
	/** Archived conversations are hidden from listings and lookups (soft delete). */
	readonly archived: boolean;
	readonly workspaceRoot: string;
	readonly lastUsedAt: number;
	readonly title: string;
	readonly firstPromptPreview: string;
	readonly createdAt: number;
	readonly lastMessageAt: number | null;
	readonly model: NekoModelRef | null;
	readonly status: "idle" | "running" | "error";
};

/** A chat model offered by the runtime's Models registry, for frontend selectors. */
export type NekoModelInfo = {
	readonly provider: string;
	readonly modelId: string;
	readonly name: string;
	readonly contextWindow: number;
	readonly input: readonly string[];
	readonly inputLimits?: ModelInputLimits;
	/** Whether the model supports thinking/reasoning levels. */
	readonly reasoning: boolean;
	readonly supportedThinkingLevels: readonly ModelThinkingLevel[];
	readonly thinkingLevelAdjustments: Record<ModelThinkingLevel, ModelThinkingLevel>;
};

/** One skill offered by a conversation's workspace, for frontend completion. */
export type NekoSkillInfo = {
	readonly name: string;
	readonly description: string;
	/** Absolute path of the SKILL.md file. */
	readonly location: string;
	/** Discovery level this skill was resolved from (project > user > builtin). */
	readonly level: SkillLevel;
};

/** What one conversation currently runs with (resolved agent). */
export type NekoAgentInfo = {
	readonly cwd: string;
	readonly model?: NekoModelRef;
	readonly thinkingLevel: ModelThinkingLevel;
	/** Names of the selected extensions, in effect order. */
	readonly extensions: readonly string[];
};

/** Changes `configureConversation` applies to one conversation's agent. */
export type NekoConversationChange = {
	readonly model?: NekoModelRef;
	readonly thinkingLevel?: ModelThinkingLevel;
};

export type NekoCreateConversationOptions = {
	readonly model?: NekoModelRef;
	readonly thinkingLevel?: ModelThinkingLevel;
	readonly cwd?: string;
};

/**
 * Soft-delete marker stored per conversation. pi-durable 1.1.0 has no conversation
 * deletion, so `archiveConversation` writes this document and listings filter on it.
 */
const ArchivedDoc = defineDoc<{ archived: boolean }>({
	kind: "app.neko.conversation",
	version: 1,
	scope: "conversation",
	history: "latest",
	fork: "initial",
	initial: () => ({ archived: false }),
});

const WorkspacesDoc = defineDoc<{ items: NekoWorkspace[] }>({
	kind: "app.neko.workspaces",
	version: 1,
	scope: "conversation",
	history: "latest",
	fork: "initial",
	initial: () => ({ items: [] }),
});

const ActivityDoc = defineDoc<{ lastUsedAt: number }>({
	kind: "app.neko.activity",
	version: 1,
	scope: "conversation",
	history: "latest",
	fork: "initial",
	initial: () => ({ lastUsedAt: 0 }),
});

/** A running neko-harness runtime: one open storage and its conversations, root plus created ones. */
export type NekoRuntime = {
	readonly workspaceFiles: WorkspaceFiles;
	readonly closed: Harness["closed"];
	/** Chord context bound to every runtime call. */
	readonly context: Context;
	/** The underlying pi-durable Harness, for callers that need more. */
	readonly harness: Harness;
	readonly approvals: ToolApprovals;
	/** The root conversation. */
	readonly conversation: Conversation;
	/** The root session: same conversation, bundled per-session operations. */
	readonly root: NekoSession;

	/** Durably admit user input to the root conversation; the returned submission settles when the run answers it. */
	submit(content: UserMessage["content"], options?: NekoSubmitOptions): Promise<Submission>;
	/** Wait for a submission on the root conversation and extract the answer text. */
	waitAnswer(submission: Submission): Promise<NekoAnswer>;
	/** The root conversation's structural view as a read-only Chord state, updated after every commit. */
	viewState(id?: ConversationId): Promise<AttachedReplicatedState<ConversationView>>;
	/** The structural view as a serialized exact-frame watch with bounded pending frames. */
	watch(id?: ConversationId): Promise<ConversationWatch>;
	/** Coding-agent style agent events (message/tool deltas). */
	events(id?: ConversationId): Promise<AgentEventStream>;
	/** Token and cost totals of a conversation's `pi.usage` (default: root). */
	usage(id?: ConversationId): Promise<UsageState>;
	/** Withdraw queued inputs and abort the current run (default: root). */
	abort(id?: ConversationId): Promise<void>;
	compact(instructions?: string, id?: ConversationId): Promise<void>;

	/** Every conversation of this storage, root included, with its soft-delete state. */
	listConversations(): Promise<NekoConversationInfo[]>;
	onDirectoryChange(listener: () => void): () => void;
	namingUsage(id?: ConversationId): Promise<UsageState>;
	globalUsage(): Promise<UsageState>;
	listWorkspaces(): Promise<NekoWorkspace[]>;
	addWorkspace(path: string): Promise<NekoWorkspace>;
	touchConversation(id: ConversationId): Promise<void>;
	forkConversation(id: ConversationId): Promise<NekoSession>;
	/** Create a new ownerless conversation; starts as a copy of the runtime's model/thinking/cwd choices. */
	createConversation(options?: NekoCreateConversationOptions): Promise<NekoSession>;
	/** Acquire a session by id; `undefined` for unknown or archived conversations. */
	getConversation(id: ConversationId): Promise<NekoSession | undefined>;
	/** Soft delete: hide the conversation from listings and lookups. pi-durable cannot delete conversations. */
	archiveConversation(id: ConversationId): Promise<void>;
	/** Change a conversation's model and/or thinking level; `false` when the conversation is unknown or archived. */
	configureConversation(id: ConversationId, change: NekoConversationChange): Promise<boolean>;
	/** Every chat model in the Models registry, for frontend model selectors. */
	listModels(): NekoModelInfo[];
	credentialStatus(provider: CredentialProviderId): Promise<CredentialStatus>;
	saveCredential(provider: CredentialProviderId, key: string): Promise<void>;
	removeCredential(provider: CredentialProviderId): Promise<void>;
	/** The conversation's resolved agent: effective model, thinking level, selected extension names. */
	getAgent(id?: ConversationId): Promise<NekoAgentInfo>;
	/** Skills available to a conversation's workspace (project > user > builtin, merged). */
	listSkills(id?: ConversationId): Promise<NekoSkillInfo[]>;
	/**
	 * Skills at every level for one workspace WITHOUT merging (duplicates across levels included),
	 * each tagged with its level. Market/install UIs derive install state from this.
	 */
	listSkillsByLevel(cwd?: string): Promise<NekoSkillInfo[]>;
	/**
	 * Install an extension, replacing one with the same name in place (pi-durable reload semantics):
	 * running work finishes on the code it started with; the next phase, request, or call uses the new code.
	 */
	installExtension(extension: Extension): void;
	/** Close the Harness and its storage. */
	close(): Promise<void>;
};

/**
 * Open the neko-harness runtime: SQLite storage, the built-in DeepSeek provider
 * (Chat Completions via pi-ai), and the CodingTools extension (read/write/edit/bash
 * on a LocalExecutionEnv).
 */
export async function createNekoRuntime(options: NekoRuntimeOptions = {}): Promise<NekoRuntime> {
	const context = options.context ?? BACKGROUND_CONTEXT;
	const defaultCwd = normalizeWorkspace(options.cwd);
	const model: NekoModelRef = options.model ?? DEFAULT_MODEL;
	const providers = options.providers ?? [];

	const credentials =
		options.credentials ??
		(options.storage === "memory" && !options.credentialsPath
			? new InMemoryCredentialStore()
			: new FileCredentialStore(options.credentialsPath));
	const runtimeKeys = new Map<CredentialProviderId, string>();
	const deepseekKey = options.apiKey?.trim();
	if (deepseekKey) runtimeKeys.set("deepseek", deepseekKey);
	const tavilyKey = options.tavilyApiKey?.trim();
	if (tavilyKey) runtimeKeys.set("tavily", tavilyKey);
	const effectiveCredentials: CredentialStore = runtimeKeys.size
		? {
				read: async (id) => {
					const override = runtimeKeys.get(id as CredentialProviderId);
					return override !== undefined ? { type: "api_key", key: override } : credentials.read(id);
				},
				list: () => credentials.list(),
				modify: (id, fn) => credentials.modify(id, fn),
				delete: (id) => credentials.delete(id),
			}
		: credentials;
	const models = createModels({ credentials: effectiveCredentials });
	models.setProvider(deepseekProvider());
	for (const provider of providers) models.setProvider(provider);
	const resolveLevel = (ref: NekoModelRef, level: ModelThinkingLevel) => {
		const info = models.getModel(ref.provider, ref.modelId);
		if (!info) throw new Error("Unknown model");
		return clampThinkingLevel(info, level);
	};

	const workspaceFiles = new WorkspaceFiles();
	const storage =
		options.storage === "memory"
			? new MemoryStorage()
			: await openNodeSqliteStorage(options.storagePath ?? DEFAULT_STORAGE_PATH);

	const registry = createRegistry();
	registry.install(createCodingTools({ images: await createNodePhotonImages() }));
	registry.install(ImageDetails);
	registry.install(AgentFileSearch);
	registry.install(
		createWebSearchTools(async () => {
			const saved = await effectiveCredentials.read("tavily");
			if (saved?.type === "api_key" && saved.key) return saved.key;
			return process.env.TAVILY_API_KEY || undefined;
		}),
	);
	const loadResources = createResourceLoader(options.promptHome);
	const resourceSnapshots = createResourceSnapshots(loadResources, (id, requestId) =>
		storage.submissionByRequest(id, requestId, context),
	);
	registry.install(createNekoPrompt(resourceSnapshots.current));
	registry.install(
		createSubagentExtension(async (id, requestId, cwd) => {
			resourceSnapshots.stage(id, requestId, cwd, await loadResources(cwd));
		}, resourceSnapshots.discard),
	);
	for (const extension of options.extensions ?? []) registry.install(extension);
	let approvals!: ToolApprovals;
	const approvalExtension = createApprovalExtension(() => approvals);
	registry.install(approvalExtension);

	const harness = await Harness.open(
		storage,
		{
			models,
			registry,
			onReport: options.onReport,
			conversationCreated: async (tx, record) => {
				(await tx.doc(SessionMetadataDoc, record.id)).createdAt = Date.now();
			},
			env: ({ cwd }) => workspaceFiles.env(executionWorkspace(cwd)),
		},
		context,
	);
	const scanConversations = () =>
		harness.commit(async (tx) => {
			const records: ConversationRecord[] = [];
			let cursor: Cursor | undefined;
			do {
				const page = await tx.scanConversations({}, 1000, cursor);
				records.push(...page.items);
				cursor = page.next;
			} while (cursor);
			return records;
		}, context);
	approvals = new ToolApprovals(harness, context);
	const existing = await scanConversations();

	try {
		await installSubagentCoordinator(
			harness,
			existing.map((r) => r.id),
			context,
		);
		await prepareApprovalConversations(
			harness,
			existing.map((r) => r.id),
			approvalExtension,
			context,
		);
		for (const record of existing) {
			const target = await harness.conversation(record.id, context);
			if (target) {
				savedWorkspace((await target.agent(context)).cwd);
				if (!(await harness.snapshot(SessionMetadataDoc, record.id, context))?.createdAt)
					throw new Error(
						"Unsupported session metadata format; use a new storage file. Existing data was not deleted.",
					);
			}
		}
	} catch (error) {
		await workspaceFiles.close();
		await harness.close(context);
		throw error;
	}
	const conversation = await harness.root(context, {
		agent: {
			model,
			thinkingLevel: resolveLevel(model, options.thinkingLevel ?? "high"),
			cwd: defaultCwd,
		},
	});
	const registerWorkspace = async (path: string): Promise<NekoWorkspace> => {
		await harness.commit(async (tx) => {
			const doc = await tx.doc(WorkspacesDoc, conversation.id);
			if (!doc.items.some((item) => item.path === path)) doc.items.push({ path, createdAt: Date.now() });
		}, context);
		return (await harness.snapshot(WorkspacesDoc, conversation.id, context))!.items.find((item) => item.path === path)!;
	};
	const addWorkspace = async (path: string) => registerWorkspace(accessibleWorkspace(path));
	for (const record of [...existing, { id: conversation.id }]) {
		const target = await harness.conversation(record.id, context);
		if (target) await registerWorkspace(savedWorkspace((await target.agent(context)).cwd));
	}

	let lastActivity = 0;
	for (const record of existing)
		lastActivity = Math.max(lastActivity, (await harness.snapshot(ActivityDoc, record.id, context))?.lastUsedAt ?? 0);
	const touchConversation = async (id: ConversationId): Promise<void> => {
		await harness.commit(async (tx) => {
			const doc = await tx.doc(ActivityDoc, id);
			lastActivity = Math.max(Date.now(), lastActivity + 1, doc.lastUsedAt + 1);
			doc.lastUsedAt = lastActivity;
		}, context);
	};
	if (existing.length === 0) await touchConversation(conversation.id);
	const metadata = new SessionMetadataManager(harness, storage, context, registry, options.onReport);
	if (existing.length === 0) await metadata.initialize(conversation.id);
	for (const record of existing)
		if (!record.owner && !(await harness.snapshot(ArchivedDoc, record.id, context))?.archived)
			await metadata.restore(record.id);
	let closing: Promise<void> | undefined;
	const cleanup = () => {
		if (!closing)
			closing = (async () => {
				await workspaceFiles.close();
				await metadata.close();
			})();
		return closing;
	};
	void harness.closed.then(cleanup).catch((error) => options.onReport?.(error));
	harness.resume();

	// Serialize admission and configuration; preprocessing must use the admitted model.
	const admissions = new Map<ConversationId, Promise<unknown>>();
	const admit = async <T>(id: ConversationId, operation: () => Promise<T>): Promise<T> => {
		const work = (admissions.get(id) ?? Promise.resolve()).catch(() => {}).then(operation);
		admissions.set(id, work);
		try {
			return await work;
		} finally {
			if (admissions.get(id) === work) admissions.delete(id);
		}
	};
	const submitTo = async (
		target: Conversation,
		content: UserMessage["content"],
		submitOptions?: NekoSubmitOptions,
	): Promise<Submission> =>
		admit(target.id, async () => {
			const agent = await target.agent(context);
			const workspace = executionWorkspace(agent.cwd);
			const duplicate =
				submitOptions?.requestId !== undefined &&
				(await storage.submissionByRequest(target.id, submitOptions.requestId, context));
			const data: InputData = { at: Date.now(), prompt: "", images: [] };
			let invocationName: string | undefined;
			if (!duplicate && typeof content === "string" && content.startsWith("/skill:")) {
				const end = content.indexOf(" ");
				invocationName = content.slice(7, end === -1 ? undefined : end);
			}
			const prepared = duplicate ? undefined : await loadResources(workspace, invocationName);
			if (prepared && invocationName !== undefined && typeof content === "string") {
				content = await expandSkillCommand(
					content,
					prepared.skills,
					async (path) => {
						if (prepared.invocation?.filePath !== path) throw new Error("Missing prepared skill content");
						return prepared.invocation.content;
					},
					undefined,
					(skill) => {
						data.skill = skill;
					},
				);
			}
			if (!duplicate && agent.model?.provider === "deepseek" && !(await models.checkAuth("deepseek"))) {
				throw new Error("DEEPSEEK_KEY_REQUIRED: Configure a DeepSeek API key in /login or Web settings.");
			}
			if (!duplicate && agent.model) {
				const resolved = models.getModel(agent.model.provider, agent.model.modelId);
				if (resolved) content = await prepareInput(content, resolved);
			}

			const requestId = submitOptions?.requestId ?? crypto.randomUUID();
			data.prompt = imagePrompt(content);
			if (!duplicate) {
				const input = addDefaultImagePrompt(content);
				content = input.content;
				if (input.defaultImagePrompt) data.defaultImagePrompt = input.defaultImagePrompt;
			}
			if (!duplicate && Array.isArray(content)) {
				let index = 0;
				for (const [contentIndex, block] of content.entries()) {
					if (block.type !== "image") continue;
					const bytes = Buffer.from(block.data, "base64");
					const { default: sharp } = await import("sharp");
					const info = await sharp(bytes).metadata();
					data.images.push({
						contentIndex,
						name: (submitOptions?.imageNames?.[index++] ?? "Image").replace(/\p{Cc}/gu, "").slice(0, 200),
						mimeType: block.mimeType,
						width: info.width!,
						height: info.height!,
						bytes: bytes.length,
					});
				}
			}
			if (prepared) resourceSnapshots.stage(target.id, requestId, workspace, prepared);
			let result: Submission;
			try {
				result = await target.submit(
					{
						type: "input",
						content,
						entry: { kind: NekoInput.kind, data },
						requestId,
						...(submitOptions?.whenBusy !== undefined ? { whenBusy: submitOptions.whenBusy } : {}),
					},
					context,
				);
			} catch (error) {
				resourceSnapshots.discard(target.id, requestId);
				throw error;
			}
			await touchConversation(target.id);
			await metadata.reconcile(target.id);
			return result;
		});

	const waitAnswerOf = async (target: Conversation, submission: Submission): Promise<NekoAnswer> => {
		const settled = await submission.wait(context);
		await metadata.flush();
		await metadata.reconcile(target.id);
		if (settled.status === "done" && settled.type === "input") {
			const entry = await target.commit((tx) => tx.entry(AssistantEntry, settled.answer), context);
			const message = entry?.model?.[0];
			const text =
				message?.role === "assistant"
					? message.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("")
					: "";
			return { status: "done", text };
		}
		const detail = settled.status === "unanswered" ? settled.detail : undefined;
		return {
			status: "unanswered",
			reason: settled.status === "unanswered" ? settled.reason : settled.status,
			...(detail !== undefined ? { detail: typeof detail === "string" ? detail : JSON.stringify(detail) } : {}),
		};
	};

	const makeSession = (target: Conversation): NekoSession => ({
		id: target.id,
		conversation: target,
		submit(content, submitOptions) {
			return submitTo(target, content, submitOptions);
		},
		waitAnswer(submission) {
			return waitAnswerOf(target, submission);
		},
		viewState() {
			return target.viewState(context);
		},
		watch() {
			return target.watch(context);
		},
		events() {
			return watchEvents(harness, target.id, context);
		},
		async usage() {
			return mergeUsage(
				(await harness.snapshot(UsageDoc, target.id, context)) ?? { models: {}, tools: {} },
				(await harness.snapshot(SessionMetadataDoc, target.id, context))?.namingUsage ?? { models: {}, tools: {} },
			);
		},
		compactionRecord() {
			return readCompaction(harness, storage, target.id, context);
		},
		async compact(instructions) {
			const agent = await target.agent(context);
			if (agent.model?.provider === "deepseek" && !(await models.checkAuth("deepseek")))
				throw new Error("DEEPSEEK_KEY_REQUIRED: Configure DeepSeek in /login or Web settings.");
			await admit(target.id, async () => {
				const live = await harness.snapshot(importLiveDoc, target.id, context);
				if (
					live?.compactions?.length ||
					(await readCompaction(harness, storage, target.id, context))?.phase === "waiting-to-apply"
				)
					return;
				await target.compact(instructions?.trim() || undefined, context);
			});
		},
		abort() {
			return target.abort(context);
		},
	});

	const rootSession = makeSession(conversation);

	const sessionFor = async (id?: ConversationId): Promise<NekoSession> => {
		if (id === undefined || id === conversation.id) return rootSession;
		const session = await getConversation(id);
		if (session === undefined) throw new Error(`Conversation ${id} is not available (unknown or archived).`);
		return session;
	};

	const getConversation = async (id: ConversationId): Promise<NekoSession | undefined> => {
		// `conversation()` yields undefined for unknown ids; snapshot on an unknown id
		// would reject, so only read the archive marker for conversations that exist.
		const target = await harness.conversation(id, context);
		if (target === undefined) return undefined;
		const archived = (await harness.snapshot(ArchivedDoc, id, context))?.archived ?? false;
		const record = await harness.commit((tx) => tx.conversation(id), context);
		return archived || record?.owner ? undefined : makeSession(target);
	};

	return {
		context,
		async compact(instructions, id) {
			await (await sessionFor(id)).compact(instructions);
		},
		onDirectoryChange: (listener) => metadata.subscribe(listener),
		async namingUsage(id = conversation.id) {
			return structuredClone((await harness.snapshot(SessionMetadataDoc, id, context))!.namingUsage);
		},
		async globalUsage() {
			let total: UsageState = { models: {}, tools: {} };
			for (const record of await scanConversations()) {
				total = mergeUsage(total, (await harness.snapshot(UsageDoc, record.id, context)) ?? { models: {}, tools: {} });
				total = mergeUsage(
					total,
					(await harness.snapshot(SessionMetadataDoc, record.id, context))?.namingUsage ?? { models: {}, tools: {} },
				);
			}
			return total;
		},
		touchConversation,
		addWorkspace,
		async listWorkspaces() {
			return [...((await harness.snapshot(WorkspacesDoc, conversation.id, context))?.items ?? [])];
		},
		async forkConversation(id) {
			const source = await sessionFor(id);
			const agent = await source.conversation.agent(context);
			await registerWorkspace(savedWorkspace(agent.cwd));
			const newest = await source.conversation.entries({}, 1, undefined, context);
			const at = newest.items[0]?.id;
			const sourceMetadata = at === undefined ? undefined : await harness.snapshot(SessionMetadataDoc, id, context);
			const childId = await harness.commit(async (tx) => {
				const inherited: import("./subagents.ts").Delegation[] = [];
				if (at !== undefined) {
					const references = await refreshDelegations(tx, id);
					const calls = new Set<string>();
					let cursor: import("@earendil-works/pi-durable").Cursor | undefined;
					do {
						const page = await tx.scanEntries({ conversationId: id, maxEntryId: at }, 100, cursor);
						for (const entry of page.items)
							for (const message of entry.model ?? []) {
								if (message.role === "assistant")
									for (const block of message.content) {
										if (block.type === "toolCall") calls.add(block.id);
									}
							}
						cursor = page.next;
					} while (cursor);
					const frozen = new Map<number, { through: number; state: UsageState }>();
					for (const reference of references) {
						if (!calls.has(reference.callId)) continue;
						let snapshot = frozen.get(reference.childId);
						if (!snapshot) {
							const latest = await tx.scanEntries({ conversationId: reference.childId as ConversationId }, 1);
							snapshot = {
								through: latest.items[0]?.id ?? 0,
								state: JSON.parse(JSON.stringify(await tx.doc(UsageDoc, reference.childId as ConversationId))),
							};
							frozen.set(reference.childId, snapshot);
						}
						const usage = totalUsage(snapshot.state);
						inherited.push({
							...reference,
							historyThrough: reference.historyThrough ?? snapshot.through,
							roundUsage:
								reference.roundUsage ??
								(reference.usageStart
									? subagentUsageTotals(subtractSubagentUsage(snapshot.state, reference.usageStart))
									: null),
							historyUsage: reference.historyUsage ?? {
								input: usage.input,
								output: usage.output,
								cacheRead: usage.cacheRead,
								cacheWrite: usage.cacheWrite,
								cost: usage.cost.total,
							},
						});
					}
				}
				// Pi transactions require table reads before the first table write.
				const child =
					at === undefined
						? await tx.createConversation({ ownership: { kind: "ownerless" } })
						: await tx.forkConversation(id, at, { ownership: { kind: "ownerless" } });
				(await tx.doc(DelegationsDoc, child.id)).items = inherited;
				if (sourceMetadata) {
					const doc = await tx.doc(SessionMetadataDoc, child.id);
					doc.title = sourceMetadata.title || sourceMetadata.firstPromptPreview;
					doc.firstPromptPreview = sourceMetadata.firstPromptPreview;
					doc.naming = "ready";
				}
				return child.id;
			}, context);
			const child = (await harness.conversation(childId, context))!;
			await child.configure(
				{ model: agent.model, thinkingLevel: agent.thinkingLevel, cwd: savedWorkspace(agent.cwd) },
				context,
			);
			await metadata.initialize(child.id);
			await touchConversation(child.id);
			return makeSession(child);
		},
		harness,
		approvals,
		closed: harness.closed,
		workspaceFiles,
		conversation,
		root: rootSession,
		submit: rootSession.submit,
		waitAnswer: rootSession.waitAnswer,
		async viewState(id?: ConversationId) {
			return (await sessionFor(id)).viewState();
		},
		async watch(id?: ConversationId) {
			return (await sessionFor(id)).watch();
		},
		async events(id?: ConversationId) {
			return (await sessionFor(id)).events();
		},
		async usage(id?: ConversationId) {
			return (await sessionFor(id)).usage();
		},
		async abort(id?: ConversationId) {
			await (await sessionFor(id)).abort();
		},
		async listConversations() {
			// The directory hides archived conversations (soft-deleted).
			const records = await scanConversations();
			const infos: NekoConversationInfo[] = [];
			for (const record of records) {
				if (record.owner) continue;
				const archived = (await harness.snapshot(ArchivedDoc, record.id, context))?.archived ?? false;
				if (!archived) {
					const target = await harness.conversation(record.id, context);
					if (!target) continue;
					const info = (await harness.snapshot(SessionMetadataDoc, record.id, context))!;
					infos.push({
						title: info.title,
						firstPromptPreview: info.firstPromptPreview,
						createdAt: info.createdAt,
						lastMessageAt: info.lastMessageAt,
						status: info.status,
						model: (await target.agent(context)).model ?? null,
						id: record.id,
						archived: false,
						workspaceRoot: savedWorkspace((await target.agent(context)).cwd),
						lastUsedAt: (await harness.snapshot(ActivityDoc, record.id, context))?.lastUsedAt ?? 0,
					});
				}
			}
			return infos;
		},
		async createConversation(createOptions) {
			const workspace = await addWorkspace(createOptions?.cwd ?? defaultCwd);
			const created = await harness.createConversation(
				{
					ownership: { kind: "ownerless" },
					agent: {
						model: createOptions?.model ?? model,
						thinkingLevel: resolveLevel(
							createOptions?.model ?? model,
							createOptions?.thinkingLevel ?? options.thinkingLevel ?? "high",
						),
						cwd: workspace.path,
					},
				},
				context,
			);
			await metadata.initialize(created.id);
			await touchConversation(created.id);
			return makeSession(created);
		},
		getConversation,
		async archiveConversation(id) {
			await (await sessionFor(id)).abort();
			await metadata.archive(id);
			await harness.commit(async (tx) => {
				(await tx.doc(ArchivedDoc, id)).archived = true;
			}, context);
			resourceSnapshots.forget(id);
		},
		async configureConversation(id, change) {
			return admit(id, async () => {
				const session = await getConversation(id);
				if (session === undefined) return false;
				const current = await session.conversation.agent(context);
				const ref = change.model ?? current.model;
				const targetModel = ref && models.getModel(ref.provider, ref.modelId);
				if (!targetModel) throw new Error("Unknown model");
				await session.conversation.configure(
					{ model: ref, thinkingLevel: clampThinkingLevel(targetModel, change.thinkingLevel ?? current.thinkingLevel) },
					context,
				);
				return true;
			});
		},
		async credentialStatus(provider) {
			const spec = credentialProvider(provider);
			const saved = await credentials.read(spec.id);
			const savedConfigured = saved?.type === "api_key" && Boolean(saved.key);
			const environmentConfigured = Boolean(process.env[spec.envVar]);
			return {
				savedConfigured,
				environmentConfigured,
				source: runtimeKeys.has(spec.id)
					? "runtime"
					: savedConfigured
						? "saved"
						: environmentConfigured
							? "environment"
							: spec.keyless
								? "keyless"
								: "none",
			};
		},
		async saveCredential(provider, key) {
			const spec = credentialProvider(provider);
			if (
				typeof key !== "string" ||
				!key.trim() ||
				key.length > 4096 ||
				Array.from(key).some((char) => char.charCodeAt(0) < 32)
			)
				throw new Error("Enter a valid API key.");
			try {
				await credentials.modify(spec.id, async () => ({ type: "api_key", key: key.trim() }));
			} catch {
				throw new Error("Cannot save API key.");
			}
		},
		async removeCredential(provider) {
			const spec = credentialProvider(provider);
			try {
				await credentials.delete(spec.id);
			} catch {
				throw new Error("Cannot remove API key.");
			}
		},
		listModels() {
			return models.getModels().map((model) => ({
				provider: model.provider,
				modelId: model.id,
				name: model.name,
				contextWindow: model.contextWindow,
				input: model.input,
				...(model.inputLimits ? { inputLimits: model.inputLimits } : {}),
				reasoning: model.reasoning,
				supportedThinkingLevels: getSupportedThinkingLevels(model),
				thinkingLevelAdjustments: Object.fromEntries(
					(["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const).map((level) => [
						level,
						clampThinkingLevel(model, level),
					]),
				) as Record<ModelThinkingLevel, ModelThinkingLevel>,
			}));
		},
		async getAgent(id?: ConversationId) {
			const session = await sessionFor(id);
			const agent = await session.conversation.agent(context);
			return {
				...(agent.model !== undefined ? { model: agent.model } : {}),
				thinkingLevel: agent.thinkingLevel,
				cwd: savedWorkspace(agent.cwd),
				extensions: agent.extensions.map((extension) => extension.name),
			};
		},
		async listSkills(id?: ConversationId) {
			const session = await sessionFor(id);
			const agent = await session.conversation.agent(context);
			const { skills } = await loadResources(savedWorkspace(agent.cwd));
			return skills.map((skill) => ({
				name: skill.name,
				description: skill.description,
				location: skill.filePath,
				level: skill.level,
			}));
		},
		async listSkillsByLevel(cwd: string) {
			const skills = await scanSkillsByLevel(normalizeWorkspace(cwd ?? defaultCwd), options.promptHome ?? homedir());
			return skills.map((skill) => ({
				name: skill.name,
				description: skill.description,
				location: skill.filePath,
				level: skill.level,
			}));
		},
		installExtension(extension) {
			registry.install(extension);
		},
		async close() {
			await cleanup();
			return harness.close(context);
		},
	};
}
