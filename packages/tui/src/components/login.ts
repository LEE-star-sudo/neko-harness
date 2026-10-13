import { type Component, Input, isKeyRelease, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import { CREDENTIAL_PROVIDERS, type CredentialProviderId, credentialProvider } from "@neko-harness/core";
import type { NekoCredentialState } from "@neko-harness/gateway";
import { theme } from "../theme/index.ts";

/** Input is never rendered; replacing it also discards its undo/kill buffers. */
export class LoginPanel implements Component {
	height = 10;
	focused = false;
	open = false;
	#input = new Input();
	#state: NekoCredentialState | undefined;
	#provider: CredentialProviderId = "deepseek";
	#message = "";
	#busy = false;
	#generation = 0;
	#unsubscribe: (() => void) | undefined;
	readonly #changed: () => void;
	readonly #closed: () => void;
	readonly #save: (provider: CredentialProviderId, key: string) => Promise<void>;
	readonly #remove: (provider: CredentialProviderId) => Promise<void>;
	constructor(options: {
		changed: () => void;
		closed: () => void;
		save: (provider: CredentialProviderId, key: string) => Promise<void>;
		remove: (provider: CredentialProviderId) => Promise<void>;
	}) {
		this.#changed = options.changed;
		this.#closed = options.closed;
		this.#save = options.save;
		this.#remove = options.remove;
	}
	show(state: NekoCredentialState | undefined, subscribe: (fn: (state: NekoCredentialState) => void) => () => void) {
		this.#generation++;
		this.open = true;
		this.#busy = false;
		this.#message = "";
		this.#input = new Input();
		this.#provider = "deepseek";
		this.#state = state;
		this.#unsubscribe?.();
		this.#unsubscribe = subscribe((value) => {
			if (this.open) {
				this.#state = value;
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
		else if (matchesKey(data, "left") || matchesKey(data, "right") || matchesKey(data, "tab")) this.#switch();
		else {
			this.#input.handleInput(data);
			if (this.#input.getValue().length > 4096) this.#input.setValue(this.#input.getValue().slice(0, 4096));
		}
		this.#changed();
	}
	get #status() {
		return this.#state?.statuses[this.#provider];
	}
	#switch() {
		const index = CREDENTIAL_PROVIDERS.findIndex((spec) => spec.id === this.#provider);
		this.#provider = CREDENTIAL_PROVIDERS[(index + 1) % CREDENTIAL_PROVIDERS.length]!.id;
		this.#input = new Input();
		this.#message = "";
	}
	async #apply(remove: boolean) {
		const key = this.#input.getValue();
		if (!remove && !key.trim()) {
			this.#message = "Enter an API key.";
			this.#changed();
			return;
		}
		const generation = this.#generation;
		const provider = this.#provider;
		this.#busy = true;
		this.#message = "Saving...";
		this.#changed();
		try {
			if (remove) await this.#remove(provider);
			else await this.#save(provider, key);
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
		const spec = credentialProvider(this.#provider);
		const tabs = CREDENTIAL_PROVIDERS.map((item) =>
			item.id === this.#provider ? `[${item.id}]` : ` ${item.id} `,
		).join(" ");
		const source = state?.source === "keyless" ? "keyless (rate-limited)" : (state?.source ?? "Loading...");
		const rows = [
			`Provider: ${tabs}`,
			`Environment: ${state ? (state.environmentConfigured ? "Configured" : "Not configured") : "Loading..."}`,
			`Active source: ${source}`,
			`API Key: ${"*".repeat(Math.min(this.#input.getValue().length, Math.max(1, width - 15))) || "(paste key)"}`,
			this.#message ||
				(spec.keyless
					? "Without a key, Tavily runs in rate-limited keyless mode."
					: "Saved key overrides environment."),
			spec.signupUrl,
		];
		const help = this.#busy
			? "Saving...  Esc Close"
			: state?.savedConfigured
				? "Enter Save  Ctrl+R Remove  Left/Right Switch  Esc Cancel"
				: "Enter Save  Left/Right Switch  Esc Cancel";
		while (rows.length < this.height - 1) rows.push("");
		return [...rows.slice(0, Math.max(0, this.height - 1)), help].map((line) =>
			theme.panel(` ${truncateToWidth(line, Math.max(1, width - 2), "...", true)} `),
		);
	}
}
