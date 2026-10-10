import type { AttachedReplicatedState } from "@earendil-works/chord";
import type { AssistantMessage, JsonObject } from "@earendil-works/pi-ai";
import type { ConversationView, EntryRecord, LiveState, Submission, UsageState } from "@earendil-works/pi-durable";
import {
	CombinedAutocompleteProvider,
	Container,
	Editor,
	Loader,
	matchesKey,
	ProcessTerminal,
	ScrollView,
	Spacer,
	Text,
	TruncatedText,
	TuiAltScreen,
	VStack,
} from "@earendil-works/pi-tui";
import { createNekoRuntime, DEFAULT_MODEL, type NekoModelRef, type NekoRuntime } from "@neko-harness/core";
import { AssistantMessageComponent } from "./components/assistant-message.ts";
import { StatusFooter, usageText } from "./components/footer.ts";
import { ToolExecutionComponent } from "./components/tool-execution.ts";
import { UserMessageComponent } from "./components/user-message.ts";
import { detectColorFgBgMode, queryTerminalMode } from "./detect-theme.ts";
import { totalUsage, userText } from "./format.ts";
import {
	getActiveThemeMode,
	getEditorTheme,
	setActiveTheme,
	type ThemeMode,
	type ThemePreference,
	theme,
} from "./theme.ts";

export type NekoTuiOptions = {
	/** 会话工具的工作目录；默认 process.cwd()。 */
	readonly cwd?: string;
	/** SQLite 存储路径；默认 ~/.neko/neko.sqlite。 */
	readonly storagePath?: string;
	/** 运行模型；默认内置 DeepSeek 模型。 */
	readonly model?: NekoModelRef;
	/** 主题：light / dark / auto（默认 auto，按终端背景自动选择）。 */
	readonly theme?: ThemePreference;
};

const EXIT_COMMANDS = new Set(["/exit", "/quit"]);
const MAX_NOTICES = 3;

/**
 * neko 终端界面：底部输入框 + 消息区（流式渲染）+ 工具卡片 + 状态栏。
 * 数据源是 core runtime 的 viewState（提交后的状态为准，见 design D4）。
 */
class NekoTuiApp {
	readonly #runtime: NekoRuntime;
	readonly #ui: TuiAltScreen;
	readonly #chat = new Container();
	readonly #notices = new Container();
	readonly #statusBox = new Container();
	readonly #editor: Editor;
	readonly #footer = new StatusFooter();
	readonly #modelLabel: string;
	readonly #cwd: string;
	readonly #themePreference: ThemePreference;
	/** 最近一次 applyView 的 live/view，主题切换后用于重刷状态栏与 Loader 配色。 */
	#lastLive: LiveState | undefined;
	#lastView: ConversationView | undefined;
	#terminalSchemeUnsubscribe: (() => void) | undefined;

	/** 已渲染的 entry id 序列，用于增量同步与重建判断。 */
	#renderedEntryIds: number[] = [];
	/** callId -> 工具卡片。 */
	#tools = new Map<string, ToolExecutionComponent>();
	/** 流式回答已为其创建过卡片的 callId。 */
	#streamingCalls = new Set<string>();
	#streaming: AssistantMessageComponent | undefined;
	#transcript: ScrollView | undefined;
	#loader: Loader | undefined;
	#busy: string | undefined;
	#noticeCount = 0;
	#applying = false;
	#applyQueued = false;
	#view: AttachedReplicatedState<ConversationView> | undefined;
	#exited: Promise<void>;
	#resolveExit: () => void = () => {};
	#exitStarted = false;

	constructor(runtime: NekoRuntime, modelLabel: string, cwd: string, themePreference: ThemePreference) {
		this.#runtime = runtime;
		this.#modelLabel = modelLabel;
		this.#cwd = cwd;
		this.#themePreference = themePreference;
		// 首帧前的临时主题：auto 先用 COLORFGBG（无则浅色），OSC 11 应答后再修正。
		setActiveTheme(themePreference === "auto" ? (detectColorFgBgMode() ?? "light") : themePreference);
		this.#ui = new TuiAltScreen(new ProcessTerminal());
		this.#editor = new Editor(this.#ui, getEditorTheme(), { paddingX: 1 });
		this.#editor.setAutocompleteProvider(
			new CombinedAutocompleteProvider([{ name: "exit", description: "退出 neko TUI" }], cwd),
		);
		this.#editor.onSubmit = (text) => {
			this.submit(text);
		};
		this.#exited = new Promise<void>((resolve) => {
			this.#resolveExit = resolve;
		});
		this.#ui.addInputListener((data) => {
			if (matchesKey(data, "ctrl+c")) {
				if (this.#busy !== undefined) this.abort();
				else this.exit();
				return { consume: true };
			}
			if (matchesKey(data, "escape") && this.#busy !== undefined) {
				this.abort();
				return { consume: true };
			}
			return undefined;
		});
	}

	async run(view: AttachedReplicatedState<ConversationView>): Promise<void> {
		this.#view = view;
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

		this.applyView(view.value);
		const unsubscribe = view.subscribe(() => this.scheduleApply());
		this.#ui.start();
		this.#ui.requestRender(true);
		this.#startThemeDetection();
		await this.#exited;
		unsubscribe();
		this.#terminalSchemeUnsubscribe?.();
		this.#loader?.stop();
		this.#ui.stop();
	}

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
		// Loader / footer 在创建时烘焙了颜色，按最近状态重建。
		if (this.#lastLive !== undefined) this.#syncBusy(this.#lastLive, true);
		if (this.#lastView !== undefined) this.#syncFooter(this.#lastView);
		this.#ui.requestRender(true);
	}

	/** 提交输入；空串忽略，/exit、/quit 退出。忙碌时按 pi-durable 默认行为排队为 follow-up。 */
	submit(text: string): void {
		const trimmed = text.trim();
		if (trimmed === "") return;
		if (EXIT_COMMANDS.has(trimmed)) {
			this.exit();
			return;
		}
		void this.#runtime
			.submit(trimmed)
			.then((submission) => this.#trackAnswer(submission))
			.catch((error: unknown) => {
				this.addNotice(error instanceof Error ? error.message : String(error), true);
			});
	}

	abort(): void {
		this.#runtime.abort().catch((error: unknown) => {
			this.addNotice(error instanceof Error ? error.message : String(error), true);
		});
	}

	exit(): void {
		if (this.#exitStarted) return;
		this.#exitStarted = true;
		this.#resolveExit();
	}

	#trackAnswer(submission: Submission): void {
		this.#runtime
			.waitAnswer(submission)
			.then((answer) => {
				if (answer.status === "unanswered" && answer.reason !== "aborted") {
					const detail = answer.detail === undefined ? "" : `：${answer.detail}`;
					this.addNotice(`未得到回答（${answer.reason}${detail}）`, true);
				}
			})
			.catch(() => {});
	}

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

	/** 同一 tick 内的多次 commit 合并为一次渲染。 */
	scheduleApply(): void {
		if (this.#applying) {
			this.#applyQueued = true;
			return;
		}
		this.#applying = true;
		setImmediate(() => {
			this.#applying = false;
			const view = this.#view;
			if (this.#exitStarted || view === undefined) return;
			const again = this.#applyQueued;
			this.#applyQueued = false;
			this.applyView(view.value);
			if (again) this.scheduleApply();
		});
	}

	applyView(view: ConversationView): void {
		const live = (view.docs["pi.live"] ?? {}) as LiveState;
		this.#lastLive = live;
		this.#lastView = view;
		this.#syncTranscript(view.entries);
		const message = live.generation?.message as AssistantMessage | undefined;
		// 部分流式内容被丢弃（如重试）时，重建转录以移除孤立的流式组件。
		if (message === undefined && this.#streaming !== undefined) this.#rebuild(view.entries);
		if (message !== undefined) this.#syncStreaming(message);
		for (const slot of live.tools ?? []) {
			if (slot.status === "pending") continue;
			const card = this.#tool(slot.name, slot.callId);
			card.markRunning();
			if (slot.status === "running" && slot.output !== undefined) card.updateOutput(slot.output);
		}
		this.#syncBusy(live);
		this.#syncFooter(view);
		if (this.#transcript !== undefined && this.#streaming !== undefined) this.#transcript.scrollToEnd();
		this.#ui.requestRender();
	}

	#syncTranscript(entries: readonly EntryRecord[]): void {
		if (this.#renderedEntryIds.some((id, index) => entries[index]?.id !== id)) {
			this.#rebuild(entries);
			return;
		}
		for (const entry of entries.slice(this.#renderedEntryIds.length)) {
			this.#addEntry(entry);
			this.#renderedEntryIds.push(entry.id);
		}
	}

	#rebuild(entries: readonly EntryRecord[]): void {
		this.#chat.clear();
		this.#tools.clear();
		this.#streamingCalls.clear();
		this.#streaming = undefined;
		this.#renderedEntryIds = [];
		for (const entry of entries) {
			this.#addEntry(entry);
			this.#renderedEntryIds.push(entry.id);
		}
		this.#transcript?.scrollToEnd();
		this.#ui.requestRender(true);
	}

	#addEntry(entry: EntryRecord): void {
		const message = entry.model?.[0];
		if (entry.kind === "pi.user" && message?.role === "user") {
			const text = userText(message.content);
			this.#chat.addChild(new Spacer(1));
			this.#chat.addChild(new UserMessageComponent(text));
			return;
		}
		if (entry.kind === "pi.assistant" && message?.role === "assistant") {
			const component = this.#streaming ?? new AssistantMessageComponent();
			if (this.#streaming === undefined) this.#chat.addChild(component);
			this.#streaming = undefined;
			component.updateContent(message, false);
			// 只有以 toolUse 结束的回答会真正执行工具；被中断/出错的回答只保留已展示过的卡片。
			const ran = message.stopReason === "toolUse";
			for (const block of message.content) {
				if (block.type !== "toolCall") continue;
				const streamed = this.#streamingCalls.has(block.id);
				if (!ran && !streamed) continue;
				const card = this.#tool(block.name, block.id, block.arguments, !streamed);
				if (!ran) card.updateResult([{ type: "text", text: "未运行：回答被中断。" }], true);
			}
			this.#streamingCalls.clear();
			return;
		}
		if (entry.kind === "pi.tool-result" && message?.role === "toolResult") {
			this.#tool(message.toolName, message.toolCallId).updateResult(
				message.content,
				message.isError,
				message.durationMs,
			);
			return;
		}
		if (entry.kind === "pi.compaction") {
			this.#addSystemLine("[context 已压缩]");
		} else if (entry.kind === "pi.reset") {
			this.#addSystemLine("[new context]");
		}
	}

	#syncStreaming(message: AssistantMessage): void {
		if (this.#streaming === undefined) {
			this.#streaming = new AssistantMessageComponent();
			this.#chat.addChild(this.#streaming);
		}
		this.#streaming.updateContent(message, true);
		for (const block of message.content) {
			if (block.type !== "toolCall") continue;
			this.#tool(block.name, block.id, block.arguments, !this.#streamingCalls.has(block.id));
			this.#streamingCalls.add(block.id);
		}
	}

	#addSystemLine(text: string): void {
		this.#chat.addChild(new Spacer(1));
		this.#chat.addChild(new Text(theme.dim(text), 1, 0));
	}

	/** 工具卡片；`fresh` 为 callId 被后续轮次复用时强制新建。 */
	#tool(name: string, callId: string, args?: JsonObject, fresh = false): ToolExecutionComponent {
		const existing = fresh ? undefined : this.#tools.get(callId);
		if (existing !== undefined) {
			if (args !== undefined) existing.updateArgs(args);
			return existing;
		}
		const card = new ToolExecutionComponent(name, args ?? {});
		this.#chat.addChild(card);
		this.#tools.set(callId, card);
		return card;
	}

	#syncBusy(live: LiveState, force = false): void {
		const runningTool = live.tools?.find((slot) => slot.status === "running");
		const busy =
			live.run === undefined
				? undefined
				: live.generation?.retry !== undefined
					? `重试中（第 ${live.generation.attempt + 1} 次）…`
					: runningTool !== undefined
						? `运行 ${runningTool.name}…`
						: "思考中…";
		if (!force && busy === this.#busy) {
			if (this.#loader !== undefined && busy !== undefined) this.#loader.setMessage(busy);
			return;
		}
		this.#busy = busy;
		this.#loader?.stop();
		this.#loader = undefined;
		this.#statusBox.clear();
		if (busy !== undefined) {
			this.#loader = new Loader(this.#ui, theme.accent, theme.dim, busy);
			this.#statusBox.addChild(this.#loader);
			this.#loader.start();
		}
	}

	#syncFooter(view: ConversationView): void {
		const usage = totalUsage((view.docs["pi.usage"] ?? { models: {}, tools: {} }) as UsageState);
		this.#footer.setStats({
			model: this.#modelLabel,
			busy: this.#busy,
			usageText: usageText(usage.input, usage.output, usage.cacheRead, usage.cost.total),
			cwd: this.#cwd,
		});
	}
}

/** 打开 neko 终端界面；用户退出（/exit 或 Ctrl+C）后 resolve。 */
export async function runTui(options: NekoTuiOptions = {}): Promise<void> {
	const model: NekoModelRef = options.model ?? DEFAULT_MODEL;
	const runtime = await createNekoRuntime({
		...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
		...(options.storagePath !== undefined ? { storagePath: options.storagePath } : {}),
		model,
	});
	try {
		const view = await runtime.viewState();
		const app = new NekoTuiApp(
			runtime,
			`${model.provider}/${model.modelId}`,
			options.cwd ?? process.cwd(),
			options.theme ?? "auto",
		);
		await app.run(view);
		view.dispose();
	} finally {
		await runtime.close();
	}
}
