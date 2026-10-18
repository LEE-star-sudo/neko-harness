import { emptyQuestionDraft, type QuestionDraft } from "@neko-harness/core/interactions";
import { useSyncExternalStore } from "react";

/**
 * In-memory UI state of the question card, outside React so it survives unmounts and route changes:
 * answer drafts and fold state are keyed by session/question/version and never reused across them;
 * the chat composer draft is a separate store and is never touched here.
 */
type FoldState = "open" | "folded";
type UiState = {
	drafts: Readonly<Record<string, QuestionDraft>>;
	fold: Readonly<Record<string, FoldState>>;
	/** The question each session currently shows in full. */
	active: Readonly<Record<string, number>>;
	/** A user-initiated request to bring a card into view; consumed by the card that handles it. */
	focus: { key: string; nonce: number } | null;
};

const EMPTY_DRAFT: QuestionDraft = emptyQuestionDraft();
let state: UiState = { drafts: {}, fold: {}, active: {}, focus: null };
let nonce = 0;
const listeners = new Set<() => void>();

function emit(next: UiState): void {
	state = next;
	for (const listener of listeners) listener();
}

export const questionKey = (sessionId: string, id: number, version: string): string =>
	JSON.stringify([sessionId, id, version]);

export function useQuestionUi(): UiState {
	return useSyncExternalStore(
		(listener) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		() => state,
	);
}

export const questionUi = {
	get state(): UiState {
		return state;
	},
	draft(key: string): QuestionDraft {
		return state.drafts[key] ?? EMPTY_DRAFT;
	},
	setDraft(key: string, draft: QuestionDraft): void {
		emit({ ...state, drafts: { ...state.drafts, [key]: draft } });
	},
	clearDraft(key: string): void {
		if (!(key in state.drafts)) return;
		const { [key]: _removed, ...drafts } = state.drafts;
		emit({ ...state, drafts });
	},
	setFold(key: string, fold: FoldState): void {
		if (state.fold[key] !== fold) emit({ ...state, fold: { ...state.fold, [key]: fold } });
	},
	setActive(sessionId: string, id: number): void {
		if (state.active[sessionId] !== id) emit({ ...state, active: { ...state.active, [sessionId]: id } });
	},
	/** Open a question in full, make it the shown one and ask its card to take focus. */
	open(sessionId: string, question: { id: number; version: string }): void {
		const key = questionKey(sessionId, question.id, question.version);
		emit({
			...state,
			fold: { ...state.fold, [key]: "open" },
			active: { ...state.active, [sessionId]: question.id },
			focus: { key, nonce: ++nonce },
		});
	},
	consumeFocus(handled: number): void {
		if (state.focus?.nonce === handled) emit({ ...state, focus: null });
	},
	/** For tests: forget every draft, fold decision and request. */
	reset(): void {
		emit({ drafts: {}, fold: {}, active: {}, focus: null });
	},
};
