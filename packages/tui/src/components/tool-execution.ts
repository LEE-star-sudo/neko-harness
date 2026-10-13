import { Box, Container, MouseRegion, Text, type TuiMouseEvent } from "@earendil-works/pi-tui";
import { getActiveThemeMode, theme } from "../theme/index.ts";

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
};

type Phase = ToolCardState["phase"];

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
		this.setExpanded(!this.#expanded);
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
		const parts = [`${theme.toolTitle(`⚡ ${state.name}`)}`, theme.dim(state.summary), this.#statusLine(state.phase)];
		let text = parts.join("  ");

		if (this.#expanded && state.detail !== null) {
			const detail = clipLines(state.detail, 20);
			text += `\n${theme.dim("---- Arguments ----")}\n${detail.visible}`;
			if (detail.rest > 0) text += `\n${theme.dim(`... ${detail.rest} more lines`)}`;
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
