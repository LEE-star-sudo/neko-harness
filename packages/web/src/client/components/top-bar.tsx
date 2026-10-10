import type { ConnPhase } from "../lib/store";
import { useNekoState } from "../lib/store";
import { folderName, Icon } from "./nav-primitives";

const phases: Record<ConnPhase, string> = {
	ready: "已连接",
	connecting: "连接中…",
	reconnecting: "重连中…",
	error: "连接失败",
};
export function TopBar(props: { conn: ConnPhase; onToggleSessions: () => void; sidebarOpen?: boolean }) {
	const { workspaceRoot, currentSessionId, operating } = useNekoState();
	return (
		<header className="nav-theme nav-topbar">
			<button
				type="button"
				className="nav-icon"
				aria-label="切换侧栏"
				title="切换侧栏"
				aria-expanded={props.sidebarOpen}
				onClick={props.onToggleSessions}
			>
				<Icon name="panel" />
			</button>
			<span className="nav-top-path" title={workspaceRoot}>
				<Icon name="folder" />
				<span className="nav-truncate">{folderName(workspaceRoot) || "工作区"}</span>
			</span>
			<span className="nav-muted">/</span>
			<span className="nav-truncate">{currentSessionId ? `会话 ${currentSessionId}` : "新会话"}</span>
			<output className={`nav-connection ${props.conn === "ready" ? "is-connected" : ""}`}>
				{operating ? "切换中…" : phases[props.conn]}
			</output>
		</header>
	);
}
