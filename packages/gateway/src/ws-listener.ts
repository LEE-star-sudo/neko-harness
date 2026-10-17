import type { Link } from "@earendil-works/chord";
import { WebSocket, WebSocketServer } from "ws";
import { boundedWebSocketLink, MAX_LINK_BYTES } from "./link.ts";
export type WsListenerOptions = {
	readonly host: string;
	readonly port: number;
	readonly maxPendingBytes?: number;
	readonly onError?: (error: Error) => void;
};
export type WsListener = {
	readonly port: number;
	start(accept: (link: Link) => void): Promise<void>;
	close(): Promise<void>;
};
export function createWsLink(url: string, signal?: AbortSignal): Link {
	signal?.throwIfAborted();
	const socket = new WebSocket(url, { maxPayload: MAX_LINK_BYTES });
	const link = boundedWebSocketLink(socket);
	const abort = () => {
		link.close("cancelled");
		// 握手或关闭握手停滞时也立即释放底层 socket。
		socket.terminate();
	};
	signal?.addEventListener("abort", abort, { once: true });
	socket.once("close", () => signal?.removeEventListener("abort", abort));
	if (signal?.aborted) abort();
	return link;
}
export function createWsListener(options: WsListenerOptions): WsListener {
	let server: WebSocketServer | undefined;
	let port = options.port;
	return {
		get port() {
			return port;
		},
		async start(accept) {
			server = new WebSocketServer({
				host: options.host,
				port: options.port,
				maxPayload: options.maxPendingBytes ?? MAX_LINK_BYTES,
			});
			await new Promise<void>((resolve, reject) => {
				server!.once("error", reject);
				server!.once("listening", resolve);
			});
			const address = server.address();
			if (typeof address === "object" && address) port = address.port;
			server.on("error", (error) => options.onError?.(error));
			server.on("connection", (socket) => {
				socket.on("error", (error) => options.onError?.(error));
				// 拒绝打包（压缩）帧：字节上限在解压之前生效，客户端不可信。
				accept(boundedWebSocketLink(socket, options.maxPendingBytes, { acceptPacked: false }));
			});
		},
		async close() {
			const previous = server;
			server = undefined;
			if (!previous) return;
			for (const socket of previous.clients) socket.terminate();
			await new Promise<void>((resolve) => previous.close(() => resolve()));
		},
	};
}
