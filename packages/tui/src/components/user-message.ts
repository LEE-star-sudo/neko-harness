import { Container, Markdown, Text } from "@earendil-works/pi-tui";
import type { SkillInvocation } from "@neko-harness/core/skill-invocation";
import { getMarkdownTheme, theme } from "../theme/index.ts";

/** 用户消息：蓝色气泡（整行背景 + 樱花左缘条），Markdown 渲染；/skill: 展开块折叠为单行标记。 */
export class UserMessageComponent extends Container {
	#text: string;
	#skill?: SkillInvocation;

	constructor(text: string, skill?: SkillInvocation) {
		super();
		this.#text = text;
		this.#skill = skill;
		this.#rebuild();
	}

	setText(text: string): void {
		this.#text = text;
		this.#rebuild();
	}

	/** 每行加 `▍` accent 左缘（底色 userBg 贯通）；内容宽度 -1，间距由内容自身 padding 提供。 */
	override render(width: number): string[] {
		const bar = theme.userBg(theme.accent("▍"));
		return super.render(Math.max(1, width - 1)).map((line) => `${bar}${line}`);
	}

	#rebuild(): void {
		this.clear();
		const invocation = this.#skill;
		if (invocation !== undefined) {
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
