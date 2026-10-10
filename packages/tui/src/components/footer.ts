import { Container, TruncatedText } from "@earendil-works/pi-tui";
import { formatTokens } from "../format.ts";
import { theme } from "../theme.ts";

export type FooterStats = {
	readonly sessionId: string;
	readonly model: string;
	/** 忙碌描述；undefined 表示空闲。 */
	readonly busy: string | undefined;
	readonly usageText: string;
	readonly cwd: string;
};

/** 底部状态栏：会话 · 模型 · 状态 · 用量 · 工作目录 + 按键提示。（TruncatedText 无 setText，更新即重建。） */
export class StatusFooter extends Container {
	setStats(stats: FooterStats): void {
		const busy = stats.busy === undefined ? theme.ok("就绪") : theme.accent(stats.busy);
		this.clear();
		this.addChild(
			new TruncatedText(
				`${theme.dim(`会话 ${stats.sessionId}`)}  ·  ${theme.model(stats.model)}  ·  ${busy}  ·  ${stats.usageText}  ·  ${theme.dim(stats.cwd)}`,
				1,
				0,
			),
		);
		this.addChild(new TruncatedText(theme.dim(this.#hints(stats.busy !== undefined)), 1, 0));
	}

	#hints(busy: boolean): string {
		return busy
			? "Enter 插入（steer） · Alt+Enter 排队（follow-up） · Esc 中止 · Ctrl+S 会话 · Ctrl+C 退出"
			: "Enter 发送 · Ctrl+S 会话列表 · /fork 分叉 · /archive 归档 · Ctrl+C 退出";
	}
}

export function usageText(input: number, output: number, cacheRead: number, costTotal: number): string {
	return `↑${formatTokens(input)} ↓${formatTokens(output)} 缓存${formatTokens(cacheRead)} $${costTotal.toFixed(4)}`;
}
