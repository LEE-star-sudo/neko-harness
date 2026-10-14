import type { Usage } from "@earendil-works/pi-ai";
import type { UsageState } from "@earendil-works/pi-durable";
import { totalUsage, type UsageTotals } from "./projection.ts";

export const emptySubagentUsage = (): UsageState => ({ models: {}, tools: {} });
/** Difference by native buckets, including optional reasoning/retention counters. */
export function subtractSubagentUsage(end: UsageState, start: UsageState): UsageState {
	const result = emptySubagentUsage();
	for (const bucket of ["models", "tools"] as const) {
		for (const [key, usage] of Object.entries(end[bucket])) {
			const before = start[bucket][key];
			const cost = usage.cost;
			const next: Usage = {
				input: usage.input - (before?.input ?? 0),
				output: usage.output - (before?.output ?? 0),
				cacheRead: usage.cacheRead - (before?.cacheRead ?? 0),
				cacheWrite: usage.cacheWrite - (before?.cacheWrite ?? 0),
				totalTokens: usage.totalTokens - (before?.totalTokens ?? 0),
				cost: {
					input: cost.input - (before?.cost.input ?? 0),
					output: cost.output - (before?.cost.output ?? 0),
					cacheRead: cost.cacheRead - (before?.cost.cacheRead ?? 0),
					cacheWrite: cost.cacheWrite - (before?.cost.cacheWrite ?? 0),
					total: cost.total - (before?.cost.total ?? 0),
				},
			};
			if (usage.reasoning !== undefined) next.reasoning = usage.reasoning - (before?.reasoning ?? 0);
			if (usage.cacheWrite1h !== undefined) next.cacheWrite1h = usage.cacheWrite1h - (before?.cacheWrite1h ?? 0);
			result[bucket][key] = next;
		}
	}
	return result;
}
export function subagentUsageTotals(state: UsageState): UsageTotals {
	const totals = totalUsage(state);
	return {
		input: totals.input,
		output: totals.output,
		cacheRead: totals.cacheRead,
		cacheWrite: totals.cacheWrite,
		cost: totals.cost.total,
	};
}
