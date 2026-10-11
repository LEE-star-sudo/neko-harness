import type { ChatItem, ChatView, StreamingView } from "@neko-harness/core";
import { useEffect, useRef, useState } from "react";
import { ImageGallery } from "./image-gallery";
import { Markdown } from "./markdown";
import { ThinkingBlock } from "./thinking";
import { ToolCard } from "./tool-card";

const BOTTOM_THRESHOLD = 48;

/** 空会话占位：内联 SVG 小猫（无外部资源），颜色取自主题 tokens。 */
function WelcomeCat() {
	const sakura200 = "var(--color-sakura-200)";
	const sakura300 = "var(--color-sakura-300)";
	const tianyi800 = "var(--color-tianyi-800)";
	const sakura800 = "var(--color-sakura-800)";
	return (
		<svg width="132" height="112" viewBox="0 0 132 112" fill="none" aria-hidden="true">
			<title>neko 小猫</title>
			<path d="M30 46 L24 14 L54 30 Z" fill={sakura200} stroke={sakura300} strokeWidth="2.5" strokeLinejoin="round" />
			<path d="M102 46 L108 14 L78 30 Z" fill={sakura200} stroke={sakura300} strokeWidth="2.5" strokeLinejoin="round" />
			<path d="M32 39 L29 23 L46 32 Z" fill={sakura300} opacity="0.55" />
			<path d="M100 39 L103 23 L86 32 Z" fill={sakura300} opacity="0.55" />
			<ellipse cx="66" cy="66" rx="44" ry="38" fill="var(--color-surface)" stroke={sakura200} strokeWidth="2.5" />
			<circle cx="50" cy="62" r="5" fill={tianyi800} />
			<circle cx="82" cy="62" r="5" fill={tianyi800} />
			<circle cx="51.8" cy="60" r="1.6" fill="var(--color-surface)" />
			<circle cx="83.8" cy="60" r="1.6" fill="var(--color-surface)" />
			<ellipse cx="40" cy="74" rx="6.5" ry="3.6" fill={sakura300} opacity="0.65" />
			<ellipse cx="92" cy="74" rx="6.5" ry="3.6" fill={sakura300} opacity="0.65" />
			<path d="M62 71 q4 4.5 4 1 q0 -3.5 4 -1" stroke={sakura800} strokeWidth="2" fill="none" strokeLinecap="round" />
			<path d="M18 64 L32 66 M19 72 L32 70" stroke={sakura200} strokeWidth="2" strokeLinecap="round" />
			<path d="M114 64 L100 66 M113 72 L100 70" stroke={sakura200} strokeWidth="2" strokeLinecap="round" />
		</svg>
	);
}

function UserRow({ text, images }: { text: string; images?: import("@neko-harness/core").ChatImage[] }) {
	return (
		<div className="chat-row anim-user flex justify-end">
			<div className="bubble-user chat-bubble px-4 py-2.5 whitespace-pre-wrap">
				{text}
				{images && <ImageGallery images={images} />}
			</div>
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
		<div className="chat-row anim-other flex justify-start">
			<div className="bubble-assistant chat-bubble space-y-1.5 px-4 py-2.5">
				<AssistantBody thinking={item.thinking} text={item.text} />
				{item.note !== null && <div className="text-xs text-sakura-800 italic">⚠ {item.note}</div>}
			</div>
		</div>
	);
}

function SystemRow({ text }: { text: string }) {
	return (
		<div className="chat-row anim-other flex justify-center">
			<span className="rounded-full bg-ink-100 px-3 py-1 text-xs text-ink-600">{text}</span>
		</div>
	);
}

function ToolRow({ item }: { item: Extract<ChatItem, { type: "tool" }> }) {
	return (
		<div className="chat-row anim-other flex justify-start">
			<div className="chat-bubble w-full">
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
				{item.images && <ImageGallery images={item.images} />}
			</div>
		</div>
	);
}

function StreamingRow({ streaming, busy }: { streaming: StreamingView; busy: boolean }) {
	const hasContent = streaming.text.trim() !== "" || streaming.thinking.trim() !== "";
	return (
		<>
			{hasContent && (
				<div className="chat-row stream-block flex justify-start">
					<div className="bubble-assistant chat-bubble space-y-1.5 px-4 py-2.5">
						<AssistantBody thinking={streaming.thinking} text={streaming.text} />
						{busy && <span className="stream-caret" aria-hidden />}
					</div>
				</div>
			)}
			{streaming.toolCalls.map((call) => (
				<div key={`st${call.callId}`} className="chat-row anim-other flex justify-start">
					<div className="chat-bubble w-full">
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
		<div className="flex min-h-0 flex-1 flex-col">
			<div ref={containerRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
				<div className="chat-column flex flex-col gap-3 px-4 py-5">
					{items.length === 0 && streaming === null && (
						<div className="mt-[14vh] flex flex-col items-center gap-4 text-center">
							<div className="welcome-cat">
								<WelcomeCat />
							</div>
							<div className="text-4xl font-extrabold tracking-tight">
								<span className="logo-gradient">neko</span>
								<span className="text-tianyi-600">.</span>
								<span className="logo-gradient">harness</span>
							</div>
							<p className="max-w-sm text-sm text-ink-600">输入消息开始吧 ✦</p>
						</div>
					)}
					{items.map((item) => {
						switch (item.type) {
							case "user":
								return <UserRow key={item.key} text={item.text} images={item.images} />;
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
				<div className="discrete-in flex shrink-0 justify-center border-t border-sakura-100 bg-base/70 py-1.5">
					<button
						type="button"
						onClick={() => {
							stickRef.current = true;
							setShowJump(false);
							scrollToBottom(true);
						}}
						className="focus-neko rounded-full border border-sakura-300 bg-surface px-3.5 py-1 text-xs font-medium text-sakura-800 hover:bg-sakura-50"
					>
						回到底部 ↓
					</button>
				</div>
			)}
		</div>
	);
}
