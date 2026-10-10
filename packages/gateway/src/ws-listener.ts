import type { ServerListener } from "@earendil-works/pi-server";
import { WebSocket, WebSocketServer } from "ws";

/**
 * WebSocket 传输：把每个 ws 连接适配成 pi-server 的有序字节连接（ByteConnection），
 * 于是 Unix socket 与 WebSocket 上跑完全相同的 pi 协议帧（4 字节长度前缀 + CBOR），
 * 上传同一份 neko 服务契约（design D3，不自研第二套协议）。
 *
 * 代价：浏览器前端需要一个 CBOR + 帧封送薄层（pi-protocol 的 encode/decode 是纯算法，
 * 可移植）；若将来要免 CBOR，可在本监听器旁加一个 JSON 子协议端点，服务契约不变。
 */

const DEFAULT_MAX_PENDING_BYTES = 16 * 1024 * 1024;

export type WsListenerOptions = {
	readonly host: string;
	readonly port: number;
	/** 慢客户端缓冲上限，超出即断开。 */
	readonly maxPendingBytes?: number;
	readonly onError?: (error: Error) => void;
};

export type WsListener = ServerListener & {
	/** bind 后的实际端口（port 传 0 时以这里为准）。 */
	readonly port: number;
};

/** 供 Node 客户端把 pi-client 的 ByteTransportFactory 桥接到 ws WebSocket（同帧格式）。 */
export function createWsByteTransportFactory(url: string) {
	return (handlers: { onData(chunk: Uint8Array): void; onClose(): void; onError(error: Error): void }) => {
		const socket = new WebSocket(url);
		socket.binaryType = "nodebuffer";
		// Client.connect 会在 transportFactory 返回后立即发送 hello：连接未开时先排队。
		let open = false;
		const queue: Uint8Array[] = [];
		socket.on("open", () => {
			open = true;
			for (const chunk of queue.splice(0)) socket.send(chunk);
		});
		socket.on("message", (data) => {
			const chunk = Array.isArray(data) ? Buffer.concat(data) : (data as Buffer);
			handlers.onData(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength));
		});
		socket.on("close", () => handlers.onClose());
		socket.on("error", (error) => handlers.onError(error));
		return {
			send(chunk: Uint8Array): Promise<void> {
				if (socket.readyState === WebSocket.CLOSING || socket.readyState === WebSocket.CLOSED) {
					return Promise.reject(new Error("WebSocket transport is not open"));
				}
				if (open) socket.send(chunk);
				else queue.push(chunk);
				return Promise.resolve();
			},
			close(): void {
				socket.close();
			},
		};
	};
}

class WsByteConnection {
	private readonly socket: WebSocket;
	private readonly maxPendingBytes: number;
	private closedValue = false;

	constructor(socket: WebSocket, maxPendingBytes: number) {
		this.socket = socket;
		this.maxPendingBytes = maxPendingBytes;
		socket.binaryType = "nodebuffer";
	}

	get closed(): boolean {
		return this.closedValue || this.socket.readyState === WebSocket.CLOSED;
	}

	async send(chunk: Uint8Array): Promise<void> {
		if (this.closed) throw new Error("WebSocket connection is closed");
		if (this.socket.bufferedAmount > this.maxPendingBytes) {
			this.socket.terminate();
			throw new Error("WebSocket connection exceeded its pending byte limit");
		}
		this.socket.send(chunk);
	}

	async close(finalChunk?: Uint8Array): Promise<void> {
		if (this.closed) {
			this.markClosed();
			return;
		}
		try {
			if (finalChunk !== undefined && this.socket.readyState === WebSocket.OPEN) {
				this.socket.send(finalChunk);
			}
			this.socket.close();
		} finally {
			this.markClosed();
		}
	}

	markClosed(): void {
		this.closedValue = true;
	}
}

export function createWsListener(options: WsListenerOptions): WsListener {
	const maxPendingBytes = options.maxPendingBytes ?? DEFAULT_MAX_PENDING_BYTES;
	let wss: WebSocketServer | undefined;
	let actualPort = options.port;
	return {
		get port() {
			return actualPort;
		},
		async start(accept) {
			const server = new WebSocketServer({ host: options.host, port: options.port });
			wss = server;
			await new Promise<void>((resolve, reject) => {
				server.once("error", reject);
				server.once("listening", () => {
					const address = server.address();
					if (typeof address === "object" && address !== null) actualPort = address.port;
					resolve();
				});
			});
			server.on("connection", (socket) => {
				const connection = new WsByteConnection(socket, maxPendingBytes);
				const handler = accept(connection);
				socket.on("message", (data, isBinary) => {
					if (!isBinary || connection.closed) {
						socket.close();
						return;
					}
					const chunk = Array.isArray(data) ? Buffer.concat(data) : (data as Buffer);
					handler.onData(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength));
				});
				socket.on("close", () => {
					connection.markClosed();
					handler.onClose();
				});
				socket.on("error", (error) => handler.onError(error));
			});
		},
		async close() {
			for (const client of wss?.clients ?? []) client.terminate();
			await new Promise<void>((resolve) => {
				if (wss === undefined) {
					resolve();
					return;
				}
				wss.close(() => resolve());
			});
			wss = undefined;
		},
	};
}
