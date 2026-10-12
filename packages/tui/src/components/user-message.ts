import { Container, Markdown, Text } from "@earendil-works/pi-tui";
import { parseSkillInvocation } from "@neko-harness/core/skill-invocation";
import { getMarkdownTheme, theme } from "../theme.ts";

/** 用户消息：蓝色气泡（整行背景），Markdown 渲染；/skill: 展开块折叠为单行标记。 */
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
		const invocation = parseSkillInvocation(this.#text);
		if (invocation !== null) {
			// 技能正文不铺开：单行技能标记 + 参数预览 + dim 来源行；正文始终在本地文件中可读。
			const args = invocation.args.replace(/\s+/g, " ").trim();
			const preview = args.length > 100 ? `${args.slice(0, 99)}…` : args;
			const head = `${theme.toolTitle(`✦ skill:${invocation.name}`)}${preview ? ` ${theme.userText(preview)}` : ""}`;
			const source = theme.dim(`skill body from ${invocation.location} (collapsed)`);
			this.addChild(new Text(`${head}\n${source}`, 1, 0, theme.userBg));
			return;
		}
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
