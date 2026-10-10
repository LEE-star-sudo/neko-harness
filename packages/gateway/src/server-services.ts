import type { Context } from "@earendil-works/chord";
import {
	createRemoteServiceEndpoint,
	type JsonValue,
	RemoteServiceProvider,
	replicatedState,
} from "@earendil-works/chord";
import type { ConversationId } from "@earendil-works/pi-durable";
import type { RoutedServerServiceAttachment, RoutedServerServiceHost } from "@earendil-works/pi-server";
import { SessionNotFoundError } from "@earendil-works/pi-server";
import type { NekoRuntime } from "@neko-harness/core";
import {
	type NekoDirectoryState,
	NekoSessionDirectory,
	NekoSessionManagement,
	type NekoSessionSummary,
} from "./contract.ts";

/**
 * 服务器级服务（目录订阅 + 会话管理），模式对照 coding-agent experimental services/server.ts：
 * 每个连接一个 RemoteServiceProvider + endpoint，目录为共享复制状态，变化推送给所有订阅。
 */
export type NekoServerServices = {
	readonly host: RoutedServerServiceHost;
	/** 重新列出目录并递增 revision（创建/归档后由管理方法内部调用）。 */
	refresh(): Promise<void>;
	dispose(): Promise<void>;
};

export async function createNekoServerServices(options: {
	readonly runtime: NekoRuntime;
	readonly context: Context;
}): Promise<NekoServerServices> {
	const { runtime, context } = options;
	const list = async (): Promise<NekoSessionSummary[]> =>
		(await runtime.listConversations()).map((info) => ({ id: String(info.id) }));

	let revision = 1;
	const directory = replicatedState<NekoDirectoryState>({ revision, sessions: await list() });
	const attachments = new Set<RoutedServerServiceAttachment>();
	let mutationTail = Promise.resolve();

	const serialize = <T>(operation: () => Promise<T>): Promise<T> => {
		const result = mutationTail.catch(() => {}).then(operation);
		mutationTail = result.then(
			() => undefined,
			() => undefined,
		);
		return result;
	};

	const refreshNow = async (): Promise<void> => {
		const sessions = await list();
		revision += 1;
		directory.change(context, (draft) => {
			draft.revision = revision;
			draft.sessions = sessions;
		});
	};

	return {
		host: {
			attachClient(presentation) {
				const provider = new RemoteServiceProvider([
					{ service: NekoSessionDirectory, mode: "singleton" },
					{ service: NekoSessionManagement, mode: "singleton" },
				]);
				provider.provide(NekoSessionDirectory, { state: directory });
				provider.provide(NekoSessionManagement, {
					create: (createOptions) =>
						serialize(async () => {
							const created = await runtime.createConversation(
								createOptions.model !== undefined ||
									createOptions.thinkingLevel !== undefined ||
									createOptions.cwd !== undefined
									? {
											...(createOptions.model !== undefined ? { model: createOptions.model } : {}),
											...(createOptions.thinkingLevel !== undefined
												? { thinkingLevel: createOptions.thinkingLevel }
												: {}),
											...(createOptions.cwd !== undefined ? { cwd: createOptions.cwd } : {}),
										}
									: undefined,
							);
							await refreshNow();
							return { id: String(created.id) };
						}),
					archive: (sessionId) =>
						serialize(async () => {
							await presentation.prepareSessionRemoval(sessionId, context);
							await runtime.archiveConversation(toConversationId(sessionId));
							await refreshNow();
						}),
					attach: (sessionId) => serialize(() => presentation.attachSession(sessionId, context)),
					detach: () => serialize(() => presentation.detachSession(context)),
					fork: (sessionId) =>
						serialize(async () => {
							const source = await runtime.getConversation(toConversationId(sessionId));
							if (source === undefined) throw new SessionNotFoundError(`Unknown session: ${sessionId}`);
							// fork 需要父会话的一个可见条目：取最新一条；空会话没有可分叉的历史，退化为新建。
							const newest = await source.conversation.entries({}, 1, undefined, context);
							const at = newest.items[0]?.id;
							const forked =
								at === undefined
									? await runtime.createConversation()
									: await source.conversation.fork(at, { ownership: { kind: "ownerless" } }, context);
							await refreshNow();
							return { id: String(forked.id) };
						}),
				});
				const endpoint = createRemoteServiceEndpoint(provider);
				let released = false;
				const attachment: RoutedServerServiceAttachment = {
					invokeService(call, publish, invokeContext): Promise<JsonValue | undefined> {
						if (released) return Promise.reject(new Error("Server service attachment is released"));
						return endpoint.invoke(call, publish, invokeContext);
					},
					release() {
						if (released) return;
						released = true;
						endpoint.dispose();
						provider.dispose();
						attachments.delete(attachment);
					},
				};
				attachments.add(attachment);
				return attachment;
			},
		},
		refresh: () => serialize(refreshNow),
		async dispose() {
			const releases = await Promise.allSettled([...attachments].map((attachment) => attachment.release(context)));
			attachments.clear();
			await mutationTail;
			const errors = releases.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
			if (errors.length === 1) throw errors[0];
			if (errors.length > 1) throw new AggregateError(errors, "Failed to release server service attachments");
		},
	};
}

/** 目录/路由用的十进制会话 id → pi-durable 的数字 ConversationId。 */
export function toConversationId(sessionId: string): ConversationId {
	const numeric = Number(sessionId);
	if (!Number.isSafeInteger(numeric) || numeric < 1) {
		throw new Error(`Invalid neko session id: ${sessionId}`);
	}
	return numeric as ConversationId;
}
