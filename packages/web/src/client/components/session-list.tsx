import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { appActions, reportError } from "../lib/bootstrap";
import { workspaceSessions } from "../lib/gateway";
import { useNekoState } from "../lib/store";
import { folderName, Icon, Modal, Popover, useMobile } from "./nav-primitives";
import { WorkspacePicker } from "./workspace-picker";

export function SessionList({ open, onClose }: { open: boolean; onClose: () => void }) {
	const state = useNekoState();
	const mobile = useMobile();
	const [menu, setMenu] = useState<{ anchor: HTMLElement; id?: string } | null>(null);
	const [picker, setPicker] = useState(false);
	const [archive, setArchive] = useState<string | null>(null);
	const [archiveError, setArchiveError] = useState("");
	const [query, setQuery] = useState("");
	const disabled = state.phase !== "ready" || state.operating;
	const sessions = workspaceSessions(state.sessions, state.workspaceRoot).filter((s) =>
		`会话 ${s.id}`.includes(query.trim()),
	);
	const action = (operation: Promise<void>) => {
		void operation
			.then(() => {
				if (mobile) onClose();
			})
			.catch(reportError);
	};
	if (!open) return null;
	const content = (
		<>
			<div className="nav-sidebar-top">
				<div className="nav-workspace-heading">
					<button
						type="button"
						className="nav-workspace-trigger"
						aria-label="切换工作区"
						aria-expanded={menu !== null && !menu.id}
						disabled={disabled}
						onClick={(e) => setMenu({ anchor: e.currentTarget })}
					>
						<span className="nav-workspace-mark">
							<Icon name="folder" />
						</span>
						<span className="nav-truncate">{folderName(state.workspaceRoot) || "工作区"}</span>
						<Icon name="chevron" />
					</button>
					{!mobile && (
						<button type="button" className="nav-icon" aria-label="收起侧栏" title="收起侧栏" onClick={onClose}>
							<Icon name="panel" />
						</button>
					)}
				</div>
				<button
					type="button"
					className="nav-row nav-new"
					disabled={disabled}
					onClick={() => action(appActions.createSession())}
				>
					<Icon name="plus" />
					新建会话
				</button>
				<div className="nav-search">
					<Icon name="search" />
					<input
						aria-label="搜索当前工作区会话"
						placeholder="搜索会话…"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
					/>
				</div>
			</div>
			<div className="nav-section-label">
				会话 <span>{sessions.length}</span>
			</div>
			<div className="nav-session-scroll">
				<ul className="nav-session-list">
					{sessions.map((session) => (
						<li
							key={session.id}
							className={`nav-session-row ${session.id === state.currentSessionId ? "is-active" : ""}`}
						>
							<button
								type="button"
								className="nav-row nav-session-select"
								disabled={disabled}
								aria-current={session.id === state.currentSessionId ? "page" : undefined}
								onClick={() => action(appActions.selectSession(session.id))}
							>
								<Icon name="chat" />
								<span className="nav-truncate">会话 {session.id}</span>
							</button>
							<button
								type="button"
								className="nav-icon nav-row-more"
								disabled={disabled}
								aria-label={`会话 ${session.id} 的操作`}
								title="会话操作"
								onClick={(e) => setMenu({ anchor: e.currentTarget, id: session.id })}
							>
								<Icon name="more" />
							</button>
						</li>
					))}
				</ul>
				{sessions.length === 0 && (
					<div className="nav-empty">
						{state.phase !== "ready" ? "等待网关连接…" : query ? "没有匹配的会话" : "此工作区暂无会话"}
					</div>
				)}
			</div>
			<div className="nav-sidebar-bottom">
				<span className="nav-path" title={state.workspaceRoot}>
					{state.workspaceRoot}
				</span>
				<Link to="/settings" className="nav-row">
					<Icon name="settings" />
					设置
				</Link>
			</div>
		</>
	);
	return (
		<>
			{mobile ? (
				<Modal title="工作区与会话" drawer onClose={onClose}>
					{content}
				</Modal>
			) : (
				<aside className="nav-theme nav-sidebar" aria-label="工作区与会话">
					{content}
				</aside>
			)}
			{menu && (
				<Popover anchor={menu.anchor} label={menu.id ? "会话操作" : "选择工作区"} onClose={() => setMenu(null)}>
					{menu.id ? (
						<button
							type="button"
							className="nav-row"
							onClick={() => {
								setArchive(menu.id!);
								setArchiveError("");
								setMenu(null);
							}}
						>
							<Icon name="archive" />
							归档会话
						</button>
					) : (
						<>
							<div className="nav-section-label">工作区</div>
							<div className="nav-workspace-options">
								{state.workspaces.map((w) => (
									<button
										type="button"
										className={`nav-workspace-option ${w.path === state.workspaceRoot ? "is-active" : ""}`}
										key={w.path}
										title={w.path}
										onClick={() => {
											setMenu(null);
											setQuery("");
											action(appActions.selectWorkspace(w.path));
										}}
									>
										<Icon name="folder" />
										<span>
											<strong>{folderName(w.path)}</strong>
											<small>{w.path}</small>
										</span>
										{w.path === state.workspaceRoot && (
											<span role="img" aria-label="当前工作区">
												✓
											</span>
										)}
									</button>
								))}
							</div>
							<button
								type="button"
								className="nav-row nav-add-workspace"
								onClick={() => {
									setMenu(null);
									setPicker(true);
								}}
							>
								<Icon name="plus" />
								添加工作区
							</button>
						</>
					)}
				</Popover>
			)}
			{picker && <WorkspacePicker initialPath={state.workspaceRoot} onClose={() => setPicker(false)} />}
			{archive && (
				<Modal title="归档会话" locked={state.operating} onClose={() => setArchive(null)}>
					<div className="nav-confirm">
						<p>归档会话 {archive}？会话将从列表中隐藏，工作区和文件仍会保留。</p>
						{archiveError && (
							<p role="alert" className="nav-error">
								{archiveError}
							</p>
						)}
						<div className="nav-actions">
							<button type="button" className="nav-button" disabled={state.operating} onClick={() => setArchive(null)}>
								取消
							</button>
							<button
								type="button"
								className="nav-button nav-primary"
								disabled={state.operating}
								onClick={() => {
									void appActions
										.archiveSession(archive)
										.then(() => setArchive(null))
										.catch((e: unknown) => setArchiveError(String(e)));
								}}
							>
								确认归档
							</button>
						</div>
					</div>
				</Modal>
			)}
		</>
	);
}
