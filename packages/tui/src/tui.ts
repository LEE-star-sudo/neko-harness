import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
	Box,
	CombinedAutocompleteProvider,
	Container,
	Editor,
	Loader,
	matchesKey,
	ProcessTerminal,
	ScrollView,
	type SelectItem,
	SelectList,
	Spacer,
	Text,
	TruncatedText,
	TuiAltScreen,
	VStack,
} from "@earendil-works/pi-tui";
import type { ChatItem, ChatView, NekoModelRef, StreamingToolCall, StreamingView } from "@neko-harness/core";
import { AssistantMessageComponent } from "./components/assistant-message.ts";
import { StatusFooter, usageText } from "./components/footer.ts";
import { type ToolCardState, ToolExecutionComponent } from "./components/tool-execution.ts";
import { UserMessageComponent } from "./components/user-message.ts";
import { detectColorFgBgMode, queryTerminalMode } from "./detect-theme.ts";
import { connectToGateway, type NekoTuiGateway } from "./gateway.ts";
import {
	getActiveThemeMode,
	getEditorTheme,
	getSelectListTheme,
	setActiveTheme,
	style,
	type ThemeMode,
	type ThemePreference,
	theme,
} from "./theme.ts";

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
const MAX_NOTICES = 3;
const NEW_SESSION_VALUE = "__new__";

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
	readonly #statusBox = new Container();
	readonly #editor: Editor;
	readonly #footer = new StatusFooter();

	#chatFacade: ChatFacade | undefined;
	#sessionId = "";
	#directoryIds: string[] = [];
	#viewUnsubscribe: (() => void) | undefined;
	#directoryUnsubscribe: (() => void) | undefined;
	#overlayHandle: { hide(): void } | undefined;

	/** 已渲染条目 key 序列（前缀比较检测重建）。 */
	#renderedKeys: string[] = [];
	#items = new Map<string, ItemEntry>();
	#toolCards = new Map<string, ToolExecutionComponent>();
	#streamingComp: AssistantMessageComponent | undefined;
	#transcript: ScrollView | undefined;
	#loader: Loader | undefined;
	#busyText: string | undefined;
	#lastView: ChatView | undefined;
	#noticeCount = 0;
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
		this.#ui = new TuiAltScreen(new ProcessTerminal());
		this.#editor = new Editor(this.#ui, getEditorTheme(), { paddingX: 1 });
		this.#editor.setAutocompleteProvider(
			new CombinedAutocompleteProvider(
				[
					{ name: "exit", description: "退出 neko TUI" },
					{ name: "sessions", description: "会话列表（切换/新建）" },
					{ name: "fork", description: "分叉当前会话" },
					{ name: "archive", description: "归档当前会话" },
				],
				options.cwd ?? process.cwd(),
			),
		);
		this.#editor.onSubmit = (text) => {
			this.submit(text);
		};
		this.#exited = new Promise<void>((resolve) => {
			this.#resolveExit = resolve;
		});
		this.#ui.addInputListener((data) => {
			if (matchesKey(data, "ctrl+c")) {
				if (this.#busyText !== undefined) this.abort();
				else this.exit();
				return { consume: true };
			}
			// 会话浮层打开时把 Escape 留给浮层（SelectList 取消）。
			if (this.#overlayHandle === undefined && matchesKey(data, "escape") && this.#busyText !== undefined) {
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
		const content = new Container();
		content.addChild(this.#chat);
		this.#transcript = new ScrollView(content, { follow: "end", primary: true, overscroll: "chain" });
		const dock = new VStack([
			{ component: this.#notices, shrink: 1, minSize: 0 },
			{ component: this.#statusBox, shrink: 1, minSize: 0 },
			{ component: this.#editor, shrink: 1, minSize: 3 },
			{ component: this.#footer, shrink: 1, minSize: 0 },
		]);
		this.#ui.setLayoutRoot(
			new VStack([
				// 不设 basis：无高度约束的整文档渲染（退出时打印回主屏）取 intrinsic 全高，
				// 有高度约束的布局帧再按 grow/shrink 分配。
				{ component: this.#transcript, grow: 1, shrink: 1, minSize: 1 },
				{ component: dock, basis: "auto", grow: 0, shrink: 1, minSize: 1 },
			]),
		);
		this.#ui.setFocus(this.#editor);

		this.#directoryUnsubscribe = this.#gateway.client.directory.state.subscribe((value) => {
			this.#directoryIds = value.sessions.map((session) => session.id);
		});
		await this.switchSession(initialSessionId);
		this.#ui.start();
		this.#ui.requestRender(true);
		this.#startThemeDetection();
		await this.#exited;
		this.#viewUnsubscribe?.();
		this.#directoryUnsubscribe?.();
		this.#terminalSchemeUnsubscribe?.();
		this.#closeOverlay();
		this.#loader?.stop();
		this.#ui.stop();
	}

	// —— 提交与运行控制 ——

	/**
	 * Enter 提交。空闲：正常提交；忙碌：steer（插入当前工具轮之后）。
	 * 斜杠命令：/exit、/quit、/sessions、/fork、/archive。
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
		if (trimmed === "/fork") {
			void this.forkSession().catch((error: unknown) => this.addNotice(messageOf(error), true));
			return;
		}
		if (trimmed === "/archive") {
			void this.archiveSession().catch((error: unknown) => this.addNotice(messageOf(error), true));
			return;
		}
		const chat = this.#chatFacade;
		if (chat === undefined) return;
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
		// 目录刷新经订阅异步到达：等它（或短暂超时）后挑下一个会话；没有了就新建。
		const remaining = await this.#waitDirectory((ids) => (ids.length > 0 ? ids : undefined), 3_000);
		const next = (remaining ?? this.#directoryIds).find((id) => id !== current);
		if (next !== undefined) await this.switchSession(next);
		else await this.createSession();
	}

	async #waitDirectory(
		pick: (ids: string[]) => string[] | undefined,
		timeoutMs: number,
	): Promise<string[] | undefined> {
		const start = Date.now();
		for (;;) {
			const value = this.#directoryIds;
			const picked = value.length > 0 ? pick(value) : undefined;
			if (picked !== undefined) return picked;
			if (Date.now() - start > timeoutMs) return undefined;
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
	}

	// —— 会话浮层 ——

	openSessionsOverlay(): void {
		if (this.#overlayHandle !== undefined || this.#exitStarted) return;
		const items: SelectItem[] = [
			{ value: NEW_SESSION_VALUE, label: "＋ 新建会话" },
			...[...this.#directoryIds]
				.sort((left, right) => Number(right) - Number(left))
				.map((id) => ({
					value: id,
					label: `会话 ${id}${id === this.#sessionId ? "（当前）" : ""}`,
					description: id === this.#sessionId ? "当前 attach 的会话" : undefined,
				})),
		];
		const pick = (value: string): void => {
			this.#closeOverlay();
			if (value === NEW_SESSION_VALUE) {
				void this.createSession().catch((error: unknown) => this.addNotice(messageOf(error), true));
			} else if (value !== this.#sessionId) {
				void this.switchSession(value).catch((error: unknown) => this.addNotice(messageOf(error), true));
			}
		};
		this.#overlayHandle = this.#ui.showOverlay(new SessionsOverlay(items, pick, () => this.#closeOverlay()), {
			maxHeight: "60%",
		});
	}

	#closeOverlay(): void {
		this.#overlayHandle?.hide();
		this.#overlayHandle = undefined;
		this.#ui.setFocus(this.#editor);
	}

	// —— 视图渲染 ——

	addNotice(text: string, isError = false): void {
		this.#noticeCount++;
		this.#notices.addChild(new TruncatedText(isError ? theme.error(text) : theme.dim(text), 1, 0));
		while (this.#noticeCount > MAX_NOTICES) {
			const first = this.#notices.children[0];
			if (first === undefined) break;
			this.#notices.removeChild(first);
			this.#noticeCount--;
		}
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

	#syncBusy(view: ChatView, force = false): void {
		const busy = view.busy ? (view.status ?? "思考中…") : undefined;
		if (!force && busy === this.#busyText) {
			if (this.#loader !== undefined && busy !== undefined) this.#loader.setMessage(busy);
			this.#syncEditorBorder();
			return;
		}
		this.#busyText = busy;
		this.#loader?.stop();
		this.#loader = undefined;
		this.#statusBox.clear();
		if (busy !== undefined) {
			this.#loader = new Loader(this.#ui, theme.accent, theme.dim, busy);
			this.#statusBox.addChild(this.#loader);
			this.#loader.start();
		}
		this.#syncEditorBorder();
	}

	#syncEditorBorder(): void {
		this.#editor.borderColor = this.#busyText !== undefined ? theme.accent : theme.dim;
	}

	#syncFooter(view: ChatView): void {
		this.#footer.setStats({
			sessionId: this.#sessionId,
			model: view.model,
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
		this.#loader?.stop();
		this.#loader = undefined;
		this.#statusBox.clear();
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
			this.#syncBusy(this.#lastView, true);
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

/**
 * 会话选择浮层：标题 + SelectList + 提示。浮层获得焦点后输入路由到浮层组件本身，
 * 必须由这里把按键转发给 SelectList（Container 默认不向子组件分发输入）。
 */
class SessionsOverlay extends Container {
	readonly #list: SelectList;

	constructor(items: readonly SelectItem[], onPick: (value: string) => void, onClose: () => void) {
		super();
		const box = new Box(2, 1);
		box.addChild(new Text(style.bold("会话"), 0, 0));
		box.addChild(new Spacer(1));
		this.#list = new SelectList([...items], Math.min(items.length, 10), getSelectListTheme());
		this.#list.onSelect = (item) => onPick(item.value);
		this.#list.onCancel = onClose;
		box.addChild(this.#list);
		box.addChild(new Spacer(1));
		box.addChild(new Text(theme.dim("↑↓ 选择 · Enter 切换 / 新建 · Esc 关闭"), 0, 0));
		this.addChild(box);
	}

	handleInput(data: string): void {
		this.#list.handleInput(data);
	}
}

/** 打开 neko 终端界面；用户退出（/exit 或 Ctrl+C）后 resolve。 */
export async function runTui(options: NekoTuiOptions = {}): Promise<void> {
	const gateway = await connectToGateway({
		...(options.socketPath !== undefined ? { socketPath: options.socketPath } : {}),
		...(options.storagePath !== undefined ? { storagePath: options.storagePath } : {}),
		...(options.model !== undefined ? { model: options.model } : {}),
		configDir: options.cwd,
	});
	try {
		const initial = await initialSessionId(gateway, options.cwd);
		const app = new NekoTuiApp(gateway, options, options.theme ?? "auto");
		await app.run(initial);
	} finally {
		await gateway.close();
	}
}

/** 初始会话：目录里最早创建的（root 最小 id）；目录为空则新建。 */
async function initialSessionId(gateway: NekoTuiGateway, cwd: string | undefined): Promise<string> {
	const state = gateway.client.directory.state;
	const start = Date.now();
	while (state.value === undefined) {
		if (Date.now() - start > 5_000) throw new Error("会话目录水合超时");
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	const sessions = state.value?.sessions ?? [];
	const first = [...sessions].sort((left, right) => Number(left.id) - Number(right.id))[0];
	if (first !== undefined) return first.id;
	return (await gateway.client.management.create({ ...(cwd !== undefined ? { cwd } : {}) }, BACKGROUND_CONTEXT)).id;
}
