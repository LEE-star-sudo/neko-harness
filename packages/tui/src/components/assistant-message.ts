import type { AssistantMessage } from "@earendil-works/pi-ai";
import { Container, Markdown, MouseRegion, Spacer, Text } from "@earendil-works/pi-tui";
import { getMarkdownTheme, theme } from "../theme.ts";

const THINKING_COLLAPSED_LABEL = "Thinking…（点击展开）";

/**
 * 助手消息：text 用 Markdown；thinking 默认折叠为一行弱化斜体，点击展开/收起；
 * 中止/错误/截断在内容后给出提示。
 */
export class AssistantMessageComponent extends Container {
	#lastMessage: AssistantMessage | undefined;
	#isStreaming = false;
	#thinkingExpanded = false;

	constructor(message?: AssistantMessage, isStreaming = false) {
		super();
		if (message !== undefined) this.updateContent(message, isStreaming);
	}

	updateContent(message: AssistantMessage, isStreaming = this.#isStreaming): void {
		this.#lastMessage = message;
		this.#isStreaming = isStreaming;
		this.#rebuild();
	}

	setThinkingExpanded(expanded: boolean): void {
		this.#thinkingExpanded = expanded;
		if (this.#lastMessage !== undefined) this.#rebuild();
	}

	#rebuild(): void {
		const message = this.#lastMessage;
		this.clear();
		if (message === undefined) return;

		let thinkingRun: string[] = [];
		const flushThinking = (): void => {
			const blocks = thinkingRun;
			thinkingRun = [];
			const text = blocks.join("\n\n").trim();
			if (text === "") return;
			const expanded = this.#thinkingExpanded;
			const thinkingComponent = expanded
				? new Markdown(text, 1, 0, getMarkdownTheme(), { color: theme.thinking, italic: true })
				: new Text(theme.thinking(THINKING_COLLAPSED_LABEL), 1, 0);
			this.addChild(
				new MouseRegion(thinkingComponent, (event) => {
					if (event.type !== "click" || event.button !== "left") return undefined;
					this.setThinkingExpanded(!expanded);
					return { handled: true };
				}),
			);
		};

		for (const block of message.content) {
			if (block.type === "thinking") {
				if (block.thinking.trim() !== "") thinkingRun.push(block.thinking);
				continue;
			}
			flushThinking();
			if (block.type === "text" && block.text.trim() !== "") {
				this.addChild(new Markdown(block.text.trim(), 1, 0, getMarkdownTheme()));
			}
		}
		flushThinking();

		const hasToolCalls = message.content.some((block) => block.type === "toolCall");
		if (message.stopReason === "length") {
			this.addChild(new Spacer(1));
			this.addChild(new Text(theme.error("回答在完成前被截断。"), 1, 0));
		} else if (!hasToolCalls && message.stopReason === "aborted") {
			this.addChild(new Spacer(1));
			this.addChild(new Text(theme.error("已中止。"), 1, 0));
		} else if (!hasToolCalls && message.stopReason === "error") {
			this.addChild(new Spacer(1));
			this.addChild(new Text(theme.error(`出错：${message.errorMessage ?? "未知错误"}`), 1, 0));
		}
	}
}
