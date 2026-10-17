import type { ConversationId, EntryId, SubmissionRecord } from "@earendil-works/pi-durable";
import type { PromptResources } from "./resources.ts";

type ConversationSnapshots = {
	workspace: string;
	active?: PromptResources | Promise<PromptResources>;
	entry?: EntryId;
	pending: Map<string, PromptResources>;
};

/** Resource preparation is not activation: only a committed input entry can replace the active snapshot. */
export const createResourceSnapshots = (
	load: (workspace: string) => Promise<PromptResources>,
	submission: (id: ConversationId, requestId: string) => Promise<SubmissionRecord | undefined>,
) => {
	const conversations = new Map<ConversationId, ConversationSnapshots>();
	const stateFor = (id: ConversationId, workspace: string): ConversationSnapshots => {
		let state = conversations.get(id);
		if (!state || state.workspace !== workspace) {
			state = { workspace, pending: new Map() };
			conversations.set(id, state);
		}
		return state;
	};
	return {
		stage(id: ConversationId, requestId: string, workspace: string, resources: PromptResources) {
			// Explicit invocation text is transient; system snapshots retain only instructions and metadata.
			stateFor(id, workspace).pending.set(requestId, {
				contextFiles: resources.contextFiles,
				skills: resources.skills,
			});
		},
		async current(id: ConversationId, workspace: string): Promise<PromptResources> {
			const state = stateFor(id, workspace);
			for (const [requestId, snapshot] of state.pending) {
				const record = await submission(id, requestId);
				if (!record || record.status === "queued") continue;
				state.pending.delete(requestId);
				if (record.type !== "input" || record.entry === undefined) continue;
				if (state.entry === undefined || record.entry > state.entry) {
					state.active = snapshot;
					state.entry = record.entry;
				}
			}
			// Restart/fork fallback; share the pending load with any overlapping render.
			state.active ??= load(workspace);
			return state.active;
		},
		discard(id: ConversationId, requestId: string) {
			conversations.get(id)?.pending.delete(requestId);
		},
		/** A resubmitted input keeps the snapshot staged for its original request. */
		move(id: ConversationId, from: string, to: string) {
			const pending = conversations.get(id)?.pending;
			const snapshot = pending?.get(from);
			if (!pending || !snapshot) return;
			pending.delete(from);
			pending.set(to, snapshot);
		},
		forget(id: ConversationId) {
			conversations.delete(id);
		},
	};
};
