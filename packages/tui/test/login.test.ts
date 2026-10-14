import { expect, it } from "bun:test";
import { Container, CURSOR_MARKER, stripTerminalSequences, Text, visibleWidth } from "@earendil-works/pi-tui";
import { renderLayoutFrame } from "@earendil-works/pi-tui/dist/layout.js";
import { StatusFooter } from "../src/components/footer.ts";
import { LoginPanel } from "../src/components/login.ts";
import { createAppLayout } from "../src/layout.ts";

const emptyState = () => ({
	revision: 1,
	statuses: {
		deepseek: { savedConfigured: false, environmentConfigured: false, source: "none" },
		tavily: { savedConfigured: false, environmentConfigured: false, source: "keyless" },
	},
});
const savedState = () => ({
	revision: 1,
	statuses: {
		deepseek: { savedConfigured: true, environmentConfigured: true, source: "saved" },
		tavily: { savedConfigured: true, environmentConfigured: false, source: "saved" },
	},
});

it("masks pasted secrets, discards undo history on close and ignores late completion", async () => {
	let release: () => void = () => {};
	let saved = "";
	let savedProvider = "";
	let closed = 0;
	const panel = new LoginPanel({
		changed: () => {},
		closed: () => {
			closed++;
		},
		save: async (provider, key) => {
			saved = key;
			savedProvider = provider;
			await new Promise<void>((r) => {
				release = r;
			});
		},
		remove: async () => {},
	});
	const show = () => panel.show(emptyState(), () => () => {});
	show();
	panel.handleInput("\x1b[200~test-secret\x1b[201~");
	const masked = panel.render(60).join("\n");
	expect(masked).not.toContain("test-secret");
	expect(masked).toContain("(11 characters)");
	panel.handleInput("\r");
	expect(saved).toBe("test-secret");
	expect(savedProvider).toBe("deepseek");
	panel.close();
	show();
	release();
	await Bun.sleep(1);
	expect(panel.render(60).join("\n")).toContain("(paste key)");
	expect(panel.render(60).join("\n")).not.toContain("Saved. Used");
	panel.handleInput("\x1f");
	expect(panel.render(60).join("\n")).not.toContain("***");
	panel.close();
	expect(closed).toBe(2);
});
it("moves the cursor with arrow keys on non-empty input, switches providers on empty input or Tab", () => {
	const panel = new LoginPanel({
		changed: () => {},
		closed: () => {},
		save: async () => {},
		remove: async () => {},
	});
	panel.show(emptyState(), () => () => {});
	expect(panel.render(80).join("\n")).toContain("[deepseek]");
	expect(panel.render(80).join("\n")).toContain("Left/Right/Tab");
	panel.handleInput("partial");
	expect(panel.render(80).join("\n")).not.toContain("Left/Right/Tab");
	// Non-empty input: arrows are cursor movement, provider and content stay.
	panel.handleInput("\x1b[C");
	panel.handleInput("\x1b[D");
	expect(panel.render(80).join("\n")).toContain("[deepseek]");
	expect(panel.render(80).join("\n")).toContain("(7 characters)");
	// Tab switches providers and preserves unsubmitted input.
	panel.handleInput("\t");
	expect(panel.render(80).join("\n")).toContain("[tavily]");
	expect(panel.render(80).join("\n")).toContain("(7 characters)");
	// Fresh panel: arrows on empty input switch providers.
	panel.show(emptyState(), () => () => {});
	panel.handleInput("\x1b[C");
	expect(panel.render(80).join("\n")).toContain("[tavily]");
});
it("requires a second Ctrl+R to remove a saved key", async () => {
	const removed: string[] = [];
	const panel = new LoginPanel({
		changed: () => {},
		closed: () => {},
		save: async () => {},
		remove: async (provider) => {
			removed.push(provider);
		},
		autoCloseMs: 5,
	});
	panel.show(savedState(), () => () => {});
	panel.handleInput("\x12");
	expect(removed).toEqual([]);
	expect(panel.render(80).join("\n")).toContain("Press Ctrl+R again");
	// Any other key cancels the confirmation.
	panel.handleInput("x");
	expect(removed).toEqual([]);
	expect(panel.render(80).join("\n")).not.toContain("Press Ctrl+R again");
	panel.handleInput("\x12");
	panel.handleInput("\x12");
	expect(removed).toEqual(["deepseek"]);
	await Bun.sleep(20);
	expect(panel.open).toBe(false);
});
it("trims surrounding whitespace and tolerates embedded newlines in pasted content", async () => {
	const saved: string[] = [];
	const panel = new LoginPanel({
		changed: () => {},
		closed: () => {},
		save: async (_provider, key) => {
			saved.push(key);
		},
		remove: async () => {},
		autoCloseMs: 5,
	});
	panel.show(emptyState(), () => () => {});
	panel.handleInput("\x1b[200~  sk-trimmed \n\x1b[201~");
	panel.handleInput("\r");
	await Bun.sleep(1);
	expect(saved).toEqual(["sk-trimmed"]);
	// The input component strips pasted control characters, so a copied key
	// with an embedded newline saves cleanly instead of being rejected.
	panel.show(emptyState(), () => () => {});
	panel.handleInput("\x1b[200~sk-broken\nkey\x1b[201~");
	panel.handleInput("\r");
	await Bun.sleep(1);
	expect(saved).toEqual(["sk-trimmed", "sk-brokenkey"]);
});
it("surfaces the server error message and auto-closes after a successful save", async () => {
	let fail = true;
	let closed = 0;
	const panel = new LoginPanel({
		changed: () => {},
		closed: () => {
			closed++;
		},
		save: async () => {
			if (fail) throw new Error("Enter a valid API key.");
		},
		remove: async () => {},
		autoCloseMs: 5,
	});
	panel.show(emptyState(), () => () => {});
	panel.handleInput("\x1b[200~sk-anything\x1b[201~");
	panel.handleInput("\r");
	await Bun.sleep(1);
	expect(panel.render(80).join("\n")).toContain("Enter a valid API key.");
	expect(panel.open).toBe(true);
	fail = false;
	panel.handleInput("\x1b[200~sk-anything\x1b[201~");
	panel.handleInput("\r");
	await Bun.sleep(1);
	expect(panel.render(80).join("\n")).toContain("Saved. Used");
	expect(panel.open).toBe(true);
	await Bun.sleep(20);
	expect(panel.open).toBe(false);
	expect(closed).toBe(1);
});
it("does not auto-close when Escape wins the race", async () => {
	let closed = 0;
	const panel = new LoginPanel({
		changed: () => {},
		closed: () => {
			closed++;
		},
		save: async () => {},
		remove: async () => {},
		autoCloseMs: 30,
	});
	panel.show(emptyState(), () => () => {});
	panel.handleInput("\x1b[200~sk-anything\x1b[201~");
	panel.handleInput("\r");
	await Bun.sleep(1);
	expect(panel.render(80).join("\n")).toContain("Saved. Used");
	panel.handleInput("\x1b");
	expect(closed).toBe(1);
	await Bun.sleep(60);
	expect(closed).toBe(1);
	panel.show(emptyState(), () => () => {});
	expect(panel.open).toBe(true);
	await Bun.sleep(60);
	expect(panel.open).toBe(true);
});
it("emits a hardware cursor marker at the insertion point only when focused", () => {
	const panel = new LoginPanel({
		changed: () => {},
		closed: () => {},
		save: async () => {},
		remove: async () => {},
	});
	panel.show(emptyState(), () => () => {});
	// Unfocused: no cursor markers, plain placeholder.
	expect(panel.render(80).join("\n")).toContain("(paste key)");
	expect(panel.render(80).join("\n")).not.toContain(CURSOR_MARKER);
	// Focused: marker present at the key row, key content never leaked.
	panel.focused = true;
	panel.handleInput("secret-value");
	const focused = panel.render(80).join("\n");
	expect(focused).toContain(CURSOR_MARKER);
	expect(focused).not.toContain("secret-value");
	expect(stripTerminalSequences(focused)).not.toContain(CURSOR_MARKER);
	expect(stripTerminalSequences(focused)).toContain("(12 characters)");
	// Focus returns to the editor: markers gone.
	panel.focused = false;
	expect(panel.render(80).join("\n")).not.toContain(CURSOR_MARKER);
});
it("keeps protected input, actions, draft and footer visible", () => {
	for (const [width, height] of [
		[120, 40],
		[80, 24],
		[60, 16],
	] as const) {
		const panel = new LoginPanel({ changed: () => {}, closed: () => {}, save: async () => {}, remove: async () => {} });
		panel.show(
			{
				revision: 1,
				statuses: {
					deepseek: { savedConfigured: true, environmentConfigured: true, source: "saved" },
					tavily: { savedConfigured: false, environmentConfigured: false, source: "keyless" },
				},
			},
			() => () => {},
		);
		panel.handleInput("x".repeat(200));
		const footer = new StatusFooter();
		footer.setStats({
			cwd: "workspace",
			model: "deepseek/flash",
			thinkingLevel: "high",
			usageText: "",
			busy: undefined,
		});
		const layout = createAppLayout({
			transcript: new Text("history"),
			panel,
			editor: new Text("draft", 0, 0),
			footer,
			notices: new Container(),
			panelOpen: () => panel.open,
		});
		const lines = renderLayoutFrame(layout, width, height, () => {}).lines.map(stripTerminalSequences);
		expect(lines.join("\n")).toContain("Enter Save");
		expect(lines.join("\n")).toContain("draft");
		expect(lines.join("\n")).toContain("Ready");
		expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true);
	}
});
