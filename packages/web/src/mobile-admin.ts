import { randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { ChordError, type Link } from "@earendil-works/chord";
import {
	assertGatewayIdentity,
	createClientHost,
	createUnixLink,
	createWsLink,
	NekoMobileAdmin,
	readOrCreateMobileAdminToken,
} from "@neko-harness/gateway";
import type { GatewayHandle } from "./gateway-spawn.ts";

/**
 * /api/mobile/* 同源代理（design D5）：浏览器只接触本页 CSRF token，admin-token 仅存在于本进程，
 * 经 Unix socket（POSIX）或本机 WS（Windows）以服务端专用客户端调用 neko.mobile-admin v1。
 */

const BODY_LIMIT_BYTES = 4096;

export class GatewayUnsupportedError extends Error {
	constructor() {
		super("gateway does not serve neko.mobile-admin");
		this.name = "GatewayUnsupportedError";
	}
}

export type MobileAdminCaller = ((method: string, params: unknown) => Promise<unknown>) & {
	/** 取消全部在途调用（关闭流程使用）。 */
	abortAll?: () => void;
};

export class MobileAdminTimeoutError extends Error {
	constructor(method: string, timeoutMs: number) {
		super(`mobile admin call "${method}" timed out after ${timeoutMs}ms`);
		this.name = "MobileAdminTimeoutError";
	}
}

export class MobileAdminAbortedError extends Error {
	constructor() {
		super("mobile admin call was cancelled because the web server is shutting down");
		this.name = "MobileAdminAbortedError";
	}
}

/** enable 可能需要拉起 Windows 侧中继，给更长时限。 */
export const MOBILE_ADMIN_CALL_TIMEOUT_MS = 10_000;
export const MOBILE_ADMIN_ENABLE_TIMEOUT_MS = 30_000;

export type MobileAdminCallerOptions = { readonly callTimeoutMs?: number; readonly enableTimeoutMs?: number };

/** 建立服务端专用调用方：每次调用临时连接并彻底释放，旧 gateway 的 unknown_type 归一为 GatewayUnsupportedError。 */
export function createMobileAdminCaller(
	gateway: GatewayHandle,
	nekoDir: string,
	timeouts: MobileAdminCallerOptions = {},
): MobileAdminCaller {
	const serverId = gateway.serverId;
	// 令牌按需读取：移动状态损坏只让 /api/mobile/* 失败，不阻断 Web 服务启动。
	let tokenPromise: Promise<string> | undefined;
	const readToken = () => {
		tokenPromise ??= readOrCreateMobileAdminToken(nekoDir).catch((error: unknown) => {
			tokenPromise = undefined;
			throw error;
		});
		return tokenPromise;
	};
	const run = async (method: string, params: unknown, signal: AbortSignal): Promise<unknown> => {
		const token = await readToken();
		signal.throwIfAborted();
		const link: Link =
			gateway.socketPath !== undefined ? await createUnixLink(gateway.socketPath) : createWsLink(gateway.wsUrl);
		const host = createClientHost(link);
		const release = (): void => {
			void host.close().catch(() => undefined);
			link.close("aborted");
		};
		// 超时或取消时立即断开连接，避免悬挂调用占用资源。
		signal.addEventListener("abort", release, { once: true });
		try {
			await assertGatewayIdentity(host, serverId, signal);
			const admin = (await host.get(NekoMobileAdmin, { token }, { signal })) as unknown as Record<
				string,
				(params: unknown) => Promise<unknown>
			>;
			const call = admin[method];
			if (call === undefined) throw new Error(`unknown mobile admin method: ${method}`);
			try {
				return await call.call(admin, params);
			} catch (error) {
				if (error instanceof ChordError && error.code === "unavailable" && error.reason === "unknown_type")
					throw new GatewayUnsupportedError();
				throw error;
			} finally {
				(admin as { release?: () => void }).release?.();
			}
		} finally {
			signal.removeEventListener("abort", release);
			await host.close().catch(() => undefined);
			link.close("done");
		}
	};

	const inflight = new Set<AbortController>();
	const caller: MobileAdminCaller = async (method, params) => {
		const timeoutMs =
			method === "enable"
				? (timeouts.enableTimeoutMs ?? MOBILE_ADMIN_ENABLE_TIMEOUT_MS)
				: (timeouts.callTimeoutMs ?? MOBILE_ADMIN_CALL_TIMEOUT_MS);
		const controller = new AbortController();
		inflight.add(controller);
		const timer = setTimeout(() => controller.abort(new MobileAdminTimeoutError(method, timeoutMs)), timeoutMs);
		try {
			const work = run(method, params, controller.signal);
			work.catch(() => undefined);
			return await new Promise<unknown>((resolve, reject) => {
				const onAbort = (): void => reject(controller.signal.reason);
				if (controller.signal.aborted) onAbort();
				else controller.signal.addEventListener("abort", onAbort, { once: true });
				work.then(resolve, reject);
			});
		} finally {
			clearTimeout(timer);
			inflight.delete(controller);
		}
	};
	caller.abortAll = () => {
		for (const controller of [...inflight]) controller.abort(new MobileAdminAbortedError());
	};
	return caller;
}

export type MobileAdminProxyContext = {
	readonly csrf: string;
	readonly caller: MobileAdminCaller;
	readonly allowedHosts: readonly string[];
};

const WRITE_ROUTES: Readonly<Record<string, string>> = {
	"/api/mobile/enable": "enable",
	"/api/mobile/disable": "disable",
	"/api/mobile/pairing": "createPairing",
	"/api/mobile/pairing/cancel": "cancelPairing",
	"/api/mobile/revoke": "revoke",
	"/api/mobile/certificate/regenerate": "regenerateCertificate",
};

const READ_ROUTES: Readonly<Record<string, string>> = {
	"/api/mobile/state": "state",
};

function writeJson(response: ServerResponse, status: number, body: unknown): void {
	response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
	response.end(JSON.stringify(body));
}

function isLoopback(address: string): boolean {
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

/**
 * 处理一条 /api/mobile/* 请求；非本前缀返回 false 交还原路由。
 * 检查顺序（全部在副作用前）：回环 peer → Host → Origin/Sec-Fetch-Site → 写方法 CSRF/JSON/体上限。
 */
export async function handleMobileAdminRequest(
	request: IncomingMessage,
	response: ServerResponse,
	context: MobileAdminProxyContext,
): Promise<boolean> {
	const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
	const isSession = pathname === "/api/mobile/session";
	const readMethod = READ_ROUTES[pathname];
	const writeMethod = WRITE_ROUTES[pathname];
	if (!isSession && readMethod === undefined && writeMethod === undefined) {
		if (pathname === "/api/mobile" || pathname.startsWith("/api/mobile/")) {
			writeJson(response, 404, { code: "not_found", message: "unknown mobile admin route" });
			return true;
		}
		return false;
	}

	// 可信来源仅 socket 对端；不读 X-Forwarded-*。
	if (!isLoopback(request.socket.remoteAddress ?? "")) {
		writeJson(response, 403, { code: "forbidden", message: "mobile admin is only available from this computer" });
		return true;
	}
	const host = (request.headers.host ?? "").toLowerCase();
	if (!context.allowedHosts.includes(host)) {
		writeJson(response, 403, { code: "forbidden", message: "host is not allowed" });
		return true;
	}
	const origin = request.headers.origin;
	if (origin !== undefined) {
		let sameOrigin = false;
		try {
			const parsed = new URL(origin);
			sameOrigin = parsed.protocol === "http:" && context.allowedHosts.includes(parsed.host.toLowerCase());
		} catch {
			sameOrigin = false;
		}
		if (!sameOrigin) {
			writeJson(response, 403, { code: "forbidden", message: "origin is not allowed" });
			return true;
		}
	}
	const fetchSite = request.headers["sec-fetch-site"];
	if (fetchSite !== undefined && fetchSite !== "same-origin") {
		writeJson(response, 403, { code: "forbidden", message: "cross-site requests are not allowed" });
		return true;
	}

	if (isSession) {
		if (request.method !== "GET") {
			writeJson(response, 404, { code: "not_found", message: "unknown mobile admin route" });
			return true;
		}
		let supported = true;
		try {
			await context.caller("state", null);
		} catch (error) {
			if (error instanceof GatewayUnsupportedError) supported = false;
			else return respondWithCaller(response, Promise.reject(error));
		}
		writeJson(response, 200, { csrf: context.csrf, supported });
		return true;
	}

	if (readMethod !== undefined) {
		if (request.method !== "GET") {
			writeJson(response, 404, { code: "not_found", message: "unknown mobile admin route" });
			return true;
		}
		return respondWithCaller(response, context.caller(readMethod, null));
	}

	if (request.method !== "POST") {
		writeJson(response, 404, { code: "not_found", message: "unknown mobile admin route" });
		return true;
	}
	const csrf = request.headers["x-neko-csrf"];
	const expected = Buffer.from(context.csrf, "utf8");
	const provided = typeof csrf === "string" ? Buffer.from(csrf, "utf8") : Buffer.alloc(0);
	if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
		writeJson(response, 403, { code: "forbidden", message: "missing or invalid csrf token" });
		return true;
	}
	const contentType = request.headers["content-type"] ?? "";
	if (!contentType.toLowerCase().startsWith("application/json")) {
		writeJson(response, 415, { code: "unsupported_media_type", message: "request body must be application/json" });
		return true;
	}
	const { body, oversize } = await readBody(request, BODY_LIMIT_BYTES);
	if (oversize) {
		writeJson(response, 413, { code: "payload_too_large", message: "request body exceeds the 4 KiB limit" });
		return true;
	}
	let params: unknown = null;
	if (body.trim() !== "") {
		try {
			params = JSON.parse(body);
		} catch {
			writeJson(response, 400, { code: "invalid", message: "request body is not valid JSON" });
			return true;
		}
	}

	if (writeMethod === undefined) return false;
	return respondWithCaller(response, context.caller(writeMethod, params));
}

async function respondWithCaller(response: ServerResponse, result: Promise<unknown>): Promise<boolean> {
	try {
		writeJson(response, 200, (await result) ?? null);
	} catch (error) {
		if (error instanceof GatewayUnsupportedError) {
			writeJson(response, 501, { code: "gateway_unsupported", message: "gateway is too old for mobile admin" });
			return true;
		}
		if (error instanceof ChordError) {
			writeJson(response, 502, { code: error.code, message: error.message });
			return true;
		}
		if (error instanceof MobileAdminTimeoutError) {
			writeJson(response, 504, { code: "gateway_timeout", message: error.message });
			return true;
		}
		if (error instanceof MobileAdminAbortedError) {
			writeJson(response, 503, { code: "shutting_down", message: error.message });
			return true;
		}
		throw error;
	}
	return true;
}

export function createMobileAdminContext(options: {
	readonly gateway: GatewayHandle;
	readonly nekoDir: string;
	readonly webHost: string;
	readonly webPort: number;
}): MobileAdminProxyContext {
	const hostSuffix = `:${options.webPort}`;
	const hosts = [`127.0.0.1${hostSuffix}`, `localhost${hostSuffix}`, `[::1]${hostSuffix}`];
	if (
		options.webHost !== "127.0.0.1" &&
		options.webHost !== "localhost" &&
		options.webHost !== "::1" &&
		options.webHost !== "::"
	) {
		const normalized =
			options.webHost.includes(":") && !options.webHost.startsWith("[") ? `[${options.webHost}]` : options.webHost;
		hosts.push(`${normalized}${hostSuffix}`);
	}
	return {
		caller: createMobileAdminCaller(options.gateway, options.nekoDir),
		csrf: randomBytes(32).toString("base64url"),
		allowedHosts: hosts,
	};
}
