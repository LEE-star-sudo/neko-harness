import type { WireQueuedInput } from "@neko-harness/gateway/contract";

type Props = {
	queued: readonly WireQueuedInput[];
	/** An operation is in flight; the buttons wait for it. */
	busy: boolean;
	onSteer(item: WireQueuedInput): void;
	onWithdraw(item: WireQueuedInput): void;
};

const modeLabel = { steer: "引导", followUp: "排队" } as const;

/** Messages accepted while the run is busy and not yet in the transcript; the host is the source of truth. */
export function QueueBar({ queued, busy, onSteer, onWithdraw }: Props) {
	if (!queued.length) return null;
	return (
		<section aria-label="排队消息" className="mb-2 rounded-2xl border border-sakura-200 bg-base/90 px-2 py-1.5">
			<ul className="flex max-h-32 flex-col gap-1 overflow-y-auto">
				{queued.map((item) => {
					const label = item.preview || (item.images ? "图片" : "");
					return (
						<li key={item.id} className="flex min-w-0 items-center gap-1 text-sm">
							<span
								className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${item.mode === "steer" ? "bg-sakura-100 text-sakura-700" : "bg-tianyi-50 text-ink-600"}`}
							>
								{modeLabel[item.mode]}
							</span>
							<span className="min-w-0 flex-1 truncate text-ink-700" title={item.preview}>
								{item.preview || (item.images ? "（仅图片）" : "")}
							</span>
							{item.images > 0 && item.preview && (
								<span className="shrink-0 text-xs text-ink-500">{item.images} 图</span>
							)}
							{item.mode === "followUp" && (
								<button
									type="button"
									disabled={busy}
									aria-label={`引导消息：${label}`}
									title="改为引导：在当前工具轮结束后加入进行中的工作"
									onClick={() => onSteer(item)}
									className="focus-neko h-8 shrink-0 rounded-full px-2 text-xs text-sakura-700 hover:bg-sakura-50 disabled:opacity-50"
								>
									引导
								</button>
							)}
							<button
								type="button"
								disabled={busy}
								aria-label={`撤回${modeLabel[item.mode]}消息：${label}`}
								onClick={() => onWithdraw(item)}
								className="focus-neko h-8 shrink-0 rounded-full px-2 text-xs text-ink-600 hover:bg-sakura-50 disabled:opacity-50"
							>
								撤回
							</button>
						</li>
					);
				})}
			</ul>
		</section>
	);
}
