import { expect, it } from "bun:test";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import type { UpdateState } from "../../core/src/application-version.ts";
import { PickerPanel } from "../src/components/picker.ts";
import { openVersion, versionNotice } from "../src/version-ui.ts";

const state: UpdateState = {
	runningVersion: "1.0.0",
	installedVersion: "1.1.0",
	protocolVersion: 1,
	checkState: "ok",
	latestVersion: "1.1.0",
	checkedAt: 1,
};
it("shows concise service restart instructions and provides a read-only version panel", async () => {
	expect(versionNotice(state, "1.1.0")).toContain("Restart neko");
	expect(versionNotice(null, null)).toBe("");
	for (const width of [60, 80]) {
		const panel = new PickerPanel(
			() => {},
			() => {},
		);
		panel.height = 12;
		await openVersion(
			panel,
			async () => ({ state, installed: "1.1.0" }),
			async () => ({ ...state, checkState: "failed" }),
		);
		panel.handleInput("\r");
		await Bun.sleep(0);
		const text = stripTerminalSequences(panel.render(width).join("\n"));
		expect(text).toContain("Gateway: 1.0.0");
		expect(text).toContain("Installed: 1.1.0");
		panel.handleInput("\x1b");
		panel.handleInput("\x1b[B");
		panel.handleInput("\r");
		await Bun.sleep(0);
		for (let n = 0; n < 5; n++) panel.handleInput("\x1b[B");
		expect(stripTerminalSequences(panel.render(width).join("\n"))).toContain("Check failed");
		panel.handleInput("\x1b");
		panel.handleInput("\x1b");
		expect(panel.open).toBe(false);
	}
});
