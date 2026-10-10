import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { ModelThinkingLevel } from "@earendil-works/pi-ai";
import {
	CombinedAutocompleteProvider,
	Container,
	matchesKey,
	ProcessTerminal,
	ScrollView,
	Spacer,
	Text,
	TruncatedText,
	TuiAltScreen,
} from "@earendil-works/pi-tui";
import type {
	ChatItem,
	ChatView,
	NekoModelInfo,
	NekoModelRef,
	StreamingToolCall,
	StreamingView,
} from "@neko-harness/core";
import { normalizeWorkspace } from "@neko-harness/core";
import { AssistantMessageComponent } from "./components/assistant-message.ts";
import { BoundedEditor } from "./components/editor.ts";
import { StatusFooter, usageText } from "./components/footer.ts";
import { LoginPanel } from "./components/login.ts";
import { PickerPanel } from "./components/picker.ts";
import { type ToolCardState, ToolExecutionComponent } from "./components/tool-execution.ts";
import { UserMessageComponent } from "./components/user-message.ts";
import { detectColorFgBgMode, queryTerminalMode } from "./detect-theme.ts";
import { formatTokens } from "./format.ts";
import { connectToGateway, type NekoTuiGateway } from "./gateway.ts";
import { commands } from "./labels.ts";
import { createAppLayout, usableSize } from "./layout.ts";
import {
	getActiveThemeMode,
	getEditorTheme,
	setActiveTheme,
	type ThemeMode,
	type ThemePreference,
	theme,
} from "./theme.ts";
import { recentlyVisited, sessionPickerItems } from "./workspace.ts";

export type NekoTuiOptions = {
	/** 新会话工具的工作目录；默认 process.cwd()。 */
	readonly cwd?: string;
	/** gateway Unix socket 路径；默认按配置/数据目录解析。 */
	readonly socketPath?: string;
	/** 存储文件路径：解析默认 socket + 透传给拉起的 gateway。 */
	readonly storagePath?: string;
	/** 模型；默认内置 DeepSeek 模型（透传给拉起的 gateway）。 */
	readonly model?: NekoModelRef;
	/** 主题：light / dark / auto（默认 auto，按终端背景自动选择）。 */
	readonly theme?: ThemePreference;
};

type ChatFacade = Awaited<ReturnType<NekoTuiGateway["client"]["attach"]>>;

const EXIT_COMMANDS = new Set(["/exit", "/quit"]);
const SESSIONS_COMMANDS = new Set(["/sessions", "/session"]);
const NEW_SESSION_VALUE = "__new__";
/** /think 接受的 thinking level（pi-ai ModelThinkingLevel）。 */

type ItemEntry =
	| { readonly kind: "user"; readonly component: UserMessageComponent }
	| { readonly kind: "assistant"; readonly component: AssistantMessageComponent }
	| { readonly kind: "tool"; readonly component: ToolExecutionComponent }
	| { readonly kind: "system"; readonly component: Text };

/**
 * neko 终端界面：gateway 客户端（design D3/D4），底部输入框 + 消息区（流式渲染）+
 * 工具卡片 + 状态栏。数据来自 neko.chat 的 ChatView 投影订阅；会话目录/管理经
 * neko.session-directory / neko.session-management。
 */
class NekoTuiApp {
	readonly #gateway: NekoTuiGateway;
	readonly #options: NekoTuiOptions;
	readonly #ui: TuiAltScreen;
	readonly #chat = new Container();
	readonly #notices = new Container();
	readonly #terminal = new ProcessTerminal();
	readonly #panel: PickerPanel;
	readonly #login: LoginPanel;
	#thinkingModel: string | undefined;
	#sessionPanelTimer: ReturnType<typeof setInterval> | undefined;
	#sessionOperation = false;
	#noticeTimer: ReturnType<typeof setTimeout> | undefined;
	readonly #editor: BoundedEditor;
	readonly #footer = new StatusFooter();

	#chatFacade: ChatFacade | undefined;
	#sessionId = "";
	#viewUnsubscribe: (() => void) | undefined;
	#directoryUnsubscribe: (() => void) | undefined;

	/** 已渲染条目 key 序列（前缀比较检测重建）。 */
	#renderedKeys: string[] = [];
	#items = new Map<string, ItemEntry>();
	#toolCards = new Map<string, ToolExecutionComponent>();
	#streamingComp: AssistantMessageComponent | undefined;
	#transcript: ScrollView | undefined;
	#busyText: string | undefined;
	#lastView: ChatView | undefined;
	#applying = false;
	#applyQueued = false;
	#terminalSchemeUnsubscribe: (() => void) | undefined;
	#themePreference: ThemePreference;
	#exited: Promise<void>;
	#resolveExit: () => void = () => {};
	#exitStarted = false;

	constructor(gateway: NekoTuiGateway, options: NekoTuiOptions, themePreference: ThemePreference) {
		this.#gateway = gateway;
		this.#options = options;
		this.#themePreference = themePreference;
		// 首帧前的临时主题：auto 先用 COLORFGBG（无则浅色），OSC 11 应答后再修正。
		setActiveTheme(themePreference === "auto" ? (detectColorFgBgMode() ?? "light") : themePreference);
		this.#ui = new TuiAltScreen(this.#terminal);
		this.#editor = new BoundedEditor(this.#ui, getEditorTheme(), { paddingX: 1, autocompleteMaxVisible: 3 });
		this.#panel = new PickerPanel(
			() => this.#ui.requestRender(),
			() => {
				this.#thinkingModel = undefined;
				clearInterval(this.#sessionPanelTimer);
				this.#sessionPanelTimer = undefined;
				this.#ui.setFocus(this.#editor);
			},
		);
		this.#login = new LoginPanel({
			changed: () => this.#ui.requestRender(),
			closed: () => this.#ui.setFocus(this.#editor),
			save: (key) => this.#gateway.client.credentials.save({ key }, BACKGROUND_CONTEXT),
			remove: () => this.#gateway.client.credentials.remove(BACKGROUND_CONTEXT),
		});
		this.#editor.setAutocompleteProvider(new CombinedAutocompleteProvider(commands, options.cwd ?? process.cwd()));
		this.#editor.onSubmit = (text) => {
			this.submit(text);
		};
		this.#exited = new Promise<void>((resolve) => {
			this.#resolveExit = resolve;
		});
		this.#ui.addInputListener((data) => {
			if (!usableSize(this.#terminal.columns, this.#terminal.rows)) {
				if (matchesKey(data, "ctrl+c")) this.exit();
				return { consume: true };
			}
			if (this.#panel.open || this.#login.open) {
				// Let focused-component dispatch filter key releases before handling panel input.
				return undefined;
			}
			if (this.#sessionOperation) return { consume: true };
			if (matchesKey(data, "ctrl+c")) {
				if (this.#busyText !== undefined) this.abort();
				else this.exit();
				return { consume: true };
			}
			// 会话浮层打开时把 Escape 留给浮层（SelectList 取消）。
			if (matchesKey(data, "escape") && this.#busyText !== undefined) {
				this.abort();
				return { consume: true };
			}
			if (matchesKey(data, "ctrl+s")) {
				this.openSessionsOverlay();
				return { consume: true };
			}
			if (this.#busyText !== undefined && matchesKey(data, "alt+enter")) {
				this.submitFollowUp();
				return { consume: true };
			}
			return undefined;
		});
	}

	async run(initialSessionId: string): Promise<void> {
		const picker = this.#panel,
			login = this.#login;
		const content = new Container();
		content.addChild(this.#chat);
		this.#transcript = new ScrollView(content, { follow: "end", primary: true, overscroll: "chain" });
		this.#ui.setLayoutRoot(
			createAppLayout({
				transcript: this.#transcript,
				panel: {
					get height() {
						return picker.height;
					},
					set height(value: number) {
						picker.height = value;
						login.height = value;
					},
					render: (width: number) => {
						const active = this.#login.open ? this.#login : this.#panel;
						return active.render(width);
					},
					invalidate: () => {},
				},
				editor: this.#editor,
				footer: this.#footer,
				notices: this.#notices,
				panelOpen: () => this.#panel.open || this.#login.open,
			}),
		);
		this.#ui.setFocus(this.#editor);

		this.#directoryUnsubscribe = this.#gateway.client.directory.state.subscribe(() => {
			if (this.#sessionPanelTimer) this.#panel.update(this.sessionItems());
			this.#ui.requestRender();
		});
		await this.switchSession(initialSessionId);
		this.#ui.start();
		this.#ui.requestRender(true);
		this.#startThemeDetection();
		await this.#exited;
		this.#viewUnsubscribe?.();
		this.#directoryUnsubscribe?.();
		clearInterval(this.#sessionPanelTimer);
		this.#terminalSchemeUnsubscribe?.();
		this.#closeOverlay();
		clearTimeout(this.#noticeTimer);
		this.#ui.stop();
	}

	// —— 提交与运行控制 ——

	/**
	 * Enter 提交。空闲：正常提交；忙碌：steer（插入当前工具轮之后）。
	 * 斜杠命令：/exit、/quit、/sessions、/model、/think <level>、/fork、/archive。
	 */
	submit(text: string): void {
		const trimmed = text.trim();
		if (trimmed === "") return;
		if (EXIT_COMMANDS.has(trimmed)) {
			this.exit();
			return;
		}
		if (SESSIONS_COMMANDS.has(trimmed)) {
			this.openSessionsOverlay();
			return;
		}
		if (trimmed === "/login") {
			if (!this.#panel.open && !this.#login.open) {
				const service = this.#gateway.client.credentials;
				this.#login.show(service.state.value, (fn) => service.state.subscribe(fn));
				this.#ui.setFocus(this.#login);
			}
			return;
		}
		if (trimmed.startsWith("/login ")) {
			this.addNotice("Use /login, then paste your key in the protected field.", true);
			return;
		}
		if (trimmed === "/model") {
			void this.openModelOverlay();
			return;
		}
		if (trimmed.startsWith("/think")) {
			void this.configureThinking(trimmed.slice("/think".length).trim());
			return;
		}
		if (trimmed === "/fork") {
			void this.#manage(() => this.forkSession());
			return;
		}
		if (trimmed === "/archive") {
			void this.#manage(() => this.archiveSession());
			return;
		}
		const chat = this.#chatFacade;
		if (chat === undefined) return;
		if (
			this.#lastView?.agent.model?.provider === "deepseek" &&
			this.#gateway.client.credentials.state.value?.source === "none"
		) {
			this.#editor.setText(text);
			this.addNotice("Configure DeepSeek with /login before sending.", true);
			return;
		}
		chat
			.submit({ content: trimmed, ...(this.#busyText !== undefined ? { whenBusy: "steer" } : {}) }, BACKGROUND_CONTEXT)
			.catch((error: unknown) => this.addNotice(messageOf(error), true));
	}

	/** Alt+Enter（忙碌时）：follow-up，排队等当前 run 结束。 */
	submitFollowUp(): void {
		const chat = this.#chatFacade;
		if (chat === undefined) return;
		const trimmed = this.#editor.getText().trim();
		if (trimmed === "") return;
		this.#editor.setText("");
		chat.submit({ content: trimmed, whenBusy: "followUp" }, BACKGROUND_CONTEXT).catch((error: unknown) => {
			this.addNotice(messageOf(error), true);
		});
	}

	abort(): void {
		const chat = this.#chatFacade;
		if (chat === undefined) return;
		chat.abort(BACKGROUND_CONTEXT).catch((error: unknown) => this.addNotice(messageOf(error), true));
	}

	exit(): void {
		if (this.#exitStarted) return;
		this.#exitStarted = true;
		this.#resolveExit();
	}

	// —— 会话管理 ——

	/** 切换 attach 的会话：重建转录（提交后的状态为准，重连即取最新快照）。 */
	async switchSession(id: string): Promise<void> {
		this.#viewUnsubscribe?.();
		this.#viewUnsubscribe = undefined;
		const facade = await this.#gateway.client.attach(id);
		this.#chatFacade = facade;
		this.#sessionId = id;
		this.#resetTranscript();
		const view = facade.view;
		if (view.value !== undefined) this.applyView(view.value);
		this.#viewUnsubscribe = view.subscribe(() => {
			this.scheduleApply();
		});
		this.#syncEditorBorder();
		this.#ui.requestRender(true);
	}

	async #manage(operation: () => Promise<void>): Promise<void> {
		if (this.#sessionOperation) return;
		this.#sessionOperation = true;
		try {
			await operation();
		} catch (error) {
			this.addNotice(`Session operation failed: ${messageOf(error)}`, true);
		} finally {
			this.#sessionOperation = false;
		}
	}
	async createSession(): Promise<void> {
		const created = await this.#gateway.client.management.create(
			{ ...(this.#options.cwd !== undefined ? { cwd: this.#options.cwd } : {}) },
			BACKGROUND_CONTEXT,
		);
		await this.switchSession(created.id);
	}

	async forkSession(): Promise<void> {
		const forked = await this.#gateway.client.management.fork(this.#sessionId, BACKGROUND_CONTEXT);
		await this.switchSession(forked.id);
	}

	async archiveSession(): Promise<void> {
		const current = this.#sessionId;
		await this.#gateway.client.management.archive(current, BACKGROUND_CONTEXT);
		const next = recentlyVisited(this.#gateway.client.directory.state.value?.sessions ?? [], this.#options.cwd!).find(
			(s) => s.id !== current,
		);
		if (next) await this.switchSession(next.id);
		else await this.createSession();
	}

	// —— 会话浮层 ——

	private sessionItems() {
		return [
			{ value: NEW_SESSION_VALUE, label: "+ New session", description: this.#options.cwd },
			...sessionPickerItems(
				this.#gateway.client.directory.state.value?.sessions ?? [],
				this.#options.cwd!,
				this.#sessionId,
			),
		];
	}
	openSessionsOverlay(): void {
		if (this.#exitStarted || this.#panel.open || this.#login.open) return;
		void this.#panel.show(
			`Sessions · ${this.#options.cwd}`,
			async () => this.sessionItems(),
			async (value) => {
				if (value === NEW_SESSION_VALUE) await this.createSession();
				else if (value !== this.#sessionId) await this.switchSession(value);
			},
		);
		this.#sessionPanelTimer = setInterval(() => this.#panel.update(this.sessionItems()), 60_000);
		this.#ui.setFocus(this.#panel);
	}

	async openModelOverlay(): Promise<void> {
		if (this.#exitStarted || this.#panel.open || this.#login.open) return;
		const chat = this.#chatFacade;
		const current = this.#lastView?.agent.model;
		const currentKey = current ? `${current.provider}/${current.modelId}` : null;
		let models: readonly NekoModelInfo[] = [];
		const ready = this.#panel.show(
			"Models",
			async () => {
				models = await this.#gateway.client.listModels();
				return [...models]
					.sort((a, b) => Number(keyOf(b) === currentKey) - Number(keyOf(a) === currentKey))
					.map((model) => ({
						value: keyOf(model),
						label: `${model.name}${keyOf(model) === currentKey ? " (Current)" : ""}`,
						description: `${keyOf(model)} | ${formatContextWindow(model.contextWindow)} context${model.reasoning ? " | Thinking" : ""}`,
					}));
			},
			async (value) => {
				const selected = models.find((m) => keyOf(m) === value);
				if (selected && value !== currentKey)
					await chat?.configure(
						{ model: { provider: selected.provider, modelId: selected.modelId } },
						BACKGROUND_CONTEXT,
					);
			},
		);
		this.#ui.setFocus(this.#panel);
		await ready;
	}

	async configureThinking(raw: string): Promise<void> {
		if (this.#panel.open || this.#login.open) return;
		const chat = this.#chatFacade;
		const ref = this.#lastView?.agent.model;
		if (!chat || !ref) return;
		try {
			const model = (await this.#gateway.client.listModels()).find(
				(m) => m.provider === ref.provider && m.modelId === ref.modelId,
			);
			if (chat !== this.#chatFacade || this.#exitStarted || this.#panel.open || this.#login.open || !model) return;
			if (raw) {
				const level = model.supportedThinkingLevels.find((value) => value === raw);
				if (!level) {
					this.addNotice(`Available levels: ${model.supportedThinkingLevels.join(" / ")}`, true);
					return;
				}
				await chat.configure({ thinkingLevel: level }, BACKGROUND_CONTEXT);
			} else {
				this.#thinkingModel = keyOf(model);
				void this.#panel.show(
					"Thinking level",
					async () =>
						model.supportedThinkingLevels.map((level) => ({
							value: level,
							label: `${level}${level === this.#lastView?.agent.thinkingLevel ? " (Current)" : ""}`,
						})),
					async (value) => {
						await chat.configure({ thinkingLevel: value as ModelThinkingLevel }, BACKGROUND_CONTEXT);
					},
				);
				this.#ui.setFocus(this.#panel);
			}
		} catch {
			this.addNotice("Failed to configure thinking level. Try again.", true);
		}
	}

	#closeOverlay(): void {
		if (this.#panel.open) this.#panel.close();
		if (this.#login.open) this.#login.close();
		this.#ui.setFocus(this.#editor);
	}

	// —— 视图渲染 ——

	addNotice(text: string, isError = false): void {
		clearTimeout(this.#noticeTimer);
		this.#noticeTimer = setTimeout(() => {
			this.#notices.clear();
			this.#ui.requestRender();
		}, 5000);
		this.#notices.clear();
		this.#notices.addChild(new TruncatedText(isError ? theme.error(text) : theme.dim(text), 1, 0));

		this.#ui.requestRender();
	}

	/** 同一 tick 内的多次推送合并为一次渲染。 */
	scheduleApply(): void {
		if (this.#applying) {
			this.#applyQueued = true;
			return;
		}
		this.#applying = true;
		setImmediate(() => {
			this.#applying = false;
			if (this.#exitStarted) return;
			const again = this.#applyQueued;
			this.#applyQueued = false;
			const view = this.#chatFacade?.view.value;
			if (view !== undefined) this.applyView(view);
			if (again) this.scheduleApply();
		});
	}

	applyView(view: ChatView): void {
		this.#lastView = view;
		if (this.#thinkingModel && this.#thinkingModel !== `${view.agent.model?.provider}/${view.agent.model?.modelId}`) {
			this.#panel.close();
			this.addNotice("Model changed. Open /think to choose its supported levels.");
		}
		this.#syncItems(view);
		this.#syncStreaming(view.streaming);
		this.#syncBusy(view);
		this.#syncFooter(view);
		if (this.#transcript !== undefined && this.#streamingComp !== undefined) this.#transcript.scrollToEnd();
		this.#ui.requestRender();
	}

	#syncItems(view: ChatView): void {
		const items = view.items;
		const keys = items.map((item) => item.key);
		const rendered = this.#renderedKeys;
		if (rendered.length > keys.length || rendered.some((key, index) => key !== keys[index])) {
			this.#resetTranscript();
		}
		// 流式工具调用按 callId 覆盖条目里的静态相位（pi.live 的运行输出）。
		const streamByCall = new Map<string, StreamingToolCall>();
		for (const call of view.streaming?.toolCalls ?? []) streamByCall.set(call.callId, call);
		for (const item of items) {
			const existing = this.#items.get(item.key);
			if (existing !== undefined) {
				this.#updateItem(existing, item, item.type === "tool" ? streamByCall.get(item.callId) : undefined);
			} else {
				this.#appendItem(item);
			}
			if (item.type === "tool") streamByCall.delete(item.callId);
		}
		// 条目还没提交的工具调用（assistant entry 未落库）：暂存卡片，条目到达后由条目路径接管。
		for (const call of streamByCall.values()) {
			this.#toolCard(call).sync(streamingCardState(call));
		}
		this.#renderedKeys = keys;
	}

	#appendItem(item: ChatItem): void {
		if (item.type === "user" || item.type === "system") this.#chat.addChild(new Spacer(1));
		if (item.type === "user") {
			const component = new UserMessageComponent(item.text);
			this.#chat.addChild(component);
			this.#items.set(item.key, { kind: "user", component });
			return;
		}
		if (item.type === "assistant") {
			const component = new AssistantMessageComponent(assistantContent(item), false);
			this.#chat.addChild(component);
			this.#items.set(item.key, { kind: "assistant", component });
			return;
		}
		if (item.type === "tool") {
			const component = this.#toolCard({
				callId: item.callId,
				name: item.name,
				summary: item.summary,
				detail: item.detail,
				phase: item.phase,
				output: item.output,
			});
			component.sync(item);
			this.#items.set(item.key, { kind: "tool", component });
			return;
		}
		const component = new Text(theme.dim(item.text), 1, 0);
		this.#chat.addChild(component);
		this.#items.set(item.key, { kind: "system", component });
	}

	#updateItem(entry: ItemEntry, item: ChatItem, streamCall: StreamingToolCall | undefined): void {
		if (entry.kind === "user" && item.type === "user") {
			entry.component.setText(item.text);
			return;
		}
		if (entry.kind === "assistant" && item.type === "assistant") {
			entry.component.updateContent(assistantContent(item), false);
			return;
		}
		if (entry.kind === "tool" && item.type === "tool") {
			entry.component.sync(mergeStream(item, streamCall));
			return;
		}
		if (entry.kind === "system" && item.type === "system") {
			entry.component.setText(theme.dim(item.text));
		}
	}

	/** 工具卡片（按 callId 复用）：流式暂存与最终条目共享同一组件。 */
	#toolCard(call: {
		readonly callId: string;
		readonly name: string;
		readonly summary: string;
		readonly detail: string | null;
		readonly phase: "pending" | "running" | "done";
		readonly output: string | null;
	}): ToolExecutionComponent {
		const existing = this.#toolCards.get(call.callId);
		if (existing !== undefined) return existing;
		const component = new ToolExecutionComponent(streamingCardState(call));
		this.#chat.addChild(component);
		this.#toolCards.set(call.callId, component);
		this.#items.set(`t${call.callId}`, { kind: "tool", component });
		return component;
	}

	#syncStreaming(streaming: StreamingView | null): void {
		if (streaming === null) {
			if (this.#streamingComp !== undefined) {
				this.#chat.removeChild(this.#streamingComp);
				this.#streamingComp = undefined;
			}
			return;
		}
		if (this.#streamingComp === undefined) {
			this.#streamingComp = new AssistantMessageComponent();
			this.#chat.addChild(this.#streamingComp);
		}
		this.#streamingComp.updateContent({ thinking: streaming.thinking, text: streaming.text, note: null }, true);
	}

	#syncBusy(view: ChatView): void {
		this.#busyText = view.busy ? (view.status ?? "Thinking...") : undefined;
		this.#syncEditorBorder();
	}

	#syncEditorBorder(): void {
		this.#editor.borderColor = this.#busyText !== undefined ? theme.accent : theme.dim;
	}

	#syncFooter(view: ChatView): void {
		this.#footer.setStats({
			model: view.model,
			thinkingLevel: view.agent.thinkingLevel,
			busy: this.#busyText,
			usageText: usageText(view.usage.input, view.usage.output, view.usage.cacheRead, view.usage.cost),
			cwd: view.cwd,
		});
	}

	#resetTranscript(): void {
		this.#chat.clear();
		this.#items.clear();
		this.#toolCards.clear();
		this.#streamingComp = undefined;
		this.#renderedKeys = [];
		this.#busyText = undefined;
	}

	// —— 主题 ——

	/** auto：首帧后异步查询终端背景（不阻塞启动），并跟随终端后续的主题变化通知。 */
	#startThemeDetection(): void {
		if (this.#themePreference !== "auto") return;
		this.#ui.setTerminalColorSchemeNotifications(true);
		this.#terminalSchemeUnsubscribe = this.#ui.onTerminalColorSchemeChange((scheme) => {
			this.#applyThemeMode(scheme);
		});
		void queryTerminalMode(this.#ui, (late) => {
			this.#applyThemeMode(late);
		}).then(
			(mode) => this.#applyThemeMode(mode),
			() => {},
		);
	}

	#applyThemeMode(mode: ThemeMode): void {
		if (this.#exitStarted || mode === getActiveThemeMode()) return;
		setActiveTheme(mode);
		this.#ui.invalidate();
		if (this.#lastView !== undefined) {
			this.#syncBusy(this.#lastView);
			this.#syncFooter(this.#lastView);
		}
		this.#ui.requestRender(true);
	}
}

function assistantContent(item: Extract<ChatItem, { type: "assistant" }>): {
	readonly thinking: string;
	readonly text: string;
	readonly note: string | null;
} {
	return { thinking: item.thinking, text: item.text, note: item.note };
}

/** 条目状态合流式槽位：执行中的工具以 pi.live 的相位与部分输出为准。 */
function mergeStream(
	item: Extract<ChatItem, { type: "tool" }>,
	streamCall: StreamingToolCall | undefined,
): ToolCardState {
	if (streamCall !== undefined && streamCall.phase !== "done") {
		return { ...item, phase: streamCall.phase, output: streamCall.output };
	}
	return item;
}

function streamingCardState(call: {
	readonly name: string;
	readonly summary: string;
	readonly detail: string | null;
	readonly phase: "pending" | "running" | "done";
	readonly output: string | null;
}): ToolCardState {
	return {
		name: call.name,
		summary: call.summary,
		detail: call.detail,
		phase: call.phase,
		isError: false,
		output: call.output,
		result: null,
		durationMs: null,
		note: null,
	};
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function keyOf(model: NekoModelInfo): string {
	return `${model.provider}/${model.modelId}`;
}

function formatContextWindow(tokens: number): string {
	return formatTokens(tokens);
}

/** 打开 neko 终端界面；用户退出（/exit 或 Ctrl+C）后 resolve。 */
export async function runTui(options: NekoTuiOptions = {}): Promise<void> {
	options = { ...options, cwd: normalizeWorkspace(options.cwd) };
	const gateway = await connectToGateway({
		...(options.socketPath !== undefined ? { socketPath: options.socketPath } : {}),
		...(options.storagePath !== undefined ? { storagePath: options.storagePath } : {}),
		...(options.model !== undefined ? { model: options.model } : {}),
		configDir: options.cwd,
	});
	try {
		const initial = await initialSessionId(gateway, options.cwd!);
		const app = new NekoTuiApp(gateway, options, options.theme ?? "auto");
		await app.run(initial);
	} finally {
		await gateway.close();
	}
}

/** 初始会话：目录里最早创建的（root 最小 id）；目录为空则新建。 */
export async function initialSessionId(gateway: NekoTuiGateway, cwd: string): Promise<string> {
	const state = gateway.client.directory.state;
	const start = Date.now();
	while (state.value === undefined) {
		if (Date.now() - start > 5_000) throw new Error("Timed out loading sessions");
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	const sessions = state.value?.sessions ?? [];
	const first = recentlyVisited(sessions, cwd)[0];
	if (first !== undefined) return first.id;
	return (await gateway.client.management.create({ ...(cwd !== undefined ? { cwd } : {}) }, BACKGROUND_CONTEXT)).id;
}
