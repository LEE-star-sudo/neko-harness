import type { ModelThinkingLevel } from "@earendil-works/pi-ai";
import type { NekoModelRef } from "@neko-harness/core";
import { useRef, useState } from "react";
import { appActions } from "../lib/bootstrap";
import { useNekoState } from "../lib/store";
import { Modal } from "./nav-primitives";

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
				disabled={!current || phase !== "ready" || operating}
				onClick={() => currentSessionId && setSession({ id: currentSessionId })}
				className="focus-neko min-w-0 truncate rounded-full px-2 py-1 text-left text-xs text-ink-500 hover:bg-sakura-50"
				aria-label={`模型与思考强度：${label} ${view?.agent.thinkingLevel ?? ""}`}
			>
				{label} · {view?.agent.thinkingLevel ?? "off"} ▾
			</button>
			{session && session.id === currentSessionId && current && (
				<ModelForm
					key={session.id}
					session={session.id}
					current={current}
					level={view?.agent.thinkingLevel ?? "off"}
					onClose={() => setSession((active) => (active === session ? null : active))}
				/>
			)}
		</>
	);
}
function ModelForm(props: {
	session: string;
	current: ReturnType<typeof useNekoState>["models"][number];
	level: string;
	onClose: () => void;
}) {
	const { models } = useNekoState();
	const [selected, setSelected] = useState(props.current);
	const [level, setLevel] = useState<ModelThinkingLevel>(props.level as ModelThinkingLevel);
	const [busy, setBusy] = useState(false);
	const pending = useRef(false);
	const [error, setError] = useState("");
	async function apply() {
		if (pending.current) return;
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
			<div className="model-settings space-y-5 p-5">
				<fieldset className="space-y-2" aria-label="模型">
					{models.map((model) => (
						<button
							type="button"
							key={`${model.provider}/${model.modelId}`}
							disabled={busy}
							aria-pressed={model === selected}
							onClick={() => {
								setSelected(model);
								setLevel(model.thinkingLevelAdjustments[level]);
							}}
							className={`focus-neko block w-full rounded-xl border px-4 py-3 text-left text-sm ${model === selected ? "border-sakura-300 bg-sakura-50 text-sakura-800" : "border-sakura-200 bg-surface text-ink-700"}`}
						>
							{model.name}
							{model === selected ? " ✓" : ""}
							<span className="mt-1 block text-xs text-ink-500">
								{model.input.includes("image") ? "支持图片" : "仅文本"}
							</span>
						</button>
					))}
				</fieldset>
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
				<p className="text-xs text-ink-500">仅当前会话，从下一次请求生效。</p>
				{error && (
					<p role="alert" className="text-sm text-sakura-800">
						{error}
					</p>
				)}
				<div className="flex justify-end gap-2">
					<button type="button" onClick={props.onClose} className="focus-neko rounded-full px-4 py-2 text-sm">
						取消
					</button>
					<button
						type="button"
						disabled={busy}
						onClick={() => void apply()}
						className="focus-neko rounded-full bg-sakura-100 px-5 py-2 text-sm text-sakura-800"
					>
						{busy ? "应用中…" : "应用"}
					</button>
				</div>
			</div>
		</Modal>
	);
}
