import { useEffect, useRef, useState } from "react";
import {
	chooseTarget,
	fetchOpenSession,
	type OpenSession,
	type OpenTargetId,
	openWorkspace,
	readStoredTarget,
	writeStoredTarget,
} from "../lib/open-workspace";
import { storeActions, useNekoState } from "../lib/store";
import { OpenTargetIcon } from "./app-icons";
import { Icon, Popover } from "./primitives";

/**
 * 顶栏「打开工作区」分体按钮：主按钮用上次选择的方式打开，下拉切换目标。
 * 入口只在本机访问时出现（/api/local/session 非 2xx 即隐藏）；失败只出页内提示，不影响聊天与草稿。
 */
export function OpenWorkspaceMenu({ ready }: { ready: boolean }) {
	const { workspaceRoot, currentSessionId, sessions, view } = useNekoState();
	const [session, setSession] = useState<OpenSession | null>(null);
	const [stored, setStored] = useState(() => readStoredTarget());
	const [anchor, setAnchor] = useState<HTMLElement | null>(null);
	const [busy, setBusy] = useState(false);
	const busyRef = useRef(false);
	const alive = useRef(true);

	useEffect(() => {
		alive.current = true;
		void fetchOpenSession().then((next) => {
			if (alive.current) setSession(next);
		});
		return () => {
			alive.current = false;
		};
	}, []);

	if (session === null) return null;
	const current = sessions.find((item) => item.id === currentSessionId);
	const path = view?.cwd ?? current?.workspaceRoot ?? workspaceRoot;
	const target = chooseTarget(session.targets, stored);
	const enabled = ready && currentSessionId !== null && path !== "" && target !== undefined && !busy;
	const mainLabel = target === undefined ? "打开工作区" : `用 ${target.label} 打开`;
	const disabledReason =
		target === undefined
			? "本机没有可用的打开方式"
			: currentSessionId === null
				? "请先选择会话"
				: !ready
					? "连接未就绪"
					: undefined;

	const run = async (id: OpenTargetId): Promise<void> => {
		if (busyRef.current || path === "") return;
		busyRef.current = true;
		setBusy(true);
		setAnchor(null);
		try {
			await openWorkspace(session.csrf, id, path);
			writeStoredTarget(id);
			setStored(id);
		} catch (error) {
			storeActions.notice({
				level: "error",
				text: `打开失败：${error instanceof Error ? error.message : String(error)}`,
			});
			// 本机环境可能已变（如 VS Code 被卸载）：刷新可用目标。
			void fetchOpenSession().then((next) => {
				if (alive.current && next !== null) setSession(next);
			});
		} finally {
			busyRef.current = false;
			setBusy(false);
		}
	};

	const toggleMenu = (button: HTMLElement): void => {
		if (anchor !== null) {
			setAnchor(null);
			return;
		}
		setAnchor(button);
		void fetchOpenSession().then((next) => {
			if (alive.current && next !== null) setSession(next);
		});
	};

	return (
		<>
			<span className="open-split" data-open-workspace>
				<button
					type="button"
					className="icon-btn open-main"
					aria-label={mainLabel}
					title={enabled || busy ? mainLabel : `${mainLabel}（${disabledReason ?? "不可用"}）`}
					disabled={!enabled}
					onClick={() => target !== undefined && void run(target.id)}
				>
					{target === undefined ? <Icon name="folder" /> : <OpenTargetIcon id={target.id} label={target.label} />}
				</button>
				<button
					type="button"
					className="icon-btn open-more"
					aria-label="选择打开方式"
					title="选择打开方式"
					aria-haspopup="dialog"
					aria-expanded={anchor !== null}
					disabled={!ready || currentSessionId === null || busy}
					onClick={(event) => toggleMenu(event.currentTarget)}
				>
					<Icon name="chevron" size={16} />
				</button>
			</span>
			{anchor && (
				<Popover anchor={anchor} label="打开工作区" onClose={() => setAnchor(null)}>
					<div className="section-label">打开工作区</div>
					{session.targets.map((item) => (
						<button
							type="button"
							key={item.id}
							className="chrome-row"
							disabled={!item.available}
							title={item.available ? undefined : item.reason}
							onClick={() => void run(item.id)}
						>
							<OpenTargetIcon id={item.id} label={item.label} />
							<span className="min-w-0 flex-1">
								<span className="block truncate">{item.label}</span>
								{!item.available && item.reason !== undefined && (
									<span className="block truncate text-xs text-ink-500">{item.reason}</span>
								)}
							</span>
						</button>
					))}
				</Popover>
			)}
		</>
	);
}
