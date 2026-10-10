import { basename } from "node:path";
import { type Component, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { formatTokens } from "../format.ts";
import { labels } from "../labels.ts";
import { theme } from "../theme.ts";

export type FooterStats = {
	readonly sessionId: string;
	readonly model: string;
	readonly thinkingLevel: string | null;
	readonly busy: string | undefined;
	readonly usageText: string;
	readonly cwd: string;
};

export class StatusFooter implements Component {
	panelOpen = false;
	#stats: FooterStats | undefined;
	setStats(stats: FooterStats): void {
		this.#stats = stats;
	}
	invalidate(): void {}
	render(width: number): string[] {
		const s = this.#stats;
		if (!s) return [labels.connecting, ""].map((x) => truncateToWidth(x, width));
		const space = Math.max(1, width - 2);
		const status = truncateToWidth(s.busy ?? labels.ready, Math.min(28, Math.floor(space / 2)));
		const workspace = truncateToWidth(basename(s.cwd) || s.cwd, Math.max(1, space - visibleWidth(status) - 3));
		let first = `${workspace} | ${s.busy ? theme.accent(status) : theme.ok(status)}`;
		for (const field of [s.model.split("/").at(-1) ?? s.model, s.thinkingLevel ? `Think: ${s.thinkingLevel}` : ""]) {
			if (field && visibleWidth(first) + visibleWidth(field) + 3 <= space) first += ` | ${theme.model(field)}`;
		}
		const hints = this.panelOpen ? labels.close : s.busy ? labels.busyHints : labels.idleHints;
		const compactHints = s.busy ? labels.busyCompact : labels.idleCompact;
		const compactUsage = s.usageText.replace(/ Cache: \S+/, "");
		const second = this.panelOpen
			? hints
			: visibleWidth(s.usageText) + hints.length + 3 <= space
				? `${s.usageText} | ${hints}`
				: visibleWidth(compactUsage) + compactHints.length + 3 <= space
					? `${compactUsage} | ${compactHints}`
					: compactHints;
		return [` ${first}`, ` ${theme.dim(second)}`].map((line) => truncateToWidth(line, width));
	}
}
export function usageText(input: number, output: number, cacheRead: number, costTotal: number): string {
	return `In: ${formatTokens(input)} Out: ${formatTokens(output)} Cache: ${formatTokens(cacheRead)} $${costTotal.toFixed(4)}`;
}
