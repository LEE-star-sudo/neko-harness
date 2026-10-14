export type HistoryBrowse = { index: number; draft: string; entries: readonly string[] };
export type HistoryKeyEvent = { key: string; shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean };
export type HistoryStep = { browse: HistoryBrowse | null; text: string; caret: "start" | "end" };

/**
 * One ↑/↓ step through prompt history (newest first). Returns null when the key keeps its default textarea
 * behavior. `browse` only counts while the text still equals the recalled entry, so edits, sends and external
 * replacements leave browsing automatically. Browsing keeps the entries it started with, so updates apply on exit.
 */
export function stepHistory(
	browse: HistoryBrowse | null,
	entries: readonly string[],
	event: HistoryKeyEvent,
	text: string,
	caret: { start: number; end: number },
): HistoryStep | null {
	if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return null;
	if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return null;
	if (caret.start !== caret.end) return null;
	const active = browse !== null && browse.entries[browse.index] === text ? browse : null;
	if (event.key === "ArrowUp") {
		if (caret.start !== 0) return null;
		const source = active?.entries ?? entries;
		const index = (active?.index ?? -1) + 1;
		const entry = source[index];
		if (entry === undefined) return null;
		return { browse: { index, draft: active?.draft ?? text, entries: source }, text: entry, caret: "start" };
	}
	if (active === null || caret.start !== text.length) return null;
	const index = active.index - 1;
	if (index < 0) return { browse: null, text: active.draft, caret: "end" };
	return { browse: { ...active, index }, text: active.entries[index] ?? "", caret: "end" };
}
