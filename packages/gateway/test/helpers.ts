import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type FauxProviderHandle, fauxAssistantMessage, fauxText } from "@earendil-works/pi-ai";
import { fauxProvider } from "../../../test/faux.ts";
import { type NekoGateway, startGateway } from "../src/index.ts";

export type TestGateway = {
	readonly gateway: NekoGateway;
	readonly dir: string;
	readonly faux: FauxProviderHandle;
	readonly socketPath: string;
	readonly wsUrl: string;
	readonly serverId: string;
};

/** 每个测试一个网关实例：memory 存储 + faux provider + 临时 socket + 随机 WS 端口。 */
export async function makeGateway(): Promise<TestGateway> {
	const dir = await mkdtemp(join(tmpdir(), "neko-gateway-test-"));
	const faux = fauxProvider();
	faux.setResponses([fauxAssistantMessage([fauxText("pong")])]);
	const serverId = randomUUID();
	const socketPath = join(dir, "gateway.sock");
	const gateway = await startGateway({
		storage: "memory",
		socketPath,
		port: 0,
		serverId,
		model: { provider: "faux", modelId: "faux-1" },
		providers: [faux.provider],
	});
	return { gateway, dir, faux, socketPath, wsUrl: gateway.wsUrl ?? "", serverId };
}

export async function cleanup(target: TestGateway): Promise<void> {
	await target.gateway.close().catch(() => {});
	await rm(target.dir, { recursive: true, force: true });
}

/** 轮询直到 predicate 为真；超时给出生动的错误信息。 */
export async function waitFor(predicate: () => boolean, what: string, timeoutMs = 20_000): Promise<void> {
	const start = Date.now();
	for (;;) {
		if (predicate()) return;
		if (Date.now() - start > timeoutMs) throw new Error(`waitFor 超时: ${what}`);
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
}
