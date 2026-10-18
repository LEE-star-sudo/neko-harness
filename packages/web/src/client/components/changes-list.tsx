import type { WireChangeDetail, WireChangeList } from "@neko-harness/gateway/contract";
import { useMemo } from "react";
import { useResource } from "../lib/use-resource.ts";
import { agentLabel, splitPath } from "../lib/workspace.ts";
import { DiffView } from "./diff-view";
import type { WorkspaceApi } from "./file-tree";

export const CHANGES_SCOPE_NOTE =
	"仅列出 agent 通过 edit / write 工具造成的改动，不含命令行（如 bash）造成的改动，也不代表磁盘或 git 的实际差异。";

const counts = (added: number, removed: number) => (
	<span className="shrink-0 font-mono text-xs">
		<span className="text-[#117555]">+{added}</span> <span className="text-sakura-800">-{removed}</span>
	</span>
);

const badge = "shrink-0 rounded-full border px-1.5 py-px text-[11px] leading-4";

/** Files the agent changed with edit/write; the list follows `revision` while it is visible. */
export function ChangesList(props: {
	list: WireChangeList | undefined;
	status: "loading" | "ready" | "error";
	error: string | undefined;
	onRetry(): void;
	onSelect(path: string): void;
}) {
	const { list } = props;
	return (
		<div className="flex min-h-0 flex-1 flex-col" data-testid="changes-list">
			<div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-1.5">
				{props.status === "error" && (
					<div role="alert" className="flex flex-wrap items-center gap-2 p-2 text-xs text-sakura-800">
						<span className="min-w-0 break-words">读取改动列表失败：{props.error}</span>
						<button
							type="button"
							className="focus-neko rounded-md border border-sakura-300 px-2 py-0.5"
							onClick={props.onRetry}
						>
							重试
						</button>
					</div>
				)}
				{!list && props.status === "loading" && <output className="block p-2 text-xs text-ink-500">加载中…</output>}
				{list && list.files.length === 0 && (
					<div data-testid="changes-empty" className="p-3 text-sm text-ink-700">
						<p className="font-medium">本会话还没有 agent 的 edit / write 改动。</p>
						<p className="mt-1 text-xs text-ink-600">{CHANGES_SCOPE_NOTE}</p>
					</div>
				)}
				{list?.files.map((file) => {
					const { name, dir } = splitPath(file.path);
					return (
						<button
							type="button"
							key={file.path}
							data-path={file.path}
							title={file.path}
							className="focus-neko flex w-full min-w-0 flex-col gap-0.5 rounded-lg px-2 py-1.5 text-left hover:bg-sakura-50"
							onClick={() => props.onSelect(file.path)}
						>
							<span className="flex min-w-0 items-center gap-2 text-sm text-ink-800">
								<span className="min-w-0 flex-1 truncate font-medium">{name}</span>
								{counts(file.added, file.removed)}
								<span className="shrink-0 text-xs text-ink-500">{file.ops} 次</span>
							</span>
							<span className="flex min-w-0 flex-wrap items-center gap-1 text-xs text-ink-500">
								{file.outside && (
									<span className={`${badge} border-sakura-300 bg-sakura-50 text-sakura-900`}>工作区外</span>
								)}
								<span className="min-w-0 max-w-full truncate" dir="ltr">
									{dir === "" ? "（根目录）" : dir}
								</span>
								{file.agents.map((agent) => (
									<span key={agent} className={`${badge} border-tianyi-200 bg-tianyi-50 text-tianyi-900`}>
										{agentLabel(agent)}
									</span>
								))}
							</span>
						</button>
					);
				})}
				{list?.truncated && (
					<p role="note" className="p-2 text-xs text-sakura-800">
						列表不完整：改动文件过多，已超出上限，仅显示部分。
					</p>
				)}
			</div>
			<p className="shrink-0 border-t border-sakura-100 px-3 py-1.5 text-[11px] text-ink-500">{CHANGES_SCOPE_NOTE}</p>
		</div>
	);
}

function Ops({ detail }: { detail: WireChangeDetail }) {
	const ops = useMemo(() => [...detail.ops].sort((a, b) => a.seq - b.seq), [detail.ops]);
	return (
		<ol className="flex flex-col gap-3 p-3">
			{ops.map((op, index) => (
				<li key={op.seq} data-testid="change-op" className="min-w-0 rounded-lg border border-tianyi-200 bg-surface">
					<div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b border-tianyi-100 px-2 py-1 text-xs text-ink-700">
						<span className="font-medium">{index + 1}</span>
						<span>{agentLabel(op.agent)}</span>
						<span className="font-mono text-tianyi-800">{op.tool}</span>
						{counts(op.added, op.removed)}
						{op.truncated && <span className={`${badge} border-sakura-300 bg-sakura-50 text-sakura-900`}>已截断</span>}
					</div>
					<DiffView
						diff={op.diff}
						path={detail.path}
						format={op.tool === "write" ? "write" : "edit"}
						className="max-h-80 overflow-auto p-2 font-mono text-xs text-ink-700"
					/>
				</li>
			))}
		</ol>
	);
}

/** Per-operation diffs of one file in time order, plus a jump to the file's current content. */
export function ChangeDetail(props: {
	api: WorkspaceApi;
	path: string;
	active: boolean;
	revision: number;
	/** From the list entry, so the "outside the workspace" state is right before the detail has loaded. */
	outside?: boolean;
	onBack(): void;
	onView(path: string): void;
}) {
	const detail = useResource(
		`change:${props.path}`,
		props.active,
		() => props.api().change(props.path),
		props.revision,
	);
	const { name, dir } = splitPath(props.path);
	const data = detail.data;
	const outside = data ? data.outside === true : props.outside === true;
	return (
		<div className="flex min-h-0 flex-1 flex-col" data-testid="change-detail">
			<div className="flex shrink-0 flex-col gap-1 border-b border-sakura-100 px-3 py-2 text-xs">
				<div className="flex min-w-0 items-center gap-2">
					<button
						type="button"
						className="focus-neko shrink-0 rounded-lg border border-sakura-300 px-2 py-0.5 text-sakura-800 hover:bg-sakura-50"
						onClick={props.onBack}
					>
						← 改动列表
					</button>
					<strong className="min-w-0 flex-1 truncate text-sm text-ink-800" title={props.path}>
						{name}
					</strong>
					{!outside && (
						<button
							type="button"
							className="focus-neko shrink-0 rounded-lg border border-sakura-300 px-2 py-0.5 text-sakura-800 hover:bg-sakura-50"
							onClick={() => props.onView(props.path)}
						>
							查看当前内容
						</button>
					)}
				</div>
				<div className="flex min-w-0 flex-wrap items-center gap-2 text-ink-500">
					{outside && <span className={`${badge} border-sakura-300 bg-sakura-50 text-sakura-900`}>工作区外</span>}
					<span className="min-w-0 break-all" title={props.path}>
						{dir === "" ? "（工作区根目录）" : dir}
					</span>
				</div>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
				{detail.status === "error" && (
					<div role="alert" className="flex flex-wrap items-center gap-2 p-3 text-xs text-sakura-800">
						<span className="min-w-0 break-words">读取改动详情失败：{detail.error}</span>
						<button
							type="button"
							className="focus-neko rounded-md border border-sakura-300 px-2 py-0.5"
							onClick={detail.reload}
						>
							重试
						</button>
					</div>
				)}
				{!data && detail.status === "loading" && <output className="block p-3 text-xs text-ink-500">加载中…</output>}
				{data === null && <p className="p-3 text-sm text-ink-600">该文件没有可显示的改动记录。</p>}
				{data && (
					<>
						{data.truncated && (
							<p role="note" className="px-3 pt-2 text-xs text-sakura-800">
								改动记录不完整：该文件的操作过多，已超出上限，仅显示部分。
							</p>
						)}
						<Ops detail={data} />
					</>
				)}
			</div>
		</div>
	);
}
