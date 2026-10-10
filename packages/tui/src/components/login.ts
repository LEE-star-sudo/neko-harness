import { type Component, Input, isKeyRelease, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import type { CredentialStatus } from "@neko-harness/core";
import { theme } from "../theme.ts";

/** Input is never rendered; replacing it also discards its undo/kill buffers. */
export class LoginPanel implements Component {
	height = 10;
	focused = false;
	open = false;
	#input = new Input();
	#status: CredentialStatus | undefined;
	#message = "";
	#busy = false;
	#generation = 0;
	#unsubscribe: (() => void) | undefined;
	readonly #changed: () => void;
	readonly #closed: () => void;
	readonly #save: (key: string) => Promise<void>;
	readonly #remove: () => Promise<void>;
	constructor(options: {
		changed: () => void;
		closed: () => void;
		save: (key: string) => Promise<void>;
		remove: () => Promise<void>;
	}) {
		this.#changed = options.changed;
		this.#closed = options.closed;
		this.#save = options.save;
		this.#remove = options.remove;
	}
	show(status: CredentialStatus | undefined, subscribe: (fn: (status: CredentialStatus) => void) => () => void) {
		this.#generation++;
		this.open = true;
		this.#busy = false;
		this.#message = "";
		this.#input = new Input();
		this.#status = status;
		this.#unsubscribe?.();
		this.#unsubscribe = subscribe((value) => {
			if (this.open) {
				this.#status = value;
				this.#changed();
			}
		});
		this.#changed();
	}
	close() {
		this.#generation++;
		this.open = false;
		this.#input = new Input();
		this.#unsubscribe?.();
		this.#unsubscribe = undefined;
		this.#closed();
		this.#changed();
	}
	invalidate() {}
	handleInput(data: string) {
		if (isKeyRelease(data)) return;
		if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
			this.close();
			return;
		}
		if (this.#busy) return;
		if (matchesKey(data, "enter")) void this.#apply(false);
		else if (matchesKey(data, "ctrl+r") && this.#status?.savedConfigured) void this.#apply(true);
		else {
			this.#input.handleInput(data);
			if (this.#input.getValue().length > 4096) this.#input.setValue(this.#input.getValue().slice(0, 4096));
		}
		this.#changed();
	}
	async #apply(remove: boolean) {
		const key = this.#input.getValue();
		if (!remove && !key.trim()) {
			this.#message = "Enter an API key.";
			this.#changed();
			return;
		}
		const generation = this.#generation;
		this.#busy = true;
		this.#message = "Saving...";
		this.#changed();
		try {
			if (remove) await this.#remove();
			else await this.#save(key);
			if (generation === this.#generation) {
				this.#input = new Input();
				this.#message = remove ? "Saved key removed." : "Saved. Used by the next request.";
			}
		} catch {
			if (generation === this.#generation) this.#message = "Could not update API key. Try again.";
		} finally {
			if (generation === this.#generation) {
				this.#busy = false;
				this.#changed();
			}
		}
	}
	render(width: number): string[] {
		const state = this.#status;
		const rows = [
			"DeepSeek API Key",
			`Environment: ${state ? (state.environmentConfigured ? "Configured" : "Not configured") : "Loading..."}`,
			`Active source: ${state?.source ?? "Loading..."}`,
			`API Key: ${"*".repeat(Math.min(this.#input.getValue().length, Math.max(1, width - 15))) || "(paste key)"}`,
			this.#message || "Saved key overrides environment.",
			"https://platform.deepseek.com/api_keys",
		];
		const help = this.#busy
			? "Saving...  Esc Close"
			: state?.savedConfigured
				? "Enter Save  Ctrl+R Remove  Esc Cancel"
				: "Enter Save  Esc Cancel";
		while (rows.length < this.height - 1) rows.push("");
		return [...rows.slice(0, Math.max(0, this.height - 1)), help].map((line) =>
			theme.panel(` ${truncateToWidth(line, Math.max(1, width - 2), "...", true)} `),
		);
	}
}
