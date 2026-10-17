import { type KeyResolver, postJson, record, truncate, type WebFetch, WebToolError } from "./http.ts";
import type { ExtractOutcome, SearchHit, WebSearchProvider } from "./provider.ts";

const SEARCH_URL = "https://api.tavily.com/search";
const EXTRACT_URL = "https://api.tavily.com/extract";

function rows(data: Record<string, unknown>, field: string): Record<string, unknown>[] {
	const value = data[field];
	if (!Array.isArray(value) || !value.every(record)) throw new WebToolError("Invalid Tavily response.");
	return value;
}

function urlKey(value: unknown): string {
	const text = String(value);
	try {
		return new URL(text).href;
	} catch {
		return text;
	}
}

/** Tavily keys are resolved at call time; an absent key selects the upstream keyless mode. */
export function createTavilyProvider(resolveKey: KeyResolver, fetchImpl: WebFetch = fetch): WebSearchProvider {
	const post = async (
		url: string,
		body: Record<string, unknown>,
		context: Parameters<WebSearchProvider["search"]>[2],
	) => {
		const data = await postJson({
			label: "Tavily",
			url,
			body,
			fetchImpl,
			context,
			resolveKey,
			headers: (key): Record<string, string> =>
				key ? { authorization: `Bearer ${key}` } : { "x-tavily-access-mode": "keyless" },
			httpError: (status, text, key) =>
				new WebToolError(
					`Tavily request failed (${status}): ${truncate(text, 500)}${key ? "" : " (keyless rate limits apply; save a Tavily API key in settings for higher limits)"}`,
					status,
				),
		});
		if (!record(data)) throw new WebToolError("Invalid Tavily response.");
		if (data.error) throw new WebToolError(`Tavily request failed: ${truncate(JSON.stringify(data.error), 500)}`);
		return data;
	};
	return {
		id: "tavily",
		async search(query, limit, context): Promise<SearchHit[]> {
			const data = await post(SEARCH_URL, { query, max_results: limit, search_depth: "basic" }, context);
			return rows(data, "results")
				.slice(0, limit)
				.map((item) => ({
					title: String(item.title ?? "(untitled)"),
					url: String(item.url ?? ""),
					text: String(item.content ?? ""),
				}));
		},
		async extract(urls, context): Promise<ExtractOutcome[]> {
			const data = await post(EXTRACT_URL, { urls, format: "markdown" }, context);
			const results = rows(data, "results");
			const failed = data.failed_results === undefined ? [] : rows(data, "failed_results");
			const byUrl = (items: Record<string, unknown>[]) => new Map(items.map((item) => [urlKey(item.url), item]));
			const successes = byUrl(results);
			const failures = byUrl(failed);
			return urls.map((url) => {
				const result = successes.get(urlKey(url));
				if (result) return { url, text: String(result.raw_content ?? "") };
				const failure = failures.get(urlKey(url));
				return { url, error: String(failure?.error ?? "No result returned for this URL") };
			});
		},
	};
}
