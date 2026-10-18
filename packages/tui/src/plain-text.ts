import { stripTerminalSequences } from "@earendil-works/pi-tui";

/** Formatting controls that can reorder or hide text; shown as visible escapes so they cannot spoof other UI. */
const SPOOFING = new Set([0x061c, 0x200b, 0x200e, 0x200f, 0x2028, 0x2029, 0xfeff]);
const isSpoofing = (code: number): boolean =>
	SPOOFING.has(code) || (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069);
const isControl = (code: number): boolean => (code < 0x20 && code !== 0x0a) || (code >= 0x7f && code <= 0x9f);

/**
 * Text from the model or another client, made safe for the terminal: escape sequences are removed, line endings
 * normalized, tabs expanded and the remaining control or direction-changing characters shown as `\uXXXX`.
 * Newlines are kept; nothing is interpreted as Markdown.
 */
export function plainText(text: string): string {
	const normalized = stripTerminalSequences(text).replace(/\r\n?/g, "\n").replace(/\t/g, "    ");
	let out = "";
	for (const char of normalized) {
		const code = char.codePointAt(0) ?? 0;
		out += isControl(code) || isSpoofing(code) ? `\\u${code.toString(16).padStart(4, "0")}` : char;
	}
	return out;
}

/** {@link plainText} on one line, clipped to `max` characters with an ellipsis. */
export function plainLine(text: string, max = 200): string {
	const line = plainText(text).replace(/\s+/g, " ").trim();
	const chars = [...line];
	return chars.length > max ? `${chars.slice(0, Math.max(1, max - 1)).join("")}…` : line;
}
