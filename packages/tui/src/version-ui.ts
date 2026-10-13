import { matchesKey, Text } from "@earendil-works/pi-tui";
import { RUNNING_VERSION, type UpdateState, updateAction } from "@neko-harness/core/application-version";
import type { PickerDetail, PickerPanel } from "./components/picker.ts";

export function versionNotice(state: UpdateState | null, installed: string | null): string {
	const action = updateAction({ gateway: state, frontend: RUNNING_VERSION, installed });
	return {
		none: "",
		install: "Update available · Run neko update",
		"restart-service": "Updated · Restart neko · /version",
		"restart-tui": "Updated · Restart neko tui",
		"refresh-page": "",
		incompatible: "Protocol incompatible · Update and restart neko",
	}[action];
}
class VersionDetail implements PickerDetail {
	help = "Up/Down Scroll · Esc Back";
	#offset = 0;
	readonly body: string;
	constructor(body: string) {
		this.body = body;
	}
	lines(width: number, height: number) {
		const lines = new Text(this.body, 0, 0).render(width);
		this.#offset = Math.min(this.#offset, Math.max(0, lines.length - height));
		return lines.slice(this.#offset, this.#offset + height);
	}
	handleKey(data: string) {
		if (matchesKey(data, "up")) this.#offset = Math.max(0, this.#offset - 1);
		else if (matchesKey(data, "down")) this.#offset++;
		else return false;
		return true;
	}
}
export function openVersion(
	panel: PickerPanel,
	read: () => Promise<{ state: UpdateState | null; installed: string | null }>,
	check: () => Promise<UpdateState>,
): Promise<void> {
	return panel.show(
		"Version",
		async () => [
			{ value: "info", label: "Versions and next step" },
			{ value: "check", label: "Check for updates" },
		],
		async (value) => {
			let failed = false;
			if (value === "check") {
				try {
					const checked = await check();
					failed = checked.checkState === "failed";
				} catch {
					failed = true;
				}
			}
			const { state, installed } = await read();
			return new VersionDetail(
				`TUI: ${RUNNING_VERSION}\nInstalled: ${installed ?? "unknown"}\nGateway: ${state?.runningVersion ?? "unknown"}\nGateway installed: ${state?.installedVersion ?? "unknown"}\nLatest: ${state?.latestVersion ?? "unknown"}\n\n${failed ? "Check failed · Retry" : versionNotice(state, installed) || (state?.checkState === "ok" && installed ? "Up to date" : "Check not available")}\n\nRun neko update in a terminal.\nTo restart the gateway: finish your tasks, close TUI/Web and any neko serve using this data directory, then run neko tui or neko web.`,
			);
		},
	);
}
