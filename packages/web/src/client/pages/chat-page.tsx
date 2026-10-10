import { Composer } from "../components/composer";
import { MessageList } from "../components/message-list";
import { StatusBar } from "../components/status-bar";
import { TopBar } from "../components/top-bar";
import { useServerInfo } from "../lib/api";
import { useNekoState } from "../lib/store";

export function ChatPage() {
	const { view, conn, notice } = useNekoState();
	const info = useServerInfo();
	const model = view?.model ?? info.data?.model ?? "…";
	const busy = view?.busy ?? false;
	const status = view?.status ?? null;

	return (
		<div className="flex h-dvh flex-col bg-base">
			<TopBar conn={conn} />
			{notice !== null && (
				<div
					className={`border-b px-4 py-1.5 text-center text-xs ${
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
			<StatusBar model={model} usage={view?.usage ?? null} busy={busy} status={status} />
			<Composer busy={busy} status={status} />
		</div>
	);
}
