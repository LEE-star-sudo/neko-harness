/** 1234 -> "1.2k", 3456000 -> "3.5M"。 */
export function formatTokens(tokens: number): string {
	if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
	if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
	return String(tokens);
}

/** Drops the provider but keeps the vendor, so `openrouter/anthropic/x` shows as `anthropic/x`. */
export function modelDisplayName(model: string): string {
	const slash = model.indexOf("/");
	return slash < 0 || slash === model.length - 1 ? model : model.slice(slash + 1);
}
