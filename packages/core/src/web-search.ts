import type { Context } from "@earendil-works/chord";
import { Type } from "@earendil-works/pi-ai";
import { defineExtension, defineTool } from "@earendil-works/pi-durable";

const SEARCH_URL = "https://api.tavily.com/search";
const EXTRACT_URL = "https://api.tavily.com/extract";
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_URLS = 20;
const MAX_RESULTS = 10;
const DEFAULT_RESULTS = 5;
const MAX_SOURCE_CHARS = 2000;
const MAX_TOTAL_CHARS = 12_000;

export type TavilyKeyResolver = () => Promise<string | undefined>;
export type TavilyFetch = (input: string, init?: RequestInit) => Promise<Response>;

/** Only deliberate, sanitized errors may enter a persistent tool result. */
class TavilyError extends Error {}

function redact(text: string, key: string | undefined): string {
	for (const secret of key ? [key, encodeURIComponent(key)] : []) text = text.replaceAll(secret, "[redacted]");
	return text.replace(/tvly-[a-zA-Z0-9_-]+/g, "[redacted]");
}
function record(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readBounded(response: Response, signal: AbortSignal): Promise<string> {
	if (Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES) {
		await response.body?.cancel();
		throw new TavilyError("Tavily response exceeds the 2 MiB limit.");
	}
	if (!response.body) return "";
	const reader = response.body.getReader();
	const cancel = () => {
		void reader.cancel().catch(() => {});
	};
	signal.addEventListener("abort", cancel, { once: true });
	const decoder = new TextDecoder();
	let size = 0;
	let text = "";
	try {
		while (true) {
			signal.throwIfAborted();
			const chunk = await reader.read();
			signal.throwIfAborted();
			if (chunk.done) return text + decoder.decode();
			size += chunk.value.byteLength;
			if (size > MAX_RESPONSE_BYTES) throw new TavilyError("Tavily response exceeds the 2 MiB limit.");
			text += decoder.decode(chunk.value, { stream: true });
		}
	} finally {
		signal.removeEventListener("abort", cancel);
		await reader.cancel().catch(() => {});
		reader.releaseLock();
	}
}

async function tavilyPost(
	url: string,
	body: Record<string, unknown>,
	resolveKey: TavilyKeyResolver,
	fetchImpl: TavilyFetch,
	context: Context,
): Promise<Record<string, unknown>> {
	let key: string | undefined;
	const signal = AbortSignal.any([
		AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		...(context.abortSignal ? [context.abortSignal] : []),
	]);
	try {
		signal.throwIfAborted();
		key = await resolveKey();
		signal.throwIfAborted();
		const headers: Record<string, string> = { "content-type": "application/json" };
		if (key) headers.authorization = `Bearer ${key}`;
		else headers["x-tavily-access-mode"] = "keyless";
		const response = await fetchImpl(url, { method: "POST", headers, body: JSON.stringify(body), signal });
		const text = redact(await readBounded(response, signal), key);
		if (!response.ok)
			throw new TavilyError(
				`Tavily request failed (${response.status}): ${truncate(text, 500)}${key ? "" : " (keyless rate limits apply; save a Tavily API key in settings for higher limits)"}`,
			);
		const data: unknown = JSON.parse(text);
		if (!record(data)) throw new TavilyError("Invalid Tavily response.");
		if (data.error) throw new TavilyError(`Tavily request failed: ${truncate(JSON.stringify(data.error), 500)}`);
		return data;
	} catch (error) {
		if (context.abortSignal?.aborted) throw new TavilyError("Web request cancelled.");
		if (signal.aborted) throw new TavilyError("Tavily request timed out. Please retry.");
		if (error instanceof TavilyError) throw error;
		// Network errors, JSON parser errors and credential-store errors can contain sensitive data.
		throw new TavilyError("Tavily request failed. Check the connection and credentials, then retry.");
	}
}
function toolError(error: unknown) {
	return {
		content: [
			{ type: "text" as const, text: error instanceof TavilyError ? error.message : "Web tool failed. Please retry." },
		],
		isError: true,
	};
}
function truncate(text: string, max: number): string {
	return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;
}
function rows(data: Record<string, unknown>, field: string): Record<string, unknown>[] {
	const value = data[field];
	if (!Array.isArray(value) || !value.every(record)) throw new TavilyError("Invalid Tavily response.");
	return value;
}
function content(text: string) {
	return { content: [{ type: "text" as const, text }] };
}
function urlKey(value: unknown): string {
	const text = String(value);
	try {
		return new URL(text).href;
	} catch {
		return text;
	}
}

/** Tavily keys are resolved at call time; absent keys select the upstream keyless mode. */
export function createWebSearchTools(resolveKey: TavilyKeyResolver, fetchImpl: TavilyFetch = fetch) {
	return defineExtension({
		name: "neko-web-search",
		tools: [
			defineTool({
				name: "web_search",
				description:
					"Search the live web for current or unknown information. Returns ranked sources (title, URL, bounded excerpts). Use only when up-to-date or external information is needed; use web_extract to read a known URL.",
				parameters: Type.Object({
					query: Type.String({ minLength: 1, maxLength: 4096, description: "The search query" }),
					maxResults: Type.Optional(
						Type.Number({ description: `Maximum number of results (1-${MAX_RESULTS}, default ${DEFAULT_RESULTS})` }),
					),
				}),
				async execute({ query, maxResults }, _api, context) {
					try {
						if (!query.trim() || query.length > 4096)
							throw new TavilyError("Provide a non-empty query of at most 4096 characters.");
						if (maxResults !== undefined && !Number.isFinite(maxResults))
							throw new TavilyError("maxResults must be a finite number.");
						const limit = Math.max(1, Math.min(MAX_RESULTS, Math.trunc(maxResults ?? DEFAULT_RESULTS)));
						const data = await tavilyPost(
							SEARCH_URL,
							{ query, max_results: limit, search_depth: "basic" },
							resolveKey,
							fetchImpl,
							context,
						);
						const results = rows(data, "results").slice(0, limit);
						const budget = Math.floor(MAX_TOTAL_CHARS / Math.max(1, results.length)) - 2;
						return content(
							results
								.map((item, index) => {
									const header = `${index + 1}. ${truncate(String(item.title ?? "(untitled)"), 200)}\n${truncate(String(item.url ?? ""), 300)}\n`;
									return (
										header + truncate(String(item.content ?? ""), Math.min(MAX_SOURCE_CHARS, budget - header.length))
									);
								})
								.join("\n\n") || "No results.",
						);
					} catch (error) {
						return toolError(error);
					}
				},
			}),
			defineTool({
				name: "web_extract",
				description:
					"Extract bounded markdown excerpts from web pages by URL. Every requested URL has a result or failure entry; long content is truncated.",
				parameters: Type.Object({
					urls: Type.Array(Type.String({ maxLength: 2048, description: "http(s) URL" }), {
						minItems: 1,
						maxItems: MAX_URLS,
						description: `URLs to extract (1-${MAX_URLS})`,
					}),
				}),
				async execute({ urls }, _api, context) {
					try {
						if (!urls.length || urls.length > MAX_URLS)
							throw new TavilyError(`Provide between 1 and ${MAX_URLS} URLs.`);
						for (const url of urls) {
							let parsed: URL;
							try {
								parsed = new URL(url);
							} catch {
								throw new TavilyError("Provide valid http(s) URLs.");
							}
							if (
								url.length > 2048 ||
								!["http:", "https:"].includes(parsed.protocol) ||
								parsed.username ||
								parsed.password
							)
								throw new TavilyError("Provide http(s) URLs of at most 2048 characters without embedded credentials.");
						}
						const data = await tavilyPost(EXTRACT_URL, { urls, format: "markdown" }, resolveKey, fetchImpl, context);
						const results = rows(data, "results");
						const failed = data.failed_results === undefined ? [] : rows(data, "failed_results");
						const byUrl = (items: Record<string, unknown>[]) => new Map(items.map((item) => [urlKey(item.url), item]));
						const successes = byUrl(results),
							failures = byUrl(failed);
						// Reserve a bounded slot for every requested URL, so content cannot displace failure information.
						const budget = Math.floor(MAX_TOTAL_CHARS / urls.length) - 2;
						return content(
							urls
								.map((url, index) => {
									const header = `## ${index + 1}. ${truncate(url, 300)}\n`;
									const result = successes.get(urlKey(url)),
										failure = failures.get(urlKey(url));
									const text = result
										? String(result.raw_content ?? "")
										: `Extraction failed: ${String(failure?.error ?? "No result returned for this URL")}`;
									return header + truncate(text, Math.min(MAX_SOURCE_CHARS, budget - header.length));
								})
								.join("\n\n"),
						);
					} catch (error) {
						return toolError(error);
					}
				},
			}),
		],
	});
}
