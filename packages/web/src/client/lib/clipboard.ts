/**
 * Copies text to the clipboard. The async API needs a secure context, so on plain-http LAN access it is
 * missing; fall back to a hidden textarea + execCommand and restore the user's focus and selection.
 */
export async function writeClipboard(text: string): Promise<void> {
	if (navigator.clipboard?.writeText) {
		try {
			await navigator.clipboard.writeText(text);
			return;
		} catch {
			// Permission denied or document not focused: try the selection-based path.
		}
	}
	const active = document.activeElement as HTMLElement | null;
	const selection = document.getSelection();
	const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i)) : [];
	const area = document.createElement("textarea");
	area.value = text;
	area.setAttribute("readonly", "");
	area.style.cssText = "position:fixed;top:0;left:-9999px;opacity:0";
	document.body.append(area);
	area.select();
	let copied = false;
	try {
		copied = document.execCommand("copy");
	} finally {
		area.remove();
		if (selection) {
			selection.removeAllRanges();
			for (const range of ranges) selection.addRange(range);
		}
		active?.focus?.();
	}
	if (!copied) throw new Error("Clipboard unavailable");
}
