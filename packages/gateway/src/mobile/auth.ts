import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { MobileDeviceRecord, MobileStoreState } from "./store.ts";

export const AUTH_FAILURE_LIMIT = 20;
export const AUTH_FAILURE_WINDOW_MS = 60_000;

export type MobileAuthStore = {
	getState(): MobileStoreState;
};

export type MobileAuthOptions = {
	readonly store: MobileAuthStore | undefined;
	readonly now?: () => number;
};

export type MobileAuthSuccess = {
	readonly ok: true;
	readonly deviceId: string;
	readonly grantRevision: number;
	readonly remoteAddress: string;
};

export type MobileAuthFailure = {
	readonly ok: false;
	readonly status: 401 | 429;
	readonly code: "unauthorized" | "rate_limited";
};

export type MobileAuthResult = MobileAuthSuccess | MobileAuthFailure;

const AUTHORIZATION_PATTERN = /^Neko-Device (\S{1,128})\.([A-Za-z0-9_-]{43})$/;

function authorizationValues(request: IncomingMessage): string[] {
	const values: string[] = [];
	const raw = request.rawHeaders;
	for (let index = 0; index + 1 < raw.length; index += 2) {
		if (raw[index]?.toLowerCase() === "authorization") values.push(raw[index + 1] ?? "");
	}
	return values;
}

function parseAuthorizationHeader(
	request: IncomingMessage,
): { readonly deviceId: string; readonly credential: string } | undefined {
	const values = authorizationValues(request);
	if (values.length !== 1) return undefined;
	const match = AUTHORIZATION_PATTERN.exec(values[0] ?? "");
	if (match === null) return undefined;
	const deviceId = match[1];
	const credential = match[2];
	if (deviceId === undefined || credential === undefined) return undefined;
	return { deviceId, credential };
}

function credentialMatches(credential: string, credentialHash: string): boolean {
	const digest = createHash("sha256").update(credential, "utf8").digest();
	const expected = Buffer.from(credentialHash, "hex");
	if (expected.length !== digest.length) return false;
	try {
		return timingSafeEqual(digest, expected);
	} catch {
		return false;
	}
}

export class MobileAuth {
	private readonly store: MobileAuthStore | undefined;
	private readonly clock: () => number;
	private readonly failures = new Map<string, number[]>();

	constructor(options: MobileAuthOptions) {
		this.store = options.store;
		this.clock = options.now ?? Date.now;
	}

	authenticate(request: IncomingMessage): MobileAuthResult {
		const remoteAddress = request.socket.remoteAddress ?? "";
		const now = this.clock();
		if (this.limited(remoteAddress, now)) return { ok: false, status: 429, code: "rate_limited" };

		const parsed = parseAuthorizationHeader(request);
		const device = parsed === undefined ? undefined : this.findDevice(parsed.deviceId);
		if (parsed === undefined || device === undefined || !credentialMatches(parsed.credential, device.credentialHash)) {
			this.recordFailure(remoteAddress, now);
			return { ok: false, status: 401, code: "unauthorized" };
		}
		return { ok: true, deviceId: device.deviceId, grantRevision: device.grantRevision, remoteAddress };
	}

	private findDevice(deviceId: string): MobileDeviceRecord | undefined {
		if (this.store === undefined) return undefined;
		return this.store.getState().devices.find((d) => d.deviceId === deviceId);
	}

	private recentFailures(remoteAddress: string, now: number): number[] {
		const recent = (this.failures.get(remoteAddress) ?? []).filter((at) => now - at < AUTH_FAILURE_WINDOW_MS);
		if (recent.length === 0) this.failures.delete(remoteAddress);
		else this.failures.set(remoteAddress, recent);
		return recent;
	}

	private limited(remoteAddress: string, now: number): boolean {
		return this.recentFailures(remoteAddress, now).length >= AUTH_FAILURE_LIMIT;
	}

	private recordFailure(remoteAddress: string, now: number): void {
		this.failures.set(remoteAddress, [...this.recentFailures(remoteAddress, now), now]);
	}
}
