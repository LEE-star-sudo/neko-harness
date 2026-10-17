import { lstat, mkdir, unlink } from "node:fs/promises";
import { connect, createServer, type Server, type Socket } from "node:net";
import { dirname } from "node:path";
import { type Frame, type Link, type WebSocketLike, webSocketLink } from "@earendil-works/chord";
import { MAX_LINK_BYTES } from "./link.ts";
/** Length-prefixed UTF-8 JSON Chord frames, with bounded receive and socket write queues. */
export class UnixLink implements Link {
	#receiving = false;
	#pendingBytes = 0;
	#socket: Socket;
	#native: Link;
	#buffer = Buffer.alloc(0);
	#message: ((event: { data: unknown }) => void)[] = [];
	#ended: (() => void)[] = [];
	constructor(socket: Socket) {
		this.#socket = socket;
		const bridge: WebSocketLike = {
			get readyState() {
				return socket.destroyed ? 3 : 1;
			},
			send: (data) => this.#transmit(data),
			close: () => socket.destroy(),
			addEventListener: (type, handler) => {
				if (type === "message") this.#message.push(handler as (event: { data: unknown }) => void);
				if (type === "close") this.#ended.push(handler as () => void);
			},
		};
		this.#native = webSocketLink(bridge);
		socket.on("data", (data) => this.#data(data));
		socket.on("error", () => this.close("socket error"));
		socket.on("close", () => {
			this.#buffer = Buffer.alloc(0);
			for (const fn of this.#ended.splice(0)) fn();
		});
	}
	get closed() {
		return this.#native.closed;
	}
	#data(data: Buffer) {
		if (this.closed) return;
		this.#buffer = Buffer.concat([this.#buffer, data]);
		while (this.#buffer.length >= 4) {
			const size = this.#buffer.readUInt32BE();
			if (!size || size > MAX_LINK_BYTES) {
				this.close("frame limit exceeded");
				return;
			}
			if (this.#buffer.length < 4 + size) break;
			let text: string;
			try {
				text = new TextDecoder("utf-8", { fatal: true }).decode(this.#buffer.subarray(4, 4 + size));
			} catch {
				this.close("protocol error");
				return;
			}
			this.#buffer = this.#buffer.subarray(4 + size);
			if (!this.#receiving) {
				this.#pendingBytes += size;
				if (this.#pendingBytes > MAX_LINK_BYTES) {
					this.close("receive queue limit exceeded");
					return;
				}
			}
			for (const fn of this.#message) fn({ data: text });
			if (this.closed) return;
		}
		if (this.#buffer.length > MAX_LINK_BYTES + 4) this.close("receive buffer limit exceeded");
	}
	#transmit(data: string | Uint8Array) {
		const bytes = Buffer.from(data);
		if (bytes.length > MAX_LINK_BYTES || this.#socket.writableLength + bytes.length + 4 > MAX_LINK_BYTES) {
			this.#socket.destroy();
			throw new Error("Link byte limit exceeded");
		}
		const header = Buffer.alloc(4);
		header.writeUInt32BE(bytes.length);
		this.#socket.write(Buffer.concat([header, bytes]));
	}
	send(frame: Frame) {
		try {
			return this.#native.send(frame);
		} catch (error) {
			this.#native.close("pending byte limit exceeded");
			throw error;
		}
	}
	receive(handler: (frame: Frame) => void) {
		this.#receiving = true;
		this.#pendingBytes = 0;
		this.#native.receive(handler);
	}
	onClose(handler: (reason: string) => void) {
		this.#native.onClose(handler);
	}
	close(reason = "closed") {
		this.#native.close(reason);
	}
}
export async function createUnixLink(path: string, signal?: AbortSignal): Promise<Link> {
	const socket = connect({ path, ...(signal ? { signal } : {}) });
	await new Promise<void>((resolve, reject) => {
		socket.once("connect", resolve);
		socket.once("error", reject);
	});
	return new UnixLink(socket);
}
export function createUnixListener(options: { path: string; onError?: (error: Error) => void }) {
	let server: Server | undefined;
	const links = new Set<Link>();
	let bound = false;
	return {
		async start(accept: (link: Link) => void) {
			await mkdir(dirname(options.path), { recursive: true });
			try {
				const stat = await lstat(options.path);
				if (!stat.isSocket()) throw new Error("Socket path is not a socket");
				const active = await new Promise<boolean>((resolve) => {
					const socket = connect(options.path);
					const timer = setTimeout(() => {
						socket.destroy();
						resolve(true);
					}, 1000);
					socket.once("connect", () => {
						clearTimeout(timer);
						socket.destroy();
						resolve(true);
					});
					socket.once("error", (error) => {
						clearTimeout(timer);
						socket.destroy();
						resolve(!["ECONNREFUSED", "ENOENT"].includes((error as NodeJS.ErrnoException).code ?? ""));
					});
				});
				if (active) throw new Error("Gateway already running at this socket");
				await unlink(options.path);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			}
			server = createServer((socket) => {
				const link = new UnixLink(socket);
				links.add(link);
				link.onClose(() => links.delete(link));
				accept(link);
			});
			await new Promise<void>((resolve, reject) => {
				server!.once("error", reject);
				server!.listen(options.path, () => {
					bound = true;
					resolve();
				});
			});
			server.on("error", (error) => options.onError?.(error));
		},
		async close() {
			for (const link of links) link.close();
			links.clear();
			const previous = server;
			server = undefined;
			if (previous) await new Promise<void>((resolve) => previous.close(() => resolve()));
			if (bound) {
				bound = false;
				await unlink(options.path).catch(() => {});
			}
		},
	};
}
