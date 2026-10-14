import {
	type Component,
	CURSOR_MARKER,
	Input,
	isKeyRelease,
	matchesKey,
	renderFakeCursor,
	truncateToWidth,
} from "@earendil-works/pi-tui";
import { CREDENTIAL_PROVIDERS, type CredentialProviderId, credentialProvider } from "@neko-harness/core";
import type { NekoCredentialState } from "@neko-harness/gateway";
import { theme } from "../theme/index.ts";
import { shortcutHints } from "./shortcut-hints.ts";

const AUTO_CLOSE_MS = 800;

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
	#confirmingRemove = false;
	#generation = 0;
	#closeTimer: ReturnType<typeof setTimeout> | undefined;
	#unsubscribe: (() => void) | undefined;
	readonly #changed: () => void;
	readonly #closed: () => void;
	readonly #save: (provider: CredentialProviderId, key: string) => Promise<void>;
	readonly #remove: (provider: CredentialProviderId) => Promise<void>;
	readonly #autoCloseMs: number;
	constructor(options: {
		changed: () => void;
		closed: () => void;
		save: (provider: CredentialProviderId, key: string) => Promise<void>;
		remove: (provider: CredentialProviderId) => Promise<void>;
		/** 成功后自动关闭延迟；测试可注入小值。 */
		autoCloseMs?: number;
	}) {
		this.#changed = options.changed;
		this.#closed = options.closed;
		this.#save = options.save;
		this.#remove = options.remove;
		this.#autoCloseMs = options.autoCloseMs ?? AUTO_CLOSE_MS;
	}
	show(state: NekoCredentialState | undefined, subscribe: (fn: (state: NekoCredentialState) => void) => () => void) {
		this.#generation++;
		this.#clearCloseTimer();
		this.open = true;
		this.#busy = false;
		this.#confirmingRemove = false;
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
		this.#clearCloseTimer();
		this.open = false;
		this.#confirmingRemove = false;
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
		const confirming = this.#confirmingRemove;
		this.#confirmingRemove = false;
		if (confirming && !matchesKey(data, "ctrl+r")) this.#message = "";
		if (matchesKey(data, "enter")) void this.#apply(false);
		else if (matchesKey(data, "ctrl+r") && this.#status?.savedConfigured) {
			if (confirming) void this.#apply(true);
			else {
				this.#confirmingRemove = true;
				this.#message = "Press Ctrl+R again to remove the saved key.";
			}
		} else if (
			matchesKey(data, "tab") ||
			((matchesKey(data, "left") || matchesKey(data, "right")) && this.#input.getValue() === "")
		)
			this.#switch();
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
		this.#message = "";
	}
	#clearCloseTimer() {
		if (this.#closeTimer !== undefined) clearTimeout(this.#closeTimer);
		this.#closeTimer = undefined;
	}
	#scheduleAutoClose(generation: number) {
		this.#clearCloseTimer();
		this.#closeTimer = setTimeout(() => {
			this.#closeTimer = undefined;
			if (generation === this.#generation && this.open) this.close();
		}, this.#autoCloseMs);
	}
	async #apply(remove: boolean) {
		const key = this.#input.getValue().trim();
		if (!remove) {
			if (!key) {
				this.#message = "Enter an API key.";
				this.#changed();
				return;
			}
			if (Array.from(key).some((char) => char.charCodeAt(0) < 32)) {
				this.#message = "Key contains a newline or control character. Remove it and try again.";
				this.#changed();
				return;
			}
		}
		const generation = this.#generation;
		const provider = this.#provider;
		this.#busy = true;
		this.#message = remove ? "Removing..." : "Saving...";
		this.#changed();
		try {
			if (remove) await this.#remove(provider);
			else await this.#save(provider, key);
			if (generation === this.#generation) {
				this.#input = new Input();
				this.#message = remove ? "Saved key removed." : "Saved. Used by the next request.";
				this.#scheduleAutoClose(generation);
			}
		} catch (error) {
			if (generation === this.#generation)
				this.#message = error instanceof Error ? error.message : "Could not update API key. Try again.";
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
		const keyLength = this.#input.getValue().length;
		// 与 Input 组件同一习语：聚焦时发射零宽硬件光标标记 + fake cursor（无硬件光标时解析为反色块）。
		// 光标恒在固定星号之后，位置不随密钥长度变化；失焦时不渲染光标。
		const marker = this.focused ? CURSOR_MARKER : "";
		const keyRow =
			keyLength > 0
				? `API Key: ********${marker}${this.focused ? renderFakeCursor(" ") : ""} (${keyLength} characters)`
				: `API Key: ${marker}${this.focused ? `${renderFakeCursor("(")}paste key)` : "(paste key)"}`;
		const rows = [
			`Provider: ${tabs}`,
			`Environment: ${state ? (state.environmentConfigured ? "Configured" : "Not configured") : "Loading..."}`,
			`Active source: ${source}`,
			keyRow,
			this.#message ||
				(spec.keyless
					? "Without a key, Tavily runs in rate-limited keyless mode."
					: "Saved key overrides environment."),
			spec.signupUrl,
		];
		const switchHint: readonly [string, string] = keyLength > 0 ? ["Tab", "Switch"] : ["Left/Right/Tab", "Switch"];
		const help = this.#busy
			? shortcutHints(["Esc", "Close"])
			: this.#confirmingRemove
				? shortcutHints(["Ctrl+R", "Confirm remove"], ["Esc", "Cancel"])
				: state?.savedConfigured
					? shortcutHints(["Enter", "Save"], ["Ctrl+R", "Remove"], switchHint, ["Esc", "Cancel"])
					: shortcutHints(["Enter", "Save"], switchHint, ["Esc", "Cancel"]);
		while (rows.length < this.height - 1) rows.push("");
		return [...rows.slice(0, Math.max(0, this.height - 1)), help].map((line) =>
			theme.panel(` ${truncateToWidth(line, Math.max(1, width - 2), "...", true)} `),
		);
	}
}
