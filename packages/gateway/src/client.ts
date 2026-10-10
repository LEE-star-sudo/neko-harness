import { createRemoteServiceBinding, type RemoteServiceBinding } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { Client, createClientServiceTransport } from "@earendil-works/pi-client";
import { createUnixTransportFactory } from "@earendil-works/pi-client/unix";
import type { NekoModelInfo } from "@neko-harness/core";
import {
	NekoChat,
	type NekoChat as NekoChatFacade,
	NekoModels,
	NekoSessionDirectory,
	NekoSessionManagement,
} from "./contract.ts";
import { createWsByteTransportFactory } from "./ws-listener.ts";

/**
 * Node 客户端：经 pi-client 连接 neko 网关（Unix socket 或 WebSocket，同一 pi 协议与契约）。
 * 切换 attach 的会话 = detach 后重新 attach；断线不重连，直接新建连接（pi-client 语义）。
 */
export type NekoGatewayAddress =
	| { readonly transport: "unix"; readonly socketPath: string; readonly serverId: string }
	| { readonly transport: "ws"; readonly url: string; readonly serverId: string };

export type NekoGatewayClient = {
	readonly client: Client;
	readonly directory: NekoSessionDirectory;
	readonly management: NekoSessionManagement;
	/** Models registry 的全局模型列表（模型选择器数据源）。 */
	listModels(): Promise<readonly NekoModelInfo[]>;
	/** attach（幂等）到会话，返回水合完成的 chat 门面（view 订阅可用）。 */
	attach(sessionId: string): Promise<NekoChatFacade>;
	detach(): Promise<void>;
	close(): Promise<void>;
};

export async function connectNekoGateway(address: NekoGatewayAddress): Promise<NekoGatewayClient> {
	const transportFactory =
		address.transport === "unix"
			? createUnixTransportFactory({ path: address.socketPath })
			: createWsByteTransportFactory(address.url);
	const client = await Client.connect({ serverId: address.serverId, transportFactory });
	try {
		const serverTransport = createClientServiceTransport(client, () => ({ serverId: address.serverId }));
		const serverBinding = createRemoteServiceBinding({
			services: [NekoSessionDirectory, NekoSessionManagement, NekoModels],
			transport: serverTransport,
		});
		const directory = serverBinding.use(NekoSessionDirectory);
		const management = serverBinding.use(NekoSessionManagement);
		const models = serverBinding.use(NekoModels);
		await serverBinding.ready(BACKGROUND_CONTEXT);

		let sessionBinding: RemoteServiceBinding | undefined;
		return {
			client,
			directory,
			management,
			listModels: () => models.list(BACKGROUND_CONTEXT),
			async attach(sessionId) {
				// 重复 attach 前先释放旧会话绑定（路由本身幂等，客户端只是重新水合订阅）。
				await sessionBinding?.dispose(BACKGROUND_CONTEXT).catch(() => {});
				await management.attach(sessionId, BACKGROUND_CONTEXT);
				await waitForAttachment(client, sessionId);
				const sessionTransport = createClientServiceTransport(client, () => client.attachment);
				sessionBinding = createRemoteServiceBinding({ services: [NekoChat], transport: sessionTransport });
				const facade = sessionBinding.use(NekoChat);
				await sessionBinding.ready(BACKGROUND_CONTEXT);
				// Chord 的服务门面是拦截任意属性的 Proxy（thenable 陷阱），不能原样穿过
				// async 返回值的 thenable 判定；包一层普通对象再交给调用方。
				const chat: NekoChatFacade = {
					view: facade.view,
					submit: (input, context) => facade.submit(input, context),
					abort: (context) => facade.abort(context),
					usage: (context) => facade.usage(context),
					configure: (change, context) => facade.configure(change, context),
				};
				return chat;
			},
			async detach() {
				await sessionBinding?.dispose(BACKGROUND_CONTEXT);
				sessionBinding = undefined;
				await management.detach(BACKGROUND_CONTEXT);
			},
			async close() {
				await sessionBinding?.dispose(BACKGROUND_CONTEXT).catch(() => {});
				await serverBinding.dispose(BACKGROUND_CONTEXT).catch(() => {});
				await client.dispose();
			},
		};
	} catch (error) {
		await client.dispose().catch(() => {});
		throw error;
	}
}

/** attach 响应与 out-of-band attachment 路由的到达顺序不保证，等路由发布到当前会话。 */
function waitForAttachment(client: Client, sessionId: string): Promise<void> {
	if (client.attachment?.sessionId === sessionId) return Promise.resolve();
	return new Promise<void>((resolve, reject) => {
		const timer = setTimeout(() => {
			unsubscribe();
			reject(new Error(`Timed out waiting for attachment to session ${sessionId}`));
		}, 5_000);
		const unsubscribe = client.onAttachmentChange((attachment) => {
			if (attachment?.sessionId === sessionId) {
				clearTimeout(timer);
				unsubscribe();
				resolve();
			}
		});
	});
}
