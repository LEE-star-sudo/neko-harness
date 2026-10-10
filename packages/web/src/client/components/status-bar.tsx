import type { UsageTotals } from "@neko-harness/core";

function formatTokens(tokens: number): string {
	if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
	if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
	return String(tokens);
}

function formatCost(cost: number): string {
	return `$${cost.toFixed(cost >= 1 ? 2 : 4)}`;
}

/** 输入区上方的小字状态条：左侧模型名（长则截断），右侧忙碌状态 + 用量。窄屏不挤压。 */
export function StatusBar(props: { model: string; usage: UsageTotals | null; busy: boolean; status: string | null }) {
	return (
		<div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 pt-2 text-xs text-ink-500">
			<span className="min-w-0 truncate font-mono">{props.model}</span>
			<div className="min-w-2 flex-1" />
			{props.busy && props.status !== null && (
				<span className="inline-flex shrink-0 items-center gap-1.5 font-medium text-sakura-700">
					<span className="dots" aria-hidden>
						<span />
						<span />
						<span />
					</span>
					{props.status}
				</span>
			)}
			{props.usage !== null && (
				<span
					className="shrink-0 font-mono"
					title={`输入 ${props.usage.input} · 输出 ${props.usage.output} · 缓存读 ${props.usage.cacheRead}`}
				>
					↑{formatTokens(props.usage.input)} ↓{formatTokens(props.usage.output)} · {formatCost(props.usage.cost)}
				</span>
			)}
		</div>
	);
}
