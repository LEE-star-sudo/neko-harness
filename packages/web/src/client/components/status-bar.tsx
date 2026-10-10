import type { NekoModelRef, UsageTotals } from "@neko-harness/core";
import { useEffect, useState } from "react";
import { useNekoState } from "../lib/store";
import { ModelPicker } from "./model-picker";

function formatTokens(tokens: number): string {
	if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
	if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
	return String(tokens);
}

function formatCost(cost: number): string {
	return `$${cost.toFixed(cost >= 1 ? 2 : 4)}`;
}

/** 输入区上方的小字状态条：左侧模型选择器，右侧忙碌状态 + 用量。窄屏不挤压。 */
export function StatusBar(props: {
	model: string;
	agentModel: NekoModelRef | null;
	usage: UsageTotals | null;
	busy: boolean;
	status: string | null;
}) {
	const { view } = useNekoState();
	const context = view?.contextUsage;
	const latest = view?.compaction?.latest;
	const active = view?.compaction?.active ?? [];
	const [, refresh] = useState(0);
	const transient = latest && !["summarizing", "waiting-to-apply"].includes(latest.phase);
	const expiresAt = transient ? latest.at + (latest.phase === "failed" ? 10000 : 5000) : null;
	useEffect(() => {
		if (expiresAt === null || expiresAt <= Date.now()) return;
		const timer = setTimeout(() => refresh((n) => n + 1), expiresAt - Date.now());
		return () => clearTimeout(timer);
	}, [expiresAt]);
	const compaction = active.length
		? active.some((c) => c.retry)
			? "压缩重试中"
			: active.some((c) => c.blocking)
				? "等待上下文压缩"
				: "正在压缩上下文"
		: latest && (expiresAt === null || Date.now() < expiresAt)
			? {
					applied: "上下文已压缩",
					nothing: "当前无需压缩",
					skipped: "已跳过过期摘要",
					cancelled: "压缩已取消",
					failed: "压缩失败，可重试",
					summarizing: "正在压缩上下文",
					"waiting-to-apply": "等待应用压缩摘要",
				}[latest.phase]
			: null;
	const failed = !active.length && latest?.phase === "failed";
	return (
		<div className="mx-auto flex w-full max-w-3xl shrink-0 flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2 text-xs text-ink-500">
			<div className="min-w-0 max-w-48 [&>button]:max-w-full">
				<ModelPicker current={props.agentModel} fallbackLabel={props.model} />
			</div>
			<div className="flex min-h-7 min-w-max flex-1 items-center gap-2">
				{context && context.window > 0 && (
					<span
						className={`shrink-0 rounded-full bg-tianyi-50 px-2 py-1 font-mono ${context.percent !== null && context.percent > 90 ? "text-sakura-700 font-semibold" : "text-ink-600"}`}
						title={
							context.tokens === null
								? "暂无有效用量；首次回答或压缩后的新回答完成后更新"
								: `最近一次成功回答的上下文用量：${context.tokens} / ${context.window} tokens；非会话累计用量`
						}
					>
						Ctx {context.percent === null ? "?" : `${context.percent.toFixed(1)}%`}/{formatTokens(context.window)}
					</span>
				)}
				<output aria-live="polite" aria-atomic="true" className="contents">
					{compaction && (
						<span
							className={`max-w-full whitespace-nowrap rounded-full border px-2 py-1 ${failed ? "border-sakura-300 bg-sakura-50 text-sakura-700" : "border-tianyi-200 bg-tianyi-50 text-ink-600"}`}
							title={
								latest?.phase === "nothing" && !active.length
									? "保留近期上下文，暂无可压缩的旧内容；默认保留最近约 20,000 tokens"
									: undefined
							}
						>
							{compaction}
						</span>
					)}
				</output>
			</div>
			<div className="ml-auto flex max-w-full shrink-0 items-center justify-end gap-2">
				{props.busy && props.status !== null && (
					<span
						className="inline-flex min-w-0 max-w-64 items-center gap-1.5 font-medium text-sakura-700"
						title={props.status}
					>
						<span className="dots shrink-0" aria-hidden>
							<span />
							<span />
							<span />
						</span>
						<span className="truncate">{props.status.replace(/\.\.\.$/, "")}</span>
					</span>
				)}
				{props.usage !== null && (
					<span
						className="min-w-0 truncate font-mono"
						title={`输入 ${props.usage.input} · 输出 ${props.usage.output} · 缓存读 ${props.usage.cacheRead}`}
					>
						↑{formatTokens(props.usage.input)} ↓{formatTokens(props.usage.output)} · {formatCost(props.usage.cost)}
					</span>
				)}
			</div>
		</div>
	);
}
