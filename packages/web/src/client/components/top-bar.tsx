import { sessionName } from "@neko-harness/core/session-display";
import type { ConnPhase } from "../lib/store";
import { useNekoState } from "../lib/store";
import { folderName, Icon } from "./primitives";

const phases: Record<ConnPhase, string> = {
	ready: "已连接",
	connecting: "连接中…",
	reconnecting: "重连中…",
	error: "连接失败",
};
export function TopBar(props: { conn: ConnPhase; onToggleSessions: () => void; sidebarOpen?: boolean }) {
	const { workspaceRoot, currentSessionId, operating, sessions } = useNekoState();
	const current = sessions.find((session) => session.id === currentSessionId);
	return (
		<header className="chrome topbar">
			<button
				type="button"
				className="icon-btn"
				aria-label="切换侧栏"
				title="切换侧栏"
				aria-expanded={props.sidebarOpen}
				onClick={props.onToggleSessions}
			>
				<Icon name="panel" />
			</button>
			<span className="topbar-path" title={workspaceRoot}>
				<Icon name="folder" />
				<span className="truncate min-w-0">{folderName(workspaceRoot) || "工作区"}</span>
			</span>
			<span className="text-ink-500">/</span>
			<span className="truncate min-w-0" title={current ? sessionName(current, "新会话") : undefined}>
				{current ? sessionName(current, "新会话") : "新会话"}
			</span>
			<output
				className={`conn-status ${props.conn === "ready" ? "is-connected" : props.conn === "error" ? "is-error" : ""}`}
			>
				{operating ? "切换中…" : phases[props.conn]}
			</output>
		</header>
	);
}
