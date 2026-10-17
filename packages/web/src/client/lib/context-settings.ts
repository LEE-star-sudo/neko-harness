import type { NekoContextSettingsPatch, NekoContextSettingsState } from "./contract.ts";

export type ContextGroup = "compaction" | "pruning";
export type ContextSource = "default" | "config" | "saved";
export type ContextUnit = "percent" | "tokens" | "count" | "chars";

export type ContextRow = {
	key: string;
	group: ContextGroup;
	field: string;
	label: string;
	description: string;
	unit: ContextUnit;
	/** Preset values shown as one-click chips; a value from the config file that is not among them gets its own chip. */
	presets: readonly number[];
};

export type ContextToggle = { group: ContextGroup; field: "enabled"; key: string };

export const TOGGLES: Record<ContextGroup, ContextToggle> = {
	compaction: { group: "compaction", field: "enabled", key: "compaction.enabled" },
	pruning: { group: "pruning", field: "enabled", key: "pruning.enabled" },
};

export const CONTEXT_ROWS: readonly ContextRow[] = [
	{
		key: "compaction.triggerPercent",
		group: "compaction",
		field: "triggerPercent",
		label: "触发时机",
		description: "上下文达到模型窗口的这个比例时自动压缩。默认接近窗口上限。",
		unit: "percent",
		presets: [30, 40, 50, 60, 70, 80],
	},
	{
		key: "compaction.keepRecentTokens",
		group: "compaction",
		field: "keepRecentTokens",
		label: "保留近期",
		description: "压缩时逐字保留的近期内容，越多越不容易丢细节。",
		unit: "tokens",
		presets: [10_000, 20_000, 40_000, 80_000],
	},
	{
		key: "pruning.triggerPercent",
		group: "pruning",
		field: "triggerPercent",
		label: "触发时机",
		description: "上下文达到模型窗口的这个比例时裁剪旧结果。",
		unit: "percent",
		presets: [20, 30, 35, 45, 55],
	},
	{
		key: "pruning.keepRecent",
		group: "pruning",
		field: "keepRecent",
		label: "保留最近结果",
		description: "最新的这些工具结果永远保持完整。",
		unit: "count",
		presets: [5, 10, 20, 40],
	},
	{
		key: "pruning.minChars",
		group: "pruning",
		field: "minChars",
		label: "最小结果长度",
		description: "短于这个长度的结果不会被裁剪。",
		unit: "chars",
		presets: [2_000, 4_000, 8_000, 16_000],
	},
	{
		key: "pruning.minSavePercent",
		group: "pruning",
		field: "minSavePercent",
		label: "单次最小释放量",
		description:
			"单次裁剪预计释放的上下文达到模型窗口的这个比例才会执行。每次裁剪都会使提示词缓存失效，比例越大，裁剪越少、越集中。",
		unit: "percent",
		presets: [2, 5, 10, 15],
	},
];

export const SOURCE_LABELS: Record<ContextSource, string> = { default: "默认", config: "配置文件", saved: "已保存" };

type Values = Record<string, boolean | number | null>;
type Sources = Record<string, ContextSource>;

export function readSetting(
	state: NekoContextSettingsState,
	item: { group: ContextGroup; field: string },
): { value: boolean | number | null; source: ContextSource } {
	const effective = state.effective[item.group] as Values;
	const sources = state.sources[item.group] as Sources;
	return { value: effective[item.field] ?? null, source: sources[item.field] ?? "default" };
}

export function formatValue(unit: ContextUnit, value: number): string {
	switch (unit) {
		case "percent":
			return `${value}%`;
		case "tokens":
			return value >= 1000 ? `${Number((value / 1000).toFixed(1))}k` : String(value);
		case "chars":
			return value >= 1000 ? `${Number((value / 1000).toFixed(1))}k 字符` : `${value} 字符`;
		default:
			return `${value} 个`;
	}
}

export type ChipView = { id: string; label: string; value: number | null; selected: boolean };

/** One-click options: "默认" clears the saved value, then the presets, then a chip for an off-preset current value. */
export function chipsFor(row: ContextRow, state: NekoContextSettingsState): ChipView[] {
	const { value, source } = readSetting(state, row);
	const current = typeof value === "number" ? value : null;
	const chips: ChipView[] = [{ id: "default", label: "默认", value: null, selected: source !== "saved" }];
	for (const preset of row.presets)
		chips.push({
			id: String(preset),
			label: formatValue(row.unit, preset),
			value: preset,
			selected: source === "saved" && current === preset,
		});
	if (current !== null && source !== "default" && !row.presets.includes(current))
		chips.push({
			id: `custom-${current}`,
			label: `${formatValue(row.unit, current)} · 自定义`,
			value: current,
			selected: source === "saved",
		});
	return chips;
}

export function describeCurrent(row: ContextRow, state: NekoContextSettingsState): string {
	const { value, source } = readSetting(state, row);
	const shown = typeof value === "number" ? formatValue(row.unit, value) : "接近窗口上限";
	return `当前生效 ${shown} · ${SOURCE_LABELS[source]}`;
}

export function patchFor(
	item: { group: ContextGroup; field: string },
	value: boolean | number | null,
): NekoContextSettingsPatch {
	return { [item.group]: { [item.field]: value } } as NekoContextSettingsPatch;
}

export type Marker = { id: "compaction" | "pruning"; label: string; percent: number; native: boolean };

/** Where each automatic step fires on a 0-100% context window, for the threshold bar. */
export function markers(state: NekoContextSettingsState): Marker[] {
	const out: Marker[] = [];
	const { compaction, pruning } = state.effective;
	if (pruning.enabled) out.push({ id: "pruning", label: "裁剪", percent: pruning.triggerPercent, native: false });
	if (compaction.enabled)
		out.push({
			id: "compaction",
			label: "压缩",
			percent: compaction.triggerPercent ?? 98,
			native: compaction.triggerPercent === null,
		});
	return out;
}
