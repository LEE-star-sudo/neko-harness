/** Bounds around the SDK's native JSON WebSocket link; no second wire protocol. */
import { type Frame, type Link, type WebSocketLike, webSocketLink } from "@earendil-works/chord";
export const MAX_LINK_BYTES = 16 * 1024 * 1024;
const size = (text: string) => new TextEncoder().encode(text).byteLength;
export function boundedWebSocketLink(
	socket: WebSocketLike & { readonly bufferedAmount: number },
	max = MAX_LINK_BYTES,
): Link {
	let queued = 0,
		incoming = 0,
		receiving = false;
	let native: Link;
	const bridge: WebSocketLike = {
		get readyState() {
			return socket.readyState;
		},
		send(data) {
			if (size(data) + socket.bufferedAmount > max) {
				socket.close(1009, "byte limit");
				throw new Error("Link pending byte limit exceeded");
			}
			socket.send(data);
		},
		close: (code, reason) => socket.close(code, reason),
		addEventListener(type, handler) {
			if (type === "message")
				socket.addEventListener("message", (event) => {
					const bytes = size(String(event.data));
					if (!receiving) incoming += bytes;
					if (bytes > max || incoming > max) {
						native.close("frame limit exceeded");
						return;
					}
					(handler as (event: { data: unknown }) => void)(event);
				});
			else
				socket.addEventListener(type, () => {
					if (type === "open") queued = 0;
					try {
						(handler as () => void)();
					} catch {
						native.close("socket error");
					}
				});
		},
	};
	native = webSocketLink(bridge);
	socket.addEventListener("error", () => native.close("socket error"));
	return {
		get closed() {
			return native.closed;
		},
		send(frame) {
			if (native.closed) return;
			if (socket.readyState > 1) {
				native.close("socket closed");
				return;
			}
			const bytes = size(JSON.stringify(frame));
			if (bytes > max || bytes + socket.bufferedAmount + queued > max) {
				native.close("pending byte limit exceeded");
				throw new Error("Link byte limit exceeded");
			}
			if (socket.readyState === 0) queued += bytes;
			native.send(frame);
		},
		receive(handler) {
			receiving = true;
			incoming = 0;
			native.receive(handler);
		},
		onClose: (handler) => native.onClose(handler),
		close: (reason) => native.close(reason),
	};
}
/** Gate delivery on the parent's native hello identity before any service state reaches a client. */
export function identifiedLink(link: Link, expectedName: string): Link {
	let receiver: ((frame: Frame) => void) | undefined;
	let seen = false,
		pendingBytes = 0;
	const pending: Frame[] = [];
	link.receive((frame) => {
		if (!seen) {
			if (frame.t !== "hello" || frame.name !== expectedName) {
				link.close("serverId mismatch");
				return;
			}
			seen = true;
		}
		if (receiver) receiver(frame);
		else {
			pendingBytes += size(JSON.stringify(frame));
			if (pendingBytes > MAX_LINK_BYTES) {
				link.close("receive queue limit exceeded");
				pending.length = 0;
				return;
			}
			pending.push(frame);
		}
	});
	return {
		get closed() {
			return link.closed;
		},
		send: (frame) => link.send(frame),
		receive(handler) {
			receiver = handler;
			pendingBytes = 0;
			for (const frame of pending.splice(0)) {
				if (link.closed) break;
				handler(frame);
			}
		},
		onClose: (handler) => link.onClose(handler),
		close: (reason) => link.close(reason),
	};
}
