import { matchesKey, Text } from "@earendil-works/pi-tui";
import {
	newer,
	RUNNING_VERSION,
	stableVersion,
	type UpdateState,
	updateAction,
	upgradeCommand,
} from "@neko-harness/core/application-version";
import type { PickerDetail, PickerPanel } from "./components/picker.ts";

type VersionOptions = { runningVersion?: string; platform?: NodeJS.Platform };
function actionFor(state: UpdateState | null, installed: string | null, runningVersion: string) {
	const action = updateAction({ gateway: state, frontend: runningVersion, installed });
	// A newer running build must never be directed to install an older registry version.
	return action === "install" && !newer(state?.latestVersion, runningVersion) ? "none" : action;
}
export function versionNotice(
	state: UpdateState | null,
	installed: string | null,
	options: VersionOptions = {},
): string {
	const action = actionFor(state, installed, options.runningVersion ?? RUNNING_VERSION);
	return {
		none: "",
		install: `Update available · Run ${upgradeCommand(options.platform ?? process.platform)} · /version`,
		"restart-service": "Updated · Restart neko · /version",
		"restart-tui": "Updated · Restart neko tui",
		"refresh-page": "",
		incompatible: "Protocol incompatible · Update and restart neko · /version",
	}[action];
}
export function versionOverview(
	state: UpdateState | null,
	installed: string | null,
	options: VersionOptions = {},
): string {
	const running = options.runningVersion ?? RUNNING_VERSION;
	const command = upgradeCommand(options.platform ?? process.platform);
	const current = `Current: ${stableVersion(running) ? `v${running}` : running}`;
	const action = actionFor(state, installed, running);
	let status: string;
	switch (action) {
		case "incompatible":
			status = `Protocol incompatible\nExit neko, run ${command}, then restart neko.`;
			break;
		case "restart-service":
			status =
				"Restart neko\nFinish tasks and close TUI/Web and any neko serve sharing this gateway. Then run neko tui or neko web.";
			break;
		case "restart-tui":
			status = "Restart neko tui\nFinish tasks, exit this TUI, then run neko tui.";
			break;
		case "install":
			status = `Update available\nLatest: v${state!.latestVersion}\nExit neko, then run:\n${command}\nRestart neko after updating.`;
			break;
		default:
			if (!stableVersion(running) || state?.checkState === "development") status = "Development build";
			else if (!state) status = "Check not available";
			else if (state.checkState === "checking") status = "Checking for updates...";
			else if (state.checkState === "failed") status = "Check failed · Retry";
			else if (state.checkState === "unknown") status = "Not checked";
			else if (
				!stableVersion(installed) ||
				!stableVersion(state.installedVersion) ||
				!stableVersion(state.runningVersion) ||
				!stableVersion(state.latestVersion) ||
				state.checkedAt === null
			)
				status = "Check not available";
			else status = "Up to date";
	}
	// A failed explicit check stays visible even when an actionable restart has priority.
	if (state?.checkState === "failed" && !status.includes("Check failed")) status += "\nCheck failed · Retry";
	return `${current}\n${status}`;
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
	options: VersionOptions = {},
): Promise<void> {
	return panel.show(
		"Version",
		async () => [
			{ value: "info", label: "Version" },
			{ value: "check", label: "Check for updates" },
			{ value: "details", label: "Version details" },
		],
		async (value) => {
			let checked: UpdateState | undefined;
			let failed = false;
			if (value === "check") {
				try {
					checked = await check();
				} catch {
					failed = true;
				}
			}
			const { state, installed } = await read();
			if (value === "details")
				return new VersionDetail(
					`TUI: ${options.runningVersion ?? RUNNING_VERSION}\nInstalled: ${installed ?? "unknown"}\nGateway: ${state?.runningVersion ?? "unknown"}\nGateway installed: ${state?.installedVersion ?? "unknown"}\nLatest: ${state?.latestVersion ?? "unknown"}`,
				);
			const result = failed && state ? { ...state, checkState: "failed" as const } : (checked ?? state);
			let body = versionOverview(result, installed, options);
			if (failed && !body.includes("Check failed")) body += "\nCheck failed · Retry";
			return new VersionDetail(body);
		},
	);
}
