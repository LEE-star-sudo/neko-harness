import { Container, Markdown } from "@earendil-works/pi-tui";
import { getMarkdownTheme, theme } from "../theme.ts";

/** 用户消息：蓝色气泡（整行背景），Markdown 渲染。 */
export class UserMessageComponent extends Container {
	#text: string;

	constructor(text: string) {
		super();
		this.#text = text;
		this.#rebuild();
	}

	setText(text: string): void {
		this.#text = text;
		this.#rebuild();
	}

	#rebuild(): void {
		this.clear();
		this.addChild(
			new Markdown(
				this.#text,
				1,
				0,
				getMarkdownTheme(),
				{
					color: theme.userText,
					bgColor: theme.userBg,
				},
				{ preserveOrderedListMarkers: true, preserveBackslashEscapes: true },
			),
		);
	}
}
