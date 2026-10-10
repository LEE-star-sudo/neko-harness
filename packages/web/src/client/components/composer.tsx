import { useRef, useState } from "react";
import { storeActions } from "../lib/store";
import { sendMessage } from "../lib/ws-client";

const MAX_HEIGHT = 160;

/** 输入区：textarea + 发送；Enter 发送 / Shift+Enter 换行（兼容输入法组合中状态）；忙碌时可中止。 */
export function Composer(props: { busy: boolean; status: string | null }) {
	const [value, setValue] = useState("");
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const resize = (): void => {
		const el = textareaRef.current;
		if (el === null) return;
		el.style.height = "auto";
		el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
	};

	const submit = (): void => {
		const content = value.trim();
		if (content === "" || props.busy) return;
		if (!sendMessage({ type: "submit", content })) {
			storeActions.notice({ level: "error", text: "连接未就绪，消息未发送。" });
			return;
		}
		setValue("");
		requestAnimationFrame(resize);
	};

	const abort = (): void => {
		if (!sendMessage({ type: "abort" })) {
			storeActions.notice({ level: "error", text: "连接未就绪，无法中止。" });
		}
	};

	return (
		<div className="border-t border-sakura-200/70 bg-surface/80 px-4 py-3 backdrop-blur">
			<div className="mx-auto flex max-w-3xl items-end gap-2">
				<textarea
					ref={textareaRef}
					value={value}
					rows={1}
					placeholder={
						props.busy ? `${props.status ?? "运行中"}（可插话排队或中止）` : "输入消息，Enter 发送，Shift+Enter 换行"
					}
					className="max-h-40 min-h-[2.5rem] flex-1 resize-none rounded-2xl border border-sakura-300 bg-base px-3.5 py-2 text-[15px] text-ink-900 placeholder:text-ink-400"
					onChange={(event) => {
						setValue(event.target.value);
						resize();
					}}
					onKeyDown={(event) => {
						// isComposing：输入法组字中的 Enter 不触发发送
						if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
							event.preventDefault();
							submit();
						}
					}}
				/>
				{props.busy ? (
					<button
						type="button"
						onClick={abort}
						className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-2xl bg-sakura-700 px-4 text-sm font-semibold text-white shadow-soft hover:bg-sakura-800"
					>
						<span aria-hidden>■</span>
						中止
					</button>
				) : (
					<button
						type="button"
						onClick={submit}
						disabled={value.trim() === ""}
						className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-2xl bg-sakura-700 px-4 text-sm font-semibold text-white shadow-soft hover:bg-sakura-800 disabled:cursor-not-allowed disabled:opacity-40"
					>
						<span aria-hidden>➤</span>
						发送
					</button>
				)}
			</div>
		</div>
	);
}
