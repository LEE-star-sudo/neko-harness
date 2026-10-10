import { Link } from "@tanstack/react-router";
import type { ConnState } from "../lib/store";

const CONN_BADGE: Record<ConnState, { label: string; className: string }> = {
	open: { label: "已连接", className: "bg-tianyi-100 text-tianyi-900 border-tianyi-300" },
	connecting: { label: "连接中…", className: "bg-ink-100 text-ink-600 border-ink-200" },
	reconnecting: { label: "重连中…", className: "bg-sakura-100 text-sakura-900 border-sakura-300" },
};

/** 顶栏：左侧 logo，右侧连接状态与设置入口。模型/用量/忙碌在输入区上方状态条。 */
export function TopBar(props: { conn: ConnState }) {
	const conn = CONN_BADGE[props.conn];
	return (
		<header className="flex items-center gap-3 border-b border-sakura-200/70 bg-surface/80 px-4 py-2.5 backdrop-blur">
			<Link to="/" className="focus-neko flex items-baseline gap-1.5 rounded-lg no-underline">
				<span className="text-xl font-extrabold tracking-tight text-sakura-800">neko</span>
				<span className="text-xs font-medium text-tianyi-600">web</span>
			</Link>
			<div className="min-w-0 flex-1" />
			<span className={`rounded-full border px-2.5 py-0.5 text-xs ${conn.className}`}>{conn.label}</span>
			<Link
				to="/settings"
				className="focus-neko rounded-full px-2 py-0.5 text-ink-500 no-underline hover:bg-sakura-100 hover:text-sakura-800"
				aria-label="设置"
				title="设置"
			>
				<span aria-hidden>⚙</span>
			</Link>
		</header>
	);
}
