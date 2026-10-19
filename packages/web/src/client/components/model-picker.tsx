import type { ModelThinkingLevel } from "@earendil-works/pi-ai";
import type { NekoModelRef, NekoSelectableModel } from "@neko-harness/core";
import { Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { appActions } from "../lib/bootstrap";
import { describeModel, groupModels, providerIssue, providerName } from "../lib/providers";
import { useNekoState } from "../lib/store";
import { Modal } from "./primitives";

export function ModelPicker(props: { current: NekoModelRef | null; fallbackLabel: string }) {
	const { models, currentSessionId, view, phase, operating } = useNekoState();
	const [session, setSession] = useState<{ id: string } | null>(null);
	const current = models.find((m) => m.provider === props.current?.provider && m.modelId === props.current?.modelId);
	if (session && session.id !== currentSessionId) setSession(null);
	const label = current?.name ?? props.fallbackLabel;
	return (
		<>
			<button
				type="button"
				disabled={!props.current || phase !== "ready" || operating}
				onClick={() => currentSessionId && setSession({ id: currentSessionId })}
				className="focus-neko min-w-0 truncate rounded-full px-2 py-1 text-left text-xs text-ink-500 hover:bg-sakura-50"
				aria-label={`模型与思考强度：${label} ${view?.agent.thinkingLevel ?? ""}`}
			>
				{label} · {view?.agent.thinkingLevel ?? "off"} ▾
			</button>
			{session && session.id === currentSessionId && props.current && (
				<ModelForm
					key={session.id}
					session={session.id}
					currentRef={props.current}
					current={current ?? null}
					level={view?.agent.thinkingLevel ?? "off"}
					onClose={() => setSession((active) => (active === session ? null : active))}
				/>
			)}
		</>
	);
}

function ModelForm(props: {
	session: string;
	currentRef: NekoModelRef;
	current: NekoSelectableModel | null;
	level: string;
	onClose: () => void;
}) {
	const { models, credentials } = useNekoState();
	const [selected, setSelected] = useState<NekoSelectableModel | null>(props.current);
	const [level, setLevel] = useState<ModelThinkingLevel>(props.level as ModelThinkingLevel);
	const [query, setQuery] = useState("");
	const [open, setOpen] = useState<Record<string, boolean>>({});
	const [busy, setBusy] = useState(false);
	const pending = useRef(false);
	const [error, setError] = useState("");
	const groups = groupModels(models, query);
	const issue = providerIssue(credentials, props.currentRef.provider);
	const searching = query.trim().length > 0;
	const isOpen = (provider: string) => open[provider] ?? (searching || provider === props.currentRef.provider);
	async function apply() {
		if (pending.current || !selected) return;
		pending.current = true;
		setBusy(true);
		setError("");
		try {
			await appActions.configure(
				{ model: { provider: selected.provider, modelId: selected.modelId }, thinkingLevel: level },
				props.session,
			);
			props.onClose();
		} catch {
			setError("配置失败，请重试。");
		} finally {
			pending.current = false;
			setBusy(false);
		}
	}
	return (
		<Modal title="模型与思考强度" onClose={props.onClose}>
			<div className="space-y-5 p-5">
				{issue && (
					<p role="alert" className="rounded-xl bg-sakura-50 px-3 py-2 text-sm text-sakura-800">
						{issue === "disabled"
							? `当前会话的模型服务 ${providerName(props.currentRef.provider)} 已取消启用，请切换到其他模型，或在设置中重新启用。`
							: `尚未配置 ${providerName(props.currentRef.provider)} 的 API Key，请先配置或切换到其他模型。`}{" "}
						<Link
							to="/settings"
							hash={`credential-${props.currentRef.provider}`}
							className="focus-neko rounded underline"
						>
							前往设置
						</Link>
					</p>
				)}
				<div className="space-y-2">
					<label className="sr-only" htmlFor="model-search">
						搜索模型
					</label>
					<input
						id="model-search"
						type="search"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="搜索模型名称、ID 或服务商"
						autoComplete="off"
						spellCheck={false}
						className="focus-neko w-full min-w-0 rounded-xl border border-sakura-200 bg-base px-3 py-2 text-sm"
					/>
					<fieldset
						aria-label="模型"
						className="m-0 min-w-0 max-h-[min(50vh,28rem)] space-y-2 overflow-y-auto border-0 p-0 pr-1"
					>
						{groups.map((group) => {
							const expanded = isOpen(group.provider);
							const panel = `models-${group.provider}`;
							return (
								<section key={group.provider} className="rounded-xl border border-sakura-200">
									<div className="flex items-center gap-2 px-3 py-2">
										<button
											type="button"
											aria-expanded={expanded}
											aria-controls={panel}
											onClick={() => setOpen({ ...open, [group.provider]: !expanded })}
											className="focus-neko flex min-w-0 flex-1 items-center gap-2 rounded text-left text-sm font-semibold text-ink-900"
										>
											<span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
											<span className="truncate">{group.name}</span>
											<span className="text-xs font-normal text-ink-500">{group.models.length}</span>
										</button>
										{!group.available && (
											<span className="shrink-0 text-xs text-sakura-800">
												未配置 Key ·{" "}
												<Link
													to="/settings"
													hash={`credential-${group.provider}`}
													className="focus-neko rounded underline"
												>
													去配置
												</Link>
											</span>
										)}
									</div>
									{expanded && (
										<ul id={panel} className="space-y-1.5 px-2 pb-2">
											{group.models.map((model) => {
												const chosen = selected?.provider === model.provider && selected.modelId === model.modelId;
												return (
													<li key={`${model.provider}/${model.modelId}`}>
														<button
															type="button"
															disabled={busy || !group.available}
															aria-pressed={chosen}
															onClick={() => {
																setSelected(model);
																setLevel(model.thinkingLevelAdjustments[level]);
															}}
															className={`focus-neko block w-full rounded-lg border px-3 py-2 text-left text-sm disabled:opacity-50 ${chosen ? "border-sakura-300 bg-sakura-50 text-sakura-800" : "border-sakura-100 bg-surface text-ink-700"}`}
														>
															{model.name}
															{chosen ? " ✓" : ""}
															<span className="block truncate text-xs text-ink-400">{model.modelId}</span>
															<span className="mt-0.5 block text-xs text-ink-500">{describeModel(model)}</span>
														</button>
													</li>
												);
											})}
										</ul>
									)}
								</section>
							);
						})}
						{groups.length === 0 && (
							<p className="px-1 py-3 text-sm text-ink-500">
								{searching ? "没有匹配的模型。" : "没有可选模型，请先在设置中启用模型服务。"}
							</p>
						)}
					</fieldset>
				</div>
				{selected && (
					<div>
						<p className="mb-2 text-sm text-ink-600">思考强度</p>
						<fieldset className="flex flex-wrap gap-2" aria-label="思考强度">
							{selected.supportedThinkingLevels.map((item) => (
								<button
									type="button"
									key={item}
									disabled={busy}
									aria-pressed={level === item}
									onClick={() => setLevel(item)}
									className={`focus-neko rounded-full border px-4 py-2 text-sm ${item === level ? "border-tianyi-300 bg-tianyi-50 text-tianyi-800" : "border-sakura-200"}`}
								>
									{item}
								</button>
							))}
						</fieldset>
					</div>
				)}
				<p className="text-xs text-ink-500">仅当前会话，从下一次请求生效。</p>
				{error && (
					<p role="alert" className="text-sm text-sakura-800">
						{error}
					</p>
				)}
				<div className="flex justify-end gap-2">
					<button type="button" onClick={props.onClose} className="btn-outline rounded-full px-4 py-2 text-sm">
						取消
					</button>
					<button
						type="button"
						disabled={busy || !selected}
						onClick={() => void apply()}
						className="btn-primary rounded-full px-5 py-2 text-sm"
					>
						{busy ? "应用中…" : "应用"}
					</button>
				</div>
			</div>
		</Modal>
	);
}
