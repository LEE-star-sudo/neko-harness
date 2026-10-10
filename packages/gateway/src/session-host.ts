import {
	type Context,
	createRemoteServiceEndpoint,
	RemoteServiceProvider,
	replicatedState,
} from "@earendil-works/chord";
import type { RoutedSessionAttachment, RoutedSessionHandle } from "@earendil-works/pi-server";
import { type ChatView, type NekoSession, projectChatView, totalUsage } from "@neko-harness/core";
import { NekoChat } from "./contract.ts";

/**
 * 打开一个会话的 RoutedSessionHandle（pi-server ServerHost.openSession 的工厂实现）。
 *
 * 每个会话维护一份 ChatView 投影复制状态（订阅 durable viewState，每次 commit 全量重投影，v1
 * 快照语义与 design D4 一致）；所有 attachment 共享该状态，各自持有独立 endpoint（订阅编码互不干扰）。
 */
export async function openNekoSessionHandle(options: {
	readonly session: NekoSession;
	readonly modelLabel: string;
	readonly cwd: string;
	readonly context: Context;
}): Promise<RoutedSessionHandle> {
	const { session, modelLabel, cwd, context } = options;
	const view = await session.viewState();
	const chatState = replicatedState<ChatView>(projectChatView(view.value, modelLabel, cwd));
	const unsubscribe = view.subscribe((value) => {
		chatState.replace(context, projectChatView(value, modelLabel, cwd));
	});

	// 会话级 provider 由本句柄的所有 attachment 共享（等价 coding-agent worker 的 per-scope endpoint 模式）。
	const provider = new RemoteServiceProvider([{ service: NekoChat, mode: "singleton" }]);
	provider.provide(NekoChat, {
		view: chatState,
		submit: async (input) => {
			await session.submit(input.content, {
				...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
				...(input.whenBusy !== undefined ? { whenBusy: input.whenBusy } : {}),
			});
		},
		abort: () => session.abort(),
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
	});

	const endpoints = new Set<ReturnType<typeof createRemoteServiceEndpoint>>();
	return {
		attachClient() {
			const endpoint = createRemoteServiceEndpoint(provider);
			endpoints.add(endpoint);
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
					endpoints.delete(endpoint);
				},
			};
			return attachment;
		},
		async close() {
			for (const endpoint of endpoints) endpoint.dispose();
			endpoints.clear();
			provider.dispose();
			unsubscribe();
			view.dispose();
		},
	};
}
