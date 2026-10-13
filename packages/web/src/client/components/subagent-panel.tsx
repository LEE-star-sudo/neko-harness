import type { ChatView, Delegation } from "@neko-harness/core";
import { downloadImage } from "@neko-harness/core/image-transfer";
import { mergeTranscriptItems } from "@neko-harness/core/transcript-items";
import { useEffect, useMemo, useRef, useState } from "react";
import { appActions } from "../lib/bootstrap";
import { useNekoState } from "../lib/store";
import { ImageReaderContext } from "./image-gallery";
import { MessageList } from "./message-list";

const labels = { queued: "排队中", running: "运行中", completed: "已完成", failed: "失败", cancelled: "已停止" };
function Detail({ entry, active }: { entry: Delegation; active: boolean }) {
	const { phase } = useNekoState();
	const [view, setView] = useState<ChatView | null>(null);
	const [error, setError] = useState("");
	const [older, setOlder] = useState<ChatView["items"]>([]);
	const [before, setBefore] = useState<number | null | undefined>();
	const [loading, setLoading] = useState(false);
	const [now, setNow] = useState(Date.now);
	useEffect(() => {
		if (!active || entry.endedAt !== null) return;
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, [active, entry.endedAt]);
	const service = useMemo(
		() => (phase === "ready" && active ? appActions.subagent(entry.taskId) : null),
		[phase, active, entry.taskId],
	);
	const epoch = useRef(0);
	useEffect(() => {
		const generation = ++epoch.current;
		setLoading(false);
		setBefore(undefined);
		if (!service) return;
		const stop = service.view.subscribe((value) => {
			if (generation === epoch.current && service.error) setError(service.error);
			if (generation === epoch.current && value) {
				setView((previous) => {
					if (previous?.items.length && !value.items.some((item) => previous.items.some((old) => old.key === item.key)))
						setBefore(value.historyBefore);
					return { ...value, items: mergeTranscriptItems(previous?.items ?? [], value.items) };
				});
				setBefore((previous) => (previous === undefined ? value.historyBefore : previous));
				if (!service.error) setError("");
			}
		});
		return () => {
			epoch.current++;
			stop();
		};
	}, [service]);
	const imageReader = useMemo(
		() =>
			service
				? (entryId: number, contentIndex: number) =>
						downloadImage((offset) => service.getImage({ entryId, contentIndex, offset }))
				: null,
		[service],
	);
	const merged = useMemo(() => {
		if (!view) return null;
		return { ...view, items: mergeTranscriptItems(older, view.items) };
	}, [view, older]);
	const history = async () => {
		if (!service || loading || before == null) return;
		const generation = epoch.current;
		setLoading(true);
		try {
			const result = await service.history(before == null ? {} : { before });
			if (generation !== epoch.current) return;
			setOlder((previous) => mergeTranscriptItems(previous, result.items));
			setBefore(result.next);
		} catch (e) {
			if (generation === epoch.current) setError(String(e));
		} finally {
			if (generation === epoch.current) setLoading(false);
		}
	};
	return (
		<div className={`${active ? "flex" : "hidden"} min-h-0 flex-1 flex-col`}>
			<div className="flex flex-wrap items-center gap-2 border-b border-sakura-100 p-3 text-xs">
				<span>
					{entry.historyThrough !== undefined ? "历史 · " : ""}
					{labels[entry.status]}
				</span>
				{view && (
					<span title="此子任务用量">
						↑{view.usage.input} ↓{view.usage.output} · ${view.usage.cost.toFixed(4)}
					</span>
				)}
				<span>{Math.max(0, Math.round(((entry.endedAt ?? now) - entry.createdAt) / 1000))}s</span>
				{entry.historyThrough === undefined && (entry.status === "running" || entry.status === "queued") && (
					<button
						type="button"
						className="focus-neko rounded-lg border border-sakura-300 px-2 leading-[14px]"
						onClick={() => {
							void service?.stop(null).catch((e) => setError(String(e)));
						}}
					>
						停止此任务
					</button>
				)}
			</div>
			{error && (
				<p role="alert" className="p-3 text-sm text-sakura-800">
					{error}
				</p>
			)}
			<ImageReaderContext.Provider value={imageReader}>
				<MessageList
					view={merged}
					onLoadEarlier={active && before != null ? history : undefined}
					busy={view?.busy ?? false}
					emptyLabel={entry.status === "queued" ? "任务排队中…" : "暂无内容"}
				/>
			</ImageReaderContext.Provider>
		</div>
	);
}
export function SubagentPanel({
	entries,
	selected,
	open,
	onSelect,
	onClose,
}: {
	entries: Delegation[];
	selected: number | null;
	open: boolean;
	onSelect: (id: number) => void;
	onClose: () => void;
}) {
	const [visited, setVisited] = useState<number[]>([]);
	const closeButton = useRef<HTMLButtonElement>(null);
	const panel = useRef<HTMLElement>(null);
	const [narrow, setNarrow] = useState(() => window.matchMedia("(max-width: 1023px)").matches);
	useEffect(() => {
		const query = window.matchMedia("(max-width: 1023px)");
		const update = () => setNarrow(query.matches);
		query.addEventListener("change", update);
		return () => query.removeEventListener("change", update);
	}, []);
	useEffect(() => {
		if (selected !== null) setVisited((ids) => (ids.includes(selected) ? ids : [...ids, selected]));
	}, [selected]);
	useEffect(() => {
		if (!open) return;
		const previous = document.activeElement as HTMLElement | null;
		const siblings =
			narrow && panel.current?.parentElement
				? [...panel.current.parentElement.children].filter(
						(node): node is HTMLElement => node instanceof HTMLElement && node !== panel.current,
					)
				: [];
		const inert = siblings.map((node) => node.inert);
		siblings.forEach((node) => {
			node.inert = true;
		});
		closeButton.current?.focus();
		return () => {
			siblings.forEach((node, index) => {
				node.inert = inert[index]!;
			});
			if (previous?.isConnected) previous.focus();
		};
	}, [open, narrow]);
	return (
		// biome-ignore lint/a11y/useAriaPropsSupportedByRole: Narrow screens explicitly use the dialog role with aria-modal.
		<aside
			ref={panel}
			role={narrow ? "dialog" : "complementary"}
			aria-modal={narrow && open ? true : undefined}
			aria-label="子智能体"
			className={`${open ? "flex" : "hidden"} fixed inset-0 z-30 min-w-0 flex-col border-l border-sakura-200 bg-base lg:static lg:z-auto lg:w-[min(42vw,40rem)] lg:shrink-0`}
			onKeyDown={(e) => {
				if (!e.currentTarget.contains(e.target as Node)) return;
				if (e.key === "Tab" && window.innerWidth < 1024) {
					const controls = [
						...e.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled]),a[href],summary,[tabindex='0']"),
					].filter((element) => element.getClientRects().length > 0);
					const first = controls[0],
						last = controls.at(-1);
					if (e.shiftKey && document.activeElement === first) {
						e.preventDefault();
						last?.focus();
					} else if (!e.shiftKey && document.activeElement === last) {
						e.preventDefault();
						first?.focus();
					}
				}
				if (e.key === "Escape") {
					e.stopPropagation();
					onClose();
				}
			}}
		>
			<div className="flex items-center justify-between border-b border-sakura-200 px-4 py-1.5">
				<strong className="text-sm text-ink-800">子智能体</strong>
				<button
					ref={closeButton}
					type="button"
					className="focus-neko rounded-lg px-2 py-1 text-sm text-ink-600 hover:bg-sakura-50"
					onClick={onClose}
				>
					关闭
				</button>
			</div>
			<div className="max-h-44 shrink-0 overflow-auto border-b border-sakura-100 p-2">
				{entries.map((entry) => (
					<button
						type="button"
						key={entry.taskId}
						aria-pressed={selected === entry.taskId}
						className={`focus-neko block w-full rounded-lg px-2 py-1.5 text-left text-sm ${selected === entry.taskId ? "bg-tianyi-100" : "hover:bg-sakura-50"}`}
						onClick={() => onSelect(entry.taskId)}
					>
						<span className="text-tianyi-700">{entry.role}</span> · {entry.title}
						<span className="ml-2 text-xs text-ink-500">{labels[entry.status]}</span>
					</button>
				))}
			</div>
			{visited.map((id) => {
				const entry = entries.find((d) => d.taskId === id);
				return entry ? <Detail key={id} entry={entry} active={open && id === selected} /> : null;
			})}
		</aside>
	);
}
