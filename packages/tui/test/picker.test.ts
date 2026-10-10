import { expect, it } from "bun:test";
import { PickerPanel } from "../src/components/picker.ts";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
it("ignores late loads, prevents duplicate panels and restores focus on close", async () => {
	let resolve!: (items: { value: string; label: string }[]) => void;
	let closed = 0;
	const panel = new PickerPanel(
		() => {},
		() => closed++,
	);
	const loading = panel.show(
		"Models",
		() =>
			new Promise((r) => {
				resolve = r;
			}),
		async () => {},
	);
	expect(panel.render(80).join("\n")).toContain("Loading");
	await panel.show(
		"Sessions",
		async () => {
			throw new Error("must not load");
		},
		async () => {},
	);
	panel.handleInput("\x1b");
	resolve([{ value: "a", label: "A" }]);
	await loading;
	expect(panel.open).toBe(false);
	expect(closed).toBe(1);
});
it("filters, navigates, retries failure and applies at most once", async () => {
	let attempts = 0,
		picks = 0;
	let finish!: () => void;
	const panel = new PickerPanel(
		() => {},
		() => {},
	);
	await panel.show(
		"Models",
		async () => {
			if (++attempts === 1) throw new Error("offline");
			return [
				{ value: "one", label: "One" },
				{ value: "two", label: "Two" },
			];
		},
		() => {
			picks++;
			return new Promise((r) => {
				finish = r;
			});
		},
	);
	expect(panel.render(80).join("\n")).toContain("offline");
	panel.handleInput("\r");
	await tick();
	panel.handleInput("z");
	expect(panel.render(80).join("\n")).toContain("No results");
	panel.handleInput("\x7f");
	panel.handleInput("t");
	expect(panel.render(80).join("\n")).toContain("> Two");
	panel.handleInput("\r");
	panel.handleInput("\r");
	expect(picks).toBe(1);
	finish();
	await tick();
	expect(panel.open).toBe(false);
});

it("moves once per Kitty key press, allows repeat and ignores release", async () => {
	const panel = new PickerPanel(
		() => {},
		() => {},
	);
	let picked = "";
	await panel.show(
		"Sessions",
		async () => [
			{ value: "1", label: "Session 1" },
			{ value: "2", label: "Session 2" },
			{ value: "3", label: "Session 3" },
			{ value: "4", label: "Session 4" },
		],
		async (value) => {
			picked = value;
		},
	);
	panel.handleInput("\x1b[1;1:1B");
	panel.handleInput("\x1b[1;1:3B");
	expect(panel.render(80).join("\n")).toContain("> Session 2");
	panel.handleInput("\x1b[1;1:2B");
	expect(panel.render(80).join("\n")).toContain("> Session 3");
	panel.handleInput("\x1b[1;1:1A");
	panel.handleInput("\x1b[1;1:3A");
	expect(panel.render(80).join("\n")).toContain("> Session 2");
	panel.handleInput("\x1b[27;1:3u");
	expect(panel.open).toBe(true);
	panel.handleInput("\x1b[13;1:3u");
	expect(picked).toBe("");
	panel.handleInput("\r");
	await tick();
	expect(picked).toBe("2");
});
