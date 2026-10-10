import type { JsonObject } from "@earendil-works/pi-ai";
import { Box, Container, MouseRegion, Text, type TuiMouseEvent } from "@earendil-works/pi-tui";
import { summarizeToolCall, type ToolSummary, toolResultText } from "../format.ts";
import { theme } from "../theme.ts";

const PREVIEW_LINES = 8;

type Phase = "pending" | "running" | "done";

function clipLines(text: string, maxLines: number): { visible: string; rest: number } {
	const lines = text.split("\n");
	return { visible: lines.slice(0, maxLines).join("\n"), rest: Math.max(0, lines.length - maxLines) };
}

/**
 * 工具调用卡片：标题行（图标 + 工具名 + 参数摘要 + 状态），展开时显示参数详情，
 * 结果区默认最多预览 8 行。底色随状态变化（待执行/成功/错误），点击切换展开。
 */
export class ToolExecutionComponent extends Container {
	#toolName: string;
	#summary: ToolSummary;
	#phase: Phase = "pending";
	#isError = false;
	#outputText: string | undefined;
	#durationMs: number | undefined;
	#expanded = false;
	#box: Box;
	#text: Text;

	constructor(toolName: string, args: JsonObject) {
		super();
		this.#toolName = toolName;
		this.#summary = summarizeToolCall(toolName, args);
		this.#text = new Text("", 1, 0);
		this.#box = new Box(0, 0, theme.toolPendingBg);
		this.#box.addChild(new MouseRegion(this.#text, (event: TuiMouseEvent) => this.#onClick(event)));
		this.addChild(this.#box);
		this.rebuild();
	}

	updateArgs(args: JsonObject): void {
		this.#summary = summarizeToolCall(this.#toolName, args);
		this.rebuild();
	}

	markRunning(): void {
		if (this.#phase === "running") return;
		this.#phase = "running";
		this.rebuild();
	}

	/** 运行中的部分输出（pi.live 的 ToolSlot.output）。 */
	updateOutput(output: string): void {
		if (this.#phase === "done") return;
		this.#phase = "running";
		this.#outputText = output;
		this.rebuild();
	}

	updateResult(content: ReadonlyArray<{ type: string; text?: string }>, isError: boolean, durationMs?: number): void {
		this.#phase = "done";
		this.#isError = isError;
		this.#outputText = toolResultText(content);
		this.#durationMs = durationMs;
		this.rebuild();
	}

	#onClick(event: TuiMouseEvent): { handled: boolean } | undefined {
		if (this.#outputText === undefined || event.type !== "click" || event.button !== "left") return undefined;
		this.#expanded = !this.#expanded;
		this.rebuild();
		return { handled: true };
	}

	rebuild(): void {
		const status =
			this.#phase === "pending"
				? theme.dim("…")
				: this.#phase === "running"
					? theme.accent("运行中…")
					: this.#isError
						? theme.error("✗ 失败")
						: theme.ok(`✓${this.#durationMs !== undefined ? ` ${(this.#durationMs / 1000).toFixed(1)}s` : ""}`);
		const parts = [`${theme.toolTitle(`⚡ ${this.#toolName}`)}`, theme.dim(this.#summary.args), status];
		let text = parts.join("  ");

		if (this.#expanded && this.#summary.detail !== undefined) {
			const detail = clipLines(this.#summary.detail, 20);
			text += `\n${theme.dim("──── 参数 ────")}\n${detail.visible}`;
			if (detail.rest > 0) text += `\n${theme.dim(`… 还有 ${detail.rest} 行`)}`;
		}

		if (this.#outputText !== undefined && this.#outputText !== "") {
			const output = clipLines(this.#outputText, this.#expanded ? Number.MAX_SAFE_INTEGER : PREVIEW_LINES);
			text += `\n${output.visible}`;
			if (output.rest > 0) text += `\n${theme.dim(`… 还有 ${output.rest} 行，点击展开`)}`;
		}

		this.#text.setText(text);
		this.#box.setBgFn(
			this.#phase !== "done" ? theme.toolPendingBg : this.#isError ? theme.toolErrorBg : theme.toolSuccessBg,
		);
	}
}
