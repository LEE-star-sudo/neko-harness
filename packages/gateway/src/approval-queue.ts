import type { Delegation, ToolApproval } from "@neko-harness/core";
import type { SubagentClient } from "./subagent-client.ts";

export type PendingApproval = { item: ToolApproval; title: string; service: SubagentClient };
/** Session-scoped, bounded child readers, independent of transcript panels. */
export class ApprovalQueue {
	#readers = new Map<number, { service: SubagentClient; stop: () => void; title: string }>();
	#connect: (id: number) => SubagentClient;
	#changed: () => void;
	constructor(connect: (id: number) => SubagentClient, changed: () => void) {
		this.#connect = connect;
		this.#changed = changed;
	}
	get pending(): PendingApproval[] {
		return [...this.#readers.values()]
			.flatMap(({ service, title }) =>
				(service.view.value?.approvals ?? [])
					.filter((item) => item.status === "pending")
					.map((item) => ({ item, title, service })),
			)
			.sort((a, b) => a.item.createdAt - b.item.createdAt || a.item.id - b.item.id);
	}
	get error(): string | undefined {
		return [...this.#readers.values()].find(({ service }) => service.error)?.service.error;
	}
	update(entries: readonly Delegation[]) {
		const pending = entries.filter((d) => d.approvalCount && d.historyThrough === undefined);
		for (const [id, reader] of this.#readers) {
			if (!pending.some((d) => d.taskId === id)) {
				this.#readers.delete(id);
				reader.stop();
			}
		}
		for (const entry of pending) {
			if (this.#readers.has(entry.taskId)) continue;
			const service = this.#connect(entry.taskId);
			const reader = { service, title: entry.title, stop: () => {} };
			this.#readers.set(entry.taskId, reader);
			reader.stop = service.view.subscribe(() => this.#changed());
		}
		this.#changed();
	}
	close() {
		for (const reader of this.#readers.values()) reader.stop();
		this.#readers.clear();
		this.#changed();
	}
}
