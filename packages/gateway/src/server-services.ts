import type { Context } from "@earendil-works/chord";
import {
	createRemoteServiceEndpoint,
	type JsonValue,
	RemoteServiceProvider,
	replicatedState,
} from "@earendil-works/chord";
import type { ConversationId } from "@earendil-works/pi-durable";
import type { RoutedServerServiceAttachment, RoutedServerServiceHost } from "@earendil-works/pi-server";
import type { NekoRuntime } from "@neko-harness/core";
import {
	type NekoCredentialState,
	NekoCredentials,
	type NekoDirectoryState,
	NekoModels,
	NekoSessionDirectory,
	NekoSessionManagement,
	type NekoSessionSummary,
	type NekoWorkspaceState,
	NekoWorkspaces,
} from "./contract.ts";
import { browseWorkspaces } from "./workspaces.ts";

/**
 * 服务器级服务（目录订阅 + 会话管理 + 模型目录），模式对照 coding-agent experimental services/server.ts：
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
		(await runtime.listConversations()).map((info) => ({
			id: String(info.id),
			workspaceRoot: info.workspaceRoot,
			lastUsedAt: info.lastUsedAt,
			title: info.title,
			firstPromptPreview: info.firstPromptPreview,
			createdAt: info.createdAt,
			lastMessageAt: info.lastMessageAt,
			model: info.model,
			status: info.status,
		}));

	let revision = 1;
	const credentials = replicatedState<NekoCredentialState>({ revision: 1, ...(await runtime.credentialStatus()) });
	const workspaces = replicatedState<NekoWorkspaceState>({ revision, workspaces: await runtime.listWorkspaces() });
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
		const items = await runtime.listWorkspaces();
		workspaces.change(context, (draft) => {
			draft.revision++;
			draft.workspaces = items;
		});
		revision += 1;
		directory.change(context, (draft) => {
			draft.revision = revision;
			draft.sessions = sessions;
		});
	};

	const unsubscribe = runtime.onDirectoryChange(() => {
		void serialize(refreshNow).catch(() => {});
	});
	return {
		host: {
			attachClient(presentation) {
				let activeSessionId: string | undefined;
				const provider = new RemoteServiceProvider([
					{ service: NekoSessionDirectory, mode: "singleton" },
					{ service: NekoSessionManagement, mode: "singleton" },
					{ service: NekoModels, mode: "singleton" },
					{ service: NekoCredentials, mode: "singleton" },
					{ service: NekoWorkspaces, mode: "singleton" },
				]);
				provider.provide(NekoSessionDirectory, { state: directory });
				const updateCredentials = (operation: () => Promise<void>) =>
					serialize(async () => {
						await operation();
						const status = await runtime.credentialStatus();
						credentials.change(context, (draft) => {
							Object.assign(draft, status);
							draft.revision++;
						});
					});
				provider.provide(NekoCredentials, {
					state: credentials,
					save: (input) => updateCredentials(() => runtime.saveCredential(input.key)),
					remove: () => updateCredentials(() => runtime.removeCredential()),
				});
				provider.provide(NekoWorkspaces, {
					state: workspaces,
					browse: (input) => browseWorkspaces(input),
					add: (input) =>
						serialize(async () => {
							const item = await runtime.addWorkspace(input.path);
							await refreshNow();
							return item;
						}),
				});
				// 模型目录是全局快照（Models registry），列表查询无需序列化。
				provider.provide(NekoModels, { list: async () => runtime.listModels() });
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
							return (await list()).find((item) => item.id === String(created.id))!;
						}),
					archive: (sessionId) =>
						serialize(async () => {
							await presentation.prepareSessionRemoval(sessionId, context);
							await runtime.archiveConversation(toConversationId(sessionId));
							await refreshNow();
						}),
					attach: (sessionId) =>
						serialize(async () => {
							await presentation.attachSession(sessionId, context);
							if (activeSessionId !== sessionId) {
								activeSessionId = sessionId;
								await runtime.touchConversation(toConversationId(sessionId));
								await refreshNow();
							}
						}),
					detach: () =>
						serialize(async () => {
							await presentation.detachSession(context);
							activeSessionId = undefined;
						}),
					fork: (sessionId) =>
						serialize(async () => {
							const forked = await runtime.forkConversation(toConversationId(sessionId));
							await refreshNow();
							return (await list()).find((item) => item.id === String(forked.id))!;
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
			unsubscribe();
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
