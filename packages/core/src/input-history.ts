import { userText } from "./conversation-items.ts";
import type { ChatItem } from "./projection.ts";

export const INPUT_HISTORY_LIMIT = 100;

/**
 * Inputs the user actually typed in this session, newest first. Derived from the transcript, so it is
 * per-session, persistent and identical across frontends; browser-safe.
 */
export function promptHistory(items: readonly ChatItem[]): string[] {
	const entries: string[] = [];
	for (const item of items) {
		if (item.type !== "user" || item.subagentRoundId !== undefined) continue;
		const text = userText(item).trim();
		if (text === "" || entries.at(-1) === text) continue;
		entries.push(text);
	}
	return entries.reverse().slice(0, INPUT_HISTORY_LIMIT);
}
