import { homedir } from "node:os";
import { join } from "node:path";
import type { AttachedReplicatedState, Context } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { ModelThinkingLevel, Provider } from "@earendil-works/pi-ai";
import { createModels } from "@earendil-works/pi-ai/models";
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
	MemoryStorage,
	type Submission,
	UsageDoc,
	type UsageState,
	watchEvents,
} from "@earendil-works/pi-durable";
import { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { CodingTools } from "@earendil-works/pi-durable/tools";
import { executionWorkspace, normalizeWorkspace, savedWorkspace } from "./workspace.ts";

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
	/** "sqlite" persists to disk (default); "memory" keeps everything in process, for tests. */
	readonly storage?: "sqlite" | "memory";
	/** SQLite file path; default `~/.neko/neko.sqlite`. */
	readonly storagePath?: string;
	/** DeepSeek API key; default `process.env.DEEPSEEK_API_KEY`. Missing: a clear error is thrown. */
	readonly apiKey?: string;
	/** Model the root conversation runs with; default the built-in DeepSeek chat model. */
	readonly model?: NekoModelRef;
	readonly thinkingLevel?: ModelThinkingLevel;
	/** Working directory of the conversation's tools; default `process.cwd()`. */
	readonly cwd?: string;
	/** Extra pi-ai providers registered next to the built-in DeepSeek one. */
	readonly providers?: readonly Provider[];
	/** Extra extensions installed after CodingTools, e.g. custom tools; tests use this with the faux provider. */
	readonly extensions?: readonly Extension[];
};

export type NekoSubmitOptions = {
	readonly requestId?: string;
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
	submit(content: string, options?: NekoSubmitOptions): Promise<Submission>;
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
};

/** Directory entry of `listConversations()`. */
export type NekoConversationInfo = {
	readonly id: ConversationId;
	/** Archived conversations are hidden from listings and lookups (soft delete). */
	readonly archived: boolean;
	readonly workspaceRoot: string;
	readonly lastUsedAt: number;
};

/** A chat model offered by the runtime's Models registry, for frontend selectors. */
export type NekoModelInfo = {
	readonly provider: string;
	readonly modelId: string;
	readonly name: string;
	readonly contextWindow: number;
	/** Whether the model supports thinking/reasoning levels. */
	readonly reasoning: boolean;
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
	/** Chord context bound to every runtime call. */
	readonly context: Context;
	/** The underlying pi-durable Harness, for callers that need more. */
	readonly harness: Harness;
	/** The root conversation. */
	readonly conversation: Conversation;
	/** The root session: same conversation, bundled per-session operations. */
	readonly root: NekoSession;

	/** Durably admit user input to the root conversation; the returned submission settles when the run answers it. */
	submit(content: string, options?: NekoSubmitOptions): Promise<Submission>;
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

	/** Every conversation of this storage, root included, with its soft-delete state. */
	listConversations(): Promise<NekoConversationInfo[]>;
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
	/** The conversation's resolved agent: effective model, thinking level, selected extension names. */
	getAgent(id?: ConversationId): Promise<NekoAgentInfo>;
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
 * on a NodeExecutionEnv).
 */
export async function createNekoRuntime(options: NekoRuntimeOptions = {}): Promise<NekoRuntime> {
	const context = options.context ?? BACKGROUND_CONTEXT;
	const defaultCwd = normalizeWorkspace(options.cwd);
	const model: NekoModelRef = options.model ?? DEFAULT_MODEL;
	const providers = options.providers ?? [];

	const deepseekReplaced = providers.some((provider) => provider.id === "deepseek");
	if (model.provider === "deepseek" && !deepseekReplaced) {
		const key = options.apiKey ?? process.env.DEEPSEEK_API_KEY;
		if (key === undefined || key === "") {
			throw new Error(
				"DEEPSEEK_API_KEY is not set: neko-harness needs a DeepSeek API key for the built-in " +
					'"deepseek" provider. Set the environment variable or pass createNekoRuntime({ apiKey }).',
			);
		}
		// deepseekProvider() reads the key from the environment at request time.
		if (options.apiKey !== undefined && process.env.DEEPSEEK_API_KEY === undefined) {
			process.env.DEEPSEEK_API_KEY = options.apiKey;
		}
	}

	const models = createModels();
	models.setProvider(deepseekProvider());
	for (const provider of providers) models.setProvider(provider);

	const registry = createRegistry();
	registry.install(CodingTools);
	for (const extension of options.extensions ?? []) registry.install(extension);

	const storage =
		options.storage === "memory"
			? new MemoryStorage()
			: await openNodeSqliteStorage(options.storagePath ?? DEFAULT_STORAGE_PATH);

	const harness = await Harness.open(
		storage,
		{
			models,
			registry,
			env: ({ cwd }) => new NodeExecutionEnv({ cwd: executionWorkspace(cwd) }),
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
	const existing = await scanConversations();
	try {
		for (const record of existing) {
			const target = await harness.conversation(record.id, context);
			if (target) savedWorkspace((await target.agent(context)).cwd);
		}
	} catch (error) {
		await harness.close(context);
		throw error;
	}
	const conversation = await harness.root(context, {
		agent: {
			model,
			...(options.thinkingLevel !== undefined ? { thinkingLevel: options.thinkingLevel } : {}),
			cwd: defaultCwd,
		},
	});
	const touchConversation = async (id: ConversationId): Promise<void> => {
		await harness.commit(async (tx) => {
			const doc = await tx.doc(ActivityDoc, id);
			doc.lastUsedAt = Math.max(Date.now(), doc.lastUsedAt + 1);
		}, context);
	};
	if (existing.length === 0) await touchConversation(conversation.id);
	harness.resume();

	const submitTo = async (
		target: Conversation,
		content: string,
		submitOptions?: NekoSubmitOptions,
	): Promise<Submission> => {
		executionWorkspace((await target.agent(context)).cwd);
		const result = await target.submit(
			{
				type: "input",
				content,
				...(submitOptions?.requestId !== undefined ? { requestId: submitOptions.requestId } : {}),
				...(submitOptions?.whenBusy !== undefined ? { whenBusy: submitOptions.whenBusy } : {}),
			},
			context,
		);

		await touchConversation(target.id);
		return result;
	};

	const waitAnswerOf = async (target: Conversation, submission: Submission): Promise<NekoAnswer> => {
		const settled = await submission.wait(context);
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
			return (await harness.snapshot(UsageDoc, target.id, context)) ?? { models: {}, tools: {} };
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
		return archived ? undefined : makeSession(target);
	};

	return {
		context,
		touchConversation,
		async forkConversation(id) {
			const source = await sessionFor(id);
			const agent = await source.conversation.agent(context);
			const newest = await source.conversation.entries({}, 1, undefined, context);
			const at = newest.items[0]?.id;
			const child =
				at === undefined
					? await harness.createConversation(
							{
								ownership: { kind: "ownerless" },
								agent: { model: agent.model, thinkingLevel: agent.thinkingLevel, cwd: savedWorkspace(agent.cwd) },
							},
							context,
						)
					: await source.conversation.fork(at, { ownership: { kind: "ownerless" } }, context);
			await child.configure(
				{ model: agent.model, thinkingLevel: agent.thinkingLevel, cwd: savedWorkspace(agent.cwd) },
				context,
			);
			await touchConversation(child.id);
			return makeSession(child);
		},
		harness,
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
				const archived = (await harness.snapshot(ArchivedDoc, record.id, context))?.archived ?? false;
				if (!archived) {
					const target = await harness.conversation(record.id, context);
					if (!target) continue;
					infos.push({
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
			const created = await harness.createConversation(
				{
					ownership: { kind: "ownerless" },
					agent: {
						model: createOptions?.model ?? model,
						...(createOptions?.thinkingLevel !== undefined ? { thinkingLevel: createOptions.thinkingLevel } : {}),
						cwd: normalizeWorkspace(createOptions?.cwd ?? defaultCwd),
					},
				},
				context,
			);
			await touchConversation(created.id);
			return makeSession(created);
		},
		getConversation,
		async archiveConversation(id) {
			await harness.commit(async (tx) => {
				(await tx.doc(ArchivedDoc, id)).archived = true;
			}, context);
		},
		async configureConversation(id, change) {
			const session = await getConversation(id);
			if (session === undefined) return false;
			await session.conversation.configure(
				{
					...(change.model !== undefined ? { model: change.model } : {}),
					...(change.thinkingLevel !== undefined ? { thinkingLevel: change.thinkingLevel } : {}),
				},
				context,
			);
			return true;
		},
		listModels() {
			return models.getModels().map((model) => ({
				provider: model.provider,
				modelId: model.id,
				name: model.name,
				contextWindow: model.contextWindow,
				reasoning: model.reasoning,
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
		installExtension(extension) {
			registry.install(extension);
		},
		close() {
			return harness.close(context);
		},
	};
}
