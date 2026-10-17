/** Bounds and built-in defaults of the context settings; validation and resolution both read them. */
export type ContextFieldLimit =
	| { readonly kind: "boolean" }
	| { readonly kind: "int"; readonly min: number; readonly max: number };

const PERCENT = { kind: "int", min: 1, max: 99 } as const;

export const CONTEXT_FIELD_LIMITS = {
	compaction: {
		enabled: { kind: "boolean" },
		triggerPercent: PERCENT,
		keepRecentTokens: { kind: "int", min: 1, max: 100_000_000 },
	},
	pruning: {
		enabled: { kind: "boolean" },
		triggerPercent: PERCENT,
		keepRecent: { kind: "int", min: 0, max: 100_000 },
		minChars: { kind: "int", min: 1, max: 100_000_000 },
		minSavePercent: PERCENT,
	},
} as const satisfies Record<string, Record<string, ContextFieldLimit>>;

/** Built-in pruning defaults (compaction defaults come from pi-durable and are not repeated here). */
export const PRUNING_DEFAULTS = {
	enabled: false,
	triggerPercent: 35,
	keepRecent: 10,
	minChars: 4000,
	minSavePercent: 5,
} as const;
export const COMPACTION_KEEP_RECENT_DEFAULT = 20_000;
