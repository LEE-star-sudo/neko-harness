import { expect, it } from "bun:test";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import {
	currentToolFrame,
	type ToolCardState,
	ToolExecutionComponent,
	ToolSpinnerTicker,
} from "../src/components/tool-execution.ts";

const base: ToolCardState = {
	name: "Bash",
	summary: "npm test",
	detail: null,
	phase: "pending",
	isError: false,
	output: null,
	result: null,
	durationMs: null,
	note: null,
};

const render = (state: Partial<ToolCardState>) =>
	stripTerminalSequences(new ToolExecutionComponent({ ...base, ...state }).render(80).join("\n"));

it("renders the unified phase glyphs", () => {
	expect(render({ phase: "pending" })).toContain("…");
	expect(render({ phase: "running" })).toContain(`${currentToolFrame()} Running...`);
	expect(render({ phase: "done", durationMs: 2300 })).toContain("✓ 2.3s");
	const failed = render({ phase: "done", isError: true });
	expect(failed).toContain("✗ Failed");
	expect(failed).not.toContain("x Failed");
});

it("pads card content inside the status background", () => {
	const card = new ToolExecutionComponent({ ...base });
	// Box(1,0) 承载色块内边距(文本自身不再内缩):每行恰好 1 格前导。
	for (const line of card.render(40).map(stripTerminalSequences)) {
		expect(line.startsWith(" ⚡")).toBe(true);
	}
});

it("exposes running state for the app ticker", () => {
	const card = new ToolExecutionComponent({ ...base, phase: "running" });
	expect(card.isRunning).toBe(true);
	card.sync({ ...base, phase: "done" });
	expect(card.isRunning).toBe(false);
});

it("advances frames only while the ticker runs", async () => {
	let ticks = 0;
	const ticker = new ToolSpinnerTicker(() => ticks++, 10);
	const before = currentToolFrame();
	expect(ticker.running).toBe(false);
	ticker.start();
	ticker.start(); // 幂等
	expect(ticker.running).toBe(true);
	await new Promise((resolve) => setTimeout(resolve, 35));
	ticker.stop();
	expect(ticker.running).toBe(false);
	expect(ticks).toBeGreaterThan(0);
	expect(currentToolFrame() === before && ticks < 2).toBe(false);
	const settledTicks = ticks;
	const settledFrame = currentToolFrame();
	await new Promise((resolve) => setTimeout(resolve, 30));
	expect(ticks).toBe(settledTicks);
	expect(currentToolFrame()).toBe(settledFrame);
});

it("collapses every tool to a single row with a line-count hint until expanded", () => {
	const result = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");
	for (const name of ["web_search", "Bash", "read"]) {
		const card = new ToolExecutionComponent({ ...base, name, phase: "done", durationMs: 4000, result });
		const collapsed = stripTerminalSequences(card.render(80).join("\n")).trimEnd();
		expect(collapsed.split("\n")).toHaveLength(1);
		expect(collapsed).toContain("+20 lines");
		expect(collapsed).not.toContain("line 3");
		card.setExpanded(true);
		const expanded = stripTerminalSequences(card.render(80).join("\n"));
		expect(expanded).toContain("line 0");
		expect(expanded).toContain("line 19");
		expect(expanded).not.toContain("+20 lines");
	}
});

it("shows running partial output and late results once expanded", () => {
	const card = new ToolExecutionComponent({ ...base, phase: "running", output: "partial…" });
	expect(stripTerminalSequences(card.render(80).join("\n"))).not.toContain("partial…");
	card.setExpanded(true);
	expect(stripTerminalSequences(card.render(80).join("\n"))).toContain("partial…");
	card.sync({ ...base, phase: "done", result: "final" });
	expect(stripTerminalSequences(card.render(80).join("\n"))).toContain("final");
});
