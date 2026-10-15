import { createHash, timingSafeEqual } from "node:crypto";
import { ChordError, type Handle, method, type RemoteContract, remote } from "@earendil-works/chord";
import { type TSchema, Type } from "typebox";
import type { MobileGateway } from "./listener.ts";
import { MobileStore } from "./store.ts";

// 与 contract.ts 相同的最小契约封装：保留公开 schema 元组，保证 declaration emit 不依赖 chord 未导出类型。
type Definition = {
	version: number;
	input: TSchema;
	variants: Record<string, { methods?: Record<string, readonly [TSchema, TSchema]> }>;
};
type WireDef<D extends Definition> = {
	version: D["version"];
	input: D["input"];
	variants: {
		[K in keyof D["variants"]]: {
			state: Record<never, never>;
			methods: D["variants"][K]["methods"] extends infer M extends Record<string, readonly [TSchema, TSchema]>
				? { [P in keyof M]: ReturnType<typeof method<M[P][0], M[P][1]>> }
				: Record<never, never>;
		};
	};
};
function contract<const D extends Definition>(name: string, def: D): RemoteContract<WireDef<D>> {
	const variants = Object.fromEntries(
		Object.entries(def.variants).map(([key, value]) => [
			key,
			{
				methods: Object.fromEntries(
					Object.entries(value.methods ?? {}).map(([member, [args, result]]) => [member, method(args, result)]),
				),
			},
		]),
	);
	return remote(name, { ...def, variants } as Parameters<typeof remote>[1]) as RemoteContract<WireDef<D>>;
}

const listenerStateSchema = Type.Union([
	Type.Object({ status: Type.Literal("disabled") }),
	Type.Object({ status: Type.Literal("starting") }),
	Type.Object({
		status: Type.Literal("listening"),
		address: Type.String(),
		port: Type.Integer({ minimum: 1, maximum: 65535 }),
		bindAddress: Type.Optional(Type.String()),
		mode: Type.Optional(Type.Union([Type.Literal("direct"), Type.Literal("wsl-relay")])),
	}),
	Type.Object({ status: Type.Literal("error"), error: Type.String() }),
	Type.Object({ status: Type.Literal("stopping") }),
]);

const adminDeviceSchema = Type.Object({
	deviceId: Type.String(),
	name: Type.String(),
	pairedAt: Type.Integer(),
	lastSeenAt: Type.Integer(),
	online: Type.Boolean(),
});

export const NekoMobileAdmin = contract("neko.mobile-admin", {
	version: 1,
	input: Type.Object({ token: Type.String() }),
	variants: {
		admin: {
			methods: {
				state: [
					Type.Null(),
					Type.Object({
						state: listenerStateSchema,
						candidates: Type.Array(Type.String()),
						port: Type.Integer({ minimum: 1, maximum: 65535 }),
						certificate: Type.Union([
							Type.Object({ fingerprint: Type.String(), expiresAt: Type.Integer() }),
							Type.Null(),
						]),
						devices: Type.Array(adminDeviceSchema),
						lastConnectedAddress: Type.Union([Type.String(), Type.Null()]),
						wsl: Type.Optional(
							Type.Union([
								Type.Object({ interop: Type.Boolean(), error: Type.Union([Type.String(), Type.Null()]) }),
								Type.Null(),
							]),
						),
					}),
				] as const,
				enable: [
					Type.Object({
						address: Type.String(),
						port: Type.Optional(Type.Integer({ minimum: 1, maximum: 65535 })),
					}),
					Type.Object({
						status: Type.Literal("listening"),
						address: Type.String(),
						port: Type.Integer({ minimum: 1, maximum: 65535 }),
						bindAddress: Type.Optional(Type.String()),
						mode: Type.Optional(Type.Union([Type.Literal("direct"), Type.Literal("wsl-relay")])),
					}),
				] as const,
				disable: [Type.Null(), listenerStateSchema] as const,
				createPairing: [Type.Null(), Type.Object({ pairingText: Type.String(), expiresAt: Type.Integer() })] as const,
				cancelPairing: [Type.Null(), Type.Null()] as const,
				revoke: [
					Type.Object({ deviceId: Type.String({ minLength: 1 }) }),
					Type.Object({ revoked: Type.Boolean() }),
				] as const,
				regenerateCertificate: [
					Type.Null(),
					Type.Object({ fingerprint: Type.String(), expiresAt: Type.Integer() }),
				] as const,
			},
		},
	},
});

export type NekoMobileAdminInput = { readonly token: string };
export type NekoMobileAdminHandle = Handle<typeof NekoMobileAdmin>;

function isMobilePrincipal(principal: unknown): boolean {
	return (
		typeof principal === "object" && principal !== null && (principal as Record<string, unknown>).kind === "mobile"
	);
}

function digest(value: string): Buffer {
	return createHash("sha256").update(value, "utf8").digest();
}

async function tokenMatches(token: string, store: MobileStore | undefined): Promise<boolean> {
	if (store === undefined) return false;
	let adminToken: string;
	try {
		adminToken = await store.ensureAdminToken();
	} catch {
		return false;
	}
	const expected = digest(adminToken);
	const provided = digest(token);
	return expected.length === provided.length && timingSafeEqual(expected, provided);
}

export type MobileAdminDeps = {
	readonly mobile: MobileGateway;
	readonly store: MobileStore | undefined;
};

/** Web/脚本等服务端进程读取（首次则安全创建）与 gateway 同一的 admin-token 文件；绝不向浏览器提供。 */
export async function readOrCreateMobileAdminToken(nekoDir: string): Promise<string> {
	return (await MobileStore.open(nekoDir)).ensureAdminToken();
}

/** D5 admin 服务（任务 4.1 完整方法集；createGatewayConnection 不绑定本契约）。 */
export function createMobileAdminFactory(deps: MobileAdminDeps) {
	return (input: NekoMobileAdminInput, principal: unknown) => {
		if (isMobilePrincipal(principal)) throw new ChordError("forbidden", "mobile principals cannot administer pairing");
		const guard = async (): Promise<void> => {
			if (!(await tokenMatches(input.token, deps.store))) throw new ChordError("forbidden", "forbidden");
		};
		return {
			kind: "admin" as const,
			async state() {
				await guard();
				return deps.mobile.adminState();
			},
			async enable(params: { readonly address: string; readonly port?: number }) {
				await guard();
				const state = await deps.mobile.enable({ address: params.address, port: params.port });
				if (state.status !== "listening")
					throw new ChordError("unavailable", `mobile listener failed: ${state.status}`);
				return state;
			},
			async disable() {
				await guard();
				return deps.mobile.disable();
			},
			async createPairing() {
				await guard();
				return deps.mobile.createPairing();
			},
			async cancelPairing() {
				await guard();
				deps.mobile.cancelPairing();
				return null;
			},
			async revoke(params: { readonly deviceId: string }) {
				await guard();
				return { revoked: await deps.mobile.revoke(params.deviceId) };
			},
			async regenerateCertificate() {
				await guard();
				return deps.mobile.regenerateCertificate();
			},
		};
	};
}
