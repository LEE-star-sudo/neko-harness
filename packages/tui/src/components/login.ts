import {
	type Component,
	CURSOR_MARKER,
	Input,
	isKeyRelease,
	matchesKey,
	renderFakeCursor,
	truncateToWidth,
	visibleWidth,
} from "@earendil-works/pi-tui";
import {
	CREDENTIAL_PROVIDERS,
	type CredentialProviderId,
	type CredentialProviderSpec,
	isModelProvider,
	LOCKED_PROVIDERS,
} from "@neko-harness/core";
import type { NekoCredentialState } from "@neko-harness/gateway";
import { style, theme } from "../theme/index.ts";
import { shortcutHints } from "./shortcut-hints.ts";

const AUTO_CLOSE_MS = 800;

type CredentialStatus = NekoCredentialState["statuses"][string];
type Entry = { header: string } | { spec: CredentialProviderSpec };

const isLocked = (id: string) => (LOCKED_PROVIDERS as readonly string[]).includes(id);
const compact = (value: string) => value.toLowerCase().replace(/\s+/g, "");

/**
 * Two levels: a filterable provider list, then the masked key input of one provider.
 * Key input is never rendered; replacing it also discards its undo/kill buffers.
 */
export class LoginPanel implements Component {
	height = 10;
	focused = false;
	open = false;
	#level: "list" | "key" = "list";
	#filter = new Input({ prompt: "❯ ", placeholder: "Type to filter" });
	#index = 0;
	#inputs = new Map<string, Input>();
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
	readonly #toggle: (provider: CredentialProviderId, enabled: boolean) => Promise<void>;
	readonly #autoCloseMs: number;
	constructor(options: {
		changed: () => void;
		closed: () => void;
		save: (provider: CredentialProviderId, key: string) => Promise<void>;
		remove: (provider: CredentialProviderId) => Promise<void>;
		/** 切换模型 provider 启用状态；DeepSeek 在面板内本地拒绝，不会调用。 */
		toggle: (provider: CredentialProviderId, enabled: boolean) => Promise<void>;
		/** 成功后自动关闭延迟；测试可注入小值。 */
		autoCloseMs?: number;
	}) {
		this.#changed = options.changed;
		this.#closed = options.closed;
		this.#save = options.save;
		this.#remove = options.remove;
		this.#toggle = options.toggle;
		this.#autoCloseMs = options.autoCloseMs ?? AUTO_CLOSE_MS;
	}
	show(state: NekoCredentialState | undefined, subscribe: (fn: (state: NekoCredentialState) => void) => () => void) {
		this.#generation++;
		this.#clearCloseTimer();
		this.open = true;
		this.#level = "list";
		this.#busy = false;
		this.#confirmingRemove = false;
		this.#message = "";
		this.#inputs.clear();
		this.#filter = new Input({ prompt: "❯ ", placeholder: "Type to filter" });
		this.#index = 0;
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
		this.#inputs.clear();
		this.#filter = new Input({ prompt: "❯ ", placeholder: "Type to filter" });
		this.#unsubscribe?.();
		this.#unsubscribe = undefined;
		this.#closed();
		this.#changed();
	}
	invalidate() {}
	get #input(): Input {
		let input = this.#inputs.get(this.#provider);
		if (!input) {
			input = new Input();
			this.#inputs.set(this.#provider, input);
		}
		return input;
	}
	get #status(): CredentialStatus | undefined {
		return this.#state?.statuses[this.#provider];
	}
	#visible(): CredentialProviderSpec[] {
		const query = compact(this.#filter.getValue());
		if (query === "") return [...CREDENTIAL_PROVIDERS];
		return CREDENTIAL_PROVIDERS.filter((spec) => compact(`${spec.name} ${spec.id} ${spec.envVar}`).includes(query));
	}
	#isEnabled(spec: CredentialProviderSpec): boolean {
		return isLocked(spec.id) || this.#state?.statuses[spec.id]?.enabled === true;
	}
	handleInput(data: string) {
		if (isKeyRelease(data)) return;
		if (matchesKey(data, "ctrl+c")) {
			this.close();
			return;
		}
		if (this.#level === "list") this.#handleList(data);
		else this.#handleKey(data);
		this.#changed();
	}
	#handleList(data: string) {
		if (matchesKey(data, "escape")) {
			this.close();
			return;
		}
		if (this.#busy) return;
		const items = this.#visible();
		if (matchesKey(data, "up") || matchesKey(data, "down")) {
			const delta = matchesKey(data, "up") ? -1 : 1;
			this.#index = Math.max(0, Math.min(items.length - 1, this.#index + delta));
			this.#message = "";
		} else if (matchesKey(data, "space")) {
			const spec = items[this.#index];
			if (spec) void this.#toggleEnabled(spec);
		} else if (matchesKey(data, "enter")) {
			const spec = items[this.#index];
			if (!spec) return;
			this.#provider = spec.id as CredentialProviderId;
			this.#level = "key";
			this.#message = "";
		} else {
			const before = this.#filter.getValue();
			this.#filter.handleInput(data);
			if (this.#filter.getValue() !== before) {
				this.#index = 0;
				this.#message = "";
			}
		}
	}
	#handleKey(data: string) {
		if (matchesKey(data, "escape")) {
			// Saving, or a pending auto-close, means the panel is finished: Esc closes it instead of going back.
			if (this.#busy || this.#closeTimer !== undefined) this.close();
			else this.#backToList();
			return;
		}
		if (this.#busy) return;
		const confirming = this.#confirmingRemove;
		this.#confirmingRemove = false;
		if (confirming && !matchesKey(data, "ctrl+r")) this.#message = "";
		const input = this.#input;
		if (matchesKey(data, "enter")) void this.#apply(false);
		else if (matchesKey(data, "ctrl+r") && this.#status?.savedConfigured) {
			if (confirming) void this.#apply(true);
			else {
				this.#confirmingRemove = true;
				this.#message = "Press Ctrl+R again to remove the saved key.";
			}
		} else if (matchesKey(data, "tab")) this.#backToList();
		else {
			input.handleInput(data);
			if (input.getValue().length > 4096) input.setValue(input.getValue().slice(0, 4096));
		}
	}
	#backToList() {
		const index = this.#visible().findIndex((spec) => spec.id === this.#provider);
		if (index >= 0) this.#index = index;
		this.#level = "list";
		this.#confirmingRemove = false;
		this.#message = "";
	}
	async #toggleEnabled(spec: CredentialProviderSpec) {
		if (!isModelProvider(spec.id)) {
			this.#message = `${spec.name} is a web search credential and has no enable switch.`;
			return;
		}
		if (isLocked(spec.id)) {
			this.#message = `${spec.name} is always enabled.`;
			return;
		}
		const enable = !this.#isEnabled(spec);
		const generation = this.#generation;
		this.#busy = true;
		this.#message = enable ? "Enabling..." : "Disabling...";
		this.#changed();
		try {
			await this.#toggle(spec.id, enable);
			if (generation === this.#generation)
				this.#message = enable ? `${spec.name} enabled. Press Enter to add a key.` : `${spec.name} disabled.`;
		} catch (error) {
			if (generation === this.#generation)
				this.#message = error instanceof Error ? error.message : "Could not update the provider. Try again.";
		} finally {
			if (generation === this.#generation) {
				this.#busy = false;
				this.#changed();
			}
		}
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
				this.#inputs.set(provider, new Input());
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
	#frame(rows: string[], help: string, width: number): string[] {
		const body = Math.max(0, this.height - 1);
		while (rows.length < body) rows.push("");
		return [...rows.slice(0, body), help].map((line) =>
			theme.panel(` ${truncateToWidth(line, Math.max(1, width - 2), "...", true)} `),
		);
	}
	render(width: number): string[] {
		return this.#level === "list" ? this.#renderList(width) : this.#renderKey(width);
	}
	#renderList(width: number): string[] {
		const w = Math.max(1, width - 2);
		const items = this.#visible();
		this.#index = Math.max(0, Math.min(this.#index, items.length - 1));
		const selected = items[this.#index];
		const rows = [theme.accent(style.bold("Model providers and API keys"))];
		if (this.height >= 4) {
			this.#filter.focused = this.focused;
			rows.push(...this.#filter.render(w).slice(0, 1));
		}
		const showStatus = this.height >= 6;
		const entries: Entry[] = [];
		let group: string | undefined;
		for (const spec of items) {
			const next = spec.kind === "search" ? "Web search" : "Model providers";
			if (next !== group) entries.push({ header: next });
			group = next;
			entries.push({ spec });
		}
		const count = Math.max(1, this.height - rows.length - 1 - (showStatus ? 1 : 0));
		const at = entries.findIndex((entry) => "spec" in entry && entry.spec.id === selected?.id);
		const start = Math.max(0, Math.min(at - Math.floor(count / 2), entries.length - count));
		for (const entry of entries.slice(start, start + count)) {
			if ("header" in entry) {
				rows.push(theme.dim(` ${entry.header}`));
				continue;
			}
			const spec = entry.spec;
			const status = this.#state?.statuses[spec.id];
			const enabled = this.#isEnabled(spec);
			const mark = spec.kind === "model" ? (enabled ? "[x]" : "[ ]") : "   ";
			const right = status ? `${status.source} · env ${status.environmentConfigured ? "set" : "unset"}` : "loading";
			const leftWidth = Math.max(1, w - 3 - visibleWidth(right));
			const left = truncateToWidth(`${mark} ${spec.name}${isLocked(spec.id) ? " (always on)" : ""}`, leftWidth, "...");
			const label = `${left}${" ".repeat(Math.max(1, leftWidth - visibleWidth(left) + 1))}${right}`;
			if (spec === selected) rows.push(theme.selection(`❯ ${label}`));
			else rows.push(spec.kind === "model" && !enabled ? theme.dim(`  ${label}`) : `  ${label}`);
		}
		if (items.length === 0) rows.push("No matching providers");
		if (showStatus) {
			while (rows.length < this.height - 2) rows.push("");
			rows.push(this.#message || (selected ? theme.dim(`Environment variable: ${selected.envVar}`) : ""));
		}
		const help = this.#busy
			? shortcutHints(["Esc", "Close"])
			: shortcutHints(["↑↓", "Select"], ["Space", "Toggle"], ["Enter", "Key"], ["Esc", "Close"]);
		return this.#frame(rows, help, width);
	}
	#renderKey(width: number): string[] {
		const state = this.#status;
		const spec = CREDENTIAL_PROVIDERS.find((item) => item.id === this.#provider) ?? CREDENTIAL_PROVIDERS[0]!;
		const source = state?.source === "keyless" ? "keyless (rate-limited)" : (state?.source ?? "Loading...");
		const keyLength = this.#input.getValue().length;
		// 与 Input 组件同一习语：聚焦时发射零宽硬件光标标记 + fake cursor（无硬件光标时解析为反色块）。
		// 光标恒在固定星号之后，位置不随密钥长度变化；失焦时不渲染光标。
		const marker = this.focused ? CURSOR_MARKER : "";
		const keyRow =
			keyLength > 0
				? `API Key: ********${marker}${this.focused ? renderFakeCursor(" ") : ""} (${keyLength} characters)`
				: `API Key: ${marker}${this.focused ? `${renderFakeCursor("(")}paste key)` : "(paste key)"}`;
		const tag = spec.kind === "search" ? "web search" : this.#isEnabled(spec) ? "enabled" : "disabled";
		const defaultMessage = spec.keyless
			? `Without a key, ${spec.name} runs in rate-limited keyless mode.`
			: spec.kind === "model" && !this.#isEnabled(spec)
				? "Provider is disabled. Esc, then Space enables it."
				: "Saved key overrides environment.";
		const provider = `Provider: ${spec.name} (${tag})`;
		const message = this.#message || defaultMessage;
		const environment = `Environment: ${spec.envVar} ${state ? (state.environmentConfigured ? "Configured" : "Not configured") : "Loading..."}`;
		const sourceRow = `Active source: ${source}`;
		// 小窗口先保住提供方、密钥行与状态消息。
		const rows =
			this.height - 1 >= 6
				? [provider, environment, sourceRow, keyRow, message, spec.signupUrl]
				: [provider, keyRow, message, environment, sourceRow, spec.signupUrl];
		const help = this.#busy
			? shortcutHints(["Esc", "Close"])
			: this.#confirmingRemove
				? shortcutHints(["Ctrl+R", "Confirm remove"], ["Esc", "Back"])
				: state?.savedConfigured
					? shortcutHints(["Enter", "Save"], ["Ctrl+R", "Remove"], ["Tab", "Providers"], ["Esc", "Back"])
					: shortcutHints(["Enter", "Save"], ["Tab", "Providers"], ["Esc", "Back"]);
		return this.#frame(rows, help, width);
	}
}
