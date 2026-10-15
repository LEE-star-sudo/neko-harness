/**
 * /api/mobile/* 浏览器侧封装（design D5）：CSRF token 来自 /api/mobile/session，
 * admin-token 永不下发浏览器；调用方用请求序号防迟到结果覆盖。
 */

export type MobileListenerState =
	| { readonly status: "disabled" }
	| { readonly status: "starting" }
	| { readonly status: "listening"; readonly address: string; readonly port: number }
	| { readonly status: "error"; readonly error: string }
	| { readonly status: "stopping" };

export type MobileAdminDevice = {
	readonly deviceId: string;
	readonly name: string;
	readonly pairedAt: number;
	readonly lastSeenAt: number;
	readonly online: boolean;
};

export type MobileAdminCertificate = { readonly fingerprint: string; readonly expiresAt: number } | null;

export type MobileAdminState = {
	readonly state: MobileListenerState;
	readonly candidates: string[];
	readonly port: number;
	readonly certificate: MobileAdminCertificate;
	readonly devices: MobileAdminDevice[];
	/** 手机最近一次成功接入的地址；gateway 会把它排在 candidates 最前。 */
	readonly lastConnectedAddress: string | null;
};

export type MobilePairing = { readonly pairingText: string; readonly expiresAt: number };

export class GatewayUnsupportedError extends Error {
	constructor() {
		super("gateway_unsupported");
		this.name = "GatewayUnsupportedError";
	}
}

type Session = { readonly csrf: string; readonly supported: boolean };

let sessionPromise: Promise<Session> | undefined;

export function resetMobileAdminSession(): void {
	sessionPromise = undefined;
}

async function fetchSession(): Promise<Session> {
	sessionPromise ??= fetch("/api/mobile/session", { cache: "no-store" })
		.then(async (response) => {
			if (!response.ok) throw new Error(`GET /api/mobile/session 失败（${response.status}）`);
			return (await response.json()) as Session;
		})
		.catch((error: unknown) => {
			sessionPromise = undefined;
			throw error;
		});
	return sessionPromise;
}

async function write<T>(path: string, params: unknown, retry = true): Promise<T> {
	const { csrf } = await fetchSession();
	const response = await fetch(path, {
		method: "POST",
		headers: { "content-type": "application/json", "x-neko-csrf": csrf },
		body: JSON.stringify(params ?? null),
	});
	if (response.status === 501) throw new GatewayUnsupportedError();
	// Web 服务重启后 CSRF 令牌已变：重新取会话并重试一次。
	if (response.status === 403 && retry) {
		resetMobileAdminSession();
		return write<T>(path, params, false);
	}
	if (!response.ok) {
		let message = `请求失败（${response.status}）`;
		try {
			const body = (await response.json()) as { message?: string };
			if (typeof body.message === "string" && body.message !== "") message = body.message;
		} catch {
			// 保留默认错误信息。
		}
		throw new Error(message);
	}
	return (await response.json()) as T;
}

async function read<T>(path: string): Promise<T> {
	const response = await fetch(path, { cache: "no-store" });
	if (response.status === 501) throw new GatewayUnsupportedError();
	if (!response.ok) throw new Error(`GET ${path} 失败（${response.status}）`);
	return (await response.json()) as T;
}

export const mobileAdmin = {
	session: () => fetchSession(),
	state: () => read<MobileAdminState>("/api/mobile/state"),
	enable: (input: { address: string; port?: number }) => write("/api/mobile/enable", input),
	disable: () => write("/api/mobile/disable", null),
	createPairing: () => write<MobilePairing>("/api/mobile/pairing", null),
	cancelPairing: () => write("/api/mobile/pairing/cancel", null),
	revoke: (deviceId: string) => write<{ revoked: boolean }>("/api/mobile/revoke", { deviceId }),
	regenerateCertificate: () =>
		write<{ fingerprint: string; expiresAt: number }>("/api/mobile/certificate/regenerate", null),
};
