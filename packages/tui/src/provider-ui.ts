import { CREDENTIAL_PROVIDERS, MODEL_PROVIDERS, type NekoSelectableModel } from "@neko-harness/core";
import type { NekoCredentialState } from "@neko-harness/gateway";
import type { PickerItem } from "./components/picker.ts";
import { formatTokens } from "./format.ts";

export const modelKey = (model: { provider: string; modelId: string }): string => `${model.provider}/${model.modelId}`;

export const providerName = (id: string): string => CREDENTIAL_PROVIDERS.find((spec) => spec.id === id)?.name ?? id;

/** The gateway rejects sends with these prefixes when the current provider is disabled or has no key. */
export const isProviderRejection = (message: string): boolean =>
	/^(PROVIDER_KEY_REQUIRED|PROVIDER_DISABLED):/.test(message);

/** Client-side mirror of the gateway check so the draft is kept and the user gets a pointer to /login. */
export function providerSendBlock(
	model: { provider: string } | null | undefined,
	credentials: NekoCredentialState | undefined,
): string | undefined {
	const status = model ? credentials?.statuses[model.provider] : undefined;
	if (!model || !status) return undefined;
	const name = providerName(model.provider);
	if (status.enabled === false) return `${name} is disabled. Enable it with /login or switch model.`;
	if (status.source === "none") return `Configure ${name} with /login before sending.`;
	return undefined;
}

/** Grouped /model rows: current provider first, then catalog order; models without credentials are not confirmable. */
export function modelItems(
	models: readonly NekoSelectableModel[],
	current: { provider: string; modelId: string } | null | undefined,
) {
	const currentKey = current ? modelKey(current) : undefined;
	const order = new Map<string, number>(MODEL_PROVIDERS.map((spec, index) => [spec.id, index + 1]));
	const rank = (provider: string) => (provider === current?.provider ? 0 : (order.get(provider) ?? order.size + 1));
	const providers = [...new Set(models.map((model) => model.provider))].sort(
		(a, b) => rank(a) - rank(b) || a.localeCompare(b),
	);
	const items: PickerItem[] = [];
	for (const provider of providers) {
		const group = models
			.filter((model) => model.provider === provider)
			.sort(
				(a, b) =>
					Number(modelKey(b) === currentKey) - Number(modelKey(a) === currentKey) || a.name.localeCompare(b.name),
			);
		const name = providerName(provider);
		const available = group.some((model) => model.available);
		items.push({
			value: `header:${provider}`,
			label: `${name}${available ? "" : " · needs key"}`,
			header: true,
		});
		for (const model of group) {
			const key = modelKey(model);
			const image = model.input.includes("image");
			const tags = [
				...(model.available ? [] : ["needs key"]),
				formatTokens(model.contextWindow),
				...(model.reasoning ? ["Thinking"] : []),
				...(image ? ["Images"] : []),
			];
			items.push({
				value: key,
				label: `${key}${key === currentKey ? " (Current)" : ""}`,
				rightLabel: tags.join(" · "),
				searchText: `${model.name} ${name}`,
				description: `${model.name} | ${formatTokens(model.contextWindow)} context${model.reasoning ? " | Thinking" : ""} | ${image ? "Images" : "Text only"}`,
				...(model.available ? {} : { blockedHint: `${name} needs a key. Use /login to configure it.` }),
			});
		}
	}
	return items;
}
