import { createHash, randomBytes } from "node:crypto";
import type { MobileCertificate } from "./certificate.ts";
import { MOBILE_API_VERSIONS } from "./protocol.ts";
import type { MobileCompletePairingInput, MobileDeviceRecord, MobileStoreState } from "./store.ts";

export const PAIRING_CODE_TTL_MS = 120_000;
export const PAIRING_RECEIPT_TTL_MS = 10 * 60_000;
export const PAIRING_BODY_LIMIT_BYTES = 4096;
export const PAIRING_RATE_LIMIT = 10;
export const PAIRING_RATE_WINDOW_MS = 60_000;
export const PAIRING_MAX_INFLIGHT = 4;

const BASE64URL_32_BYTES = /^[A-Za-z0-9_-]{43}$/;

export type MobilePairSuccessBody = {
	readonly serverId: string;
	readonly serverName: string;
	readonly deviceId: string;
	readonly grantRevision: number;
	readonly apiVersions: readonly number[];
};

export type MobilePairErrorBody = {
	readonly code: string;
	readonly message: string;
};

export type MobilePairingResult =
	| { readonly status: 200; readonly body: MobilePairSuccessBody }
	| { readonly status: 400 | 403 | 409 | 410 | 413 | 429 | 500; readonly body: MobilePairErrorBody };

export type MobilePairingStore = {
	getState(): MobileStoreState;
	completePairing(input: MobileCompletePairingInput): Promise<MobileStoreState>;
};

export type MobilePairRequest = {
	readonly v: number;
	readonly sid: string;
	readonly code: string;
	readonly pairRequestId: string;
	readonly deviceId: string;
	readonly deviceName: string;
	readonly credential: string;
};

export type MobilePairingOptions = {
	readonly serverId: string;
	readonly serverName: string;
	readonly store: MobilePairingStore | undefined;
	readonly certificate: () => MobileCertificate | undefined;
	readonly isListening: () => { readonly address: string; readonly port: number } | undefined;
	readonly onPaired?: (device: MobileDeviceRecord) => void;
	readonly now?: () => number;
};

type ActivePairingCode = {
	readonly codeHash: string;
	readonly expiresAt: number;
	consumed: boolean;
};

function sha256Hex(value: string): string {
	return createHash("sha256").update(value, "utf8").digest("hex");
}

function failure(status: 400 | 403 | 409 | 410 | 413 | 429 | 500, code: string, message: string): MobilePairingResult {
	return { status, body: { code, message } };
}

export function pairingBodyTooLarge(): MobilePairingResult {
	return failure(413, "payload_too_large", "request body exceeds the 4 KiB limit");
}

function parsePairRequest(body: Buffer): MobilePairRequest | MobilePairingResult {
	let raw: unknown;
	try {
		raw = JSON.parse(body.toString("utf8"));
	} catch {
		return failure(400, "invalid", "request body is not valid JSON");
	}
	if (typeof raw !== "object" || raw === null || Array.isArray(raw))
		return failure(400, "invalid", "request body must be a JSON object");
	const record = raw as Record<string, unknown>;
	const readString = (key: string, max: number): string | undefined => {
		const value = record[key];
		return typeof value === "string" && value.length > 0 && value.length <= max ? value : undefined;
	};
	const v = record.v;
	const sid = readString("sid", 128);
	const code = readString("code", 64);
	const pairRequestId = readString("pairRequestId", 128);
	const deviceId = readString("deviceId", 128);
	const credential = readString("credential", 64);
	const deviceName = record.deviceName;
	if (typeof v !== "number" || v !== 1) return failure(400, "invalid", "unsupported or missing version");
	if (sid === undefined) return failure(400, "invalid", "missing or invalid sid");
	if (code === undefined || !BASE64URL_32_BYTES.test(code)) return failure(400, "invalid", "missing or invalid code");
	if (pairRequestId === undefined) return failure(400, "invalid", "missing or invalid pairRequestId");
	if (deviceId === undefined) return failure(400, "invalid", "missing or invalid deviceId");
	if (typeof deviceName !== "string" || deviceName.length > 128)
		return failure(400, "invalid", "missing or invalid deviceName");
	if (credential === undefined || !BASE64URL_32_BYTES.test(credential))
		return failure(400, "invalid", "missing or invalid credential");
	return { v, sid, code, pairRequestId, deviceId, deviceName, credential };
}

export class MobilePairing {
	private readonly serverId: string;
	private readonly serverName: string;
	private readonly store: MobilePairingStore | undefined;
	private readonly certificate: () => MobileCertificate | undefined;
	private readonly isListening: () => { readonly address: string; readonly port: number } | undefined;
	private readonly onPaired: ((device: MobileDeviceRecord) => void) | undefined;
	private readonly clock: () => number;
	private current: ActivePairingCode | undefined;
	private readonly hits = new Map<string, number[]>();
	private inflight = 0;

	constructor(options: MobilePairingOptions) {
		this.serverId = options.serverId;
		this.serverName = options.serverName;
		this.store = options.store;
		this.certificate = options.certificate;
		this.isListening = options.isListening;
		this.onPaired = options.onPaired;
		this.clock = options.now ?? Date.now;
	}

	createPairing(): { readonly pairingText: string; readonly expiresAt: number } {
		const endpoint = this.isListening();
		if (endpoint === undefined) throw new Error("mobile listener is not active; pairing requires a listening state");
		const certificate = this.certificate();
		if (certificate === undefined) throw new Error("mobile certificate is not available");
		const now = this.clock();
		const code = randomBytes(32).toString("base64url");
		const expiresAt = now + PAIRING_CODE_TTL_MS;
		this.current = { codeHash: sha256Hex(code), expiresAt, consumed: false };
		const payload = {
			v: 1,
			sid: this.serverId,
			name: this.serverName,
			ep: `https://${endpoint.address}:${endpoint.port}`,
			fp: certificate.fingerprint,
			code,
			exp: expiresAt,
		};
		return {
			pairingText: `nekopair:1:${Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")}`,
			expiresAt,
		};
	}

	invalidate(): void {
		this.current = undefined;
	}

	async redeem(body: Buffer, sourceIp: string): Promise<MobilePairingResult> {
		const now = this.clock();
		if (this.recordHit(sourceIp, now))
			return failure(429, "rate_limited", "too many pairing attempts; try again later");
		if (this.inflight >= PAIRING_MAX_INFLIGHT)
			return failure(429, "rate_limited", "too many pairing attempts in progress");
		this.inflight += 1;
		try {
			return await this.redeemInner(body, this.clock());
		} finally {
			this.inflight -= 1;
		}
	}

	private async redeemInner(body: Buffer, now: number): Promise<MobilePairingResult> {
		if (body.byteLength > PAIRING_BODY_LIMIT_BYTES) return pairingBodyTooLarge();
		const parsed = parsePairRequest(body);
		if ("status" in parsed) return parsed;
		const request = parsed;
		if (request.sid !== this.serverId)
			return failure(403, "wrong_server", "pairing code belongs to a different server");

		const store = this.store;
		if (store === undefined) return failure(500, "internal", "mobile store is unavailable");

		const receipt = store.getState().receipts.find((r) => r.pairRequestId === request.pairRequestId);
		if (receipt !== undefined) {
			if (receipt.expiresAt <= now) return failure(410, "code_expired", "pairing receipt expired; scan a new code");
			if (receipt.deviceId === request.deviceId && receipt.credentialHash === sha256Hex(request.credential))
				return this.success(receipt.deviceId, receipt.grantRevision);
			return failure(409, "code_used", "pairing request was already used");
		}

		const credentialHash = sha256Hex(request.credential);
		const current = this.current;
		if (current === undefined || current.codeHash !== sha256Hex(request.code))
			return failure(410, "code_expired", "pairing code is not active; scan a new code");
		if (current.consumed) return failure(409, "code_used", "pairing code was already used");
		if (current.expiresAt <= now) return failure(410, "code_expired", "pairing code expired; scan a new code");

		current.consumed = true;
		let device: MobileDeviceRecord;
		try {
			const state = await store.completePairing({
				pairRequestId: request.pairRequestId,
				deviceId: request.deviceId,
				name: request.deviceName,
				credentialHash,
				pairedAt: now,
				receiptExpiresAt: now + PAIRING_RECEIPT_TTL_MS,
			});
			const persisted = state.devices.find((d) => d.deviceId === request.deviceId);
			if (persisted === undefined) throw new Error("paired device missing after persist");
			device = persisted;
		} catch {
			current.consumed = false;
			return failure(500, "internal", "failed to persist pairing");
		}
		try {
			this.onPaired?.(device);
		} catch {
			// 持久化已成功：清理/失效回调失败不回滚授权，也不把响应改成失败。
		}
		return this.success(device.deviceId, device.grantRevision);
	}

	private success(deviceId: string, grantRevision: number): MobilePairingResult {
		return {
			status: 200,
			body: {
				serverId: this.serverId,
				serverName: this.serverName,
				deviceId,
				grantRevision,
				apiVersions: MOBILE_API_VERSIONS,
			},
		};
	}

	private recordHit(sourceIp: string, now: number): boolean {
		for (const [ip, times] of this.hits) {
			if (times.every((at) => now - at >= PAIRING_RATE_WINDOW_MS)) this.hits.delete(ip);
		}
		const window = (this.hits.get(sourceIp) ?? []).filter((at) => now - at < PAIRING_RATE_WINDOW_MS);
		window.push(now);
		this.hits.set(sourceIp, window);
		return window.length > PAIRING_RATE_LIMIT;
	}
}
