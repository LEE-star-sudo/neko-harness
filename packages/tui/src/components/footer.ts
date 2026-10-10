import { Container, TruncatedText } from "@earendil-works/pi-tui";
import { formatTokens } from "../format.ts";
import { theme } from "../theme.ts";

export type FooterStats = {
	readonly model: string;
	/** 忙碌描述；undefined 表示空闲。 */
	readonly busy: string | undefined;
	readonly usageText: string;
	readonly cwd: string;
};

/** 底部状态栏：模型 · 状态 · 用量 · 工作目录 + 按键提示。（TruncatedText 无 setText，更新即重建。） */
export class StatusFooter extends Container {
	setStats(stats: FooterStats): void {
		const busy = stats.busy === undefined ? theme.ok("就绪") : theme.accent(stats.busy);
		this.clear();
		this.addChild(
			new TruncatedText(
				`${theme.model(stats.model)}  ·  ${busy}  ·  ${stats.usageText}  ·  ${theme.dim(stats.cwd)}`,
				1,
				0,
			),
		);
		this.addChild(
			new TruncatedText(theme.dim("Enter 发送 · Esc 中止运行 · Ctrl+C 退出 · /exit 退出 · 点击工具卡片展开输出"), 1, 0),
		);
	}
}

export function usageText(input: number, output: number, cacheRead: number, costTotal: number): string {
	return `↑${formatTokens(input)} ↓${formatTokens(output)} 缓存${formatTokens(cacheRead)} $${costTotal.toFixed(4)}`;
}
