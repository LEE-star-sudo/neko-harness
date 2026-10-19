import type { NekoSelectableModel } from "@neko-harness/core";
import { isModelProvider, MODEL_PROVIDERS } from "@neko-harness/core/credential-providers";
import type { NekoCredentialState, NekoDefaultModelState } from "./contract.ts";

export type ProviderIssue = "disabled" | "missing-key";

const NAMES = new Map<string, string>(MODEL_PROVIDERS.map((item) => [item.id, item.name]));

export function providerName(id: string): string {
	return NAMES.get(id) ?? id;
}

/** Why a session on `provider` cannot send; providers outside the catalog (code-registered) are never blocked. */
export function providerIssue(
	credentials: NekoCredentialState | null,
	provider: string | undefined,
): ProviderIssue | null {
	if (!credentials || !provider || !isModelProvider(provider)) return null;
	const status = credentials.statuses[provider];
	if (!status) return null;
	if (status.enabled === false) return "disabled";
	return status.source === "none" ? "missing-key" : null;
}

export type ModelGroup = {
	provider: string;
	name: string;
	available: boolean;
	models: NekoSelectableModel[];
};

const ORDER = new Map<string, number>(MODEL_PROVIDERS.map((item, index) => [item.id, index]));

/** Whether `model` is the saved default that new sessions start with (the state is the whole chain's result). */
export function isDefaultModel(
	state: NekoDefaultModelState | null,
	model: { provider: string; modelId: string } | null | undefined,
): boolean {
	return (
		state !== null &&
		model !== null &&
		model !== undefined &&
		state.effective.provider === model.provider &&
		state.effective.modelId === model.modelId
	);
}

/** Group models by provider in catalog order, keeping only those matching every query word. */
export function groupModels(models: readonly NekoSelectableModel[], query: string): ModelGroup[] {
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	const groups = new Map<string, ModelGroup>();
	for (const model of models) {
		const haystack = `${model.name} ${model.modelId} ${model.provider} ${providerName(model.provider)}`.toLowerCase();
		if (!words.every((word) => haystack.includes(word))) continue;
		let group = groups.get(model.provider);
		if (!group) {
			group = { provider: model.provider, name: providerName(model.provider), available: model.available, models: [] };
			groups.set(model.provider, group);
		}
		group.models.push(model);
	}
	return [...groups.values()].sort(
		(a, b) => (ORDER.get(a.provider) ?? ORDER.size) - (ORDER.get(b.provider) ?? ORDER.size),
	);
}

export function formatContextWindow(tokens: number): string {
	if (tokens >= 1_000_000) return `${Number((tokens / 1_000_000).toFixed(1))}M`;
	if (tokens >= 1000) return `${Math.round(tokens / 1000)}K`;
	return String(tokens);
}

export function describeModel(model: NekoSelectableModel): string {
	return [
		`${formatContextWindow(model.contextWindow)} 上下文`,
		model.input.includes("image") ? "支持图片" : "仅文本",
		model.reasoning ? "支持思考" : "无思考",
	].join(" · ");
}
