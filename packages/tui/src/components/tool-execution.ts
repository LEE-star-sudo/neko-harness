import { Box, Container, MouseRegion, Text, type TuiMouseEvent } from "@earendil-works/pi-tui";
import { getActiveThemeMode, theme } from "../theme/index.ts";
import { languageForPath } from "../theme/syntax.ts";
import { diffTargetPath, highlightDiffLines } from "./diff-view.ts";

/** 运行中工具的动画帧(braille);由 ToolSpinnerTicker 推进,无 ticker 时停在首帧。 */

/** 运行中工具的动画帧(braille);由 ToolSpinnerTicker 推进,无 ticker 时停在首帧。 */
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;
let spinnerFrame = 0;

export function currentToolFrame(): string {
	return SPINNER_FRAMES[spinnerFrame]!;
}

/**
 * 应用级运行动画 ticker:仅当存在运行中工具卡时 start,按固定间隔推进帧并触发回调
 * (调用方负责 rebuild 运行中卡片与 requestRender);stop 后无后台定时器。
 */
export class ToolSpinnerTicker {
	#timer: ReturnType<typeof setInterval> | undefined;
	readonly #tick: () => void;
	readonly #intervalMs: number;
	constructor(tick: () => void, intervalMs = 120) {
		this.#tick = tick;
		this.#intervalMs = intervalMs;
	}
	get running(): boolean {
		return this.#timer !== undefined;
	}
	start(): void {
		if (this.#timer !== undefined) return;
		this.#timer = setInterval(() => {
			spinnerFrame = (spinnerFrame + 1) % SPINNER_FRAMES.length;
			this.#tick();
		}, this.#intervalMs);
	}
	stop(): void {
		clearInterval(this.#timer);
		this.#timer = undefined;
	}
}

export type ToolCardState = {
	readonly name: string;
	/** 单行参数摘要。 */
	readonly summary: string;
	/** 参数详情(多行);无则为 null。 */
	readonly detail: string | null;
	/** pending=待结果; running=正在执行; done=已有结果。 */
	readonly phase: "pending" | "running" | "done";
	readonly isError: boolean;
	/** 运行中的部分输出。 */
	readonly output: string | null;
	/** 最终结果文本。 */
	readonly result: string | null;
	readonly durationMs: number | null;
	/** 补充说明(如"Not run: response interrupted.")。 */
	readonly note: string | null;
	/** 展示型 diff(edit 透传上游 / write 参数合成);无则为 null。 */
	readonly diff: string | null;
	/** diff 新增行数;无 diff 时为 null。 */
	readonly diffAdded: number | null;
	/** diff 删除行数;无 diff 时为 null。 */
	readonly diffRemoved: number | null;
	readonly diffTruncated?: boolean;
};

type Phase = ToolCardState["phase"];

/** 展开区 diff 行数上限,超出截断并提示剩余行数。 */
const DIFF_MAX_LINES = 50;

/** 折叠摘要的增删计数后缀:edit ` (+18/-3)`、write ` (+142)`(删除为 0 时省略);无 diff 为 ""。 */
function diffCountSuffix(state: ToolCardState): string {
	if (state.diffAdded === null) return "";
	const removed = state.diffRemoved !== null && state.diffRemoved > 0 ? `/-${state.diffRemoved}` : "";
	return ` (+${state.diffAdded}${removed})`;
}

function clipLines(text: string, maxLines: number): { visible: string; rest: number } {
	const lines = text.split("\n");
	return { visible: lines.slice(0, maxLines).join("\n"), rest: Math.max(0, lines.length - maxLines) };
}

/**
 * 工具调用卡片:默认单行折叠(图标 + 工具名 + 参数摘要 + 状态 + 行数提示),
 * 点击展开参数详情与输出原文全文。底色随状态变化(待执行/成功/错误)。
 * 状态字形统一(design D6):`…` 待执行 / braille 动画 运行中 / `✓` 成功 / `✗` 失败。
 */
export class ToolExecutionComponent extends Container {
	#renderTheme = getActiveThemeMode();
	#state: ToolCardState;
	#expanded = false;
	onOpen: (() => void) | undefined;
	#box: Box;
	#text: Text;

	constructor(state: ToolCardState) {
		super();
		this.#state = state;
		this.#text = new Text("", 0, 0);
		this.#box = new Box(1, 0, theme.toolPendingBg);
		this.#box.addChild(new MouseRegion(this.#text, (event: TuiMouseEvent) => this.#onClick(event)));
		this.addChild(this.#box);
		this.rebuild();
	}

	override render(width: number): string[] {
		if (this.#renderTheme !== getActiveThemeMode()) {
			this.#renderTheme = getActiveThemeMode();
			this.rebuild();
		}

		return super.render(width);
	}

	get isRunning(): boolean {
		return this.#state.phase === "running";
	}

	sync(state: ToolCardState): void {
		this.#state = state;
		this.rebuild();
	}

	#onClick(event: TuiMouseEvent): { handled: boolean } | undefined {
		if (event.type !== "click" || event.button !== "left") return undefined;
		if (this.onOpen) this.onOpen();
		else this.setExpanded(!this.#expanded);
		return { handled: true };
	}

	setExpanded(expanded: boolean): void {
		this.#expanded = expanded;
		this.rebuild();
	}

	#statusLine(phase: Phase): string {
		if (phase === "pending") return theme.dim("…");
		if (phase === "running") return theme.accent(`${currentToolFrame()} Running...`);
		return this.#state.isError
			? theme.error("✗ Failed")
			: theme.ok(`✓${this.#state.durationMs !== null ? ` ${(this.#state.durationMs / 1000).toFixed(1)}s` : ""}`);
	}

	rebuild(): void {
		const state = this.#state;
		const parts = [
			`${theme.toolTitle(`⚡ ${state.name}`)}`,
			theme.dim(state.summary + diffCountSuffix(state)),
			this.#statusLine(state.phase),
		];
		let text = parts.join("  ");

		if (this.#expanded) {
			// 完整 write diff 可替代 detail;截断时仍保留参数预览。
			const detail = state.detail;
			if (detail !== null && !(state.diff !== null && state.name === "write" && !state.diffTruncated)) {
				const clipped = clipLines(detail, 20);
				text += `\n${theme.dim("---- Arguments ----")}\n${clipped.visible}`;
				if (clipped.rest > 0) text += `\n${theme.dim(`... ${clipped.rest} more lines`)}`;
			}
			if (state.diff !== null) {
				const clipped = clipLines(state.diff, DIFF_MAX_LINES);
				const lang = languageForPath(diffTargetPath(state.name, state.summary, state.detail));
				const format = state.name === "write" ? "write" : "edit";
				text += `\n${theme.dim("---- Diff ----")}\n${highlightDiffLines(clipped.visible, lang, format).join("\n")}`;
				if (state.diffTruncated) text += `\n${theme.dim("… Diff preview truncated (line or byte limit)")}`;
				if (clipped.rest > 0) text += `\n${theme.dim(`… +${clipped.rest} more lines`)}`;
			}
		}

		// 默认单行折叠(design D12):标题行 + 行数提示;点击展开参数详情与输出原文全文。
		const body = state.phase === "running" ? state.output : state.result;
		if (!this.#expanded && body !== null && body !== "") {
			text += theme.dim(`  +${body.split("\n").length} lines`);
		}
		if (this.#expanded && body !== null && body !== "") {
			text += `\n${theme.toolOutput(body)}`;
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
