import { useEffect, useState } from "react";
import { Composer } from "../components/composer";
import { MessageList } from "../components/message-list";
import { folderName, useMobile } from "../components/primitives";
import { SessionList } from "../components/session-list";
import { TopBar } from "../components/top-bar";
import { appActions, reportError } from "../lib/bootstrap";
import { MOBILE_QUERY } from "../lib/layout";
import { useNekoState } from "../lib/store";

export function ChatPage() {
	const { view, phase, notice, operating, workspaceRoot, currentSessionId } = useNekoState();
	const mobile = useMobile();
	const [sidebarOpen, setSidebarOpen] = useState(() => !window.matchMedia(MOBILE_QUERY).matches);
	useEffect(() => {
		setSidebarOpen(!mobile);
	}, [mobile]);
	const busy = view?.busy ?? false;
	const status = view?.status ?? null;

	return (
		<div className="flex h-dvh">
			<a href="#main-content" className="skip-link">
				跳到主内容
			</a>
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
						<MessageList view={view} busy={busy} />
					)}
					<Composer disabled={phase !== "ready" || operating} busy={busy} status={status} />
				</main>
			</div>
		</div>
	);
}
