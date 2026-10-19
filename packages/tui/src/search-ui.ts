import { SEARCH_PROVIDERS, type SearchProviderId } from "@neko-harness/core/search-providers";
import type { NekoCredentialState, NekoSearchSettingsState } from "@neko-harness/gateway";
import type { PickerItem, PickerPanel } from "./components/picker.ts";
import { shortcutHints } from "./components/shortcut-hints.ts";

export const SEARCH_EMPTY = "Search settings are unavailable.";

const NAMES: Record<SearchProviderId, string> = { tavily: "Tavily", deepseek: "DeepSeek" };

const SOURCES: Record<NekoCredentialState["statuses"][string]["source"], string> = {
	saved: "saved key",
	environment: "environment variable",
	runtime: "runtime key",
	keyless: "keyless, rate-limited",
	none: "no key",
};

/** One row per provider; the current choice is marked and the key status explains what it needs. */
export function searchItems(
	settings: NekoSearchSettingsState | undefined,
	credentials: NekoCredentialState | undefined,
): PickerItem[] {
	if (!settings) return [];
	const source = (provider: SearchProviderId) => {
		const status = credentials?.statuses[provider];
		return status ? SOURCES[status.source] : "loading";
	};
	const deepseekMissing = credentials?.statuses.deepseek?.source === "none";
	const descriptions: Record<SearchProviderId, string> = {
		tavily: `Tavily search (${source("tavily")}). Default`,
		deepseek: deepseekMissing
			? "No DeepSeek key. Press k (or use /login) to set one before choosing it"
			: `DeepSeek search and fetch with your DeepSeek API key (${source("deepseek")})`,
	};
	return SEARCH_PROVIDERS.map((value) => ({
		value,
		label: `${NAMES[value]}${settings.selected === value ? " (Current)" : ""}`,
		description: descriptions[value],
	}));
}

type SearchClient = {
	readonly searchSettings: {
		readonly state: {
			readonly value: NekoSearchSettingsState | undefined;
			subscribe(listener: (value: NekoSearchSettingsState | undefined) => void): () => void;
		};
		set(input: { provider: SearchProviderId }): Promise<unknown>;
	};
	readonly credentials: {
		readonly state: {
			readonly value: NekoCredentialState | undefined;
			subscribe(listener: (value: NekoCredentialState | undefined) => void): () => void;
		};
	};
};

/**
 * Opens the /search panel and keeps it in sync with the gateway; the returned function stops the sync.
 * `k` (empty filter) closes the panel and hands the highlighted provider to `openKey`, which shows its
 * key input; this panel never collects keys itself.
 */
export function openSearchPanel(
	panel: PickerPanel,
	client: SearchClient,
	notify: (message: string) => void,
	openKey?: (provider: SearchProviderId) => void,
): () => void {
	const items = () => searchItems(client.searchSettings.state.value, client.credentials.state.value);
	const refresh = () => panel.update(items());
	const stops = [client.searchSettings.state.subscribe(refresh), client.credentials.state.subscribe(refresh)];
	panel.emptyText = SEARCH_EMPTY;
	if (openKey) {
		panel.help = shortcutHints(["↑↓", "Select"], ["Enter", "Choose"], ["K", "Set key"], ["Esc", "Close"]);
		panel.listKey = (data, value) => {
			if (data.toLowerCase() !== "k" || panel.search.getValue() !== "" || value === undefined) return false;
			if (!(SEARCH_PROVIDERS as readonly string[]).includes(value)) return false;
			panel.close();
			openKey(value as SearchProviderId);
			return true;
		};
	}
	void panel.show(
		"Web search",
		async () => items(),
		async (value) => {
			await client.searchSettings.set({ provider: value as SearchProviderId });
			notify(`Web search provider set to ${NAMES[value as SearchProviderId]}.`);
		},
	);
	return () => {
		for (const stop of stops) stop();
	};
}
