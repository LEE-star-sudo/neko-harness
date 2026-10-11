import { useEffect, useRef, useState } from "react";
import { appActions } from "../lib/bootstrap";
import type { NekoDirectoryPage } from "../lib/contract";
import { pathCrumbs } from "../lib/path-crumbs";
import { folderName, Icon, Modal } from "./nav-primitives";

export function WorkspacePicker({ initialPath, onClose }: { initialPath: string; onClose: () => void }) {
	const [path, setPath] = useState(initialPath);
	const [input, setInput] = useState(initialPath);
	const [query, setQuery] = useState("");
	const [hidden, setHidden] = useState(false);
	const [page, setPage] = useState<NekoDirectoryPage | null>(null);
	const [loading, setLoading] = useState(true);
	const [adding, setAdding] = useState(false);
	const [error, setError] = useState("");
	const [retry, setRetry] = useState(0);
	const generation = useRef(0);
	const pathInput = useRef<HTMLInputElement>(null);
	const addingRef = useRef(false);
	useEffect(() => {
		void retry; // Explicit retry reissues the current directory request.
		const current = ++generation.current;
		setLoading(true);
		setError("");
		setPage(null);
		void appActions.browse({ path, query, showHidden: hidden }).then(
			(result) => {
				if (current !== generation.current) return;
				setPage(result);
				setInput((value) => (value === path ? result.path : value));
				setLoading(false);
			},
			(e: unknown) => {
				if (current === generation.current) {
					setError(String(e));
					setLoading(false);
				}
			},
		);
		return () => {
			++generation.current;
		};
	}, [path, query, hidden, retry]);
	const navigate = (next: string) => {
		pathInput.current?.focus();
		setPath(next);
		setInput(next);
		setQuery("");
		setRetry((r) => r + 1);
	};
	const more = async () => {
		if (!page?.next || loading) return;
		const current = ++generation.current;
		setLoading(true);
		setError("");
		try {
			const result = await appActions.browse({ path, query, showHidden: hidden, cursor: page.next });
			if (current === generation.current) setPage({ ...result, entries: [...page.entries, ...result.entries] });
		} catch (e) {
			if (current === generation.current) setError(String(e));
		} finally {
			if (current === generation.current) setLoading(false);
		}
	};
	const add = async () => {
		if (!page || loading || addingRef.current) return;
		addingRef.current = true;
		setAdding(true);
		setError("");
		try {
			await appActions.addWorkspace(page.path);
			onClose();
		} catch (e) {
			setError(String(e));
		} finally {
			addingRef.current = false;
			setAdding(false);
		}
	};
	const { root, rootLabel, crumbs } = pathCrumbs(page?.path ?? path);
	return (
		<Modal title="添加工作区" onClose={onClose} locked={adding}>
			<div className="nav-picker-controls">
				<p className="nav-muted">选择 Harness 所在电脑上的文件夹</p>
				<nav className="nav-breadcrumbs" aria-label="目录路径">
					<button type="button" disabled={adding} onClick={() => navigate(root)}>
						{rootLabel}
					</button>
					{crumbs.map((crumb) => (
						<button type="button" key={crumb.path} disabled={adding} onClick={() => navigate(crumb.path)}>
							{crumb.label} /
						</button>
					))}
				</nav>
				<form
					className="nav-path-form"
					onSubmit={(e) => {
						e.preventDefault();
						navigate(input);
					}}
				>
					<input
						ref={pathInput}
						aria-label="完整目录路径"
						value={input}
						disabled={adding}
						onChange={(e) => setInput(e.target.value)}
					/>
					<button className="nav-button" type="submit" disabled={adding}>
						前往
					</button>
				</form>
				<div className="nav-filter-row">
					<input
						aria-label="筛选文件夹"
						placeholder="筛选文件夹…"
						value={query}
						disabled={adding}
						onChange={(e) => setQuery(e.target.value)}
					/>
					<label>
						<input type="checkbox" checked={hidden} disabled={adding} onChange={(e) => setHidden(e.target.checked)} />
						隐藏目录
					</label>
				</div>
			</div>
			<fieldset
				className="nav-folder-list"
				aria-label="文件夹列表"
				aria-busy={loading}
				onKeyDown={(event) => {
					if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
					event.preventDefault();
					const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
					const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
					buttons[(index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
				}}
			>
				{error && (
					<div role="alert" className="nav-error">
						{error}
						<button type="button" className="nav-button" disabled={adding} onClick={() => setRetry((r) => r + 1)}>
							重试
						</button>
					</div>
				)}
				{page?.parent && (
					<button type="button" className="nav-row" disabled={adding || loading} onClick={() => navigate(page.parent!)}>
						<Icon name="up" />
						上级目录
					</button>
				)}
				{page?.entries.map((entry) => (
					<button
						type="button"
						className="nav-row"
						key={entry.path}
						disabled={adding || loading || !!entry.error}
						title={entry.error ?? entry.path}
						onClick={() => navigate(entry.path)}
					>
						<Icon name="folder" />
						<span className="nav-truncate">{entry.name}</span>
						{entry.error && <span className="nav-muted">不可访问</span>}
					</button>
				))}
				{loading && <output className="nav-empty">正在读取目录…</output>}
				{!loading && page?.entries.length === 0 && <p className="nav-empty">没有匹配的子文件夹，可选择当前目录</p>}
				{page?.next && (
					<button type="button" className="nav-button" disabled={loading || adding} onClick={() => void more()}>
						加载更多
					</button>
				)}
			</fieldset>
			<div className="nav-picker-footer">
				<div>
					<strong>{folderName(page?.path ?? path)}</strong>
					<p className="nav-path">{page?.path ?? path}</p>
				</div>
				<div className="nav-actions">
					<button type="button" className="nav-button" disabled={adding} onClick={onClose}>
						取消
					</button>
					<button
						type="button"
						className="nav-button nav-primary"
						disabled={!page || loading || adding || !!error}
						onClick={() => void add()}
					>
						{adding ? "正在添加…" : "选择文件夹"}
					</button>
				</div>
			</div>
		</Modal>
	);
}
