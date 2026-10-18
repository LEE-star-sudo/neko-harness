import type { WorkspaceClient } from "@neko-harness/gateway/client-session";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useResource } from "../lib/use-resource.ts";
import { Icon } from "./primitives";

export type WorkspaceApi = () => Pick<WorkspaceClient, "dir" | "file" | "changes" | "change">;

type TreeContext = {
	api: WorkspaceApi;
	active: boolean;
	version: string | number;
	expanded: ReadonlySet<string>;
	selected: string | null;
	focusPath: string | null;
	onToggle(path: string): void;
	onOpen(path: string): void;
	onFocusPath(path: string): void;
	/** A row that held the tab stop left the tree (collapsed or deleted). */
	onRowGone(path: string): void;
};

type Entry = { name: string; path: string; kind: "file" | "directory" | "symlink"; protected?: true };

const rowClass =
	"focus-neko flex w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-md py-1 pr-2 text-left text-sm text-ink-800 hover:bg-sakura-50 aria-selected:bg-tianyi-100";

function onRowKey(event: KeyboardEvent<HTMLElement>, entry: Entry, parent: string, ctx: TreeContext) {
	const tree = event.currentTarget.closest<HTMLElement>("[role=tree]");
	if (!tree) return;
	const rows = [...tree.querySelectorAll<HTMLElement>("[role=treeitem][data-path]")];
	const index = rows.indexOf(event.currentTarget);
	const isDir = entry.kind === "directory";
	const open = ctx.expanded.has(entry.path);
	const focusRow = (row: HTMLElement | undefined) => {
		if (!row) return;
		event.preventDefault();
		row.focus();
	};
	switch (event.key) {
		case "ArrowDown":
			return focusRow(rows[index + 1]);
		case "ArrowUp":
			return focusRow(rows[index - 1]);
		case "Home":
			return focusRow(rows[0]);
		case "End":
			return focusRow(rows.at(-1));
		case "ArrowRight":
			if (!isDir) return;
			if (!open) {
				event.preventDefault();
				return ctx.onToggle(entry.path);
			}
			return focusRow(rows[index + 1]?.dataset.parent === entry.path ? rows[index + 1] : undefined);
		case "ArrowLeft":
			if (isDir && open) {
				event.preventDefault();
				return ctx.onToggle(entry.path);
			}
			return focusRow(rows.find((row) => row.dataset.path === parent));
		case "Enter":
		case " ":
			event.preventDefault();
			return isDir ? ctx.onToggle(entry.path) : ctx.onOpen(entry.path);
	}
}

function Row({
	entry,
	parent,
	depth,
	first,
	ctx,
}: {
	entry: Entry;
	parent: string;
	depth: number;
	/** First top-level row: the tab stop while no row has been focused yet. */
	first: boolean;
	ctx: TreeContext;
}) {
	const isDir = entry.kind === "directory";
	const open = isDir && ctx.expanded.has(entry.path);
	const gone = useRef(ctx.onRowGone);
	gone.current = ctx.onRowGone;
	useEffect(() => {
		const path = entry.path;
		return () => gone.current(path);
	}, [entry.path]);
	return (
		<div
			role="treeitem"
			tabIndex={ctx.focusPath === entry.path || (ctx.focusPath === null && first) ? 0 : -1}
			aria-level={depth + 1}
			aria-expanded={isDir ? open : undefined}
			aria-selected={ctx.selected === entry.path}
			data-path={entry.path}
			data-parent={parent}
			title={entry.path}
			className={rowClass}
			style={{ paddingLeft: `${0.375 + depth * 0.875}rem` }}
			onFocus={() => ctx.onFocusPath(entry.path)}
			onClick={() => (isDir ? ctx.onToggle(entry.path) : ctx.onOpen(entry.path))}
			onKeyDown={(event) => onRowKey(event, entry, parent, ctx)}
		>
			<span aria-hidden className="w-3 shrink-0 text-ink-400">
				{isDir ? (open ? "▾" : "▸") : ""}
			</span>
			<span aria-hidden className="w-3.5 shrink-0 text-ink-400">
				{isDir && <Icon name="folder" size={14} />}
			</span>
			<span className="min-w-0 flex-1 truncate">{entry.name}</span>
			{entry.kind === "symlink" && (
				<span className="shrink-0 text-xs text-ink-500" title="符号链接（不跟随）" role="img" aria-label="符号链接">
					↪
				</span>
			)}
			{entry.protected && (
				<span className="shrink-0 text-ink-500" title="受保护文件，不提供查看" role="img" aria-label="受保护文件">
					<Icon name="key" size={13} />
				</span>
			)}
		</div>
	);
}

function DirNode({ path, depth, ctx }: { path: string; depth: number; ctx: TreeContext }) {
	const dir = useResource(path, ctx.active, (signal) => ctx.api().dir(path, signal), ctx.version);
	const indent = { paddingLeft: `${0.375 + depth * 0.875 + 1.25}rem` };
	const entries = dir.data?.entries as Entry[] | undefined;
	return (
		<>
			{entries?.map((entry, index) => (
				<RowWithChildren
					key={entry.path}
					entry={entry}
					parent={path}
					depth={depth}
					first={depth === 0 && index === 0}
					ctx={ctx}
				/>
			))}
			{entries && entries.length === 0 && dir.status !== "error" && (
				<div className="py-1 pr-2 text-xs text-ink-500" style={indent}>
					空目录
				</div>
			)}
			{!entries && dir.status === "loading" && (
				<output className="block py-1 pr-2 text-xs text-ink-500" style={indent}>
					加载中…
				</output>
			)}
			{dir.status === "error" && (
				<div
					className="flex flex-wrap items-center gap-2 py-1 pr-2 text-xs text-sakura-800"
					style={indent}
					role="alert"
				>
					<span className="min-w-0 break-words">读取失败：{dir.error}</span>
					<button
						type="button"
						className="focus-neko shrink-0 rounded-md border border-sakura-300 px-2 py-0.5"
						onClick={dir.reload}
					>
						重试
					</button>
				</div>
			)}
			{dir.data && (dir.data.incomplete || dir.data.limited) && (
				<div className="py-1 pr-2 text-xs text-sakura-800" style={indent} role="note">
					列表不完整：{dir.data.limited ? "该目录子项过多，仅显示部分。" : "工作区文件过多，枚举已被截断。"}
				</div>
			)}
		</>
	);
}

function RowWithChildren({
	entry,
	parent,
	depth,
	first,
	ctx,
}: {
	entry: Entry;
	parent: string;
	depth: number;
	first: boolean;
	ctx: TreeContext;
}) {
	return (
		<>
			<Row entry={entry} parent={parent} depth={depth} first={first} ctx={ctx} />
			{entry.kind === "directory" && ctx.expanded.has(entry.path) && (
				<DirNode path={entry.path} depth={depth + 1} ctx={ctx} />
			)}
		</>
	);
}

/**
 * Lazy read-only tree. Each expanded directory is its own component that loads only its direct children, so a
 * collapsed subtree costs nothing and expanding again re-reads it. Rows are flat siblings in document order.
 */
export function FileTree(props: {
	api: WorkspaceApi;
	active: boolean;
	/** Bumping it reloads every expanded directory (manual refresh, changed revision). */
	version: string | number;
	expanded: ReadonlySet<string>;
	selected: string | null;
	onToggle(path: string): void;
	onOpen(path: string): void;
	onRefresh(): void;
}) {
	const [focusPath, setFocusPath] = useState<string | null>(null);
	const ctx: TreeContext = {
		api: props.api,
		active: props.active,
		version: props.version,
		expanded: props.expanded,
		selected: props.selected,
		focusPath,
		onToggle: (path) => {
			setFocusPath(path);
			props.onToggle(path);
		},
		onOpen: props.onOpen,
		onFocusPath: setFocusPath,
		onRowGone: (path) => setFocusPath((current) => (current === path ? null : current)),
	};
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex shrink-0 items-center justify-between gap-2 border-b border-sakura-100 px-3 py-1.5 text-xs">
				<span className="text-ink-600">只读浏览</span>
				<button
					type="button"
					className="focus-neko rounded-lg border border-sakura-300 px-2 py-0.5 text-sakura-800 hover:bg-sakura-50"
					aria-label="刷新文件树"
					onClick={props.onRefresh}
				>
					刷新
				</button>
			</div>
			<div role="tree" aria-label="工作区文件树" className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-1.5">
				<DirNode path="" depth={0} ctx={ctx} />
			</div>
		</div>
	);
}
