import type { SubagentSummary } from "@neko-harness/core";
import { useEffect, useRef, useState } from "react";
import { ApprovalInbox } from "../components/approval-inbox";
import { Composer } from "../components/composer";
import { JobPanel } from "../components/job-panel";
import { MessageList } from "../components/message-list";
import { DismissButton, folderName, useMobile } from "../components/primitives";
import { SessionList } from "../components/session-list";
import { SubagentPanel } from "../components/subagent-panel";
import { TopBar } from "../components/top-bar";
import { appActions, reportError } from "../lib/bootstrap";
import { MOBILE_QUERY } from "../lib/layout";
import { storeActions, useNekoState } from "../lib/store";

const INFO_NOTICE_MS = 8000;

export function ChatPage() {
	const { view, phase, notice, operating, workspaceRoot, currentSessionId } = useNekoState();
	const mobile = useMobile();
	useEffect(() => {
		if (notice?.level !== "info") return;
		const timer = setTimeout(storeActions.clearNotice, INFO_NOTICE_MS);
		return () => clearTimeout(timer);
	}, [notice]);
	const targetSequence = useRef(0);
	const [narrow, setNarrow] = useState(() => window.matchMedia("(max-width: 1023px)").matches);
	useEffect(() => {
		const query = window.matchMedia("(max-width: 1023px)");
		const update = () => setNarrow(query.matches);
		query.addEventListener("change", update);
		return () => query.removeEventListener("change", update);
	}, []);
	const [panels, setPanels] = useState<
		Record<
			string,
			{ open: boolean; selected: string | null; entries: SubagentSummary[]; target?: { taskId: number; nonce: number } }
		>
	>({});
	const agentEntries = view?.agents;
	useEffect(() => {
		if (!currentSessionId || !agentEntries?.length) return;
		setPanels((previous) => ({
			...previous,
			[currentSessionId]: {
				open: previous[currentSessionId]?.open ?? true,
				...(previous[currentSessionId]?.target ? { target: previous[currentSessionId]!.target } : {}),
				selected: previous[currentSessionId]?.selected ?? agentEntries[0]!.agentId,
				entries: agentEntries,
			},
		}));
	}, [agentEntries, currentSessionId]);
	// Tied to the session it was opened in, so switching sessions closes it.
	const [jobsOpenFor, setJobsOpenFor] = useState<string | null>(null);
	const jobsOpen = jobsOpenFor !== null && jobsOpenFor === currentSessionId;
	const selectIdentity = (id: string, taskId?: number) => {
		if (!currentSessionId) return;
		setJobsOpenFor(null);
		const nonce = ++targetSequence.current;
		setPanels((previous) => ({
			...previous,
			[currentSessionId]: {
				open: true,
				selected: id,
				entries: agentEntries ?? [],
				...(taskId === undefined ? {} : { target: { taskId, nonce } }),
			},
		}));
	};
	const selectAgent = (taskId: number) => {
		const round = view?.subagents?.find((r) => r.taskId === taskId);
		if (round?.agentId) selectIdentity(round.agentId, taskId);
	};
	const [sidebarOpen, setSidebarOpen] = useState(() => !window.matchMedia(MOBILE_QUERY).matches);
	useEffect(() => {
		setSidebarOpen(!mobile);
	}, [mobile]);
	const approvalInPanel = narrow && !!panels[currentSessionId ?? ""]?.open;
	const busy = view?.busy ?? false;
	const status = view?.status ?? null;

	return (
		<div className="flex h-dvh">
			<a href="#main-content" className="skip-link">
				跳到主内容
			</a>
			<SessionList open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
			<div className="flex min-w-0 flex-1 flex-col">
				<TopBar
					sidebarOpen={sidebarOpen}
					conn={phase}
					onToggleSessions={() => setSidebarOpen(!sidebarOpen)}
					jobsOpen={jobsOpen}
					onToggleJobs={() => {
						if (!jobsOpen && currentSessionId)
							setPanels((previous) =>
								previous[currentSessionId]
									? { ...previous, [currentSessionId]: { ...previous[currentSessionId]!, open: false } }
									: previous,
							);
						setJobsOpenFor(jobsOpen ? null : (currentSessionId ?? null));
					}}
				/>
				{notice !== null && (
					<div
						className={`discrete-in flex items-center gap-2 border-b py-1 pr-2 pl-9 text-xs ${
							notice.level === "error"
								? "border-sakura-300 bg-sakura-100 text-sakura-900"
								: "border-tianyi-200 bg-tianyi-50 text-tianyi-900"
						}`}
						role="alert"
					>
						<span className="min-w-0 flex-1 text-center">{notice.text}</span>
						<DismissButton label="关闭提示" onClick={storeActions.clearNotice} />
					</div>
				)}
				<main id="main-content" tabIndex={-1} className="flex min-h-0 flex-1 flex-col focus:outline-none">
					{!currentSessionId && phase === "ready" && !operating ? (
						<div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
							<h1 className="text-xl font-semibold text-ink-900">{folderName(workspaceRoot)}</h1>
							<p className="text-sm text-ink-600">在这个工作区开始新的会话</p>
							<button
								type="button"
								className="btn-primary focus-neko rounded-xl px-4 py-2"
								onClick={() => {
									void appActions.createSession().catch(reportError);
								}}
							>
								新建会话
							</button>
						</div>
					) : (
						<MessageList
							view={view}
							busy={busy}
							onSubagent={selectAgent}
							tray={
								(agentEntries?.length ?? 0) > 0 ? (
									<button
										type="button"
										className="focus-neko rounded-full border border-sakura-300 bg-surface px-3.5 py-1 text-xs font-medium text-sakura-800 hover:bg-sakura-50"
										onClick={() =>
											selectIdentity(panels[currentSessionId ?? ""]?.selected ?? agentEntries![0]!.agentId)
										}
									>
										子智能体 · {agentEntries!.length} 个
										{agentEntries!.some((d) => d.approvalCount)
											? ` · 待审批 ${agentEntries!.reduce((n, d) => n + (d.approvalCount ?? 0), 0)}`
											: ""}
										{agentEntries!.some((d) => d.historyThrough === undefined && d.status === "running")
											? ` · ${agentEntries!.filter((d) => d.historyThrough === undefined && d.status === "running").length} 运行中`
											: ""}
									</button>
								) : undefined
							}
						/>
					)}
					{!approvalInPanel && <ApprovalInbox />}
					<Composer disabled={phase !== "ready" || operating} busy={busy} status={status} />
				</main>
			</div>
			{Object.entries(panels).map(([sessionId, panel]) => (
				<SubagentPanel
					key={sessionId}
					entries={sessionId === currentSessionId ? (agentEntries ?? panel.entries) : panel.entries}
					approval={approvalInPanel && sessionId === currentSessionId ? <ApprovalInbox /> : undefined}
					selected={panel.selected}
					open={sessionId === currentSessionId && panel.open}
					onSelect={selectIdentity}
					target={panel.target}
					onClose={() => setPanels((previous) => ({ ...previous, [sessionId]: { ...panel, open: false } }))}
				/>
			))}
			{currentSessionId && view?.jobs !== undefined && (
				<JobPanel
					key={currentSessionId}
					sessionId={currentSessionId}
					jobs={view.jobs}
					open={jobsOpen}
					onClose={() => setJobsOpenFor(null)}
				/>
			)}
		</div>
	);
}
