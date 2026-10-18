import type { WireChangeList, WireWorkspaceFile } from "@neko-harness/gateway/contract";
import DOMPurify from "dompurify";
import { useEffect, useMemo, useRef, useState } from "react";
import { languageFromPath } from "../lib/diff-highlight.ts";
import { renderCodeHtml } from "../lib/highlight.ts";
import { useResource } from "../lib/use-resource.ts";
import { formatBytes, isNotFound, lineCount, splitPath } from "../lib/workspace.ts";
import type { WorkspaceApi } from "./file-tree";

/** Beyond this many characters the file is shown as plain text: highlighting 512 KiB blocks the page. */
const HIGHLIGHT_LIMIT = 200_000;

function CodeView({ file }: { file: WireWorkspaceFile }) {
	const content = (file.content ?? "").replace(/\n$/, "");
	const html = useMemo(() => {
		const language = content.length > HIGHLIGHT_LIMIT ? undefined : languageFromPath(file.path);
		return DOMPurify.sanitize(renderCodeHtml(content, language), { USE_PROFILES: { html: true } });
	}, [content, file.path]);
	const numbers = useMemo(
		() => Array.from({ length: lineCount(content) }, (_, index) => index + 1).join("\n"),
		[content],
	);
	return (
		<section
			aria-label="文件内容"
			data-testid="file-code"
			// biome-ignore lint/a11y/noNoninteractiveTabindex: The scroll container must be keyboard focusable to scroll long lines.
			tabIndex={0}
			className="focus-neko min-h-0 flex-1 overflow-auto bg-tianyi-50/40"
		>
			<div className="flex min-w-max font-mono text-xs leading-5">
				<pre
					aria-hidden
					data-testid="file-gutter"
					className="sticky left-0 shrink-0 select-none border-r border-sakura-100 bg-base px-2 py-2 text-right text-ink-400"
				>
					{numbers}
				</pre>
				<pre className="hljs px-3 py-2 whitespace-pre">
					{/* biome-ignore lint/security/noDangerouslySetInnerHtml: the highlighted HTML went through DOMPurify.sanitize above. */}
					<code dangerouslySetInnerHTML={{ __html: html }} />
				</pre>
			</div>
		</section>
	);
}

function Notice(props: { title: string; detail?: string; action?: { label: string; run(): void }; tone?: "error" }) {
	return (
		<div
			role={props.tone === "error" ? "alert" : "status"}
			data-testid="file-notice"
			className="flex flex-col items-start gap-2 p-4 text-sm"
		>
			<p className={`font-medium ${props.tone === "error" ? "text-sakura-800" : "text-ink-800"}`}>{props.title}</p>
			{props.detail && <p className="break-words text-xs text-ink-600">{props.detail}</p>}
			{props.action && (
				<button
					type="button"
					className="focus-neko rounded-lg border border-sakura-300 px-3 py-1 text-xs text-sakura-800 hover:bg-sakura-50"
					onClick={props.action.run}
				>
					{props.action.label}
				</button>
			)}
		</div>
	);
}

/** Read-only file content with line numbers; no editing, saving, creating, deleting or renaming. */
export function FileViewer(props: {
	api: WorkspaceApi;
	path: string;
	active: boolean;
	/** Latest agent change list, used to notice that the open file was modified after it was read. */
	changes: WireChangeList | undefined;
	onBack(): void;
	backLabel: string;
}) {
	const file = useResource(props.path, props.active, (signal) => props.api().file(props.path, signal));
	const { name, dir } = splitPath(props.path);
	const back = useRef<HTMLButtonElement>(null);
	useEffect(() => back.current?.focus(), []);

	// A change recorded after the file was read marks the shown content as possibly outdated.
	const seq = props.changes?.files.find((entry) => entry.path === props.path)?.lastSeq ?? 0;
	const known = props.changes !== undefined;
	const baseline = useRef<number | undefined>(undefined);
	const [stale, setStale] = useState(false);
	const loaded = file.data;
	// biome-ignore lint/correctness/useExhaustiveDependencies: A new read (new data object) restarts the comparison.
	useEffect(() => {
		baseline.current = known ? seq : undefined;
		setStale(false);
	}, [loaded]);
	useEffect(() => {
		if (!known) return;
		if (baseline.current === undefined) baseline.current = seq;
		else if (seq > baseline.current) setStale(true);
	}, [known, seq]);

	const data = file.data;
	const notFound = file.status === "error" && !data && isNotFound(file.error);
	return (
		<div className="flex min-h-0 flex-1 flex-col" data-testid="file-viewer">
			<div className="flex shrink-0 flex-col gap-1 border-b border-sakura-100 px-3 py-2 text-xs">
				<div className="flex min-w-0 items-center gap-2">
					<button
						ref={back}
						type="button"
						className="focus-neko shrink-0 rounded-lg border border-sakura-300 px-2 py-0.5 text-sakura-800 hover:bg-sakura-50"
						onClick={props.onBack}
					>
						{props.backLabel}
					</button>
					<strong className="min-w-0 flex-1 truncate text-sm text-ink-800" title={props.path}>
						{name}
					</strong>
					<button
						type="button"
						className="focus-neko shrink-0 rounded-lg border border-sakura-300 px-2 py-0.5 text-sakura-800 hover:bg-sakura-50 disabled:opacity-50"
						aria-label="刷新文件内容"
						disabled={file.status === "loading"}
						onClick={file.reload}
					>
						{file.status === "loading" && data ? "刷新中…" : "刷新"}
					</button>
				</div>
				<div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-ink-500">
					<span className="min-w-0 break-all" title={props.path}>
						{dir === "" ? "（工作区根目录）" : dir}
					</span>
					{data && <span className="shrink-0">{formatBytes(data.size)}</span>}
				</div>
			</div>
			{stale && (
				<output className="flex shrink-0 flex-wrap items-center gap-2 bg-tianyi-50 px-3 py-1.5 text-xs text-tianyi-900">
					<span>agent 修改了此文件，当前显示的内容可能已过期。</span>
					<button
						type="button"
						className="focus-neko rounded-md border border-tianyi-300 px-2 py-0.5"
						onClick={file.reload}
					>
						刷新内容
					</button>
				</output>
			)}
			{notFound ? (
				<Notice
					title="文件不存在"
					detail="该文件可能已被删除或移出工作区。"
					action={{ label: "重试", run: file.reload }}
				/>
			) : file.status === "error" && !data ? (
				<Notice tone="error" title={`读取失败：${file.error}`} action={{ label: "重试", run: file.reload }} />
			) : !data ? (
				<Notice title="加载中…" />
			) : data.kind === "protected" ? (
				<Notice
					title="受保护文件，不提供查看"
					detail="凭据类文件（如 .env、私钥）的内容不会通过浏览器下发，以免经网络泄露。"
				/>
			) : data.kind === "binary" ? (
				<Notice title="二进制文件，不提供预览" detail={`大小 ${formatBytes(data.size)}`} />
			) : (
				<>
					{file.status === "error" && (
						<div
							role="alert"
							className="flex shrink-0 flex-wrap items-center gap-2 px-3 py-1.5 text-xs text-sakura-800"
						>
							<span className="min-w-0 break-words">刷新失败：{file.error}</span>
							<button
								type="button"
								className="focus-neko rounded-md border border-sakura-300 px-2 py-0.5"
								onClick={file.reload}
							>
								重试
							</button>
						</div>
					)}
					{data.truncated && (
						<div role="note" className="shrink-0 bg-sakura-50 px-3 py-1.5 text-xs text-sakura-900">
							已截断，仅显示开头部分，文件共 {formatBytes(data.size)}
						</div>
					)}
					<CodeView file={data} />
				</>
			)}
		</div>
	);
}
