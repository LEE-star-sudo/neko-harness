import { Box, Container, MouseRegion, Text, type TuiMouseEvent } from "@earendil-works/pi-tui";
import { theme } from "../theme.ts";

const PREVIEW_LINES = 8;

export type ToolCardState = {
	readonly name: string;
	/** 单行参数摘要。 */
	readonly summary: string;
	/** 参数详情（多行）；无则为 null。 */
	readonly detail: string | null;
	/** pending=待结果; running=正在执行; done=已有结果。 */
	readonly phase: "pending" | "running" | "done";
	readonly isError: boolean;
	/** 运行中的部分输出。 */
	readonly output: string | null;
	/** 最终结果文本。 */
	readonly result: string | null;
	readonly durationMs: number | null;
	/** 补充说明（如"未运行：回答被中断。"）。 */
	readonly note: string | null;
};

type Phase = ToolCardState["phase"];

function clipLines(text: string, maxLines: number): { visible: string; rest: number } {
	const lines = text.split("\n");
	return { visible: lines.slice(0, maxLines).join("\n"), rest: Math.max(0, lines.length - maxLines) };
}

/**
 * 工具调用卡片：标题行（图标 + 工具名 + 参数摘要 + 状态），运行中显示部分输出，
 * 完成后显示结果（默认预览 8 行）。底色随状态变化（待执行/成功/错误），点击切换展开。
 */
export class ToolExecutionComponent extends Container {
	#state: ToolCardState;
	#expanded = false;
	#box: Box;
	#text: Text;

	constructor(state: ToolCardState) {
		super();
		this.#state = state;
		this.#text = new Text("", 1, 0);
		this.#box = new Box(0, 0, theme.toolPendingBg);
		this.#box.addChild(new MouseRegion(this.#text, (event: TuiMouseEvent) => this.#onClick(event)));
		this.addChild(this.#box);
		this.rebuild();
	}

	sync(state: ToolCardState): void {
		this.#state = state;
		this.rebuild();
	}

	#onClick(event: TuiMouseEvent): { handled: boolean } | undefined {
		if (event.type !== "click" || event.button !== "left") return undefined;
		this.#expanded = !this.#expanded;
		this.rebuild();
		return { handled: true };
	}

	#statusLine(phase: Phase): string {
		if (phase === "pending") return theme.dim("…");
		if (phase === "running") return theme.accent("运行中…");
		return this.#state.isError
			? theme.error("✗ 失败")
			: theme.ok(`✓${this.#state.durationMs !== null ? ` ${(this.#state.durationMs / 1000).toFixed(1)}s` : ""}`);
	}

	rebuild(): void {
		const state = this.#state;
		const parts = [`${theme.toolTitle(`⚡ ${state.name}`)}`, theme.dim(state.summary), this.#statusLine(state.phase)];
		let text = parts.join("  ");

		if (this.#expanded && state.detail !== null) {
			const detail = clipLines(state.detail, 20);
			text += `\n${theme.dim("──── 参数 ────")}\n${detail.visible}`;
			if (detail.rest > 0) text += `\n${theme.dim(`… 还有 ${detail.rest} 行`)}`;
		}

		const body = state.phase === "running" ? state.output : state.result;
		if (body !== null && body !== "") {
			const clipped = clipLines(body, this.#expanded ? Number.MAX_SAFE_INTEGER : PREVIEW_LINES);
			text += `\n${clipped.visible}`;
			if (clipped.rest > 0) text += `\n${theme.dim(`… 还有 ${clipped.rest} 行，点击展开`)}`;
		}
		if (state.note !== null) {
			text += `\n${theme.error(state.note)}`;
		}

		this.#text.setText(text);
		this.#box.setBgFn(
			state.phase !== "done" ? theme.toolPendingBg : state.isError ? theme.toolErrorBg : theme.toolSuccessBg,
		);
	}
}
