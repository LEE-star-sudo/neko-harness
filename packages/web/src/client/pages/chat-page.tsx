import { useEffect, useState } from "react";
import { Composer } from "../components/composer";
import { MessageList } from "../components/message-list";
import { folderName, useMobile } from "../components/nav-primitives";
import { SessionList } from "../components/session-list";
import { StatusBar } from "../components/status-bar";
import { TopBar } from "../components/top-bar";
import { appActions, reportError } from "../lib/bootstrap";
import { useNekoState } from "../lib/store";

export function ChatPage() {
	const { view, phase, notice, operating, workspaceRoot, currentSessionId } = useNekoState();
	const mobile = useMobile();
	const [sidebarOpen, setSidebarOpen] = useState(() => !window.matchMedia("(max-width: 767px)").matches);
	useEffect(() => {
		setSidebarOpen(!mobile);
	}, [mobile]);
	const busy = view?.busy ?? false;
	const status = view?.status ?? null;

	return (
		<div className="flex h-dvh">
			<SessionList open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
			<div className="flex min-w-0 flex-1 flex-col">
				<TopBar sidebarOpen={sidebarOpen} conn={phase} onToggleSessions={() => setSidebarOpen(!sidebarOpen)} />
				{notice !== null && (
					<div
						className={`discrete-in border-b px-4 py-1.5 text-center text-xs ${
							notice.level === "error"
								? "border-sakura-300 bg-sakura-100 text-sakura-900"
								: "border-tianyi-200 bg-tianyi-50 text-tianyi-900"
						}`}
						role="alert"
					>
						{notice.text}
					</div>
				)}
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
					<MessageList view={view} busy={busy} />
				)}
				<StatusBar
					model={view?.model ?? "…"}
					agentModel={view?.agent.model ?? null}
					usage={view?.usage ?? null}
					busy={busy}
					status={status}
				/>
				<Composer disabled={phase !== "ready" || operating || !currentSessionId || !view} busy={busy} status={status} />
			</div>
		</div>
	);
}
