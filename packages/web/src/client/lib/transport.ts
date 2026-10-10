import type { ByteTransport, ByteTransportFactory, ByteTransportHandlers } from "@earendil-works/pi-client";

/**
 * 浏览器 ByteTransportFactory：WebSocket binary（arraybuffer）适配成 pi-server 的有序
 * 字节连接。帧封送（4 字节长度前缀 + CBOR）由 pi-client 的 Connection 内部完成，
 * 本层只搬运原始字节，与 packages/gateway/src/ws-listener.ts 的 Node 版同帧格式。
 */
export function createBrowserWsTransportFactory(url: string): ByteTransportFactory {
	return (handlers: ByteTransportHandlers): ByteTransport => {
		const socket = new WebSocket(url);
		socket.binaryType = "arraybuffer";
		// Client.connect 在 transportFactory 返回后立即发送 hello：连接未开时先排队。
		let open = false;
		const queue: Uint8Array[] = [];
		socket.onopen = () => {
			open = true;
			// TS7：Uint8Array 默认 Uint8Array<ArrayBufferLike>，浏览器 send 要 ArrayBuffer 版；slice() 复制并收窄类型。
			for (const chunk of queue.splice(0)) socket.send(chunk.slice());
		};
		socket.onmessage = (event) => {
			if (event.data instanceof ArrayBuffer) {
				handlers.onData(new Uint8Array(event.data));
				return;
			}
			if (event.data instanceof Blob) {
				void event.data.arrayBuffer().then((buffer) => handlers.onData(new Uint8Array(buffer)));
			}
		};
		socket.onclose = () => handlers.onClose();
		socket.onerror = () => handlers.onError(new Error("WebSocket transport error"));
		return {
			send(chunk: Uint8Array): Promise<void> {
				if (socket.readyState === WebSocket.CLOSING || socket.readyState === WebSocket.CLOSED) {
					return Promise.reject(new Error("WebSocket transport is not open"));
				}
				if (open) socket.send(chunk.slice());
				else queue.push(chunk);
				return Promise.resolve();
			},
			close(): void {
				socket.close();
			},
		};
	};
}
