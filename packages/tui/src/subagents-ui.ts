import { type Component, matchesKey } from "@earendil-works/pi-tui";
import { type ChatItem, type ChatView, type Delegation, mergeTranscriptItems } from "@neko-harness/core";
import { downloadImage } from "@neko-harness/core/image-transfer";
import type { NekoGatewayConnection } from "@neko-harness/gateway/client-session";
import { AssistantMessageComponent } from "./components/assistant-message.ts";
import { HistoryImage } from "./components/history-image.ts";
import type { PickerDetail, PickerPanel } from "./components/picker.ts";
import { shortcutHints } from "./components/shortcut-hints.ts";
import { ThemedText } from "./components/themed-text.ts";
import { ToolExecutionComponent } from "./components/tool-execution.ts";
import { UserMessageComponent } from "./components/user-message.ts";
import { theme } from "./theme/index.ts";

const labels = { queued: "Queued", running: "Running", completed: "Done", failed: "Failed", cancelled: "Stopped" };
export const subagentItems = (entries: readonly Delegation[]) =>
	entries.map((d) => ({
		value: String(d.taskId),
		label: `${d.role} · ${d.title}`,
		description: `${d.historyThrough !== undefined ? "Snapshot · " : ""}${labels[d.status]}`,
		rightLabel: d.approvalCount ? `Approval ${d.approvalCount}` : labels[d.status],
	}));
export class SubagentDetail implements PickerDetail {
	get help() {
		const canStop =
			this.entry?.historyThrough === undefined && (this.entry?.status === "running" || this.entry?.status === "queued");
		return shortcutHints(
			["←", "Main"],
			["↑↓/Wheel", "Scroll"],
			["E", "Expand"],
			...(canStop ? [["S", "Stop"] as const] : []),
		);
	}
	#view: ChatView | undefined;
	#entries = new Map<string, ChatItem>();
	#components = new Map<string, Component>();
	#images = new Map<string, HistoryImage>();
	#offset = 0;
	#maxOffset = 0;
	#pageSize = 10;
	#prependOffset: number | undefined;
	#follow = true;
	#expanded = false;
	#before: number | null | undefined;
	#error = "";
	#loading = false;
	#stop: (() => void) | undefined;
	#service: ReturnType<NekoGatewayConnection["subagent"]>;
	#changed: () => void;
	#panel: PickerPanel;
	#active = false;
	entry: Delegation | undefined;
	#epoch = 0;
	constructor(client: NekoGatewayConnection, taskId: number, panel: PickerPanel, changed: () => void) {
		this.#service = client.subagent(taskId);
		this.#changed = changed;
		this.#panel = panel;
	}
	open() {
		if (this.#active) return this;
		this.#epoch++;
		this.#before = undefined;
		this.#active = true;
		this.#stop = this.#service.view.subscribe((view) => {
			if (!this.#active) return;
			this.#error = this.#service.error ?? "";
			if (!view) {
				this.#changed();
				return;
			}
			if (this.#entries.size && !view.items.some((item) => this.#entries.has(item.key)))
				this.#before = view.historyBefore;
			this.#view = view;
			if (this.#before === undefined) this.#before = view.historyBefore;
			this.#entries = new Map(
				mergeTranscriptItems([...this.#entries.values()], view.items).map((item) => [item.key, item]),
			);
			this.#changed();
		});
		return this;
	}
	close() {
		this.#epoch++;
		this.#active = false;
		this.#stop?.();
		this.#stop = undefined;
		for (const image of this.#images.values()) image.setVisible(false);
	}
	async history() {
		if (this.#loading || this.#before == null) return;
		this.#loading = true;
		const epoch = this.#epoch;
		try {
			const result = await this.#service.history(this.#before === undefined ? {} : { before: this.#before });
			if (!this.#active || epoch !== this.#epoch) return;
			this.#prependOffset = this.#maxOffset;
			this.#entries = new Map(
				mergeTranscriptItems([...this.#entries.values()], result.items).map((item) => [item.key, item]),
			);
			this.#before = result.next;
			this.#follow = false;
		} catch (e) {
			if (this.#active) this.#error = String(e);
		} finally {
			this.#loading = false;
			this.#changed();
		}
	}
	scroll(delta: number) {
		this.#offset = Math.max(0, Math.min(this.#maxOffset, this.#offset + delta));
		this.#follow = delta > 0 && this.#offset === this.#maxOffset;
		if (delta < 0 && this.#offset === 0) void this.history();
	}
	handleKey(data: string) {
		if (matchesKey(data, "up")) {
			this.scroll(-1);
		} else if (matchesKey(data, "down")) {
			this.scroll(1);
		} else if (matchesKey(data, "pageUp")) {
			this.scroll(-this.#pageSize);
		} else if (matchesKey(data, "pageDown")) {
			this.scroll(this.#pageSize);
		} else if (data.toLowerCase() === "e") {
			this.#expanded = !this.#expanded;
			for (const component of this.#components.values()) {
				if (component instanceof ToolExecutionComponent) component.setExpanded(this.#expanded);
				if (component instanceof AssistantMessageComponent) component.setThinkingExpanded(this.#expanded);
			}
		} else if (
			data.toLowerCase() === "s" &&
			this.entry?.historyThrough === undefined &&
			(this.entry?.status === "running" || this.entry?.status === "queued")
		)
			this.#panel.showDetail({
				help: shortcutHints(["Enter", "Stop"], ["Esc", "Back"]),
				lines: () => [theme.warning("Stop this task? Existing changes will be kept.")],
				handleKey: (key) => {
					if (!matchesKey(key, "enter")) return false;
					void this.#service
						.stop(null)
						.catch((e) => {
							this.#error = String(e);
						})
						.finally(() => {
							this.#panel.popDetail();
							this.#changed();
						});
					return true;
				},
			});
		else return false;
		return true;
	}
	#component(item: ChatItem): Component {
		let existing = this.#components.get(item.key);
		if (!existing) {
			existing =
				item.type === "assistant"
					? new AssistantMessageComponent()
					: item.type === "tool"
						? new ToolExecutionComponent(item)
						: item.type === "user"
							? new UserMessageComponent(item.text, item.skill, item.defaultImagePrompt)
							: new ThemedText(item.text, theme.dim, 1, 0);
			this.#components.set(item.key, existing);
			if (existing instanceof ToolExecutionComponent) existing.setExpanded(this.#expanded);
			if (existing instanceof AssistantMessageComponent) existing.setThinkingExpanded(this.#expanded);
		}
		if (item.type === "assistant" && existing instanceof AssistantMessageComponent)
			existing.updateContent({ thinking: item.thinking, text: item.text, note: item.note });
		if (item.type === "tool" && existing instanceof ToolExecutionComponent) existing.sync(item);
		return existing;
	}
	lines(width: number, height: number): readonly string[] {
		this.#pageSize = Math.max(1, height - 1);
		const entry = this.entry;
		const rows: string[] = entry
			? [
					theme.accent(`${entry.role} · ${entry.title}`),
					theme.dim(
						`${entry.historyThrough !== undefined ? "Snapshot · " : ""}${labels[entry.status]} · ${Math.max(0, Math.round(((entry.endedAt ?? Date.now()) - entry.createdAt) / 1000))}s`,
					),
					"",
				]
			: [];
		if (this.#view)
			rows.push(
				theme.dim(
					`In ${this.#view.usage.input} · Out ${this.#view.usage.output} · $${this.#view.usage.cost.toFixed(4)}`,
				),
				"",
			);
		const imageRows: { image: HistoryImage; start: number; end: number }[] = [];
		for (const item of [...this.#entries.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
			rows.push(...this.#component(item).render(width));
			if (item.type === "tool") {
				for (const approval of this.#view?.approvals ?? [])
					if (approval.callId === item.callId && approval.status !== "pending")
						rows.push(
							theme.dim(
								`Approval: ${approval.status === "allowed" ? "Allowed once" : approval.status === "denied" ? "Denied" : "Cancelled"}`,
							),
						);
			}
			rows.push("");
			if (item.type === "user" || item.type === "tool")
				for (const image of item.images ?? []) {
					const key = `${image.entryId}:${image.contentIndex}`;
					let component = this.#images.get(key);
					if (!component) {
						component = new HistoryImage(
							image,
							() =>
								downloadImage((offset) =>
									this.#service.getImage({ entryId: image.entryId, contentIndex: image.contentIndex, offset }),
								),
							this.#changed,
						);
						this.#images.set(key, component);
					}
					const start = rows.length;
					rows.push(...component.measure(width));
					imageRows.push({ image: component, start, end: rows.length });
				}
		}
		const stream = this.#view?.streaming;
		if (stream) {
			let component = this.#components.get("live");
			if (!(component instanceof AssistantMessageComponent)) {
				component = new AssistantMessageComponent();
				this.#components.set("live", component);
			}
			(component as AssistantMessageComponent).updateContent(
				{ thinking: stream.thinking, text: stream.text, note: null },
				true,
			);
			rows.push(...component.render(width));
			for (const call of stream.toolCalls) {
				const saved = [...this.#entries.values()].find((i) => i.type === "tool" && i.callId === call.callId);
				if (saved) continue;
				rows.push(
					...new ToolExecutionComponent({ ...call, isError: false, result: null, durationMs: null, note: null }).render(
						width,
					),
				);
			}
		}
		if (this.#error) rows.push(theme.error(this.#error));
		if (!rows.length) rows.push(theme.dim("Loading..."));
		this.#maxOffset = Math.max(0, rows.length - height);
		if (this.#prependOffset !== undefined) {
			this.#offset += Math.max(0, this.#maxOffset - this.#prependOffset);
			this.#prependOffset = undefined;
		}
		this.#offset = this.#follow ? this.#maxOffset : Math.min(this.#offset, this.#maxOffset);
		for (const image of imageRows) {
			image.image.setVisible(this.#active && image.start < this.#offset + height && image.end > this.#offset);
			rows.splice(image.start, image.end - image.start, ...image.image.render(width));
		}
		return rows.slice(this.#offset, this.#offset + height);
	}
}
