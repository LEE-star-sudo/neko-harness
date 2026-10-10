import { useState } from "react";
import { Composer } from "../components/composer";
import { MessageList } from "../components/message-list";
import { SessionList } from "../components/session-list";
import { StatusBar } from "../components/status-bar";
import { TopBar } from "../components/top-bar";
import { useNekoState } from "../lib/store";

export function ChatPage() {
	const { view, phase, notice } = useNekoState();
	const [sidebarOpen, setSidebarOpen] = useState(true);
	const busy = view?.busy ?? false;
	const status = view?.status ?? null;

	return (
		<div className="flex h-dvh">
			<SessionList open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
			<div className="flex min-w-0 flex-1 flex-col">
				<TopBar conn={phase} onToggleSessions={() => setSidebarOpen(!sidebarOpen)} />
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
				<MessageList view={view} busy={busy} />
				<StatusBar model={view?.model ?? "…"} usage={view?.usage ?? null} busy={busy} status={status} />
				<Composer busy={busy} status={status} />
			</div>
		</div>
	);
}
