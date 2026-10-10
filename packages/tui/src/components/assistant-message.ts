import { Container, Markdown, MouseRegion, Spacer, Text, type TuiMouseEvent } from "@earendil-works/pi-tui";
import { getMarkdownTheme, theme } from "../theme.ts";

const THINKING_COLLAPSED_LABEL = "Thinking…（点击展开）";

export type AssistantContent = {
	readonly thinking: string;
	readonly text: string;
	/** 回答被中断/出错/截断时的提示行；无则为 null。 */
	readonly note: string | null;
};

/**
 * 助手消息：text 用 Markdown；thinking 默认折叠为一行弱化斜体，点击展开/收起；
 * note（中止/错误/截断提示）在内容后给出。
 */
export class AssistantMessageComponent extends Container {
	#lastContent: AssistantContent | undefined;
	#isStreaming = false;
	#thinkingExpanded = false;

	constructor(content?: AssistantContent, isStreaming = false) {
		super();
		if (content !== undefined) this.updateContent(content, isStreaming);
	}

	updateContent(content: AssistantContent, isStreaming = this.#isStreaming): void {
		this.#lastContent = content;
		this.#isStreaming = isStreaming;
		this.#rebuild();
	}

	setThinkingExpanded(expanded: boolean): void {
		this.#thinkingExpanded = expanded;
		if (this.#lastContent !== undefined) this.#rebuild();
	}

	#rebuild(): void {
		const content = this.#lastContent;
		this.clear();
		if (content === undefined) return;

		if (content.thinking.trim() !== "") {
			const expanded = this.#thinkingExpanded;
			const thinkingComponent = expanded
				? new Markdown(content.thinking.trim(), 1, 0, getMarkdownTheme(), { color: theme.thinking, italic: true })
				: new Text(theme.thinking(THINKING_COLLAPSED_LABEL), 1, 0);
			this.addChild(
				new MouseRegion(thinkingComponent, (event: TuiMouseEvent) => {
					if (event.type !== "click" || event.button !== "left") return undefined;
					this.setThinkingExpanded(!expanded);
					return { handled: true };
				}),
			);
		}
		if (content.text.trim() !== "") {
			this.addChild(new Markdown(content.text.trim(), 1, 0, getMarkdownTheme()));
		}
		if (content.note !== null) {
			this.addChild(new Spacer(1));
			this.addChild(new Text(theme.error(content.note), 1, 0));
		}
	}
}
