/** Browser-safe path references; selecting a reference never reads file content. */
export type FileCandidate = { name: string; path: string; kind: "file" | "directory" };
export type FileCandidates = { entries: FileCandidate[]; limited: boolean; incomplete: boolean };
export type Mention = { start: number; end: number; query: string };
export function mentionAt(text: string, cursor: number): Mention | null {
	const before = text.slice(0, cursor);
	const match = /(?:^|\s|[([{])(@(?:"[^"\n]*"?|[^\s"@]*))$/.exec(before);
	if (!match?.[1]) return null;
	const raw = match[1];
	return { start: cursor - raw.length, end: cursor, query: raw.slice(1).replace(/^"|"$/g, "") };
}
export function mentionValue(path: string, directory = false): string {
	const value = directory && !path.endsWith("/") ? `${path}/` : path;
	return `@${/\s/.test(value) ? `"${value}"` : value}`;
}
export function replaceMention(text: string, token: Mention, path: string, directory: boolean) {
	const value = mentionValue(path, directory);
	const suffix = directory ? "" : " ";
	return {
		text: text.slice(0, token.start) + value + suffix + text.slice(token.end),
		cursor: token.start + value.length + suffix.length - (directory && value.endsWith('"') ? 1 : 0),
	};
}
