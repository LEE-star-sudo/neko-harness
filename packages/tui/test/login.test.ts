import { expect, it } from "bun:test";
import { Container, stripTerminalSequences, Text, visibleWidth } from "@earendil-works/pi-tui";
import { renderLayoutFrame } from "@earendil-works/pi-tui/dist/layout.js";
import { StatusFooter } from "../src/components/footer.ts";
import { LoginPanel } from "../src/components/login.ts";
import { createAppLayout } from "../src/layout.ts";

it("masks pasted secrets, discards undo history on close and ignores late completion", async () => {
	let release: () => void = () => {};
	let saved = "";
	let closed = 0;
	const panel = new LoginPanel({
		changed: () => {},
		closed: () => {
			closed++;
		},
		save: async (key) => {
			saved = key;
			await new Promise<void>((r) => {
				release = r;
			});
		},
		remove: async () => {},
	});
	const show = () =>
		panel.show({ savedConfigured: false, environmentConfigured: false, source: "none" }, () => () => {});
	show();
	panel.handleInput("\x1b[200~test-secret\x1b[201~");
	expect(panel.render(60).join("\n")).not.toContain("test-secret");
	panel.handleInput("\r");
	expect(saved).toBe("test-secret");
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
it("keeps protected input, actions, draft and footer visible", () => {
	for (const [width, height] of [
		[120, 40],
		[80, 24],
		[60, 16],
	] as const) {
		const panel = new LoginPanel({ changed: () => {}, closed: () => {}, save: async () => {}, remove: async () => {} });
		panel.show({ savedConfigured: true, environmentConfigured: true, source: "saved" }, () => () => {});
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
