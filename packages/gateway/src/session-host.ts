import {
	type Context,
	createRemoteServiceEndpoint,
	RemoteServiceError,
	RemoteServiceProvider,
	replicatedState,
} from "@earendil-works/chord";
import type { RoutedSessionAttachment, RoutedSessionHandle } from "@earendil-works/pi-server";
import { type ChatView, type NekoRuntime, type NekoSession, projectChatView, totalUsage } from "@neko-harness/core";
import { NekoChat } from "./contract.ts";

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
	readonly cwd: string;
	readonly context: Context;
}): Promise<RoutedSessionHandle> {
	const { runtime, session, modelLabel, cwd, context } = options;
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
		configure: async (change) => {
			const applied = await runtime.configureConversation(session.id, change);
			if (!applied) {
				// 句柄仍在路由中但会话已被归档/删除（竞态窗口）：给前端一个可判读的远程错误。
				throw new RemoteServiceError(
					"service_invalid_value",
					`会话 ${String(session.id)} 不存在或已归档，无法应用配置变更`,
				);
			}
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
