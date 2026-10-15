import { randomBytes } from "node:crypto";
import { connect as tlsConnect } from "node:tls";

export type MobileWsClient = {
	send(value: unknown): void;
	/** 多个帧合并为一次 socket 写入，用于并发上限测试。 */
	sendBatch(values: readonly unknown[]): void;
	sendText(text: string): void;
	nextMessage(): Promise<unknown>;
	waitForClose(): Promise<{ readonly code: number; readonly reason: string }>;
	close(code?: number, reason?: string): void;
	terminate(): void;
};

function encodeFrame(opcode: number, payload: Buffer): Buffer {
	const mask = randomBytes(4);
	let header: Buffer;
	if (payload.length < 126) {
		header = Buffer.from([0x80 | opcode, 0x80 | payload.length]);
	} else if (payload.length < 65_536) {
		header = Buffer.alloc(4);
		header[0] = 0x80 | opcode;
		header[1] = 0x80 | 126;
		header.writeUInt16BE(payload.length, 2);
	} else {
		header = Buffer.alloc(10);
		header[0] = 0x80 | opcode;
		header[1] = 0x80 | 127;
		header.writeBigUInt64BE(BigInt(payload.length), 2);
	}
	const masked = Buffer.alloc(payload.length);
	for (let index = 0; index < payload.length; index++) masked[index] = (payload[index] ?? 0) ^ (mask[index % 4] ?? 0);
	return Buffer.concat([header, mask, masked]);
}

export function connectMobileWs(port: number, headers: Record<string, string> = {}): Promise<MobileWsClient> {
	return new Promise((resolve, reject) => {
		const socket = tlsConnect({ host: "127.0.0.1", port, rejectUnauthorized: false });
		const timer = setTimeout(() => {
			socket.destroy();
			reject(new Error("connectMobileWs timeout"));
		}, 5_000);
		let settled = false;
		let handshakeDone = false;
		let buffer = Buffer.alloc(0);
		let textFragment = "";
		const messages: unknown[] = [];
		let messageResolve: ((value: unknown) => void) | undefined;
		let closeResolve: ((value: { code: number; reason: string }) => void) | undefined;
		let closeReceived: { code: number; reason: string } | undefined;

		const settleReject = (error: Error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			socket.destroy();
			reject(error);
		};
		socket.on("error", (error: Error) => settleReject(error));

		socket.on("secureConnect", () => {
			const lines = [
				"GET /mobile/v1/ws HTTP/1.1",
				`Host: 127.0.0.1:${port}`,
				"Upgrade: websocket",
				"Connection: Upgrade",
				`Sec-WebSocket-Key: ${randomBytes(16).toString("base64")}`,
				"Sec-WebSocket-Version: 13",
			];
			for (const [name, value] of Object.entries(headers)) lines.push(`${name}: ${value}`);
			socket.write(`${lines.join("\r\n")}\r\n\r\n`);
		});

		const deliverMessage = (text: string) => {
			let parsed: unknown = text;
			try {
				parsed = JSON.parse(text);
			} catch {
				// 非 JSON 文本原样上交，由测试断言。
			}
			if (messageResolve !== undefined) {
				const resolve = messageResolve;
				messageResolve = undefined;
				resolve(parsed);
			} else {
				messages.push(parsed);
			}
		};

		const handleFrame = (opcode: number, payload: Buffer) => {
			if (opcode === 0x1) {
				deliverMessage(payload.toString("utf8"));
			} else if (opcode === 0x8) {
				const code = payload.length >= 2 ? payload.readUInt16BE(0) : 1005;
				const result = { code, reason: payload.subarray(2).toString("utf8") };
				closeReceived = result;
				if (closeResolve !== undefined) {
					const resolve = closeResolve;
					closeResolve = undefined;
					resolve(result);
				}
			} else if (opcode === 0x9) {
				socket.write(encodeFrame(0xa, payload));
			}
		};

		const processFrames = () => {
			for (;;) {
				if (buffer.length < 2) return;
				const opcode = (buffer[0] ?? 0) & 0x0f;
				const fin = ((buffer[0] ?? 0) & 0x80) !== 0;
				let length = (buffer[1] ?? 0) & 0x7f;
				let offset = 2;
				if (length === 126) {
					if (buffer.length < 4) return;
					length = buffer.readUInt16BE(2);
					offset = 4;
				} else if (length === 127) {
					if (buffer.length < 10) return;
					length = Number(buffer.readBigUInt64BE(2));
					offset = 10;
				}
				if (buffer.length < offset + length) return;
				const payload = buffer.subarray(offset, offset + length);
				buffer = buffer.subarray(offset + length);
				if (fin && opcode === 0x0 && textFragment !== "") {
					deliverMessage(textFragment + payload.toString("utf8"));
					textFragment = "";
				} else if (!fin && opcode === 0x1) {
					textFragment = payload.toString("utf8");
				} else if (fin) {
					handleFrame(opcode, payload);
				}
			}
		};

		socket.on("data", (chunk: Buffer) => {
			if (!handshakeDone) {
				buffer = Buffer.concat([buffer, chunk]);
				const headerEnd = buffer.indexOf("\r\n\r\n");
				if (headerEnd === -1) return;
				const statusLine = buffer.subarray(0, buffer.indexOf("\r\n")).toString("utf8");
				const rest = buffer.subarray(headerEnd + 4);
				if (!statusLine.startsWith("HTTP/1.1 101")) {
					settleReject(new Error(`upgrade rejected: ${statusLine}`));
					return;
				}
				handshakeDone = true;
				settled = true;
				clearTimeout(timer);
				buffer = rest;
				const client: MobileWsClient = {
					send(value: unknown) {
						socket.write(encodeFrame(0x1, Buffer.from(JSON.stringify(value), "utf8")));
					},
					sendBatch(values: readonly unknown[]) {
						socket.write(
							Buffer.concat(values.map((value) => encodeFrame(0x1, Buffer.from(JSON.stringify(value), "utf8")))),
						);
					},
					sendText(text: string) {
						socket.write(encodeFrame(0x1, Buffer.from(text, "utf8")));
					},
					nextMessage() {
						const queued = messages.shift();
						if (queued !== undefined) return Promise.resolve(queued);
						return new Promise((resolveMessage) => {
							messageResolve = resolveMessage;
						});
					},
					waitForClose() {
						if (closeReceived !== undefined) return Promise.resolve(closeReceived);
						return new Promise((resolveClose) => {
							closeResolve = resolveClose;
						});
					},
					close(code?: number, reason?: string) {
						if (code === undefined) {
							socket.write(encodeFrame(0x8, Buffer.alloc(0)));
							return;
						}
						const reasonBuffer = Buffer.from(reason ?? "", "utf8");
						const payload = Buffer.alloc(2 + reasonBuffer.length);
						payload.writeUInt16BE(code, 0);
						reasonBuffer.copy(payload, 2);
						socket.write(encodeFrame(0x8, payload));
					},
					terminate() {
						socket.destroy();
					},
				};
				resolve(client);
				processFrames();
				return;
			}
			buffer = Buffer.concat([buffer, chunk]);
			processFrames();
		});
	});
}
