import type { SkillInvocation } from "@neko-harness/core/skill-invocation";
import { useState } from "react";
import { Icon } from "./primitives";

/**
 * 技能调用卡片：/skill: 展开块的紧凑呈现，视觉骨架与 ToolCard 同族（圆角卡 + 图标 +
 * 等宽名称 + 截断路径 + 折叠箭头），sakura 着色以区别于工具卡的 tianyi。正文默认折叠。
 */
export function SkillInvocationCard({ invocation }: { invocation: SkillInvocation }) {
	const [expanded, setExpanded] = useState(false);
	return (
		<div className="overflow-hidden rounded-card border border-sakura-200 bg-surface text-left shadow-soft">
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				aria-expanded={expanded}
				className="focus-neko flex w-full items-center gap-2 px-3 py-2"
			>
				<span className="text-sakura-500">
					<Icon name="sparkles" size={14} />
				</span>
				<span className="shrink-0 font-mono text-sm font-semibold text-sakura-800">skill:{invocation.name}</span>
				<span className="min-w-0 flex-1 truncate font-mono text-xs text-ink-600" title={invocation.location}>
					{invocation.location}
				</span>
				<span aria-hidden className="shrink-0 text-ink-400">
					{expanded ? "▾" : "▸"}
				</span>
			</button>
			{expanded && (
				<div className="border-t border-sakura-100 px-3 py-2">
					<pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-ink-50 p-2 font-mono text-xs text-ink-700">
						{invocation.body.trim()}
					</pre>
				</div>
			)}
		</div>
	);
}
