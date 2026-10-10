import { useEffect, useRef, useState } from "react";
import { appActions } from "../lib/bootstrap";
import { useNekoState } from "../lib/store";

/**
 * 会话列表侧栏：目录订阅驱动（neko.session-directory），实时更新。
 * 当前会话高亮；支持新建、切换、归档（两步内联确认）。移动端抽屉式，桌面端常显。
 */
export function SessionList(props: { open: boolean; onClose: () => void }) {
	const { sessions, currentSessionId, phase } = useNekoState();
	const [confirmId, setConfirmId] = useState<string | null>(null);
	const confirmTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

	useEffect(() => {
		return () => {
			if (confirmTimer.current !== undefined) clearTimeout(confirmTimer.current);
		};
	}, []);

	const requestArchive = (id: string): void => {
		if (confirmId === id) {
			setConfirmId(null);
			if (confirmTimer.current !== undefined) clearTimeout(confirmTimer.current);
			appActions.archiveSession(id);
			return;
		}
		setConfirmId(id);
		if (confirmTimer.current !== undefined) clearTimeout(confirmTimer.current);
		confirmTimer.current = setTimeout(() => {
			setConfirmId((current) => (current === id ? null : current));
		}, 3000);
	};

	const panelClass = props.open ? "translate-x-0" : "-translate-x-full md:translate-x-0";

	return (
		<>
			{props.open && (
				<button
					type="button"
					aria-label="关闭会话列表"
					className="focus-neko fixed inset-0 z-30 cursor-default bg-ink-900/20 md:hidden"
					onClick={props.onClose}
				/>
			)}
			<aside
				className={`fixed inset-y-0 left-0 z-40 flex w-60 transform flex-col border-r border-sakura-200 bg-surface shadow-lift transition-transform duration-200 md:static md:z-auto md:shadow-none ${panelClass}`}
			>
				<div className="flex items-center gap-2 border-b border-sakura-200/70 px-3 py-2.5">
					<span className="text-sm font-bold text-sakura-800">会话</span>
					<div className="flex-1" />
					<button
						type="button"
						onClick={appActions.createSession}
						disabled={phase !== "ready"}
						className="focus-neko inline-flex items-center gap-1 rounded-full bg-sakura-700 px-2.5 py-1 text-xs font-semibold text-white shadow-soft hover:bg-sakura-800 disabled:opacity-40"
						title="新建会话"
					>
						<span aria-hidden>＋</span>
						新建
					</button>
				</div>
				<div className="flex-1 overflow-y-auto px-2 py-2">
					{sessions.length === 0 && (
						<div className="px-2 py-6 text-center text-xs text-ink-500">
							{phase === "ready" ? "暂无会话，点上方「新建」。" : "等待网关连接…"}
						</div>
					)}
					<ul className="flex flex-col gap-1">
						{sessions.map((session) => {
							const active = session.id === currentSessionId;
							const confirming = confirmId === session.id;
							return (
								<li key={session.id} className="group flex items-center gap-1">
									<button
										type="button"
										onClick={() => {
											appActions.selectSession(session.id);
											props.onClose();
										}}
										className={`focus-neko flex min-w-0 flex-1 items-center gap-1.5 rounded-xl border px-2.5 py-2 text-left text-[13px] ${
											active
												? "border-sakura-300 bg-sakura-100 font-medium text-sakura-900"
												: "border-transparent text-ink-700 hover:border-sakura-200 hover:bg-sakura-50"
										}`}
									>
										<span aria-hidden className={active ? "text-sakura-500" : "text-tianyi-400"}>
											◈
										</span>
										<span className="truncate">会话 {session.id}</span>
										{session.id === "1" && (
											<span className="shrink-0 rounded-full border border-tianyi-200 bg-tianyi-50 px-1.5 text-[10px] text-tianyi-800">
												root
											</span>
										)}
									</button>
									<button
										type="button"
										onClick={() => {
											requestArchive(session.id);
										}}
										className={`focus-neko shrink-0 rounded-lg px-1.5 py-1 text-xs ${
											confirming
												? "bg-sakura-700 font-semibold text-white"
												: "text-ink-400 opacity-0 group-hover:opacity-100 hover:bg-sakura-100 hover:text-sakura-800"
										}`}
										title={confirming ? "再次点击确认归档" : "归档会话"}
									>
										{confirming ? "确认?" : "✕"}
									</button>
								</li>
							);
						})}
					</ul>
				</div>
			</aside>
		</>
	);
}
