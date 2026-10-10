import {
	CURSOR_MARKER,
	Editor,
	stripTerminalSequences,
	type TuiMouseEvent,
	type TuiMouseEventResult,
} from "@earendil-works/pi-tui";

/** Bound input height while retaining the cursor and nearby completion rows. */
export class BoundedEditor extends Editor {
	maxRows = 7;
	#rowMap: number[] = [];
	override handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
		return super.handleMouse({ ...event, y: this.#rowMap[event.y] ?? event.y });
	}
	override render(width: number): string[] {
		const lines = super.render(width);
		this.#rowMap = lines.map((_, i) => i);
		if (lines.length <= this.maxRows) return lines;
		const borders = lines.flatMap((line, index) => (/^[─↑↓]/u.test(stripTerminalSequences(line)) ? [index] : []));
		const bottom = borders.at(-1) ?? lines.length - 1;
		const completions = lines.slice(bottom + 1).slice(0, Math.max(0, this.maxRows - 3));
		const count = Math.max(1, this.maxRows - 2 - completions.length);
		const cursor = Math.max(
			1,
			lines.findIndex((line) => line.includes(CURSOR_MARKER)),
		);
		const start = Math.max(1, Math.min(cursor - count + 1, bottom - count));
		this.#rowMap = [
			0,
			...Array.from({ length: count }, (_, i) => start + i),
			bottom,
			...completions.map((_, i) => bottom + 1 + i),
		];
		return [lines[0]!, ...lines.slice(start, start + count), lines[bottom]!, ...completions];
	}
}
