import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * 本机同源接口的共用守卫（/api/mobile/*、/api/local/*、/api/open）：
 * 检查顺序为回环 peer → Host → Origin/Sec-Fetch-Site → 写方法 CSRF/JSON/体上限，全部在副作用前完成。
 */

export const LOCAL_BODY_LIMIT_BYTES = 4096;

export type LocalGuardContext = {
	readonly csrf: string;
	readonly allowedHosts: readonly string[];
};

export function writeJson(response: ServerResponse, status: number, body: unknown): void {
	response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
	response.end(JSON.stringify(body));
}

export function isLoopback(address: string): boolean {
	return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function readBody(
	request: IncomingMessage,
	limit: number,
): Promise<{ readonly body: string; readonly oversize: boolean }> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		let size = 0;
		let oversize = false;
		request.on("data", (chunk: Buffer) => {
			size += chunk.length;
			if (!oversize && size <= limit) chunks.push(chunk);
			if (size > limit) oversize = true;
		});
		request.on("end", () => resolve({ body: Buffer.concat(chunks).toString("utf8"), oversize }));
		request.on("error", reject);
	});
}

/** 回环 peer、Host、Origin、Sec-Fetch-Site 校验；失败时已写入响应并返回 false。 */
export function checkLocalOrigin(
	request: IncomingMessage,
	response: ServerResponse,
	allowedHosts: readonly string[],
	deniedPeerMessage: string,
): boolean {
	// 可信来源仅 socket 对端；不读 X-Forwarded-*。
	if (!isLoopback(request.socket.remoteAddress ?? "")) {
		writeJson(response, 403, { code: "forbidden", message: deniedPeerMessage });
		return false;
	}
	const host = (request.headers.host ?? "").toLowerCase();
	if (!allowedHosts.includes(host)) {
		writeJson(response, 403, { code: "forbidden", message: "host is not allowed" });
		return false;
	}
	const origin = request.headers.origin;
	if (origin !== undefined) {
		let sameOrigin = false;
		try {
			const parsed = new URL(origin);
			sameOrigin = parsed.protocol === "http:" && allowedHosts.includes(parsed.host.toLowerCase());
		} catch {
			sameOrigin = false;
		}
		if (!sameOrigin) {
			writeJson(response, 403, { code: "forbidden", message: "origin is not allowed" });
			return false;
		}
	}
	const fetchSite = request.headers["sec-fetch-site"];
	if (fetchSite !== undefined && fetchSite !== "same-origin") {
		writeJson(response, 403, { code: "forbidden", message: "cross-site requests are not allowed" });
		return false;
	}
	return true;
}

/** 写方法的 CSRF、Content-Type、体上限与 JSON 解析；失败时已写入响应并返回 undefined。 */
export async function readGuardedJson(
	request: IncomingMessage,
	response: ServerResponse,
	csrf: string,
): Promise<{ readonly params: unknown } | undefined> {
	const header = request.headers["x-neko-csrf"];
	const expected = Buffer.from(csrf, "utf8");
	const provided = typeof header === "string" ? Buffer.from(header, "utf8") : Buffer.alloc(0);
	if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
		writeJson(response, 403, { code: "forbidden", message: "missing or invalid csrf token" });
		return undefined;
	}
	const contentType = request.headers["content-type"] ?? "";
	if (!contentType.toLowerCase().startsWith("application/json")) {
		writeJson(response, 415, { code: "unsupported_media_type", message: "request body must be application/json" });
		return undefined;
	}
	const { body, oversize } = await readBody(request, LOCAL_BODY_LIMIT_BYTES);
	if (oversize) {
		writeJson(response, 413, { code: "payload_too_large", message: "request body exceeds the 4 KiB limit" });
		return undefined;
	}
	let params: unknown = null;
	if (body.trim() !== "") {
		try {
			params = JSON.parse(body);
		} catch {
			writeJson(response, 400, { code: "invalid", message: "request body is not valid JSON" });
			return undefined;
		}
	}
	return { params };
}
