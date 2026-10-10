import { compactInstructions, type ImageFile } from "@neko-harness/core/image-transfer";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { appActions } from "../lib/bootstrap";
import { useNekoState } from "../lib/store";

type Attachment = { id: string; file: File; error?: string; processing?: boolean };
type Draft = { text: string; files: Attachment[]; requestId: string };
const drafts = new Map<string, Draft>();
const draftListeners = new Set<() => void>();
const subscribeDrafts = (listener: () => void) => {
	draftListeners.add(listener);
	return () => {
		draftListeners.delete(listener);
	};
};
type Props = { busy: boolean; status: string | null; disabled?: boolean };
export function Composer(props: Props) {
	const { currentSessionId } = useNekoState();
	return <SessionComposer key={currentSessionId ?? "none"} sessionId={currentSessionId ?? "none"} {...props} />;
}
function Thumbnail({ file }: { file: File }) {
	const [url, setUrl] = useState("");
	useEffect(() => {
		const next = URL.createObjectURL(file);
		setUrl(next);
		return () => URL.revokeObjectURL(next);
	}, [file]);
	return <img src={url || undefined} alt={file.name} className="h-16 w-20 rounded-lg object-cover" />;
}
function SessionComposer(props: Props & { sessionId: string }) {
	const { credentials, view, models } = useNekoState();
	if (!drafts.has(props.sessionId))
		drafts.set(props.sessionId, { text: "", files: [], requestId: crypto.randomUUID() });
	const draft = useSyncExternalStore(subscribeDrafts, () => drafts.get(props.sessionId)!);

	const [now, setNow] = useState(Date.now);
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, []);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");
	const [menu, setMenu] = useState(false);
	const [drag, setDrag] = useState(false);
	const textarea = useRef<HTMLTextAreaElement>(null);
	const picker = useRef<HTMLInputElement>(null);
	const current = useRef(draft);
	current.current = draft;
	const locked = useRef(false);
	const update = (next: Draft) => {
		current.current = next;
		drafts.set(props.sessionId, next);
		for (const listener of draftListeners) listener();
	};
	const edit = (next: Partial<Draft>) => update({ ...current.current, ...next, requestId: crypto.randomUUID() });
	const missingKey = view?.agent.model?.provider === "deepseek" && credentials?.source === "none";
	const model = models.find(
		(m) => m.provider === view?.agent.model?.provider && m.modelId === view?.agent.model?.modelId,
	);
	const noVision = draft.files.length > 0 && !model?.input.includes("image");
	const add = (files: File[]) => {
		const next: Attachment[] = files.map((file) => ({
			id: crypto.randomUUID(),
			file,
			processing: true,
			error: !["image/png", "image/jpeg", "image/webp"].includes(file.type)
				? "仅支持 PNG、JPEG、WebP"
				: file.size > 20 * 1024 * 1024
					? "单图不能超过 20 MiB"
					: undefined,
		}));
		edit({ files: [...current.current.files, ...next] });
		for (const attachment of next) void validate(attachment);
	};
	const validate = async (attachment: Attachment) => {
		let error = attachment.error;
		if (!error) {
			try {
				const bitmap = await createImageBitmap(attachment.file);
				bitmap.close();
			} catch {
				error = "无法解码图片，请重新选择";
			}
		}
		const saved = drafts.get(props.sessionId);
		if (!saved?.files.some((a) => a.id === attachment.id)) return;
		const next = {
			...saved,
			files: saved.files.map((a) => (a.id === attachment.id ? { ...a, error, processing: false } : a)),
		};
		update(next);
	};
	const compact = async (instructions: string) => {
		if (locked.current || props.disabled) return;
		locked.current = true;
		setPending(true);
		setError("");
		const before = current.current;
		drafts.set(props.sessionId, before);
		try {
			await appActions.compact(instructions, props.sessionId);
			if (
				current.current === before &&
				drafts.get(props.sessionId) === before &&
				compactInstructions(before.text) !== null
			)
				update({ ...before, text: "", requestId: crypto.randomUUID() });
			setMenu(false);
		} catch (e) {
			setError(e instanceof Error ? e.message : "压缩失败，请重试");
		} finally {
			locked.current = false;
			setPending(false);
		}
	};
	const submit = async () => {
		const instructions = compactInstructions(current.current.text);
		if (instructions !== null) {
			await compact(instructions);
			return;
		}
		const before = current.current;
		drafts.set(props.sessionId, before);
		if (
			locked.current ||
			props.disabled ||
			props.busy ||
			missingKey ||
			noVision ||
			(!before.text.trim() && !before.files.length)
		)
			return;
		if (before.files.length > 4 || before.files.reduce((n, a) => n + a.file.size, 0) > 40 * 1024 * 1024) {
			setError("每条消息最多 4 张图片，总大小不超过 40 MiB");
			return;
		}
		if (before.files.some((a) => a.processing)) return;
		if (before.files.some((a) => a.error)) {
			setError("请先移除不支持的附件");
			return;
		}
		locked.current = true;
		setPending(true);
		setError("");
		try {
			const files: ImageFile[] = [];
			for (const a of before.files)
				files.push({ name: a.file.name, mimeType: a.file.type, bytes: new Uint8Array(await a.file.arrayBuffer()) });
			await appActions.submit(before.text.trim(), files, before.requestId, props.sessionId);
			const saved = drafts.get(props.sessionId);
			if (saved)
				update({
					text: saved.text === before.text ? "" : saved.text,
					files: saved.files.filter((a) => !before.files.some((sent) => sent.id === a.id)),
					requestId: crypto.randomUUID(),
				});
		} catch (e) {
			setError(e instanceof Error ? e.message : "发送失败，请重试");
		} finally {
			locked.current = false;
			setPending(false);
		}
	};
	const active = view?.compaction?.active ?? [];
	const latest = view?.compaction?.latest;
	const compaction = active.length
		? active.some((c) => c.retry)
			? "压缩重试中"
			: active.some((c) => c.blocking)
				? "等待上下文压缩"
				: "正在压缩上下文"
		: latest?.phase === "waiting-to-apply"
			? "等待应用压缩摘要"
			: latest && now - latest.at < 10000
				? (
						{
							applied: "上下文已压缩",
							nothing: "暂无可压缩内容",
							skipped: "已跳过过期摘要",
							cancelled: "压缩已取消",
							failed: "压缩失败，可重试",
							summarizing: "正在压缩上下文",
						} as Record<string, string>
					)[latest.phase]
				: null;
	return (
		<section
			aria-label="消息输入"
			className={`relative border-t border-sakura-200/70 bg-surface/80 px-4 py-3 ${drag ? "ring-2 ring-sakura-300" : ""}`}
			onDragOver={(e) => {
				if (e.dataTransfer.types.includes("Files")) {
					e.preventDefault();
					setDrag(true);
				}
			}}
			onDragLeave={(e) => {
				if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrag(false);
			}}
			onDrop={(e) => {
				e.preventDefault();
				setDrag(false);
				add(Array.from(e.dataTransfer.files));
			}}
		>
			<div className="mx-auto max-w-3xl">
				{drag && <p className="text-sm text-sakura-700">松开以添加图片，不会自动发送</p>}
				{missingKey && (
					<p className="text-sm text-sakura-700">
						尚未配置 DeepSeek Key。
						<Link to="/settings" className="focus-neko underline">
							前往设置
						</Link>
					</p>
				)}
				{props.busy && props.status && <p className="text-xs text-ink-500">{props.status}</p>}
				{compaction && <output className="mb-1 text-sm text-ink-500">{compaction}</output>}
				{noVision && <p className="text-sm text-sakura-700">当前模型不支持图片，请切换模型或移除附件。</p>}
				{!model?.input.includes("image") && view?.items.some((i) => i.type === "user" && i.images?.length) && (
					<p className="text-xs text-ink-500">当前模型无法查看历史原图，仍可使用已有文字分析。</p>
				)}
				{error && (
					<p role="alert" className="my-1 break-words text-sm text-sakura-700">
						{error}
					</p>
				)}
				{!!draft.files.length && (
					<ul className="mb-2 flex max-h-40 flex-wrap gap-2 overflow-y-auto">
						{draft.files.map((a) => (
							<li key={a.id} className="relative w-28 rounded-xl border border-sakura-200 bg-base p-2">
								<Thumbnail file={a.file} />
								<span className="block truncate text-xs" title={a.file.name}>
									{a.file.name}
								</span>
								{a.processing && <span className="text-xs text-ink-500">检查图片…</span>}
								{a.error && <span className="text-xs text-sakura-700">{a.error}</span>}
								<button
									type="button"
									aria-label={`移除 ${a.file.name}`}
									className="focus-neko absolute right-0 top-0 rounded-full bg-base px-1"
									onClick={() => edit({ files: current.current.files.filter((f) => f.id !== a.id) })}
								>
									×
								</button>
							</li>
						))}
					</ul>
				)}
				{menu && (
					<div
						role="menu"
						aria-label="输入命令"
						className="mb-2 max-h-40 overflow-auto rounded-xl border border-sakura-200 bg-base p-2 shadow-soft"
					>
						<button
							onKeyDown={(e) => {
								if (e.key === "Escape") {
									setMenu(false);
									textarea.current?.focus();
								}
							}}
							role="menuitem"
							type="button"
							className="focus-neko w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-sakura-50"
							onClick={() => {
								edit({ text: "/compact " });
								setMenu(false);
								textarea.current?.focus();
							}}
						>
							/compact · 压缩上下文（可附加要求）
						</button>
					</div>
				)}
				<div className="flex items-end gap-2">
					<input
						ref={picker}
						type="file"
						accept="image/png,image/jpeg,image/webp"
						multiple
						hidden
						onChange={(e) => {
							add(Array.from(e.target.files ?? []));
							e.target.value = "";
						}}
					/>
					<button
						type="button"
						aria-label="添加图片"
						title="添加图片（最多 4 张）"
						disabled={props.disabled}
						onClick={() => picker.current?.click()}
						className="focus-neko h-10 rounded-full border border-sakura-200 px-3 text-xl"
					>
						＋
					</button>
					<textarea
						ref={textarea}
						disabled={props.disabled}
						value={draft.text}
						rows={1}
						placeholder="输入消息或 / 命令，支持粘贴图片"
						className="focus-neko max-h-40 min-h-10 min-w-0 flex-1 resize-none rounded-2xl border border-sakura-300 bg-base px-3.5 py-2 text-[15px] text-ink-900"
						onChange={(e) => {
							edit({ text: e.target.value });
							setMenu(/^\/[a-z]*$/.test(e.target.value));
							e.target.style.height = "auto";
							e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
						}}
						onPaste={(e) => {
							const files = Array.from(e.clipboardData.files);
							if (files.length) {
								e.preventDefault();
								add(files);
							}
						}}
						onKeyDown={(e) => {
							if (e.nativeEvent.isComposing) return;
							if (e.key === "Escape" && menu) {
								e.preventDefault();
								setMenu(false);
							} else if (menu && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
								e.preventDefault();
								e.currentTarget.parentElement?.previousElementSibling
									?.querySelector<HTMLButtonElement>("button")
									?.focus();
							} else if (e.key === "Enter" && !e.shiftKey) {
								e.preventDefault();
								if (menu && draft.text !== "/compact") {
									edit({ text: "/compact " });
									setMenu(false);
								} else void submit();
							}
						}}
					/>
					<button
						type="button"
						aria-label="输入操作菜单"
						aria-expanded={menu}
						className="focus-neko h-10 px-2"
						onClick={() => setMenu(!menu)}
					>
						⋯
					</button>
					<button
						type="button"
						disabled={
							pending ||
							props.disabled ||
							(!draft.text.trim() && !draft.files.length) ||
							(compactInstructions(draft.text) === null &&
								(props.busy || missingKey || noVision || draft.files.some((a) => !!a.error || a.processing)))
						}
						onClick={() => void submit()}
						className="btn-primary focus-neko h-10 shrink-0 rounded-full px-3 text-sm disabled:opacity-50"
					>
						{pending ? "处理中" : "发送"}
					</button>
					{(props.busy || active.some((c) => c.reason === "manual" || c.blocking)) && (
						<button
							type="button"
							onClick={() => appActions.abort()}
							className="btn-stop focus-neko h-10 rounded-full px-2 text-sm"
							title="中止当前会话运行及可中止任务"
						>
							停止
						</button>
					)}
				</div>
			</div>
		</section>
	);
}
