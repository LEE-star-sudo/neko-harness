import { basename } from "node:path";
import { type Component, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { formatTokens } from "../format.ts";
import { labels } from "../labels.ts";
import { theme } from "../theme.ts";

export type FooterStats = {
	readonly contextUsage?: { tokens: number | null; window: number; percent: number | null };
	readonly model: string;
	readonly thinkingLevel: string | null;
	readonly busy: string | undefined;
	readonly compaction?: string;
	readonly canAbort?: boolean;
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
		const status = truncateToWidth(s.compaction ?? s.busy ?? labels.ready, Math.min(28, Math.floor(space / 2)));
		const workspace = truncateToWidth(basename(s.cwd) || s.cwd, Math.max(1, space - visibleWidth(status) - 3));
		let first = `${workspace} | ${s.busy ? theme.accent(status) : theme.ok(status)}`;
		for (const field of [s.model.split("/").at(-1) ?? s.model, s.thinkingLevel ? `Think: ${s.thinkingLevel}` : ""]) {
			if (field && visibleWidth(first) + visibleWidth(field) + 3 <= space) first += ` | ${theme.model(field)}`;
		}
		const hints = this.panelOpen
			? labels.close
			: s.canAbort && !s.busy
				? "Esc: stop compaction"
				: s.busy
					? labels.busyHints
					: labels.idleHints;
		const compactHints = s.canAbort && !s.busy ? "Esc: stop" : s.busy ? labels.busyCompact : labels.idleCompact;
		const context = s.contextUsage;
		const contextText =
			context && context.window > 0
				? `Ctx ${context.percent === null ? "?" : `${context.percent.toFixed(1)}%`}/${formatTokens(context.window)}`
				: "";
		const usage = [contextText, s.usageText].filter(Boolean).join(" | ");
		const cache = s.usageText.match(/Cache: \S+/)?.[0] ?? "";
		const essentials = [contextText, cache].filter(Boolean).join(" | ");
		const shortContext = contextText.split("/")[0] ?? "";
		const shortEssentials = [shortContext, cache].filter(Boolean).join(" | ");
		const minimalHints = this.panelOpen ? labels.close : s.canAbort || s.busy ? "Esc Stop" : "/ Cmds";
		const candidates = this.panelOpen
			? [`${essentials} | ${hints}`, `${shortEssentials} | ${hints}`, hints]
			: [
					`${usage} | ${hints}`,
					`${usage} | ${compactHints}`,
					`${usage} | ${minimalHints}`,
					`${essentials} | ${compactHints}`,
					`${essentials} | ${minimalHints}`,
					`${shortEssentials} | ${minimalHints}`,
					minimalHints,
				];
		const second = candidates.find((line) => visibleWidth(line) <= space) ?? minimalHints;
		const shownContext = second.includes(contextText) ? contextText : shortContext;
		const contextLabel =
			context && context.percent !== null && context.percent > 90 ? theme.error(shownContext) : theme.dim(shownContext);
		return [` ${first}`, ` ${theme.dim(second).replace(shownContext, contextLabel)}`].map((line) =>
			truncateToWidth(line, width),
		);
	}
}
export function usageText(input: number, output: number, cacheRead: number, costTotal: number): string {
	return `In: ${formatTokens(input)} Out: ${formatTokens(output)} Cache: ${formatTokens(cacheRead)} $${costTotal.toFixed(4)}`;
}
