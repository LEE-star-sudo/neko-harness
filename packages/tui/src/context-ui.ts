import { matchesKey } from "@earendil-works/pi-tui";
import type { NekoContextSettingsPatch, NekoContextSettingsState } from "@neko-harness/gateway";
import type { PickerDetail, PickerItem, PickerPanel } from "./components/picker.ts";
import { shortcutHints } from "./components/shortcut-hints.ts";
import { theme } from "./theme/index.ts";

export const CONTEXT_EMPTY = "Context settings are unavailable.";

type Kind = "bool" | "percent" | "tokens" | "count" | "chars";
type Row = {
	readonly key: string;
	readonly group: "compaction" | "pruning";
	readonly field: string;
	readonly label: string;
	readonly kind: Kind;
	readonly description: string;
	readonly presets: readonly (boolean | number)[];
};

export const CONTEXT_ROWS: readonly Row[] = [
	{
		key: "compaction.enabled",
		group: "compaction",
		field: "enabled",
		label: "Auto compaction",
		kind: "bool",
		description: "Compact automatically near the limit. /compact always works.",
		presets: [true, false],
	},
	{
		key: "compaction.triggerPercent",
		group: "compaction",
		field: "triggerPercent",
		label: "Compact at",
		kind: "percent",
		description: "Compact when context reaches this share of the smallest model window. Default is near the limit.",
		presets: [30, 40, 50, 60, 70, 80],
	},
	{
		key: "compaction.keepRecentTokens",
		group: "compaction",
		field: "keepRecentTokens",
		label: "Keep recent",
		kind: "tokens",
		description: "Recent context a compaction keeps verbatim.",
		presets: [10_000, 20_000, 40_000, 80_000],
	},
	{
		key: "pruning.enabled",
		group: "pruning",
		field: "enabled",
		label: "Prune tool results",
		kind: "bool",
		description: "Replace old, large tool results with a short note in what the model sees. History is kept.",
		presets: [true, false],
	},
	{
		key: "pruning.triggerPercent",
		group: "pruning",
		field: "triggerPercent",
		label: "Prune at",
		kind: "percent",
		description: "Prune when context reaches this share of the model window. Each prune invalidates the prompt cache.",
		presets: [20, 30, 35, 45, 55],
	},
	{
		key: "pruning.keepRecent",
		group: "pruning",
		field: "keepRecent",
		label: "Keep recent results",
		kind: "count",
		description: "Newest tool results that are never pruned.",
		presets: [5, 10, 20, 40],
	},
	{
		key: "pruning.minChars",
		group: "pruning",
		field: "minChars",
		label: "Min result size",
		kind: "chars",
		description: "Results shorter than this are never pruned.",
		presets: [2000, 4000, 8000, 16000],
	},
	{
		key: "pruning.minSavePercent",
		group: "pruning",
		field: "minSavePercent",
		label: "Min release",
		kind: "percent",
		description:
			"A prune runs only if it frees at least this share of the model window. Each prune invalidates the prompt cache, so a larger share means fewer prunes.",
		presets: [2, 5, 10, 15],
	},
];

const SOURCES = { default: "Default", config: "Config", saved: "Saved" } as const;

function format(kind: Kind, value: boolean | number | null): string {
	if (value === null) return "Default";
	if (typeof value === "boolean") return value ? "On" : "Off";
	switch (kind) {
		case "percent":
			return `${value}%`;
		case "tokens":
			return value >= 1000 ? `${Math.round(value / 1000)}k tokens` : `${value} tokens`;
		case "chars":
			return value >= 1000 ? `${Math.round(value / 1000)}k chars` : `${value} chars`;
		default:
			return String(value);
	}
}

function read(state: NekoContextSettingsState, row: Row) {
	const effective = state.effective[row.group] as Record<string, boolean | number | null>;
	const sources = state.sources[row.group] as Record<string, keyof typeof SOURCES>;
	return { value: effective[row.field] ?? null, source: sources[row.field] ?? "default" };
}

export const RESET_VALUE = "reset";

/** Settings grouped under headers; each row shows its effective value and where it comes from. */
export function contextItems(state: NekoContextSettingsState | undefined): PickerItem[] {
	if (!state) return [];
	const items: PickerItem[] = [];
	let group = "";
	for (const row of CONTEXT_ROWS) {
		if (row.group !== group) {
			group = row.group;
			items.push({
				value: `header:${group}`,
				label: group === "compaction" ? "Compaction" : "Tool result pruning",
				header: true,
			});
		}
		const { value, source } = read(state, row);
		const custom = source !== "default" && value !== null && !row.presets.includes(value);
		items.push({
			value: row.key,
			label: row.label,
			rightLabel: `${format(row.kind, value)}  ${SOURCES[source]}${custom ? " · Custom" : ""}`,
			description: row.description,
		});
	}
	items.push({
		value: RESET_VALUE,
		label: "Reset to defaults",
		description: "Clear every saved value. Config file values still apply.",
	});
	return items;
}

export type ContextClient = {
	readonly contextSettings: {
		readonly state: {
			readonly value: NekoContextSettingsState | undefined;
			subscribe(listener: (value: NekoContextSettingsState | undefined) => void): () => void;
		};
		set(patch: NekoContextSettingsPatch): Promise<unknown>;
		reset(input: Record<string, never>): Promise<unknown>;
	};
};

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Preset chooser for one setting; Enter saves, Esc returns to the list. */
class PresetDetail implements PickerDetail {
	readonly help = shortcutHints(["↑↓", "Select"], ["Enter", "Save"], ["Esc", "Back"]);
	#index = 0;
	#error = "";
	#saving = false;
	readonly #options: readonly (boolean | number | null)[];

	readonly #row: Row;
	readonly #client: ContextClient;
	readonly #panel: PickerPanel;
	readonly #notify: (message: string) => void;
	readonly #changed: () => void;

	constructor(
		row: Row,
		client: ContextClient,
		panel: PickerPanel,
		notify: (message: string) => void,
		changed: () => void,
	) {
		this.#row = row;
		this.#client = client;
		this.#panel = panel;
		this.#notify = notify;
		this.#changed = changed;
		const state = client.contextSettings.state.value;
		const current = state ? read(state, row) : { value: null, source: "default" as const };
		const options: (boolean | number | null)[] = [null, ...row.presets];
		const custom = current.source !== "default" && current.value !== null && !row.presets.includes(current.value);
		if (custom) options.push(current.value);
		this.#options = options;
		this.#index = current.source === "saved" || custom ? Math.max(0, options.indexOf(current.value)) : 0;
	}

	lines(_width: number, height: number): readonly string[] {
		const state = this.#client.contextSettings.state.value;
		const current = state ? read(state, this.#row) : undefined;
		const head = [theme.accent(this.#row.label), theme.dim(this.#row.description)];
		if (this.#saving) head.push("Saving...");
		if (this.#error) head.push(theme.error(`Error: ${this.#error}`));
		const options = this.#options.map((option, i) => {
			const custom = option !== null && !this.#row.presets.includes(option);
			const text = `${format(this.#row.kind, option)}${custom ? " (Custom)" : ""}${
				option === null && current ? ` - now ${SOURCES[current.source]}` : ""
			}`;
			return i === this.#index ? theme.selection(`❯ ${text}`) : `  ${text}`;
		});
		const count = Math.max(1, height - head.length);
		const start = Math.max(0, Math.min(this.#index - Math.floor(count / 2), options.length - count));
		return [...head, ...options.slice(start, start + count)];
	}

	handleKey(data: string): boolean {
		if (this.#saving) return true;
		if (matchesKey(data, "up")) this.#index = Math.max(0, this.#index - 1);
		else if (matchesKey(data, "down")) this.#index = Math.min(this.#options.length - 1, this.#index + 1);
		else if (matchesKey(data, "enter")) {
			const value = this.#options[this.#index] ?? null;
			this.#saving = true;
			this.#error = "";
			const patch = { [this.#row.group]: { [this.#row.field]: value } } as NekoContextSettingsPatch;
			void this.#client.contextSettings.set(patch).then(
				() => {
					this.#saving = false;
					this.#notify(`${this.#row.label} set to ${format(this.#row.kind, value)}.`);
					this.#panel.popDetail();
				},
				(error) => {
					this.#saving = false;
					this.#error = message(error);
					this.#changed();
				},
			);
		} else return false;
		return true;
	}
}

/** Opens the /context panel and keeps it in sync with the gateway; the returned function stops the sync. */
export function openContextPanel(
	panel: PickerPanel,
	client: ContextClient,
	notify: (message: string) => void,
): () => void {
	const items = () => contextItems(client.contextSettings.state.value);
	const stop = client.contextSettings.state.subscribe(() => panel.update(items()));
	panel.emptyText = CONTEXT_EMPTY;
	void panel.show(
		"Context settings",
		async () => items(),
		async (value) => {
			if (value === RESET_VALUE) {
				await client.contextSettings.reset({});
				notify("Context settings reset to defaults.");
				return;
			}
			const row = CONTEXT_ROWS.find((item) => item.key === value);
			if (!row) return;
			return new PresetDetail(row, client, panel, notify, () => panel.changed());
		},
	);
	return stop;
}
