import { sessionName } from "@neko-harness/core/session-display";
import type { ConnPhase } from "../lib/store";
import { useNekoState } from "../lib/store";
import { ExportMenu } from "./export-menu";
import { folderName, Icon } from "./primitives";
import { UpdateNotice } from "./update-notice";

const phases: Record<ConnPhase, string> = {
	ready: "已连接",
	connecting: "连接中…",
	reconnecting: "重连中…",
	error: "连接失败",
};
export function TopBar(props: {
	conn: ConnPhase;
	onToggleSessions: () => void;
	sidebarOpen?: boolean;
	onToggleJobs?: () => void;
	jobsOpen?: boolean;
}) {
	const { workspaceRoot, currentSessionId, operating, sessions, view } = useNekoState();
	// `jobs` is absent on a gateway without background jobs, so the entry stays hidden there.
	const jobs = view?.jobs;
	const running = jobs?.filter((job) => job.status === "running").length ?? 0;
	const current = sessions.find((session) => session.id === currentSessionId);
	return (
		<>
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
				{jobs !== undefined && jobs.length > 0 && props.onToggleJobs && (
					<button
						type="button"
						className="focus-neko shrink-0 whitespace-nowrap rounded-full border border-sakura-300 px-2.5 py-0.5 text-xs text-sakura-800 hover:bg-sakura-50"
						aria-expanded={props.jobsOpen}
						title="后台任务"
						onClick={props.onToggleJobs}
					>
						任务{running > 0 ? ` · ${running} 运行中` : ` ${jobs.length}`}
					</button>
				)}
				<ExportMenu />
			</header>
			<UpdateNotice />
		</>
	);
}
