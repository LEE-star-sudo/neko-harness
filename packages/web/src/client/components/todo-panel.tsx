import type { KeyboardEvent } from "react";
import { plainText, TODO_STATUS_LABEL, todoState } from "../lib/interactions.ts";
import { useNekoState } from "../lib/store.ts";
import { Icon } from "./primitives.tsx";

const MARKS = {
	pending: "border-ink-300 bg-surface text-ink-600",
	in_progress: "border-tianyi-300 bg-tianyi-100 text-tianyi-900",
	completed: "border-ink-200 bg-ink-50 text-ink-600",
} as const;

/** Top-bar entry: progress of the model's todo list. Hidden when the gateway has no todos or the list is empty. */
export function TodoButton(props: { open: boolean; onToggle: () => void; panelId: string }) {
	const todo = todoState(useNekoState());
	if (todo === null || todo.total === 0) return null;
	return (
		<button
			type="button"
			className="focus-neko shrink-0 whitespace-nowrap rounded-full border border-sakura-300 px-2.5 py-0.5 text-xs text-sakura-800 hover:bg-sakura-50"
			aria-expanded={props.open}
			aria-controls={props.panelId}
			aria-label={`待办 ${todo.completed}/${todo.total}，已完成 ${todo.completed} 项${todo.offline ? "（离线）" : ""}`}
			title="待办进度（只读）"
			onClick={props.onToggle}
		>
			<span className="max-sm:hidden" aria-hidden>
				待办{" "}
			</span>
			<span aria-hidden>
				{todo.completed}/{todo.total}
			</span>
		</button>
	);
}

/**
 * Read-only list below the top bar. It sits in the page flow (not over it), so it can never cover the composer,
 * the stop button or a question card; a long list scrolls inside its own height cap.
 */
export function TodoPanel(props: { id: string; onClose: () => void }) {
	const todo = todoState(useNekoState());
	if (todo === null || todo.total === 0) return null;
	const onKeyDown = (event: KeyboardEvent) => {
		if (event.key !== "Escape") return;
		event.stopPropagation();
		props.onClose();
	};
	return (
		<section
			id={props.id}
			aria-label="待办列表"
			data-todo-panel
			className="flex max-h-[min(45dvh,20rem)] min-h-[3rem] shrink-[10] flex-col border-b border-sakura-200 bg-base"
			onKeyDown={onKeyDown}
		>
			<div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5 text-xs">
				<strong className="text-ink-800">
					待办 · 已完成 {todo.completed}/{todo.total}
				</strong>
				{todo.offline && (
					<output className="rounded-full border border-sakura-300 bg-sakura-50 px-2 py-0.5 text-sakura-800">
						离线 · 显示最后一次加载的内容，可能不是最新状态
					</output>
				)}
				<button
					type="button"
					className="focus-neko ml-auto rounded-lg px-2 py-1 text-ink-600 hover:bg-sakura-50"
					onClick={props.onClose}
				>
					关闭
				</button>
			</div>
			<div className="chat-column flex min-h-0 flex-1 flex-col">
				<section
					className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-2"
					data-todo-scroll
					// biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard users must be able to scroll a long list.
					tabIndex={0}
					aria-label="待办条目"
				>
					<ol className="space-y-1.5">
						{todo.items.map((item) => (
							<li key={item.id} className="flex min-w-0 items-start gap-2 text-sm" data-status={item.status}>
								<span
									className={`mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${MARKS[item.status]}`}
								>
									<Icon
										name={item.status === "completed" ? "check" : item.status === "in_progress" ? "spinner" : "clock"}
										size={12}
									/>
									{TODO_STATUS_LABEL[item.status]}
								</span>
								<span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-ink-800">
									{plainText(item.text)}
								</span>
							</li>
						))}
					</ol>
				</section>
			</div>
		</section>
	);
}
