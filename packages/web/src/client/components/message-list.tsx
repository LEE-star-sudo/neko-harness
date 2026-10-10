import { useEffect, useRef, useState } from "react";
import type { ChatItem, ChatView, StreamingView } from "../../protocol";
import { Markdown } from "./markdown";
import { ThinkingBlock } from "./thinking";
import { ToolCard } from "./tool-card";

const BOTTOM_THRESHOLD = 48;

function UserRow({ text }: { text: string }) {
	return (
		<div className="chat-row flex justify-end">
			<div className="bubble-user max-w-[85%] px-4 py-2.5 text-[15px] whitespace-pre-wrap sm:max-w-[75%]">{text}</div>
		</div>
	);
}

function AssistantBody({ thinking, text }: { thinking: string; text: string }) {
	return (
		<>
			<ThinkingBlock text={thinking} />
			{text.trim() !== "" && <Markdown text={text} />}
		</>
	);
}

function AssistantRow({ item }: { item: Extract<ChatItem, { type: "assistant" }> }) {
	// 只有工具调用、没有文本/thinking/提示时不渲染气泡（工具卡片独立成行）；
	// 流式期间文本从无到有，出现时再渲染，不会闪烁。
	if (item.text.trim() === "" && item.thinking.trim() === "" && item.note === null) return null;
	return (
		<div className="chat-row flex justify-start">
			<div className="bubble-assistant max-w-[85%] space-y-1.5 px-4 py-2.5 sm:max-w-[75%]">
				<AssistantBody thinking={item.thinking} text={item.text} />
				{item.note !== null && <div className="text-xs text-sakura-800 italic">⚠ {item.note}</div>}
			</div>
		</div>
	);
}

function SystemRow({ text }: { text: string }) {
	return (
		<div className="chat-row flex justify-center">
			<span className="rounded-full bg-ink-100 px-3 py-1 text-xs text-ink-600">{text}</span>
		</div>
	);
}

function ToolRow({ item }: { item: Extract<ChatItem, { type: "tool" }> }) {
	return (
		<div className="chat-row flex justify-start">
			<div className="w-full max-w-[85%] sm:max-w-[75%]">
				<ToolCard
					name={item.name}
					summary={item.summary}
					detail={item.detail}
					phase={item.phase}
					isError={item.isError}
					output={item.output}
					result={item.result}
					durationMs={item.durationMs}
					note={item.note}
				/>
			</div>
		</div>
	);
}

function StreamingRow({ streaming, busy }: { streaming: StreamingView; busy: boolean }) {
	const hasContent = streaming.text.trim() !== "" || streaming.thinking.trim() !== "";
	return (
		<>
			{hasContent && (
				<div className="chat-row flex justify-start">
					<div className="bubble-assistant max-w-[85%] space-y-1.5 px-4 py-2.5 sm:max-w-[75%]">
						<AssistantBody thinking={streaming.thinking} text={streaming.text} />
						{busy && <span className="stream-caret" aria-hidden />}
					</div>
				</div>
			)}
			{streaming.toolCalls.map((call) => (
				<div key={`st${call.callId}`} className="chat-row flex justify-start">
					<div className="w-full max-w-[85%] sm:max-w-[75%]">
						<ToolCard
							name={call.name}
							summary={call.summary}
							detail={call.detail}
							phase={call.phase}
							output={call.output}
						/>
					</div>
				</div>
			))}
		</>
	);
}

/** 消息列表：已提交条目 + 流式块；贴底跟随滚动，离开底部时出现"回到底部"。 */
export function MessageList({ view, busy }: { view: ChatView | null; busy: boolean }) {
	const containerRef = useRef<HTMLDivElement>(null);
	const stickRef = useRef(true);
	const [showJump, setShowJump] = useState(false);

	const items = view?.items ?? [];
	const streaming = view?.streaming ?? null;

	const scrollToBottom = (smooth: boolean): void => {
		const el = containerRef.current;
		if (el === null) return;
		el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
	};

	// 每次渲染后若贴底则跟随（渲染本身由快照更新驱动）。
	useEffect(() => {
		if (!stickRef.current) return;
		const el = containerRef.current;
		if (el !== null) el.scrollTo({ top: el.scrollHeight });
	});

	const onScroll = (): void => {
		const el = containerRef.current;
		if (el === null) return;
		const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD;
		stickRef.current = nearBottom;
		setShowJump(!nearBottom);
	};

	return (
		<div className="relative min-h-0 flex-1">
			<div ref={containerRef} onScroll={onScroll} className="h-full overflow-y-auto">
				<div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-5">
					{items.length === 0 && streaming === null && (
						<div className="mt-[18vh] flex flex-col items-center gap-3 text-center">
							<div className="text-5xl font-extrabold tracking-tight">
								<span className="text-sakura-800">neko</span>
								<span className="text-tianyi-600">.</span>
								<span className="text-sakura-500">harness</span>
							</div>
							<p className="max-w-sm text-sm text-ink-600">
								和 DeepSeek 驱动的 agent 对话，内置 read / write / edit / bash 工具。
								<br />
								输入消息开始吧。
							</p>
						</div>
					)}
					{items.map((item) => {
						switch (item.type) {
							case "user":
								return <UserRow key={item.key} text={item.text} />;
							case "assistant":
								return <AssistantRow key={item.key} item={item} />;
							case "tool":
								return <ToolRow key={item.key} item={item} />;
							case "system":
								return <SystemRow key={item.key} text={item.text} />;
							default:
								return null;
						}
					})}
					{streaming !== null && <StreamingRow streaming={streaming} busy={busy} />}
				</div>
			</div>
			{showJump && (
				<button
					type="button"
					onClick={() => {
						stickRef.current = true;
						setShowJump(false);
						scrollToBottom(true);
					}}
					className="focus-neko absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-sakura-300 bg-surface px-3.5 py-1.5 text-xs font-medium text-sakura-800 shadow-lift hover:bg-sakura-50"
				>
					回到底部 ↓
				</button>
			)}
		</div>
	);
}
