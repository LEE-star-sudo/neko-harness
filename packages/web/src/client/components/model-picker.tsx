import type { NekoModelInfo, NekoModelRef } from "@neko-harness/core";
import { useEffect, useState } from "react";
import { appActions } from "../lib/bootstrap";
import { useNekoState } from "../lib/store";

function formatContext(tokens: number): string {
	if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(0)}M`;
	if (tokens >= 1_000) return `${Math.round(tokens / 1024)}k`;
	return String(tokens);
}

/**
 * 模型选择器（状态条左侧）：点击弹出模型目录面板（neko.models.list），
 * 当前模型高亮，点击切换（neko.chat.configure，下一次请求生效）。
 */
export function ModelPicker(props: { current: NekoModelRef | null; fallbackLabel: string }) {
	const { models } = useNekoState();
	const [open, setOpen] = useState(false);

	useEffect(() => {
		if (!open) return;
		const onKeyDown = (event: KeyboardEvent): void => {
			if (event.key === "Escape") setOpen(false);
		};
		window.addEventListener("keydown", onKeyDown);
		return () => {
			window.removeEventListener("keydown", onKeyDown);
		};
	}, [open]);

	const currentInfo =
		props.current !== null
			? models.find((m) => m.provider === props.current?.provider && m.modelId === props.current?.modelId)
			: undefined;
	const label =
		currentInfo?.name ??
		(props.current !== null ? `${props.current.provider}/${props.current.modelId}` : props.fallbackLabel);

	const select = (model: NekoModelInfo): void => {
		setOpen(false);
		appActions.configureModel({ provider: model.provider, modelId: model.modelId });
	};

	return (
		<span className="relative min-w-0">
			<button
				type="button"
				onClick={() => {
					setOpen(!open);
				}}
				disabled={models.length === 0}
				className="focus-neko inline-flex min-w-0 max-w-56 items-center gap-1 rounded-full border border-transparent px-2 py-0.5 text-xs text-ink-500 hover:border-sakura-200 hover:bg-sakura-50 hover:text-sakura-800 disabled:cursor-default disabled:hover:border-transparent disabled:hover:bg-transparent"
				aria-label={`选择模型（当前：${label}）`}
				title={models.length === 0 ? label : "切换模型"}
			>
				<span className="min-w-0 truncate font-mono">{label}</span>
				{models.length > 0 && (
					<span aria-hidden className="shrink-0 text-[10px]">
						▾
					</span>
				)}
			</button>
			{open && (
				<>
					<button
						type="button"
						aria-label="关闭模型选择"
						className="focus-neko fixed inset-0 z-30 cursor-default"
						onClick={() => {
							setOpen(false);
						}}
					/>
					<div
						role="listbox"
						aria-label="模型列表"
						className="discrete-in absolute bottom-full left-0 z-40 mb-2 max-h-80 w-80 overflow-y-auto rounded-2xl border border-sakura-200 bg-surface p-2 shadow-lift"
					>
						<ul className="flex flex-col gap-1">
							{models.map((model) => {
								const active =
									props.current !== null &&
									model.provider === props.current.provider &&
									model.modelId === props.current.modelId;
								return (
									<li key={`${model.provider}/${model.modelId}`}>
										<button
											type="button"
											role="option"
											aria-selected={active}
											onClick={() => {
												select(model);
											}}
											className={`focus-neko w-full rounded-xl border px-3 py-2 text-left ${
												active
													? "border-sakura-300 bg-sakura-100"
													: "border-transparent hover:border-sakura-200 hover:bg-sakura-50"
											}`}
										>
											<span className="flex items-center gap-1.5">
												<span className="truncate text-[13px] font-medium text-ink-900">{model.name}</span>
												{model.reasoning && (
													<span className="shrink-0 rounded-full border border-tianyi-200 bg-tianyi-50 px-1.5 text-[10px] text-tianyi-800">
														思考 ✦
													</span>
												)}
												{active && (
													<span aria-hidden className="ml-auto shrink-0 text-sakura-500">
														◈
													</span>
												)}
											</span>
											<span className="mt-0.5 block truncate font-mono text-[11px] text-ink-500">
												{model.provider}/{model.modelId} · {formatContext(model.contextWindow)} ctx
											</span>
										</button>
									</li>
								);
							})}
						</ul>
					</div>
				</>
			)}
		</span>
	);
}
