import { type Context, createRemoteServiceBinding, type RemoteServiceBinding } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { Client, createClientServiceTransport } from "@earendil-works/pi-client";
import type { ChatView, NekoConversationChange, NekoModelInfo } from "@neko-harness/core";
import {
	NekoChat,
	type NekoChat as NekoChatFacade,
	type NekoDirectoryState,
	NekoModels,
	type NekoModels as NekoModelsFacade,
	NekoSessionDirectory,
	NekoSessionManagement,
	type NekoSessionManagement as NekoSessionManagementFacade,
	type NekoSessionSummary,
} from "./contract.ts";
import { createBrowserWsTransportFactory } from "./transport.ts";

/**
 * 浏览器侧 neko 网关连接：pi-client 直连 gateway WebSocket（pi 协议帧，design D3）。
 *
 * 生命周期：start() → Client.connect（serverId 握手校验）→ 服务器级服务绑定
 * （session-directory 订阅 + session-management）→ attach 会话（默认目录第一个）
 * → 会话级 NekoChat.view 订阅（快照即最新投影，不重放历史，D4）。
 *
 * 断线：连接状态变 disconnected 即指数退避重连（800ms→8s），重建 Client、
 * 重新订阅目录、重新 attach 当前会话取最新快照。
 */

const CONTEXT: Context = BACKGROUND_CONTEXT;

export type ConnPhase = "connecting" | "ready" | "reconnecting";

export type GatewayEvents = {
	onPhase(phase: ConnPhase): void;
	/** 连接/服务级错误提示（已格式化）。 */
	onError(text: string): void;
	onDirectory(state: NekoDirectoryState): void;
	onModels(models: readonly NekoModelInfo[]): void;
	onSessionChange(sessionId: string | null): void;
	onView(view: ChatView | null): void;
};

export type GatewayConnectionOptions = {
	readonly url: string;
	readonly serverId: string;
	readonly events: GatewayEvents;
	/** 重连退避基数毫秒；默认 800。 */
	readonly retryBaseMs?: number;
	readonly retryMaxMs?: number;
};

export class GatewayConnection {
	readonly #url: string;
	readonly #serverId: string;
	readonly #events: GatewayEvents;
	readonly #retryBaseMs: number;
	readonly #retryMaxMs: number;

	#client: Client | undefined;
	#serverBinding: RemoteServiceBinding | undefined;
	#sessionBinding: RemoteServiceBinding | undefined;
	#management: NekoSessionManagementFacade | undefined;
	#models: NekoModelsFacade | undefined;
	#chat: NekoChatFacade | undefined;
	#currentSessionId: string | undefined;
	#unsubDirectory: (() => void) | undefined;
	#unsubView: (() => void) | undefined;
	#reconnectTimer: ReturnType<typeof setTimeout> | undefined;
	#attempt = 0;
	#disposed = false;

	constructor(options: GatewayConnectionOptions) {
		this.#url = options.url;
		this.#serverId = options.serverId;
		this.#events = options.events;
		this.#retryBaseMs = options.retryBaseMs ?? 800;
		this.#retryMaxMs = options.retryMaxMs ?? 8000;
	}

	/** 开始连接；失败按退避自动重试。返回首个就绪的 promise（可忽略）。 */
	async start(): Promise<void> {
		this.#events.onPhase("connecting");
		try {
			await this.#connect();
		} catch {
			this.#scheduleReconnect();
		}
	}

	get currentSessionId(): string | undefined {
		return this.#currentSessionId;
	}

	get ready(): boolean {
		return this.#chat !== undefined;
	}

	/** attach（幂等）到会话；切换时旧订阅先释放。 */
	async attachTo(sessionId: string): Promise<void> {
		if (this.#currentSessionId === sessionId && this.#chat !== undefined && this.#unsubView !== undefined) return;
		const management = this.#management;
		const client = this.#client;
		if (management === undefined || client === undefined) throw new Error("网关连接未就绪");
		this.#events.onSessionChange(sessionId);
		this.#events.onView(null);
		this.#teardownSession();
		await management.attach(sessionId, CONTEXT);
		await waitForAttachment(client, sessionId);
		const sessionTransport = createClientServiceTransport(client, () => client.attachment);
		this.#sessionBinding = createRemoteServiceBinding({ services: [NekoChat], transport: sessionTransport });
		const facade = this.#sessionBinding.use(NekoChat);
		await this.#sessionBinding.ready(CONTEXT);
		// Chord 服务门面是拦截任意属性的 Proxy（thenable 陷阱），包一层普通对象再持有。
		this.#chat = {
			view: facade.view,
			submit: (input, context) => facade.submit(input, context),
			abort: (context) => facade.abort(context),
			usage: (context) => facade.usage(context),
			configure: (change, context) => facade.configure(change, context),
		};
		this.#currentSessionId = sessionId;
		const initial = this.#chat.view.value;
		if (initial !== undefined) this.#events.onView(initial);
		this.#unsubView = this.#chat.view.subscribe((value) => {
			this.#events.onView(value);
		});
	}

	/** 脱离当前会话（归档最后一个会话后调用）。 */
	async clearSession(): Promise<void> {
		this.#teardownSession();
		this.#currentSessionId = undefined;
		this.#events.onSessionChange(null);
		this.#events.onView(null);
		await this.#management?.detach(CONTEXT).catch(() => {});
	}

	async createSession(): Promise<void> {
		const management = this.#management;
		if (management === undefined) throw new Error("网关连接未就绪");
		const created = await management.create({}, CONTEXT);
		await this.attachTo(created.id);
	}

	async archiveSession(sessionId: string): Promise<void> {
		const management = this.#management;
		if (management === undefined) throw new Error("网关连接未就绪");
		await management.archive(sessionId, CONTEXT);
	}

	/** 模型目录（neko.models.list 全局快照）。 */
	async listModels(): Promise<readonly NekoModelInfo[]> {
		const models = this.#models;
		if (models === undefined) throw new Error("网关连接未就绪");
		return models.list(CONTEXT);
	}

	/** 会话级切换模型；从下一次请求起生效，投影 agent.model 随即更新。 */
	async configure(change: NekoConversationChange): Promise<void> {
		const chat = this.#chat;
		if (chat === undefined) throw new Error("会话未就绪");
		await chat.configure(change, CONTEXT);
	}

	submit(content: string): void {
		this.#chat?.submit({ content }, CONTEXT).catch((error: unknown) => {
			this.#events.onError(error instanceof Error ? error.message : String(error));
		});
	}

	abort(): void {
		this.#chat?.abort(CONTEXT).catch((error: unknown) => {
			this.#events.onError(error instanceof Error ? error.message : String(error));
		});
	}

	dispose(): void {
		this.#disposed = true;
		if (this.#reconnectTimer !== undefined) clearTimeout(this.#reconnectTimer);
		this.#reconnectTimer = undefined;
		void this.#teardown();
	}

	async #connect(): Promise<void> {
		const client = await Client.connect({
			serverId: this.#serverId,
			transportFactory: createBrowserWsTransportFactory(this.#url),
			onListenerError: (error) => this.#events.onError(error.message),
		});
		if (this.#disposed) {
			await client.dispose().catch(() => {});
			return;
		}
		this.#client = client;
		client.onConnectionStateChange((change) => {
			if (change.state !== "disconnected") return;
			if (this.#client !== client || this.#disposed) return;
			this.#events.onError(change.error?.message ?? "网关连接已断开");
			this.#scheduleReconnect();
		});
		const serverTransport = createClientServiceTransport(client, () => ({ serverId: this.#serverId }));
		this.#serverBinding = createRemoteServiceBinding({
			services: [NekoSessionDirectory, NekoSessionManagement, NekoModels],
			transport: serverTransport,
		});
		const directory = this.#serverBinding.use(NekoSessionDirectory);
		const management = this.#serverBinding.use(NekoSessionManagement);
		const models = this.#serverBinding.use(NekoModels);
		await this.#serverBinding.ready(CONTEXT);
		this.#management = management;
		this.#models = models;
		models
			.list(CONTEXT)
			.then((list) => this.#events.onModels(list))
			.catch(() => {
				// 模型目录拉取失败不阻塞连接；选择器退化为只读标签。
			});
		const initialDirectory = directory.state.value;
		if (initialDirectory !== undefined) this.#events.onDirectory(initialDirectory);
		this.#unsubDirectory = directory.state.subscribe((value) => {
			this.#events.onDirectory(value);
		});
		// attach 当前会话（重连）或目录第一个会话（首连）；会话可能刚被其他前端归档，失败则回退目录首项。
		const target = this.#currentSessionId ?? initialDirectory?.sessions[0]?.id;
		if (target !== undefined) {
			try {
				await this.attachTo(target);
			} catch (error) {
				const fallback = initialDirectory?.sessions[0]?.id;
				if (fallback === undefined || fallback === target) throw error;
				this.#events.onError(error instanceof Error ? error.message : String(error));
				await this.attachTo(fallback);
			}
		}
		this.#attempt = 0;
		this.#events.onPhase("ready");
	}

	#scheduleReconnect(): void {
		if (this.#disposed || this.#reconnectTimer !== undefined) return;
		this.#attempt += 1;
		const delay = Math.min(this.#retryBaseMs * this.#attempt, this.#retryMaxMs);
		this.#events.onPhase("reconnecting");
		this.#reconnectTimer = setTimeout(() => {
			this.#reconnectTimer = undefined;
			void this.#teardown().then(() => {
				if (this.#disposed) return;
				this.#connect().catch(() => {
					this.#scheduleReconnect();
				});
			});
		}, delay);
	}

	#teardownSession(): void {
		this.#unsubView?.();
		this.#unsubView = undefined;
		this.#chat = undefined;
		void this.#sessionBinding?.dispose(CONTEXT).catch(() => {});
		this.#sessionBinding = undefined;
	}

	async #teardown(): Promise<void> {
		this.#unsubDirectory?.();
		this.#unsubDirectory = undefined;
		this.#teardownSession();
		this.#management = undefined;
		this.#models = undefined;
		const binding = this.#serverBinding;
		this.#serverBinding = undefined;
		await binding?.dispose(CONTEXT).catch(() => {});
		const client = this.#client;
		this.#client = undefined;
		await client?.dispose().catch(() => {});
	}
}

/** attach 响应与 out-of-band attachment 路由的到达顺序不保证，等路由发布到目标会话。 */
function waitForAttachment(client: Client, sessionId: string): Promise<void> {
	if (client.attachment?.sessionId === sessionId) return Promise.resolve();
	return new Promise<void>((resolve, reject) => {
		const timer = setTimeout(() => {
			unsubscribe();
			reject(new Error(`等待会话 ${sessionId} 的 attachment 路由超时`));
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

export type { NekoDirectoryState, NekoSessionSummary };
