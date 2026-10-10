import { open } from "node:fs/promises";
import { basename, extname } from "node:path";
import {
	type Context,
	createRemoteServiceEndpoint,
	RemoteServiceError,
	RemoteServiceProvider,
	replicatedState,
} from "@earendil-works/chord";
import type { RoutedSessionAttachment, RoutedSessionHandle } from "@earendil-works/pi-server";
import {
	type ChatView,
	CompactionDoc,
	ImageMetadataDoc,
	mergeUsage,
	type NekoRuntime,
	type NekoSession,
	prepareImage,
	projectChatView,
	totalUsage,
} from "@neko-harness/core";
import { workspaceTarget } from "@neko-harness/core/workspace-files";
import { NekoChat } from "./contract.ts";
import { IMAGE_CHUNK_BYTES, ImageUploads } from "./image-uploads.ts";

/**
 * 打开一个会话的 RoutedSessionHandle（pi-server ServerHost.openSession 的工厂实现）。
 *
 * 每个会话维护一份 ChatView 投影复制状态（订阅 durable viewState，每次 commit 全量重投影，v1
 * 快照语义与 design D4 一致）；所有 attachment 共享该状态，各自持有独立 endpoint（订阅编码互不干扰）。
 * 生效模型/thinkingLevel 由投影直接从 pi.agent doc 读出：configure 是一次 commit，视图更新即推送新值，无竞态。
 */
export async function openNekoSessionHandle(options: {
	readonly runtime: NekoRuntime;
	readonly session: NekoSession;
	readonly modelLabel: string;
	readonly onActivity: () => Promise<void>;
	readonly context: Context;
}): Promise<RoutedSessionHandle> {
	const { runtime, session, modelLabel, onActivity, context } = options;
	const view = await session.viewState();
	const history = new Map<number, import("@earendil-works/pi-durable").EntryRecord>();
	let cursor: import("@earendil-works/pi-durable").Cursor | undefined;
	do {
		const page = await session.conversation.entries({ order: "ascending" }, 100, cursor, context);
		for (const entry of page.items) history.set(entry.id, entry);
		cursor = page.next;
	} while (cursor);
	let compactionDoc = await runtime.harness.snapshot(CompactionDoc, session.id, context);
	let imageDoc = await runtime.harness.snapshot(ImageMetadataDoc, session.id, context);
	let namingUsage = await runtime.namingUsage(session.id);
	let disposed = false;
	let revision = 0;
	const project = () => {
		for (const entry of view.value.entries) history.set(entry.id, entry);
		return projectChatView(
			{
				...view.value,
				entries: [...history.values()].sort((a, b) => a.id - b.id),
				docs: {
					...view.value.docs,
					"app.neko.compaction": compactionDoc ?? { latest: null },
					"app.neko.images": imageDoc ?? { images: {} },
					"pi.usage": mergeUsage(
						(view.value.docs["pi.usage"] ?? {
							models: {},
							tools: {},
						}) as import("@earendil-works/pi-durable").UsageState,
						namingUsage,
					),
				},
			},
			modelLabel,
			{ models: runtime.listModels(), contextEntries: view.value.entries },
		);
	};
	const chatState = replicatedState<ChatView>(project());
	const stopMetadata = runtime.onDirectoryChange(() => {
		const current = ++revision;
		void runtime
			.namingUsage(session.id)
			.then((usage) => {
				if (!disposed && current === revision) {
					namingUsage = usage;
					chatState.replace(context, project());
				}
			})
			.catch(() => {});
	});
	const unsubscribe = view.subscribe(() => {
		for (const entry of view.value.entries) history.set(entry.id, entry);
		chatState.replace(context, project());
	});

	let hostTail = Promise.resolve();
	const stopHost = runtime.harness.subscribeCommits(({ changes }) => {
		if (
			!changes.some(
				(c) =>
					c.type === "document" &&
					c.conversationId === session.id &&
					(c.record.kind === "app.neko.compaction" || c.record.kind === "app.neko.images"),
			)
		)
			return;
		hostTail = hostTail
			.catch(() => {})
			.then(async () => {
				const [a, b] = await Promise.all([
					runtime.harness.snapshot(CompactionDoc, session.id, context),
					runtime.harness.snapshot(ImageMetadataDoc, session.id, context),
				]);
				if (disposed) return;
				compactionDoc = a;
				imageDoc = b;
				chatState.replace(context, project());
			});
	});
	// 会话级 provider 由本句柄的所有 attachment 共享（等价 coding-agent worker 的 per-scope endpoint 模式）。
	const safeUpload = <T>(action: () => T): T => {
		try {
			return action();
		} catch (error) {
			throw new RemoteServiceError(
				"service_invalid_value",
				error instanceof Error ? error.message : "Image upload failed",
			);
		}
	};
	const createProvider = () => {
		const uploads = new ImageUploads();
		const provider = new RemoteServiceProvider([{ service: NekoChat, mode: "singleton" }]);
		provider.provide(NekoChat, {
			view: chatState,
			draftImage: async ({ id, offset }) => safeUpload(() => uploads.read(id, offset)),
			importImage: async (path, ctx) => {
				const target = await workspaceTarget(chatState.value!.cwd, path);
				const mimeType = (
					{ ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" } as Record<
						string,
						string
					>
				)[extname(target).toLowerCase()];
				if (!mimeType) throw new Error("Only PNG, JPEG and WebP images are supported");
				const agent = await runtime.getAgent(session.id);
				const model = runtime
					.listModels()
					.find((m) => m.provider === agent.model?.provider && m.modelId === agent.model?.modelId);
				if (!model?.input.includes("image")) throw new Error("Current model does not support images");
				const handle = await open(target, "r");
				let id: string | undefined;
				try {
					const info = await handle.stat();
					if (!info.isFile()) throw new Error("Image must be a file");
					ctx.abortSignal?.throwIfAborted();
					id = uploads.begin({ name: basename(target), mimeType, size: info.size });
					let offset = 0;
					while (offset < info.size) {
						ctx.abortSignal?.throwIfAborted();
						const buffer = Buffer.alloc(Math.min(IMAGE_CHUNK_BYTES, info.size - offset));
						const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);
						if (!bytesRead) throw new Error("Image changed while reading");
						uploads.append({ id, offset, data: buffer.subarray(0, bytesRead).toString("base64") });
						offset += bytesRead;
					}
					const after = await handle.stat();
					if (after.size !== info.size || after.mtimeMs !== info.mtimeMs)
						throw new Error("Image changed while reading");
					ctx.abortSignal?.throwIfAborted();
					uploads.finish(id);
					const raw = uploads.resolve([id])[0]!;
					await prepareImage(Buffer.from(raw.content.data, "base64"), mimeType, basename(target), model);
					ctx.abortSignal?.throwIfAborted();
					return { id, name: basename(target) };
				} catch (error) {
					if (id) uploads.release(id);
					throw error;
				} finally {
					await handle.close();
				}
			},
			compact: async ({ instructions }) => {
				try {
					await session.compact(instructions);
				} catch (error) {
					throw new RemoteServiceError(
						"service_invalid_value",
						error instanceof Error ? error.message : "Cannot compact",
					);
				}
			},
			beginImage: async (input) => safeUpload(() => uploads.begin(input)),
			appendImage: async (input) => safeUpload(() => uploads.append(input)),
			finishImage: async (id) => safeUpload(() => uploads.finish(id)),
			releaseImage: async (id) => uploads.release(id),
			getImage: async (input) => {
				if (
					!Number.isSafeInteger(input.offset) ||
					input.offset < 0 ||
					!Number.isSafeInteger(input.contentIndex) ||
					input.contentIndex < 0
				)
					throw new RemoteServiceError("service_invalid_value", "Invalid image range");
				const entry = history.get(input.entryId);
				const content = entry?.model?.[0]?.content;
				const image = Array.isArray(content) ? content[input.contentIndex] : undefined;
				if (image?.type !== "image")
					throw new RemoteServiceError("service_invalid_value", "Image is not part of this conversation");
				const bytes = Buffer.from(image.data, "base64");
				if (input.offset > bytes.length) throw new RemoteServiceError("service_invalid_value", "Invalid image range");
				return {
					data: bytes.subarray(input.offset, input.offset + IMAGE_CHUNK_BYTES).toString("base64"),
					total: bytes.length,
					mimeType: image.mimeType,
				};
			},
			submit: async (input) => {
				try {
					const duplicate =
						input.requestId &&
						(await session.conversation.commit((tx) => tx.submissionByRequest(session.id, input.requestId!), context));
					const images = duplicate ? [] : uploads.resolve(input.images ?? []);
					await session.submit(
						images.length ? [{ type: "text", text: input.content }, ...images.map((i) => i.content)] : input.content,
						{
							imageNames: images.map((i) => i.name),
							...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
							...(input.whenBusy !== undefined ? { whenBusy: input.whenBusy } : {}),
						},
					);
					for (const id of input.images ?? []) uploads.release(id);
				} catch (error) {
					if (error instanceof Error && error.message.startsWith("DEEPSEEK_KEY_REQUIRED:"))
						throw new RemoteServiceError(
							"service_invalid_value",
							"DEEPSEEK_KEY_REQUIRED: Configure DeepSeek in /login or Web settings.",
						);
					throw new RemoteServiceError(
						"service_invalid_value",
						error instanceof Error ? error.message : "Cannot submit message",
					);
				}
				await onActivity();
			},
			abort: () => session.abort(),
			skills: () => runtime.listSkills(session.id),
			usage: async () => {
				const usage = totalUsage(await session.usage());
				return {
					input: usage.input,
					output: usage.output,
					cacheRead: usage.cacheRead,
					cacheWrite: usage.cacheWrite,
					cost: usage.cost.total,
				};
			},
			configure: async (change) => {
				const applied = await runtime.configureConversation(session.id, change);
				if (!applied) {
					// 句柄仍在路由中但会话已被归档/删除（竞态窗口）：给前端一个可判读的远程错误。
					throw new RemoteServiceError(
						"service_invalid_value",
						`Session ${String(session.id)} is unavailable or archived`,
					);
				}
			},
		});

		return { provider, uploads };
	};
	const endpoints = new Map<ReturnType<typeof createRemoteServiceEndpoint>, () => void>();
	return {
		attachClient() {
			const { provider, uploads } = createProvider();
			const endpoint = createRemoteServiceEndpoint(provider);
			endpoints.set(endpoint, () => {
				endpoint.dispose();
				uploads.close();
				provider.dispose();
			});
			let released = false;
			const attachment: RoutedSessionAttachment = {
				invokeService(call, publish, invokeContext) {
					if (released) return Promise.reject(new Error("Session attachment is released"));
					return endpoint.invoke(call, publish, invokeContext);
				},
				release() {
					if (released) return;
					released = true;
					endpoint.dispose();
					uploads.close();
					provider.dispose();
					endpoints.delete(endpoint);
				},
			};
			return attachment;
		},
		async close() {
			for (const dispose of endpoints.values()) dispose();
			endpoints.clear();
			stopHost();
			unsubscribe();
			disposed = true;
			stopMetadata();
			view.dispose();
		},
	};
}
