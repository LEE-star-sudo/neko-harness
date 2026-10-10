import { useState } from "react";

export type ToolCardProps = {
	name: string;
	summary: string;
	detail: string | null;
	phase: "pending" | "running" | "done";
	isError?: boolean;
	output?: string | null;
	result?: string | null;
	durationMs?: number | null;
	note?: string | null;
};

const STATUS = {
	pending: { label: "待执行", className: "border-ink-200 bg-ink-100 text-ink-600" },
	running: { label: "运行中", className: "border-tianyi-300 bg-tianyi-100 text-tianyi-900" },
	doneOk: { label: "完成", className: "border-sakura-300 bg-sakura-100 text-sakura-900" },
	doneError: { label: "失败", className: "border-sakura-400 bg-sakura-100 text-sakura-900" },
} as const;

/** 工具调用卡片：名称、参数摘要、状态徽章；展开看参数详情与输出/结果预览。 */
export function ToolCard(props: ToolCardProps) {
	const [expanded, setExpanded] = useState(false);
	const status = props.phase !== "done" ? STATUS[props.phase] : props.isError ? STATUS.doneError : STATUS.doneOk;
	const duration =
		props.phase === "done" && props.durationMs !== undefined && props.durationMs !== null
			? ` · ${(props.durationMs / 1000).toFixed(1)}s`
			: "";
	const hasBody = props.detail !== null || props.output != null || props.result != null || props.note != null;

	return (
		<div className="overflow-hidden rounded-card border border-tianyi-200 bg-surface shadow-soft">
			<button
				type="button"
				onClick={() => {
					if (hasBody) setExpanded(!expanded);
				}}
				className="focus-neko flex w-full items-center gap-2 px-3 py-2 text-left"
			>
				<span aria-hidden className="text-tianyi-500">
					⚡
				</span>
				<span className="font-mono text-[13px] font-semibold text-tianyi-800">{props.name}</span>
				<span className="min-w-0 flex-1 truncate font-mono text-xs text-ink-600">{props.summary}</span>
				<span
					className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${status.className}`}
				>
					{props.phase === "running" && <span className="size-1.5 animate-pulse-soft rounded-full bg-tianyi-500" />}
					{status.label}
					{duration}
				</span>
				{hasBody && (
					<span aria-hidden className="shrink-0 text-ink-400">
						{expanded ? "▾" : "▸"}
					</span>
				)}
			</button>
			{expanded && (
				<div className="space-y-2 border-t border-tianyi-100 px-3 py-2">
					{props.detail !== null && (
						<pre className="max-h-48 overflow-auto rounded-lg bg-ink-50 p-2 font-mono text-xs text-ink-700">
							{props.detail}
						</pre>
					)}
					{props.output != null && props.output !== "" && (
						<div>
							<div className="mb-1 text-xs font-medium text-tianyi-700">输出</div>
							<pre className="max-h-48 overflow-auto rounded-lg bg-tianyi-50 p-2 font-mono text-xs text-ink-700">
								{props.output}
							</pre>
						</div>
					)}
					{props.result != null && props.result !== "" && (
						<div>
							<div className={`mb-1 text-xs font-medium ${props.isError ? "text-sakura-800" : "text-ink-600"}`}>
								{props.isError ? "错误输出" : "结果"}
							</div>
							<pre
								className={`max-h-48 overflow-auto rounded-lg p-2 font-mono text-xs ${
									props.isError ? "bg-sakura-50 text-sakura-900" : "bg-ink-50 text-ink-700"
								}`}
							>
								{props.result}
							</pre>
						</div>
					)}
					{props.note != null && <div className="text-xs italic text-ink-500">{props.note}</div>}
				</div>
			)}
		</div>
	);
}
