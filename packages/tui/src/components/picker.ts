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

export type PickerItem = SelectItem & { rightLabel?: string; searchText?: string };

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
	#pick: ((value: string) => Promise<void>) | undefined;
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
		pick: (value: string) => Promise<void>,
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
		this.#state = "closed";
		this.closed();
		this.changed();
	}
	#filtered(): readonly PickerItem[] {
		const query = this.search.getValue().toLowerCase();
		return this.#items.filter((item) =>
			`${item.label} ${item.description ?? ""} ${item.searchText ?? ""}`.toLowerCase().includes(query),
		);
	}
	handleInput(data: string): void {
		if (isKeyRelease(data)) return;
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
		if (matchesKey(data, "up")) this.#index = Math.max(0, this.#index - 1);
		else if (matchesKey(data, "down")) this.#index = Math.min(Math.max(0, items.length - 1), this.#index + 1);
		else if (matchesKey(data, "enter")) {
			const item = items[this.#index];
			if (!item) return;
			const generation = this.#generation;
			this.#state = "applying";
			void this.#pick!(item.value).then(
				() => {
					if (generation === this.#generation) this.close();
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
			this.#index = 0;
		}
		this.changed();
	}
	render(width: number): string[] {
		const height = Math.max(1, this.height);
		const w = Math.max(1, width - 2);
		const rows = [style.bold(this.#title)];
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
			const selected = items[this.#index];
			const details = height >= 9 && selected?.description ? wrapTextWithAnsi(selected.description, w).slice(0, 2) : [];
			const count = Math.max(1, available - details.length);
			const start = Math.max(0, Math.min(this.#index - Math.floor(count / 2), items.length - count));
			for (const [i, item] of items.slice(start, start + count).entries()) {
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
