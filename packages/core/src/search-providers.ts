/**
 * Search provider descriptors. Free of Node imports so browser bundles (the Web settings page)
 * can use it via the `@neko-harness/core/search-providers` subpath.
 */

/** Backends that can serve web_search / web_extract; the user picks one explicitly. */
export type SearchProviderId = "deepseek" | "tavily";

export const SEARCH_PROVIDERS: readonly SearchProviderId[] = ["tavily", "deepseek"];

export const DEFAULT_SEARCH_PROVIDER: SearchProviderId = "tavily";

export type SearchSettings = {
	readonly selected: SearchProviderId;
};

export function isSearchProvider(value: unknown): value is SearchProviderId {
	return typeof value === "string" && (SEARCH_PROVIDERS as readonly string[]).includes(value);
}
