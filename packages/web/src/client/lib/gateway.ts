import { type Context, createRemoteServiceBinding, type RemoteServiceBinding } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { Client, createClientServiceTransport } from "@earendil-works/pi-client";
import type { ChatView, NekoConversationChange, NekoModelInfo } from "@neko-harness/core";
import {
	type NekoBrowseOptions,
	NekoChat,
	type NekoDirectoryPage,
	type NekoDirectoryState,
	NekoModels,
	NekoSessionDirectory,
	NekoSessionManagement,
	type NekoSessionSummary,
	type NekoWorkspaceState,
	NekoWorkspaces,
} from "./contract.ts";
import { createBrowserWsTransportFactory } from "./transport.ts";

const CONTEXT: Context = BACKGROUND_CONTEXT;
export type ConnPhase = "connecting" | "ready" | "reconnecting";
export type GatewayEvents = {
	onPhase(phase: ConnPhase): void;
	onError(text: string): void;
	onDirectory(state: NekoDirectoryState): void;
	onWorkspaces(state: NekoWorkspaceState): void;
	onWorkspace(path: string): void;
	onOperation(busy: boolean): void;
	onModels(models: readonly NekoModelInfo[]): void;
	onSessionChange(sessionId: string | null): void;
	onView(view: ChatView | null): void;
};
export type GatewayConnectionOptions = {
	readonly url: string;
	readonly serverId: string;
	readonly workspaceRoot: string;
	readonly events: GatewayEvents;
	readonly retryBaseMs?: number;
	readonly retryMaxMs?: number;
};
export function workspaceSessions(sessions: readonly NekoSessionSummary[], path: string): NekoSessionSummary[] {
	return sessions
		.filter((s) => s.workspaceRoot === path)
		.sort((a, b) => b.lastUsedAt - a.lastUsedAt || Number(b.id) - Number(a.id));
}

/** Single attachment, serialized navigation, and generation-guarded snapshots. */
export class GatewayConnection {
	readonly #options: GatewayConnectionOptions;
	#client: Client | undefined;
	#server: RemoteServiceBinding | undefined;
	#session: RemoteServiceBinding | undefined;
	#management: NekoSessionManagement | undefined;
	#workspaces: NekoWorkspaces | undefined;
	#models: NekoModels | undefined;
	#chat: NekoChat | undefined;
	#sessions: readonly NekoSessionSummary[] = [];
	#workspace: string;
	#currentSessionId: string | undefined;
	#unsub: (() => void)[] = [];
	#unsubView: (() => void) | undefined;
	#timer: ReturnType<typeof setTimeout> | undefined;
	#attempt = 0;
	#epoch = 0;
	#viewEpoch = 0;
	#disposed = false;
	#connected = false;
	#operating = false;
	#initialized = false;
	constructor(options: GatewayConnectionOptions) {
		this.#options = options;
		this.#workspace = options.workspaceRoot;
	}
	get currentSessionId() {
		return this.#currentSessionId;
	}
	get workspaceRoot() {
		return this.#workspace;
	}
	get ready() {
		return this.#connected && !this.#operating && this.#chat !== undefined;
	}
	get managementReady() {
		return this.#connected && !this.#operating;
	}
	async start(): Promise<void> {
		this.#options.events.onPhase("connecting");
		this.#options.events.onWorkspace(this.#workspace);
		try {
			await this.#connect();
		} catch (error) {
			this.#error(error);
			this.#scheduleReconnect();
		}
	}
	#error(error: unknown) {
		this.#options.events.onError(error instanceof Error ? error.message : String(error));
	}
	#assert(epoch: number) {
		if (this.#disposed || epoch !== this.#epoch) throw new Error("连接已变化，请重试");
	}
	async #operate(operation: (epoch: number) => Promise<void>): Promise<void> {
		if (!this.managementReady) throw new Error("操作进行中或网关未连接，请稍后重试");
		this.#operating = true;
		this.#options.events.onOperation(true);
		const epoch = this.#epoch;
		try {
			await operation(epoch);
		} finally {
			this.#operating = false;
			this.#options.events.onOperation(false);
			if (epoch === this.#epoch) this.#reconcile();
		}
	}
	async selectWorkspace(path: string): Promise<void> {
		await this.#operate(async (epoch) => {
			if (!this.#workspaces?.state.value?.workspaces.some((w) => w.path === path)) throw new Error("工作区不存在");
			await this.#select(path, undefined, epoch);
		});
	}
	async addWorkspace(path: string): Promise<void> {
		await this.#operate(async (epoch) => {
			const item = await this.#workspaces!.add({ path }, CONTEXT);
			this.#assert(epoch);
			await this.#select(item.path, undefined, epoch);
		});
	}
	async browse(options: NekoBrowseOptions): Promise<NekoDirectoryPage> {
		if (!this.#connected || !this.#workspaces) throw new Error("网关未连接");
		return this.#workspaces.browse(options, CONTEXT);
	}
	async attachTo(id: string): Promise<void> {
		await this.#operate(async (epoch) => {
			const entry = this.#sessions.find((s) => s.id === id && s.workspaceRoot === this.#workspace);
			if (!entry) throw new Error("会话不属于当前工作区或已归档");
			await this.#attach(id, epoch);
		});
	}
	async createSession(): Promise<void> {
		await this.#operate(async (epoch) => {
			const created = await this.#management!.create({ cwd: this.#workspace }, CONTEXT);
			this.#assert(epoch);
			await this.#attach(created.id, epoch);
		});
	}
	async archiveSession(id: string): Promise<void> {
		await this.#operate(async (epoch) => {
			await this.#management!.archive(id, CONTEXT);
			this.#assert(epoch);
			this.#sessions = this.#sessions.filter((s) => s.id !== id);
			if (this.#currentSessionId === id) await this.#select(this.#workspace, undefined, epoch);
		});
	}
	async #select(path: string, preferred: string | undefined, epoch: number): Promise<void> {
		const sessions = workspaceSessions(this.#sessions, path);
		const target = sessions.find((s) => s.id === preferred) ?? sessions[0];
		try {
			if (target) await this.#attach(target.id, epoch);
			else await this.#clear(epoch);
			this.#assert(epoch);
			this.#workspace = path;
			this.#options.events.onWorkspace(path);
		} catch (error) {
			// A failed attach cannot leave an old chat eligible for submissions.
			if (epoch === this.#epoch) {
				this.#dropView();
				this.#currentSessionId = undefined;
				this.#options.events.onSessionChange(null);
			}
			throw error;
		}
	}
	async #attach(id: string, epoch: number): Promise<void> {
		if (this.#currentSessionId === id && this.#chat) return;
		const client = this.#client!;
		this.#dropView();
		const generation = this.#viewEpoch;
		this.#currentSessionId = undefined;
		this.#options.events.onSessionChange(null);
		const previousActivity = this.#sessions.find((s) => s.id === id)?.lastUsedAt ?? -1;
		const changesAttachment = client.attachment?.sessionId !== id;
		await this.#management!.attach(id, CONTEXT);
		this.#assert(epoch);
		await waitForAttachment(client, id);
		if (changesAttachment) {
			const started = Date.now();
			while ((this.#sessions.find((s) => s.id === id)?.lastUsedAt ?? -1) <= previousActivity) {
				if (Date.now() - started > 5000) throw new Error("等待会话目录更新超时");
				await new Promise((r) => setTimeout(r, 5));
				this.#assert(epoch);
			}
		}
		this.#assert(epoch);
		const binding = createRemoteServiceBinding({
			services: [NekoChat],
			transport: createClientServiceTransport(client, () => client.attachment),
		});
		this.#session = binding;
		await binding.ready(CONTEXT);
		this.#assert(epoch);
		const chat = binding.use(NekoChat);
		this.#chat = chat;
		this.#currentSessionId = id;
		this.#options.events.onSessionChange(id);
		const publish = (view: ChatView) => {
			if (epoch === this.#epoch && generation === this.#viewEpoch) this.#options.events.onView(view);
		};
		if (chat.view.value) publish(chat.view.value);
		this.#unsubView = chat.view.subscribe(publish);
	}
	async #clear(epoch: number): Promise<void> {
		this.#dropView();
		this.#currentSessionId = undefined;
		this.#options.events.onSessionChange(null);
		await this.#management!.detach(CONTEXT);
		this.#assert(epoch);
	}
	#reconcile(): void {
		if (!this.managementReady || !this.#currentSessionId || this.#sessions.some((s) => s.id === this.#currentSessionId))
			return;
		void this.#operate((epoch) => this.#select(this.#workspace, undefined, epoch)).catch((e) => this.#error(e));
	}
	async configure(change: NekoConversationChange): Promise<void> {
		if (!this.ready) throw new Error("会话未就绪");
		await this.#chat!.configure(change, CONTEXT);
	}
	submit(content: string): void {
		if (!this.ready) return;
		void this.#chat!.submit({ content }, CONTEXT).catch((e: unknown) => this.#error(e));
	}
	abort(): void {
		if (this.ready) void this.#chat!.abort(CONTEXT).catch((e: unknown) => this.#error(e));
	}
	async listModels(): Promise<readonly NekoModelInfo[]> {
		return this.#models?.list(CONTEXT) ?? [];
	}
	async #connect(): Promise<void> {
		const epoch = ++this.#epoch;
		const client = await Client.connect({
			serverId: this.#options.serverId,
			transportFactory: createBrowserWsTransportFactory(this.#options.url),
			onListenerError: (e) => this.#error(e),
		});
		if (this.#disposed || epoch !== this.#epoch) {
			await client.dispose();
			return;
		}
		this.#client = client;
		client.onConnectionStateChange((change) => {
			if (change.state === "disconnected" && client === this.#client) this.#scheduleReconnect();
		});
		const binding = createRemoteServiceBinding({
			services: [NekoSessionDirectory, NekoSessionManagement, NekoModels, NekoWorkspaces],
			transport: createClientServiceTransport(client, () => ({ serverId: this.#options.serverId })),
		});
		this.#server = binding;
		await binding.ready(CONTEXT);
		this.#assert(epoch);
		this.#management = binding.use(NekoSessionManagement);
		this.#workspaces = binding.use(NekoWorkspaces);
		this.#models = binding.use(NekoModels);
		const directory = binding.use(NekoSessionDirectory);
		const publish = (value: NekoDirectoryState) => {
			if (epoch !== this.#epoch) return;
			this.#sessions = value.sessions;
			this.#options.events.onDirectory(value);
			this.#reconcile();
		};
		this.#unsub.push(directory.state.subscribe(publish));
		this.#unsub.push(
			this.#workspaces.state.subscribe((value) => {
				if (epoch === this.#epoch) this.#options.events.onWorkspaces(value);
			}),
		);
		if (!this.#initialized) {
			await this.#workspaces.add({ path: this.#workspace }, CONTEXT);
			this.#assert(epoch);
			this.#initialized = true;
		}
		const started = Date.now();
		while (!directory.state.value || !this.#workspaces.state.value) {
			if (Date.now() - started > 5000) throw new Error("等待工作区目录超时");
			await new Promise((r) => setTimeout(r, 10));
			this.#assert(epoch);
		}
		publish(directory.state.value);
		this.#options.events.onWorkspaces(this.#workspaces.state.value);
		await this.#select(this.#workspace, this.#currentSessionId, epoch);
		this.#assert(epoch);
		this.#connected = true;
		this.#attempt = 0;
		this.#options.events.onPhase("ready");
		void this.#models
			.list(CONTEXT)
			.then((models) => {
				if (epoch === this.#epoch) this.#options.events.onModels(models);
			})
			.catch(() => {});
	}
	#scheduleReconnect(): void {
		if (this.#disposed || this.#timer) return;
		++this.#epoch;
		this.#connected = false;
		this.#dropView();
		this.#options.events.onPhase("reconnecting");
		const delay = Math.min((this.#options.retryBaseMs ?? 800) * ++this.#attempt, this.#options.retryMaxMs ?? 8000);
		this.#timer = setTimeout(() => {
			this.#timer = undefined;
			void this.#teardown()
				.then(() => {
					if (!this.#disposed) return this.#connect();
				})
				.catch((e) => {
					this.#error(e);
					this.#scheduleReconnect();
				});
		}, delay);
	}
	#dropView(): void {
		++this.#viewEpoch;
		this.#unsubView?.();
		this.#unsubView = undefined;
		this.#chat = undefined;
		void this.#session?.dispose(CONTEXT).catch(() => {});
		this.#session = undefined;
		this.#options.events.onView(null);
	}
	async #teardown(): Promise<void> {
		for (const unsubscribe of this.#unsub.splice(0)) unsubscribe();
		this.#dropView();
		this.#management = undefined;
		this.#workspaces = undefined;
		this.#models = undefined;
		await this.#server?.dispose(CONTEXT).catch(() => {});
		this.#server = undefined;
		const client = this.#client;
		this.#client = undefined;
		await client?.dispose().catch(() => {});
	}
	dispose(): void {
		this.#disposed = true;
		++this.#epoch;
		this.#connected = false;
		clearTimeout(this.#timer);
		void this.#teardown();
	}
}
function waitForAttachment(client: Client, id: string): Promise<void> {
	if (client.attachment?.sessionId === id) return Promise.resolve();
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			unsubscribe();
			reject(new Error("等待会话连接超时"));
		}, 5000);
		const unsubscribe = client.onAttachmentChange((a) => {
			if (a?.sessionId === id) {
				clearTimeout(timer);
				unsubscribe();
				resolve();
			}
		});
	});
}
export type { NekoDirectoryState, NekoSessionSummary };
