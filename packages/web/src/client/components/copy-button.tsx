import { useEffect, useRef, useState } from "react";
import { writeClipboard } from "../lib/clipboard";
import { Icon } from "./primitives";

type CopyState = "idle" | "copied" | "failed";
const STATUS_MS = 1500;
const STATUS_TEXT: Record<CopyState, string> = { idle: "", copied: "已复制", failed: "复制失败" };

/** 气泡下方的复制按钮；状态文字放进 aria-live 区域，按钮名称保持稳定。 */
export function CopyButton({ text, label = "复制" }: { text: string; label?: string }) {
	const [state, setState] = useState<CopyState>("idle");
	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	useEffect(() => () => clearTimeout(timer.current), []);
	if (text === "") return null;
	const show = (next: CopyState) => {
		setState(next);
		clearTimeout(timer.current);
		timer.current = setTimeout(() => setState("idle"), STATUS_MS);
	};
	return (
		<span className="copy-row" data-state={state}>
			<button
				type="button"
				className="copy-btn focus-neko"
				aria-label={label}
				title={label}
				onClick={() => {
					writeClipboard(text).then(
						() => show("copied"),
						() => show("failed"),
					);
				}}
			>
				<Icon name={state === "copied" ? "check" : "copy"} size={15} />
			</button>
			<output className="copy-status" aria-live="polite">
				{STATUS_TEXT[state]}
			</output>
		</span>
	);
}
