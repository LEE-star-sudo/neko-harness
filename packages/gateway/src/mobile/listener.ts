import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer, type Server as HttpsServer } from "node:https";
import type { Socket } from "node:net";
import { hostname, type NetworkInterfaceInfo, networkInterfaces } from "node:os";
import { createHost, type Link, memoryLinkPair } from "@earendil-works/chord";
import { type WebSocket, WebSocketServer } from "ws";
import { NekoChat, NekoSessionDirectory, NekoSessionManagement, NekoSubagent, NekoWorkspaces } from "../contract.ts";
import { identifiedLink } from "../link.ts";
import { MobileAdapter, type MobileRuntimeBridge, type MobileServices } from "./adapter.ts";
import { MobileAuth } from "./auth.ts";
import { MobileCertificate } from "./certificate.ts";
import { MobilePairing, type MobilePairingResult, PAIRING_BODY_LIMIT_BYTES, pairingBodyTooLarge } from "./pairing.ts";
import { MOBILE_CLOSE_REVOKED, MOBILE_LIMITS } from "./protocol.ts";
import { type MobileDeviceRecord, MobileStore } from "./store.ts";

export type MobileListenerState =
	| { readonly status: "disabled" }
	| { readonly status: "starting" }
	| { readonly status: "listening"; readonly address: string; readonly port: number }
	| { readonly status: "error"; readonly error: string }
	| { readonly status: "stopping" };

export type MobileChordBridge = {
	accept(link: Link, options: { readonly principal: unknown; readonly kind: "client" }): void;
	invalidatePrincipal(match: ((principal: unknown) => boolean) | Readonly<Record<string, unknown>>): Promise<void>;
};

export type MobileGatewayOptions = {
	readonly nekoDir: string;
	readonly serverId: string;
	readonly serverName?: string;
	readonly onError?: (error: Error) => void;
	readonly chord: MobileChordBridge;
	/** 受理状态与审批列表的只读查询（design D6）；缺省时这些查询返回空/unknown。 */
	readonly runtime?: MobileRuntimeBridge;
};

function defaultServerName(): string {
	const name = hostname().trim();
	return (name === "" ? "neko-computer" : name).slice(0, 64);
}

/** 常见虚拟接口名前缀（macOS/Linux 短名，如 utun0、bridge100、veth1a2b3c）。 */
const VIRTUAL_INTERFACE_PREFIXES = [
	"anpi",
	"awdl",
	"bridge",
	"docker",
	"gif",
	"ipsec",
	"llw",
	"ppp",
	"stf",
	"tap",
	"tun",
	"utun",
	"vboxnet",
	"veth",
	"virbr",
	"vmnet",
] as const;

/** Windows 接口名是描述性字符串（如 "vEthernet (WSL)"），按关键词排除。 */
const VIRTUAL_INTERFACE_KEYWORDS = ["hyper-v", "virtual", "virtualbox", "vmware", "vpn"] as const;

function isVirtualInterfaceName(name: string): boolean {
	const lower = name.toLowerCase();
	if (VIRTUAL_INTERFACE_PREFIXES.some((prefix) => lower.startsWith(prefix))) return true;
	return VIRTUAL_INTERFACE_KEYWORDS.some((keyword) => lower.includes(keyword));
}

/** RFC 2544 基准测试段（198.18.0.0/15）：代理工具 fake-ip 常用，手机无法直连。 */
function isBenchmarkAddress(address: string): boolean {
	return address.startsWith("198.18.") || address.startsWith("198.19.");
}

function collectListenCandidates(interfaces: NodeJS.Dict<NetworkInterfaceInfo[]>, skipVirtual: boolean): string[] {
	const candidates: string[] = [];
	for (const [name, infos] of Object.entries(interfaces)) {
		if (infos === undefined) continue;
		if (skipVirtual && isVirtualInterfaceName(name)) continue;
		for (const info of infos) {
			if (info.family !== "IPv4" || info.internal) continue;
			if (info.address.startsWith("169.254.")) continue;
			if (skipVirtual && isBenchmarkAddress(info.address)) continue;
			candidates.push(info.address);
		}
	}
	return candidates.sort();
}

/**
 * 可供手机直连的 IPv4 候选：过滤虚拟接口与 RFC 2544 段；过滤后为空（例如只剩 VPN）
 * 时回退到未过滤列表，保证始终有地址可选。
 */
export function mobileListenCandidates(interfaces?: NodeJS.Dict<NetworkInterfaceInfo[]>): string[] {
	const source = interfaces ?? networkInterfaces();
	const filtered = collectListenCandidates(source, true);
	return filtered.length > 0 ? filtered : collectListenCandidates(source, false);
}

/** 把上次连接成功的地址排到候选最前；不在当前候选中（网络已变化）时不虚构。 */
export function prioritizeListenCandidate(
	candidates: readonly string[],
	lastConnectedAddress: string | null,
): string[] {
	if (lastConnectedAddress === null || !candidates.includes(lastConnectedAddress)) return [...candidates];
	return [lastConnectedAddress, ...candidates.filter((candidate) => candidate !== lastConnectedAddress)];
}

function isIpv4Literal(address: string): boolean {
	const parts = address.split(".");
	return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

function assertListenAddress(address: string): string {
	if (!isIpv4Literal(address)) throw new Error(`mobile listen address must be an IPv4 literal, got "${address}"`);
	if (address === "0.0.0.0") throw new Error("mobile listen address must not be 0.0.0.0");
	return address;
}

function toError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

function isMobilePrincipal(principal: unknown): boolean {
	return (
		typeof principal === "object" && principal !== null && (principal as Record<string, unknown>).kind === "mobile"
	);
}

export type MobileAdminDevice = Pick<MobileDeviceRecord, "deviceId" | "name" | "pairedAt" | "lastSeenAt"> & {
	readonly online: boolean;
};

export type MobileAdminState = {
	readonly state: MobileListenerState;
	candidates: string[];
	readonly port: number;
	readonly certificate: { readonly fingerprint: string; readonly expiresAt: number } | null;
	devices: MobileAdminDevice[];
	/** 手机最近一次成功接入的 listener 本地地址；从未接入为 null。 */
	readonly lastConnectedAddress: string | null;
};

function toMessage(error: unknown): string {
	if (error instanceof Error) {
		const code = (error as { code?: unknown }).code;
		return typeof code === "string" && code !== "" ? `${code}: ${error.message}` : error.message;
	}
	return String(error);
}

export class MobileGateway {
	private readonly serverId: string;
	private readonly serverName: string;
	private readonly onError: ((error: Error) => void) | undefined;
	private readonly chord: MobileChordBridge;
	private runtime: MobileRuntimeBridge | undefined;
	private readonly storeHandle: MobileStore | undefined;
	private readonly storeFailure: string | undefined;
	private certificate: MobileCertificate | undefined;
	private pairingValue: MobilePairing | undefined;
	private authValue: MobileAuth | undefined;
	private server: HttpsServer | undefined;
	private wss: WebSocketServer | undefined;
	private readonly sockets = new Set<Socket>();
	private readonly connections = new Map<string, MobileAdapter>();
	private stateValue: MobileListenerState;
	private queue: Promise<unknown> = Promise.resolve();
	private closing: Promise<void> | undefined;

	private constructor(
		serverId: string,
		serverName: string,
		onError: ((error: Error) => void) | undefined,
		chord: MobileChordBridge,
		store: MobileStore | undefined,
		storeFailure: string | undefined,
		initial: MobileListenerState,
	) {
		this.serverId = serverId;
		this.serverName = serverName;
		this.onError = onError;
		this.chord = chord;
		this.storeHandle = store;
		this.storeFailure = storeFailure;
		this.stateValue = initial;
	}

	static async create(options: MobileGatewayOptions): Promise<MobileGateway> {
		let store: MobileStore | undefined;
		let storeFailure: string | undefined;
		try {
			store = await MobileStore.open(options.nekoDir);
		} catch (error) {
			storeFailure = toMessage(error);
		}
		const gateway = new MobileGateway(
			options.serverId,
			options.serverName ?? defaultServerName(),
			options.onError,
			options.chord,
			store,
			storeFailure,
			storeFailure === undefined
				? { status: "disabled" }
				: { status: "error", error: `mobile store unavailable: ${storeFailure}` },
		);
		gateway.runtime = options.runtime;
		if (store !== undefined) {
			const config = store.getState();
			if (config.enabled) {
				if (config.address === null) {
					gateway.stateValue = { status: "error", error: "mobile listener is enabled without a configured address" };
				} else {
					try {
						await gateway.startListening(config.address, config.port);
					} catch {
						// startListening 已置 error 状态；持久配置保持 enabled，重启后按配置重试。
					}
				}
			}
		}
		return gateway;
	}

	get state(): MobileListenerState {
		return this.stateValue;
	}

	get store(): MobileStore | undefined {
		return this.storeHandle;
	}

	enable(input: { address: string; port?: number }): Promise<MobileListenerState> {
		return this.enqueue(async () => {
			if (this.closing !== undefined) throw new Error("mobile gateway is closed");
			const address = assertListenAddress(input.address);
			const store = this.requireStore();
			const port = input.port ?? store.getState().port;
			await store.updateConfig({ enabled: true, address, port });
			await this.startListening(address, port);
			return this.stateValue;
		});
	}

	disable(): Promise<MobileListenerState> {
		return this.enqueue(async () => {
			if (this.closing !== undefined) throw new Error("mobile gateway is closed");
			const store = this.requireStore();
			await store.updateConfig({ enabled: false });
			this.pairingValue?.invalidate();
			await this.stopListening();
			this.stateValue = { status: "disabled" };
			return this.stateValue;
		});
	}

	close(): Promise<void> {
		if (this.closing === undefined) {
			this.closing = this.enqueue(async () => {
				this.stateValue = { status: "stopping" };
				this.pairingValue?.invalidate();
				this.notificationCleanup?.();
				this.notificationCleanup = undefined;
				await this.stopListening().catch((error: unknown) => this.onError?.(toError(error)));
				this.stateValue = { status: "disabled" };
			});
		}
		return this.closing;
	}

	createPairing(): { readonly pairingText: string; readonly expiresAt: number } {
		return this.pairing().createPairing();
	}

	cancelPairing(): void {
		this.pairingValue?.invalidate();
	}

	deviceOnline(deviceId: string): boolean {
		for (const connection of this.connections.values()) {
			if (connection.deviceId === deviceId) return true;
		}
		return false;
	}

	adminState(): MobileAdminState {
		const store = this.requireStore();
		const config = store.getState();
		return {
			state: this.stateValue,
			candidates: prioritizeListenCandidate(mobileListenCandidates(), config.lastConnectedAddress),
			port: config.port,
			certificate:
				this.certificate === undefined
					? null
					: { fingerprint: this.certificate.fingerprint, expiresAt: this.certificate.expiresAt },
			devices: config.devices.map((device) => ({
				deviceId: device.deviceId,
				name: device.name,
				pairedAt: device.pairedAt,
				lastSeenAt: device.lastSeenAt,
				online: this.deviceOnline(device.deviceId),
			})),
			lastConnectedAddress: config.lastConnectedAddress,
		};
	}

	async regenerateCertificate(): Promise<{ readonly fingerprint: string; readonly expiresAt: number }> {
		const store = this.requireStore();
		const certificate = this.certificate ?? (await MobileCertificate.load(store, this.serverId));
		// 证书与授权写入先完成；任何一步失败都向调用方报错，不动现有连接。
		const material = await certificate.regenerate();
		await store.clearMobileAuthorizations();
		this.certificate = certificate;
		this.pairingValue?.invalidate();
		await this.chord.invalidatePrincipal(isMobilePrincipal);
		for (const connection of [...this.connections.values()]) connection.close(MOBILE_CLOSE_REVOKED, "revoked");
		const current = this.stateValue;
		if (current.status === "listening") {
			await this.enqueue(async () => {
				await this.startListening(current.address, current.port, true);
			});
		}
		return { fingerprint: material.fingerprint, expiresAt: material.expiresAt };
	}

	private pairing(): MobilePairing {
		if (this.pairingValue === undefined) {
			this.pairingValue = new MobilePairing({
				serverId: this.serverId,
				serverName: this.serverName,
				store: this.storeHandle,
				certificate: () => this.certificate,
				isListening: () => {
					const state = this.stateValue;
					return state.status === "listening" ? { address: state.address, port: state.port } : undefined;
				},
				onPaired: (device) => this.handleDevicePaired(device),
			});
		}
		return this.pairingValue;
	}

	private auth(): MobileAuth {
		if (this.authValue === undefined) {
			this.authValue = new MobileAuth({ store: this.storeHandle });
		}
		return this.authValue;
	}

	private handleDevicePaired(device: MobileDeviceRecord): void {
		this.invalidateConnections(device.deviceId, device.grantRevision).catch((error: unknown) =>
			this.onError?.(toError(error)),
		);
	}

	/** 撤销设备（design D7）：先持久删除，再释放 chord 记录并关闭该设备的移动 WS（4401）。 */
	async revoke(deviceId: string): Promise<boolean> {
		const store = this.requireStore();
		const existing = store.getState().devices.some((device) => device.deviceId === deviceId);
		if (!existing) return false;
		await store.removeDevice(deviceId);
		await this.invalidateConnections(deviceId);
		return true;
	}

	private async invalidateConnections(deviceId: string, exceptGrantRevision?: number): Promise<void> {
		const match = (principal: unknown): boolean => {
			if (typeof principal !== "object" || principal === null) return false;
			const record = principal as Record<string, unknown>;
			return (
				record.kind === "mobile" &&
				record.deviceId === deviceId &&
				(exceptGrantRevision === undefined || record.grantRevision !== exceptGrantRevision)
			);
		};
		await this.chord.invalidatePrincipal(match);
		for (const connection of [...this.connections.values()]) {
			if (
				connection.deviceId === deviceId &&
				(exceptGrantRevision === undefined || connection.grantRevision !== exceptGrantRevision)
			) {
				connection.close(MOBILE_CLOSE_REVOKED, "revoked");
			}
		}
	}

	private attachConnection(
		socket: WebSocket,
		auth: { deviceId: string; grantRevision: number; remoteAddress: string },
		localAddress: string | undefined,
	): void {
		const connectionId = randomUUID();
		const [serverEnd, clientEnd] = memoryLinkPair();
		this.chord.accept(serverEnd, {
			principal: { connectionId, kind: "mobile", deviceId: auth.deviceId, grantRevision: auth.grantRevision },
			kind: "client",
		});
		const store = this.storeHandle;
		if (store?.getState().devices.some((device) => device.deviceId === auth.deviceId)) {
			void store.touchDevice(auth.deviceId, Date.now()).catch((error: unknown) => this.onError?.(toError(error)));
		}
		// 学习有效地址：手机经此入口接入即证明该本地地址可达，排序到候选最前（重复值不落盘）。
		if (store !== undefined && typeof localAddress === "string" && isIpv4Literal(localAddress)) {
			if (store.getState().lastConnectedAddress !== localAddress) {
				void store.rememberConnectedAddress(localAddress).catch((error: unknown) => this.onError?.(toError(error)));
			}
		}
		const clientHost = createHost({
			kind: "client",
			upstream: identifiedLink(clientEnd, this.serverId),
			onError: () => {},
		});
		let servicesValue: MobileServices | undefined;
		const adapter = new MobileAdapter({
			socket,
			connectionId,
			deviceId: auth.deviceId,
			grantRevision: auth.grantRevision,
			serverId: this.serverId,
			serverName: this.serverName,
			services: () => {
				if (servicesValue === undefined) {
					servicesValue = {
						directory: clientHost.get(NekoSessionDirectory, {} as never, { at: this.serverId }),
						management: clientHost.get(NekoSessionManagement, {} as never, { at: this.serverId }),
						workspaces: clientHost.get(NekoWorkspaces, {} as never, { at: this.serverId }),
						openChat: (attachment) => clientHost.get(NekoChat, attachment, { at: this.serverId }),
						openSubagent: (input) => clientHost.get(NekoSubagent, input, { at: this.serverId }),
					};
				}
				return servicesValue;
			},
			...(this.runtime === undefined ? {} : { runtime: this.runtime }),
			authorized: () =>
				store
					?.getState()
					.devices.some((device) => device.deviceId === auth.deviceId && device.grantRevision === auth.grantRevision) ??
				false,
			onClose: () => {
				this.connections.delete(connectionId);
				void clientHost.close().catch(() => undefined);
			},
			onError: this.onError,
		});
		this.connections.set(connectionId, adapter);
		this.ensureNotifications();
		adapter.start();
	}

	private notificationCleanup: (() => void) | undefined;

	/** 共享一份桌面状态订阅（初始快照不广播），把变更通知发给全部已连接手机。 */
	private ensureNotifications(): void {
		if (this.notificationCleanup !== undefined) return;
		const [serverEnd, clientEnd] = memoryLinkPair();
		this.chord.accept(serverEnd, { principal: { connectionId: "mobile-notification-hub" }, kind: "client" });
		const host = createHost({ kind: "client", upstream: identifiedLink(clientEnd, this.serverId), onError: () => {} });
		const directory = host.get(NekoSessionDirectory, {} as never, { at: this.serverId });
		const workspaces = host.get(NekoWorkspaces, {} as never, { at: this.serverId });
		const last = { directory: -1, workspaces: -1 };
		const unsubscribe = [
			directory.state.subscribe(() => {
				const value = directory.state.value;
				if (value === undefined || value.revision === last.directory) return;
				const priming = last.directory === -1;
				last.directory = value.revision;
				if (!priming) this.broadcastNotification("sessions.changed", { revision: value.revision });
			}),
			workspaces.state.subscribe(() => {
				const value = workspaces.state.value;
				if (value === undefined || value.revision === last.workspaces) return;
				const priming = last.workspaces === -1;
				last.workspaces = value.revision;
				if (!priming) this.broadcastNotification("workspaces.changed", { revision: value.revision });
			}),
		];
		this.notificationCleanup = () => {
			for (const off of unsubscribe) off();
			void host.close().catch(() => undefined);
		};
	}

	private broadcastNotification(method: string, params: unknown): void {
		for (const connection of this.connections.values()) connection.sendNotification(method, params);
	}

	private requireStore(): MobileStore {
		if (this.storeHandle === undefined)
			throw new Error(`mobile store is unavailable: ${this.storeFailure ?? "unknown error"}`);
		return this.storeHandle;
	}

	private async startListening(address: string, port: number, force = false): Promise<void> {
		const current = this.stateValue;
		if (!force && current.status === "listening" && current.address === address && current.port === port) return;
		await this.stopListening();
		this.stateValue = { status: "starting" };
		try {
			const certificate = await this.certificateValue();
			const server = createServer({ cert: certificate.certPem, key: certificate.keyPem }, (request, response) => {
				this.handleRequest(request, response);
			});
			const wss = new WebSocketServer({ noServer: true, maxPayload: MOBILE_LIMITS.maxFrameBytes });
			server.on("connection", (socket: Socket) => {
				this.sockets.add(socket);
				socket.on("close", () => this.sockets.delete(socket));
			});
			server.on("upgrade", (request, socket: Socket, head) => {
				this.handleUpgrade(request, socket, head);
			});
			await new Promise<void>((resolve, reject) => {
				const cleanup = () => {
					server.off("error", onFailure);
					server.off("listening", onListening);
				};
				const onFailure = (error: Error) => {
					cleanup();
					reject(error);
				};
				const onListening = () => {
					cleanup();
					resolve();
				};
				server.once("error", onFailure);
				server.once("listening", onListening);
				server.listen(port, address);
			});
			this.server = server;
			this.wss = wss;
			this.stateValue = { status: "listening", address, port };
			server.on("error", (error) => {
				this.stateValue = { status: "error", error: toMessage(error) };
				this.onError?.(error);
				void this.stopListening().catch(() => undefined);
			});
		} catch (error) {
			await this.stopListening().catch(() => undefined);
			this.stateValue = { status: "error", error: toMessage(error) };
			throw error;
		}
	}

	private async certificateValue(): Promise<MobileCertificate> {
		if (this.certificate === undefined) {
			this.certificate = await MobileCertificate.load(this.requireStore(), this.serverId);
		}
		return this.certificate;
	}

	private async stopListening(): Promise<void> {
		for (const connection of [...this.connections.values()]) connection.close(1001, "listener_stopped");
		const server = this.server;
		const wss = this.wss;
		this.server = undefined;
		this.wss = undefined;
		if (wss !== undefined) {
			for (const client of wss.clients) client.terminate();
			await new Promise<void>((resolve) => wss.close(() => resolve()));
		}
		for (const socket of this.sockets) socket.destroy();
		this.sockets.clear();
		if (server !== undefined) {
			await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
		}
	}

	private handleRequest(request: IncomingMessage, response: ServerResponse): void {
		if (request.method === "POST" && request.url === "/mobile/v1/pair") {
			void this.handlePair(request, response).catch((error: unknown) => {
				if (!response.headersSent) this.writeJson(response, 500, { code: "internal", message: "pairing failed" });
				else response.end();
				this.onError?.(toError(error));
			});
			return;
		}
		response.writeHead(404, { "content-type": "application/json" });
		response.end(JSON.stringify({ code: "not_found", message: "unknown path" }));
	}

	private async handlePair(request: IncomingMessage, response: ServerResponse): Promise<void> {
		const { body, oversize } = await this.readBody(request, PAIRING_BODY_LIMIT_BYTES);
		if (oversize) {
			// 不再读取剩余请求体：写完 413 后立即断开连接。
			const result = pairingBodyTooLarge();
			response.writeHead(result.status, { "content-type": "application/json", connection: "close" });
			response.end(JSON.stringify(result.body), () => request.socket.destroy());
			return;
		}
		const result: MobilePairingResult = await this.pairing().redeem(body, request.socket.remoteAddress ?? "");
		this.writeJson(response, result.status, result.body);
	}

	private readBody(
		request: IncomingMessage,
		limit: number,
	): Promise<{ readonly body: Buffer; readonly oversize: boolean }> {
		return new Promise((resolve, reject) => {
			const chunks: Buffer[] = [];
			let size = 0;
			request.on("data", (chunk: Buffer) => {
				size += chunk.length;
				if (size > limit) {
					request.pause();
					resolve({ body: Buffer.alloc(0), oversize: true });
					return;
				}
				chunks.push(chunk);
			});
			request.on("end", () => resolve({ body: Buffer.concat(chunks), oversize: false }));
			request.on("error", reject);
		});
	}

	private writeJson(response: ServerResponse, status: number, body: unknown): void {
		response.writeHead(status, { "content-type": "application/json" });
		response.end(JSON.stringify(body));
	}

	private handleUpgrade(request: IncomingMessage, socket: Socket, head: Buffer): void {
		const reject = (status: 401 | 429, code: "unauthorized" | "rate_limited") => {
			const message = code === "rate_limited" ? "too many authentication attempts" : "mobile authentication failed";
			socket.on("error", () => undefined);
			socket.end(
				`HTTP/1.1 ${status} ${status === 429 ? "Too Many Requests" : "Unauthorized"}\r\nconnection: close\r\ncontent-type: application/json\r\n\r\n${JSON.stringify({ code, message })}`,
			);
		};
		if (request.method !== "GET" || request.url !== "/mobile/v1/ws") {
			reject(401, "unauthorized");
			return;
		}
		const result = this.auth().authenticate(request);
		if (!result.ok) {
			reject(result.status, result.code);
			return;
		}
		const wss = this.wss;
		if (wss === undefined) {
			socket.destroy();
			return;
		}
		wss.handleUpgrade(request, socket, head, (ws) => {
			this.attachConnection(ws, result, socket.localAddress);
		});
	}

	private enqueue<T>(task: () => Promise<T>): Promise<T> {
		const run = this.queue.then(task);
		this.queue = run.then(
			() => undefined,
			() => undefined,
		);
		return run;
	}
}
