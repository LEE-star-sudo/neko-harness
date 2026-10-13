import { theme } from "../theme/index.ts";

/** Shared menu hint style; single-letter shortcuts use uppercase labels. */
export const shortcutHints = (...parts: readonly (readonly [string, string])[]): string =>
	parts
		.map(([key, action]) => `${theme.accent(key.length === 1 ? key.toUpperCase() : key)} ${theme.dim(action)}`)
		.join(theme.dim(" · "));
