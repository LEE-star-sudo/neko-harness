import type { Context } from "@earendil-works/chord";
import {
	CompactionTask,
	type Conversation,
	type ConversationId,
	defineDoc,
	type Harness,
	LiveDoc,
	type Storage,
	type SubmissionId,
} from "@earendil-works/pi-durable";

export type CompactionResultState = "applied" | "nothing" | "skipped" | "cancelled" | "failed";
export type CompactionRecord = {
	taskId: number;
	phase: "summarizing" | "waiting-to-apply" | CompactionResultState;
	at: number;
};
export const CompactionDoc = defineDoc<{ latest: CompactionRecord | null }>({
	kind: "app.neko.compaction",
	version: 1,
	scope: "conversation",
	history: "latest",
	fork: "initial",
	initial: () => ({ latest: null }),
});

/** Observes native receipts; never drives or replaces the native task lifecycle. */
export class CompactionManager {
	#tail: Promise<void> = Promise.resolve();
	#closed = false;
	#stop: () => void;
	#admissions = new Map<ConversationId, Promise<void>>();
	private harness: Harness;
	private context: Context;
	private storage: Storage;
	constructor(harness: Harness, context: Context, storage: Storage) {
		this.harness = harness;
		this.context = context;
		this.storage = storage;
		this.#stop = harness.subscribeCommits(({ changes }) => {
			const ids = new Set<ConversationId>();
			for (const change of changes) {
				if (change.type === "task" && change.value.kind === CompactionTask.definition.name)
					ids.add(change.value.conversationId);
				if (change.type === "submission" && change.value.type === "write") ids.add(change.value.conversationId);
			}
			if (ids.size)
				queueMicrotask(() => {
					for (const id of ids) this.enqueue(id);
				});
		});
	}
	private enqueue(id: ConversationId) {
		if (this.#closed) return;
		this.#tail = this.#tail.catch(() => {}).then(() => this.reconcile(id));
	}
	async restore(id: ConversationId) {
		await this.reconcile(id);
	}
	async reconcile(id: ConversationId): Promise<void> {
		if (this.#closed) return;
		await this.harness.commit(async (tx) => {
			const tasks = await tx.scanTasks(
				{ conversationId: id, kind: CompactionTask.definition.name, order: "descending" },
				1,
			);
			const task = tasks.items[0];
			if (!task) return;
			let phase: CompactionRecord["phase"] = "summarizing";
			if (task.state.status === "terminal") {
				const outcome = task.state.outcome;
				if (outcome.status !== "completed")
					phase = outcome.status === "aborted" || task.abortRequested ? "cancelled" : "failed";
				else {
					const result = outcome.result as { entryId?: number; submissionId?: number };
					if (result.entryId !== undefined) phase = "applied";
					else if (result.submissionId !== undefined) {
						const submission = await this.storage.submission(result.submissionId as SubmissionId, this.context);
						phase =
							submission?.status === "done"
								? "applied"
								: submission?.status === "unanswered"
									? submission.reason === "aborted"
										? "cancelled"
										: "skipped"
									: "waiting-to-apply";
					} else phase = task.abortRequested ? "cancelled" : "nothing";
				}
			}
			const doc = await tx.doc(CompactionDoc, id);
			if (doc.latest?.taskId !== task.id || doc.latest.phase !== phase)
				doc.latest = { taskId: task.id, phase, at: Date.now() };
		}, this.context);
	}
	async compact(conversation: Conversation, instructions?: string): Promise<void> {
		const inFlight = this.#admissions.get(conversation.id);
		if (inFlight) return inFlight;
		const previous = Promise.resolve();
		const work = previous
			.catch(() => {})
			.then(async () => {
				const live = await this.harness.snapshot(LiveDoc, conversation.id, this.context);
				if (live?.compactions?.length) return;
				await this.reconcile(conversation.id);
				const state = await this.harness.snapshot(CompactionDoc, conversation.id, this.context);
				if (state?.latest?.phase === "waiting-to-apply") return;
				await conversation.compact(instructions?.trim() || undefined, this.context);
				await this.reconcile(conversation.id);
			});
		this.#admissions.set(conversation.id, work);
		try {
			await work;
		} finally {
			if (this.#admissions.get(conversation.id) === work) this.#admissions.delete(conversation.id);
		}
	}
	async close() {
		this.#closed = true;
		this.#stop();
		await this.#tail.catch(() => {});
	}
}
