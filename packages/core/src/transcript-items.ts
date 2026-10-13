import type { ChatItem } from "./projection.ts";

/** Merge overlapping live/history windows without regressing settled tool results. */
export function mergeTranscriptItems(previous: readonly ChatItem[], incoming: readonly ChatItem[]): ChatItem[] {
	const items = new Map(previous.map((item) => [item.key, item]));
	for (const item of incoming) {
		const old = items.get(item.key);
		if (old?.type === "tool" && item.type === "tool" && old.phase === "done" && item.phase !== "done") continue;
		items.set(item.key, item);
	}
	return [...items.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
