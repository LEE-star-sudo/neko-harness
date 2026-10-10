import { replaceMention } from "@neko-harness/core/file-mentions";
import { compactInstructions, type ImageFile } from "@neko-harness/core/image-transfer";
import { Link } from "@tanstack/react-router";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { appActions } from "../lib/bootstrap";
import { getState, storeActions, useNekoState } from "../lib/store";
import { ComposerSuggestions } from "./composer-suggestions";
import { useFileMentions } from "./file-mentions";

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
	const { currentSessionId, workspaceRoot } = useNekoState();
	return (
		<SessionComposer
			key={currentSessionId ?? `none:${workspaceRoot}`}
			sessionId={currentSessionId ?? `none:${workspaceRoot}`}
			{...props}
		/>
	);
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
	const { credentials, view, models, workspaceRoot, phase, operating } = useNekoState();
	const active = view?.compaction?.active ?? [];
	if (!drafts.has(props.sessionId))
		drafts.set(props.sessionId, { text: "", files: [], requestId: crypto.randomUUID() });
	const draft = useSyncExternalStore(subscribeDrafts, () => drafts.get(props.sessionId)!);

	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");
	const [menu, setMenu] = useState(false);
	const commandId = useId();
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
	const missingKey = view?.agent.model?.provider === "deepseek" && credentials?.statuses.deepseek.source === "none";
	const model = models.find(
		(m) => m.provider === view?.agent.model?.provider && m.modelId === view?.agent.model?.modelId,
	);
	const noVision = draft.files.length > 0 && model !== undefined && !model.input.includes("image");
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
	const imageRequest = useRef<AbortController | null>(null);
	const creating = useRef(false);
	useEffect(
		() => () => {
			if (!creating.current) imageRequest.current?.abort();
		},
		[],
	);
	const mentions = useFileMentions(textarea, workspaceRoot, phase === "ready" && !operating, (item, token) => {
		const before = current.current;
		if (item.kind === "file" && /\.(png|jpe?g|webp)$/i.test(item.path)) {
			if (imageRequest.current) return;
			const controller = new AbortController();
			imageRequest.current = controller;
			setError("正在读取图片…");
			void (async () => {
				let sessionId = props.sessionId;
				if (sessionId.startsWith("none:")) {
					creating.current = true;
					await appActions.createSession();
					const state = getState();
					if (state.workspaceRoot !== workspaceRoot || !state.currentSessionId) throw new Error("工作区已切换");
					sessionId = state.currentSessionId;
					drafts.set(sessionId, before);
					for (const listener of draftListeners) listener();
				}
				const file = await appActions.workspaceImage(item.path, sessionId, controller.signal);
				if (
					controller.signal.aborted ||
					getState().currentSessionId !== sessionId ||
					getState().workspaceRoot !== workspaceRoot
				)
					return;
				const saved = drafts.get(sessionId) ?? before;
				const attachment = {
					id: crypto.randomUUID(),
					file: new File([new Uint8Array(file.bytes)], file.name, { type: file.mimeType }),
				};
				const text =
					saved.text === before.text ? before.text.slice(0, token.start) + before.text.slice(token.end) : saved.text;
				drafts.set(sessionId, { ...saved, text, files: [...saved.files, attachment], requestId: crypto.randomUUID() });
				for (const listener of draftListeners) listener();
				setError("");
			})()
				.catch((error) => {
					if (!controller.signal.aborted) {
						const text = error instanceof Error ? error.message : "图片读取失败，请重试";
						setError(text);
						if (creating.current) storeActions.notice({ level: "error", text });
					}
				})
				.finally(() => {
					if (imageRequest.current === controller) imageRequest.current = null;
				});
			return;
		}
		const replacement = replaceMention(before.text, token, item.path, item.kind === "directory");
		const el = textarea.current;
		if (el) {
			el.focus();
			el.setSelectionRange(token.start, token.end);
			// Native insertion preserves the browser undo stack where supported.
			const inserted = replacement.text.slice(token.start, replacement.text.length - (before.text.length - token.end));
			if (!document.execCommand("insertText", false, inserted)) edit({ text: replacement.text });
			else edit({ text: el.value });
			requestAnimationFrame(() => {
				el.setSelectionRange(replacement.cursor, replacement.cursor);
				if (item.kind === "directory") mentions.refresh();
			});
		}
	});
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
			let target = props.sessionId;
			if (target.startsWith("none:")) {
				await appActions.createSession();
				const state = getState();
				if (state.workspaceRoot !== workspaceRoot || !state.currentSessionId)
					throw new Error("工作区已切换，草稿已保留");
				target = state.currentSessionId;
				drafts.set(target, before);
				for (const listener of draftListeners) listener();
			}
			await appActions.submit(before.text.trim(), files, before.requestId, target);
			if (target !== props.sessionId) {
				drafts.set(target, { text: "", files: [], requestId: crypto.randomUUID() });
				for (const listener of draftListeners) listener();
			}
			const saved = drafts.get(props.sessionId);
			if (saved)
				update({
					text: saved.text === before.text ? "" : saved.text,
					files: saved.files.filter((a) => !before.files.some((sent) => sent.id === a.id)),
					requestId: crypto.randomUUID(),
				});
		} catch (e) {
			const message = e instanceof Error ? e.message : "发送失败，请重试";
			setError(message);
			if (getState().currentSessionId !== props.sessionId) storeActions.notice({ level: "error", text: message });
		} finally {
			locked.current = false;
			setPending(false);
		}
	};
	const acceptCommand = () => {
		edit({ text: "/compact " });
		setMenu(false);
		textarea.current?.focus();
	};
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
				{mentions.panel}
				{menu && !mentions.open && (
					<ComposerSuggestions
						anchor={textarea}
						id={commandId}
						title="输入命令"
						items={[{ key: "compact", label: "/compact", description: "压缩上下文（可附加要求）" }]}
						selected={0}
						onSelect={() => {}}
						onAccept={acceptCommand}
					/>
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
						placeholder="输入消息，@ 引用文件，/ 命令"
						aria-autocomplete="list"
						aria-controls={mentions.controls ?? (menu ? commandId : undefined)}
						aria-activedescendant={mentions.active ?? (menu ? `${commandId}-0` : undefined)}
						onClick={() => mentions.refresh()}
						onBlur={() => {
							mentions.close();
							setMenu(false);
						}}
						onCompositionStart={() => mentions.close()}
						onCompositionEnd={() => mentions.refresh()}
						className="focus-neko max-h-40 min-h-10 min-w-0 flex-1 resize-none rounded-2xl border border-sakura-300 bg-base px-3.5 py-2 text-[15px] text-ink-900"
						onChange={(e) => {
							edit({ text: e.target.value });
							setMenu(/^\/[a-z]*$/.test(e.target.value));
							if (!(e.nativeEvent as InputEvent).isComposing) mentions.refresh();
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
							if (mentions.keyDown(e)) return;
							if (e.key === "Escape" && menu) {
								e.preventDefault();
								setMenu(false);
							} else if (menu && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
								e.preventDefault();
							} else if (menu && e.key === "Tab") {
								if (!e.shiftKey) {
									e.preventDefault();
									acceptCommand();
								} else setMenu(false);
							} else if (e.key === "Enter" && !e.shiftKey) {
								e.preventDefault();
								if (menu) acceptCommand();
								else void submit();
							}
						}}
					/>
					<button
						type="button"
						aria-label="输入操作菜单"
						aria-expanded={menu}
						className="focus-neko h-10 px-2"
						onClick={() => {
							mentions.close();
							setMenu(!menu);
							textarea.current?.focus();
						}}
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
