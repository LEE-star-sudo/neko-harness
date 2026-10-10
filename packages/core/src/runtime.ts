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
	type ConversationView,
	type ConversationWatch,
	createRegistry,
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
};

export type NekoSubmitOptions = {
	readonly requestId?: string;
	readonly whenBusy?: "steer" | "followUp" | "reject";
};

/** Terminal outcome of one submitted input, with the answer text already extracted. */
export type NekoAnswer =
	| { readonly status: "done"; readonly text: string }
	| { readonly status: "unanswered"; readonly reason: string; readonly detail?: string };

/** A running neko-harness runtime: one open storage, one root conversation. */
export type NekoRuntime = {
	/** Chord context bound to every runtime call. */
	readonly context: Context;
	/** The underlying pi-durable Harness, for callers that need more. */
	readonly harness: Harness;
	/** The root conversation. */
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
	/** Token and cost totals of the root conversation's `pi.usage`. */
	usage(): Promise<UsageState>;
	/** Withdraw queued inputs and abort the current run. */
	abort(): Promise<void>;
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

	const storage =
		options.storage === "memory"
			? new MemoryStorage()
			: await openNodeSqliteStorage(options.storagePath ?? DEFAULT_STORAGE_PATH);

	const harness = await Harness.open(
		storage,
		{
			models,
			registry,
			env: ({ cwd }) => new NodeExecutionEnv({ cwd: cwd ?? process.cwd() }),
		},
		context,
	);
	const conversation = await harness.root(context, {
		agent: {
			model,
			...(options.thinkingLevel !== undefined ? { thinkingLevel: options.thinkingLevel } : {}),
			...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
		},
	});
	harness.resume();

	return {
		context,
		harness,
		conversation,
		submit(content, submitOptions) {
			return conversation.submit(
				{
					type: "input",
					content,
					...(submitOptions?.requestId !== undefined ? { requestId: submitOptions.requestId } : {}),
					...(submitOptions?.whenBusy !== undefined ? { whenBusy: submitOptions.whenBusy } : {}),
				},
				context,
			);
		},
		async waitAnswer(submission) {
			const settled = await submission.wait(context);
			if (settled.status === "done" && settled.type === "input") {
				const entry = await conversation.commit((tx) => tx.entry(AssistantEntry, settled.answer), context);
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
		},
		viewState() {
			return conversation.viewState(context);
		},
		watch() {
			return conversation.watch(context);
		},
		events() {
			return watchEvents(harness, conversation.id, context);
		},
		async usage() {
			return (await harness.snapshot(UsageDoc, conversation.id, context)) ?? { models: {}, tools: {} };
		},
		abort() {
			return conversation.abort(context);
		},
		close() {
			return harness.close(context);
		},
	};
}
