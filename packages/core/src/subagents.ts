import type { Context } from "@earendil-works/chord";
import {
	AssistantEntry,
	type ConversationId,
	configure,
	defineDoc,
	defineExtension,
	defineTool,
	type Extension,
	type Harness,
	type TaskId,
	type ToolExecutionApi,
	type Tx,
} from "@earendil-works/pi-durable";
import { Type } from "typebox";
import { NekoInput } from "./input.ts";

export type SubagentRole = "explore" | "plan" | "coder";
export type Delegation = {
	parentId: number;
	taskId: number;
	callId: string;
	childId: number;
	role: SubagentRole;
	title: string;
	createdAt: number;
	startedAt: number | null;
	endedAt: number | null;
	status: "queued" | "running" | "completed" | "failed" | "cancelled";
	report: string | null;
	/** A user fork can browse only entries at or before this watermark. */
	historyThrough?: number;
	historyUsage?: { input: number; output: number; cacheRead: number; cacheWrite: number; cost: number };
};
export const DelegationsDoc = defineDoc<{ items: Delegation[] }>({
	kind: "app.neko.delegations",
	version: 1,
	scope: "conversation",
	history: "latest",
	fork: "initial",
	initial: () => ({ items: [] }),
});
export const SubagentDoc = defineDoc<{ role: SubagentRole | null; parentId: number | null }>({
	kind: "app.neko.subagent",
	version: 1,
	scope: "conversation",
	history: "latest",
	fork: "initial",
	initial: () => ({ role: null, parentId: null }),
});
// Admission receipts refer to native tasks, never to another executor. A restart keeps each active task's slot.
const SlotsDoc = defineDoc<{ items: { taskId: number; parentId: number; cwd: string; coder: boolean }[] }>({
	kind: "app.neko.subagent-slots",
	version: 1,
	scope: "session",
	initial: () => ({ items: [] }),
});

export const ROLE_PROMPTS: Record<SubagentRole, string> = {
	explore:
		"You are neko's read-only exploration subagent. Discover files, search and read evidence. Do not modify files or execute commands. Return findings with paths and line numbers.",
	plan: "You are neko's read-only planning subagent. Read evidence and propose implementation steps, trade-offs and verification. Do not modify files or execute commands.",
	coder:
		"You are neko's coding subagent. Implement only the assigned scope and verify it. Coordinate through the main agent; do not overwrite unrelated changes. Report changed files and verification results.",
};
export const SUBAGENT_DELIVERY =
	" Work only from the assigned task and your project resources; you cannot see the main conversation. Do not delegate or ask the user directly. Your final message must be a self-contained delivery to the main agent, including evidence, results and limitations. Skills never expand your allowed tools.";
const READ_TOOLS = new Set(["read", "find_files", "search_text", "web_search", "web_extract"]);

export async function refreshDelegations(tx: Tx, id: ConversationId): Promise<Delegation[]> {
	const doc = await tx.doc(DelegationsDoc, id);
	for (const item of doc.items) {
		if (item.historyThrough !== undefined) continue;
		if (item.status === "completed" || item.status === "failed" || item.status === "cancelled") continue;
		const task = await tx.task(item.taskId as TaskId);
		if (task?.state.status !== "terminal") continue;
		item.status = task.state.outcome.status === "aborted" ? "cancelled" : "failed";
		item.endedAt = Date.now();
	}
	return JSON.parse(JSON.stringify(doc.items));
}
async function admit(api: ToolExecutionApi, cwd: string, role: SubagentRole, context: Context) {
	for (;;) {
		context.abortSignal?.throwIfAborted();
		const acquired = await api.commit(async (tx) => {
			const slots = await tx.doc(SlotsDoc);
			const live: typeof slots.items = [];
			for (const slot of slots.items) {
				const task = await tx.task(slot.taskId as TaskId);
				if (task && task.state.status !== "terminal") live.push(slot);
			}
			slots.items = live;
			if (live.some((slot) => slot.taskId === api.taskId)) return true;
			if (
				live.filter((slot) => slot.parentId === api.conversationId).length >= 3 ||
				(role === "coder" && live.some((slot) => slot.coder && slot.cwd === cwd))
			)
				return false;
			slots.items.push({ taskId: api.taskId, parentId: api.conversationId, cwd, coder: role === "coder" });
			return true;
		}, context);
		if (acquired) return;
		await new Promise<void>((resolve, reject) => {
			const cleanup = () => {
				clearTimeout(timer);
				context.abortSignal?.removeEventListener("abort", abort);
			};
			const abort = () => {
				cleanup();
				reject(context.abortSignal?.reason ?? new Error("Cancelled"));
			};
			const timer = setTimeout(() => {
				cleanup();
				resolve();
			}, 100);
			context.abortSignal?.addEventListener("abort", abort, { once: true });
			if (context.abortSignal?.aborted) abort();
		});
	}
}

export function createSubagentExtension(
	prepare: (id: ConversationId, requestId: string, cwd: string) => Promise<void>,
	discard: (id: ConversationId, requestId: string) => void,
): Extension {
	const extension: Extension = defineExtension({
		name: "neko-subagents",
		tools: [
			defineTool({
				name: "subagent",
				description:
					"Delegate a self-contained task to an independent foreground subagent. explore: read-only investigation; plan: read-only implementation planning; coder: scoped changes and verification. Include all needed context, constraints and expected delivery. Use only when isolation or parallel independent work helps; handle simple tasks directly. Returns the final report; the main agent waits and must verify/integrate it.",
				parameters: Type.Object({
					type: Type.Union([Type.Literal("explore"), Type.Literal("plan"), Type.Literal("coder")]),
					title: Type.String({ minLength: 1, maxLength: 80 }),
					task: Type.String({ minLength: 1, maxLength: 32768 }),
				}),
				replay: "safe",
				execute: async (args, api, context) => {
					if (!args.task.trim() || !args.title.trim() || Buffer.byteLength(args.task) > 32768)
						throw new Error("Task/title must be nonempty; task limit is 32 KiB.");
					if ((await api.snapshot(SubagentDoc, api.conversationId, context))?.role)
						throw new Error("Subagents cannot delegate.");
					const agent = await api.agent(context);
					const childId = await api.commit(async (tx) => {
						const existing = (await tx.scanConversations({ ownerTaskId: api.taskId }, 1)).items[0];
						if (existing) return existing.id;
						const child = await tx.createConversation({ ownership: { kind: "task", taskId: api.taskId } });
						await configure(tx, child.id, {
							model: agent.model,
							thinkingLevel: agent.thinkingLevel,
							cwd: agent.cwd,
							extensions: agent.extensions.filter((e) => e.name !== extension.name),
							tools: agent.tools.filter(
								(tool) => tool.name !== "subagent" && (args.type === "coder" || READ_TOOLS.has(tool.name)),
							),
						});
						Object.assign(await tx.doc(SubagentDoc, child.id), { role: args.type, parentId: api.conversationId });
						(await tx.doc(DelegationsDoc, api.conversationId)).items.push({
							parentId: api.conversationId,
							taskId: api.taskId,
							callId: api.callId,
							childId: child.id,
							role: args.type,
							title: args.title,
							createdAt: Date.now(),
							startedAt: null,
							endedAt: null,
							status: "queued",
							report: null,
						});
						return child.id;
					}, context);
					await api.details({ conversationId: childId, role: args.type, title: args.title }, context);
					const cwd = api.env ? await api.env.canonicalPath(agent.cwd ?? api.env.cwd, context) : undefined;
					await admit(api, cwd?.ok ? cwd.value : (agent.cwd ?? ""), args.type, context);
					await api.commit(async (tx) => {
						const item = (await tx.doc(DelegationsDoc, api.conversationId)).items.find((d) => d.taskId === api.taskId)!;
						item.status = "running";
						item.startedAt ??= Date.now();
					}, context);
					const child = (await api.conversation(childId, context))!;
					const requestId = `subagent:${api.taskId}`;
					const duplicate = await api.commit((tx) => tx.submissionByRequest(childId, requestId), context);
					if (!duplicate) await prepare(childId, requestId, agent.cwd ?? "");
					let submission: Awaited<ReturnType<typeof child.submit>>;
					try {
						submission = await child.submit(
							{
								type: "input",
								content: args.task,
								requestId,
								entry: { kind: NekoInput.kind, data: { at: Date.now(), prompt: args.task, images: [] } },
							},
							context,
						);
					} catch (error) {
						discard(childId, requestId);
						throw error;
					}
					const settled = await submission.wait(context);
					let report = "";
					let status: Delegation["status"] = "failed";
					if (settled.status === "done" && settled.type === "input") {
						const entry = await api.commit((tx) => tx.entry(AssistantEntry, settled.answer), context);
						const message = entry?.model?.[0];
						report =
							message?.role === "assistant"
								? message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("")
								: "";
						status = "completed";
					} else if (settled.status === "unanswered") {
						status = settled.reason === "aborted" ? "cancelled" : "failed";
						report = `Subagent ${status}: ${settled.reason}`;
					}
					await api.commit(async (tx) => {
						const item = (await tx.doc(DelegationsDoc, api.conversationId)).items.find((d) => d.taskId === api.taskId)!;
						item.status = status;
						item.report = report;
						item.endedAt = Date.now();
					}, context);
					return {
						output: [{ type: "text", text: report || "Subagent completed without a text report." }],
						isError: status !== "completed",
						details: { conversationId: childId, role: args.type, title: args.title, status },
					};
				},
			}),
		],
	});
	return extension;
}

export async function listDelegations(harness: Harness, parent: ConversationId, context: Context) {
	return harness.commit((tx) => refreshDelegations(tx, parent), context);
}
