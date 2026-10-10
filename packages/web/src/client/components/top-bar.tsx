import { Link } from "@tanstack/react-router";
import type { UsageTotals } from "../../protocol";
import type { ConnState } from "../lib/store";

function formatTokens(tokens: number): string {
	if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
	if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
	return String(tokens);
}

function formatCost(cost: number): string {
	return `$${cost.toFixed(cost >= 1 ? 2 : 4)}`;
}

const CONN_BADGE: Record<ConnState, { label: string; className: string }> = {
	open: { label: "已连接", className: "bg-tianyi-100 text-tianyi-900 border-tianyi-300" },
	connecting: { label: "连接中…", className: "bg-ink-100 text-ink-600 border-ink-200" },
	reconnecting: { label: "重连中…", className: "bg-sakura-100 text-sakura-900 border-sakura-300" },
};

export function TopBar(props: {
	model: string;
	usage: UsageTotals | null;
	busy: boolean;
	status: string | null;
	conn: ConnState;
}) {
	const conn = CONN_BADGE[props.conn];
	return (
		<header className="flex items-center gap-3 border-b border-sakura-200/70 bg-surface/80 px-4 py-2.5 backdrop-blur">
			<Link to="/" className="flex items-baseline gap-1.5 no-underline">
				<span className="text-xl font-extrabold tracking-tight text-sakura-800">neko</span>
				<span className="text-xs font-medium text-tianyi-600">web</span>
			</Link>
			<div className="min-w-0 flex-1" />
			<span className="hidden truncate rounded-full border border-tianyi-200 bg-tianyi-50 px-2.5 py-0.5 font-mono text-xs text-tianyi-900 sm:inline">
				{props.model}
			</span>
			{props.usage !== null && (
				<span
					className="hidden rounded-full border border-sakura-200 bg-sakura-50 px-2.5 py-0.5 font-mono text-xs text-sakura-800 md:inline"
					title={`输入 ${props.usage.input} · 输出 ${props.usage.output} · 缓存读 ${props.usage.cacheRead}`}
				>
					↑{formatTokens(props.usage.input)} ↓{formatTokens(props.usage.output)} · {formatCost(props.usage.cost)}
				</span>
			)}
			{props.busy && props.status !== null && (
				<span className="inline-flex items-center gap-1.5 rounded-full border border-sakura-300 bg-sakura-100 px-2.5 py-0.5 text-xs font-medium text-sakura-900">
					<span className="size-1.5 animate-pulse-soft rounded-full bg-sakura-500" />
					{props.status}
				</span>
			)}
			<span className={`rounded-full border px-2.5 py-0.5 text-xs ${conn.className}`}>{conn.label}</span>
			<Link
				to="/settings"
				className="rounded-full px-2 py-0.5 text-ink-500 no-underline hover:bg-sakura-100 hover:text-sakura-800"
				aria-label="设置"
				title="设置"
			>
				<span aria-hidden>⚙</span>
			</Link>
		</header>
	);
}
