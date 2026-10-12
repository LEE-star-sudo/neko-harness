import {
	type Component,
	Input,
	isKeyRelease,
	matchesKey,
	type SelectItem,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { labels } from "../labels.ts";
import { style, theme } from "../theme.ts";

export type PickerItem = SelectItem & { rightLabel?: string; searchText?: string; header?: boolean };

/**
 * An in-panel detail view (list stays underneath; Esc pops back to the list).
 * Used by the skill market for skill details / preview / inline confirms.
 */
export type PickerDetail = {
	/** Body lines for the current width/height budget. */
	lines(width: number, height: number): readonly string[];
	/** Footer hint shown while the view is open. */
	help: string;
	/** Return true when the key was consumed; Esc/ctrl+c are reserved for popping the view. */
	handleKey(data: string): boolean;
};

/** A single searchable panel. Async generations cannot reopen a closed panel. */
export class PickerPanel implements Component {
	readonly search = new Input({ prompt: "Search: ", placeholder: "Type to filter" });
	#items: readonly PickerItem[] = [];
	#index = 0;
	#generation = 0;
	#state: "closed" | "loading" | "ready" | "error" | "applying" = "closed";
	#error = "";
	#title = "";
	#load: (() => Promise<readonly PickerItem[]>) | undefined;
	// biome-ignore lint/suspicious/noConfusingVoidType: pick 要么无返回（关闭面板）要么返回详情视图
	#pick: ((value: string) => Promise<void | PickerDetail>) | undefined;
	height = 10;
	readonly changed: () => void;
	readonly closed: () => void;
	constructor(changed: () => void, closed: () => void) {
		this.changed = changed;
		this.closed = closed;
	}
	get open(): boolean {
		return this.#state !== "closed";
	}
	get focused(): boolean {
		return this.search.focused;
	}
	set focused(value: boolean) {
		this.search.focused = value;
	}
	invalidate(): void {}
	async show(
		title: string,
		load: () => Promise<readonly PickerItem[]>,
		// biome-ignore lint/suspicious/noConfusingVoidType: pick 要么无返回（关闭面板）要么返回详情视图
		pick: (value: string) => Promise<void | PickerDetail>,
	): Promise<void> {
		if (this.open) return;
		this.#title = title;
		this.#load = load;
		this.#pick = pick;
		this.search.setValue("");
		this.#index = 0;
		await this.reload();
	}
	async reload(): Promise<void> {
		const generation = ++this.#generation;
		this.#state = "loading";
		this.changed();
		try {
			const items = await this.#load!();
			if (generation !== this.#generation) return;
			this.#items = items;
			this.#state = "ready";
		} catch (error) {
			if (generation !== this.#generation) return;
			this.#error = error instanceof Error ? error.message : String(error);
			this.#state = "error";
		}
		this.changed();
	}
	update(items: readonly PickerItem[]): void {
		if (this.#state !== "ready") return;
		const value = this.#filtered()[this.#index]?.value;
		this.#items = items;
		const filtered = this.#filtered();
		const index = filtered.findIndex((item) => item.value === value);
		this.#index = index < 0 ? Math.max(0, Math.min(this.#index, filtered.length - 1)) : index;
		this.changed();
	}
	close(): void {
		++this.#generation;
		this.#details = [];
		this.#state = "closed";
		this.closed();
		this.changed();
	}
	/** Push a detail view above the current content (Esc pops one level at a time). */
	showDetail(detail: PickerDetail): void {
		if (!this.open) return;
		this.#details.push(detail);
		this.changed();
	}
	/** Pop the top detail view, back to the previous view or the list. */
	popDetail(): void {
		if (this.#details.length === 0) return;
		this.#details.pop();
		this.changed();
	}
	get detailOpen(): boolean {
		return this.#details.length > 0;
	}
	get #detail(): PickerDetail | undefined {
		return this.#details[this.#details.length - 1];
	}
	#details: PickerDetail[] = [];
	#filtered(): readonly PickerItem[] {
		const query = this.search.getValue().toLowerCase();
		// 搜索时隐藏组头，平铺命中项。
		if (query !== "") return this.#items.filter((item) => !item.header && this.#matches(item, query));
		return this.#items;
	}
	#matches(item: PickerItem, query: string): boolean {
		return `${item.label} ${item.description ?? ""} ${item.searchText ?? ""}`.toLowerCase().includes(query);
	}
	/** 第一个可选中（非组头）下标。 */
	#firstSelectable(items: readonly PickerItem[]): number {
		return items.findIndex((item) => !item.header);
	}
	#move(delta: -1 | 1): void {
		const items = this.#filtered();
		let next = this.#index + delta;
		while (next >= 0 && next < items.length && items[next]?.header) next += delta;
		this.#index = Math.max(0, Math.min(Math.max(0, items.length - 1), next));
		if (items[this.#index]?.header) this.#index = this.#firstSelectable(items);
	}
	handleInput(data: string): void {
		if (isKeyRelease(data)) return;
		// 详情视图：Esc 弹回列表，其余键先交给视图。
		if (this.#detail !== undefined) {
			if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
				this.popDetail();
			} else if (this.#detail.handleKey(data)) {
				this.changed();
			}
			return;
		}
		if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
			this.close();
			return;
		}
		if (this.#state === "error") {
			if (matchesKey(data, "enter")) void this.reload();
			return;
		}
		if (this.#state !== "ready") return;
		const items = this.#filtered();
		if (matchesKey(data, "up")) this.#move(-1);
		else if (matchesKey(data, "down")) this.#move(1);
		else if (matchesKey(data, "enter")) {
			const item = items[this.#index];
			if (!item || item.header) return;
			const generation = this.#generation;
			this.#state = "applying";
			void this.#pick!(item.value).then(
				(result) => {
					if (generation !== this.#generation) return;
					// pick 返回 PickerDetail 时进入详情视图而不是关闭（市场详情页）。
					if (result !== undefined && typeof result === "object" && "lines" in result) {
						this.#state = "ready";
						this.showDetail(result as PickerDetail);
						this.changed();
						return;
					}
					this.close();
				},
				(error) => {
					if (generation !== this.#generation) return;
					this.#error = error instanceof Error ? error.message : String(error);
					this.#state = "error";
					this.changed();
				},
			);
		} else {
			this.search.handleInput(data);
			this.#index = this.#firstSelectable(this.#filtered());
		}
		this.changed();
	}
	render(width: number): string[] {
		const height = Math.max(1, this.height);
		const w = Math.max(1, width - 2);
		const rows = [style.bold(this.#title)];
		if (this.#detail !== undefined) {
			const body = this.#detail.lines(w, Math.max(1, height - 2));
			rows.push(...body);
			while (rows.length < height - 1) rows.push("");
			// 详情视图的 help 由视图自行配色（键位 accent、说明 dim），面板不再整体压暗。
			if (height > 1) rows.push(this.#detail.help);
			return rows.slice(0, height).map((line) => theme.panel(` ${truncateToWidth(line, w, "...", true)} `));
		}
		if (height >= 4) rows.push(...this.search.render(w).slice(0, 1));
		const help = this.#state === "error" ? labels.retry : this.#state === "ready" ? labels.select : labels.close;
		const available = Math.max(1, height - rows.length - 1);
		if (this.#state !== "ready")
			rows.push(
				this.#state === "error"
					? theme.error(`Error: ${this.#error}`)
					: this.#state === "applying"
						? labels.applying
						: labels.loading,
			);
		else {
			const items = this.#filtered();
			this.#index = Math.min(this.#index, Math.max(0, items.length - 1));
			if (items[this.#index]?.header) {
				const first = this.#firstSelectable(items);
				if (first >= 0) this.#index = first;
			}
			const selected = items[this.#index];
			const details = height >= 9 && selected?.description ? wrapTextWithAnsi(selected.description, w).slice(0, 2) : [];
			const count = Math.max(1, available - details.length);
			const start = Math.max(0, Math.min(this.#index - Math.floor(count / 2), items.length - count));
			for (const [i, item] of items.slice(start, start + count).entries()) {
				if (item.header) {
					rows.push(theme.dim(` ${item.label}`));
					continue;
				}
				const right = item.rightLabel ?? "";
				const leftWidth = Math.max(1, w - 3 - visibleWidth(right));
				const left = truncateToWidth(item.label, leftWidth, "...");
				const label = right ? `${left}${" ".repeat(Math.max(1, leftWidth - visibleWidth(left) + 1))}${right}` : left;
				rows.push(start + i === this.#index ? theme.selection(`> ${label}`) : `  ${label}`);
			}
			if (items.length === 0) rows.push(labels.noResults);
			while (rows.length < height - 1 - details.length) rows.push("");
			rows.push(...details.map((line) => theme.dim(line)));
		}
		while (rows.length < height - 1) rows.push("");
		if (height > 1) rows.push(theme.dim(help));
		return rows.slice(0, height).map((line) => theme.panel(` ${truncateToWidth(line, w, "...", true)} `));
	}
}
