import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { connectNekoGateway } from "@neko-harness/gateway";
import { connectToGateway } from "../../tui/src/gateway.ts";
import { ensureNekoGateway } from "../../web/src/gateway-spawn.ts";

let dir: string;
let originalKey: string | undefined;
beforeEach(async () => {
	dir = await mkdtemp("/tmp/neko-start-");
	originalKey = process.env.DEEPSEEK_API_KEY;
	// Startup tests never submit a model request. Never forward a real credential.
	process.env.DEEPSEEK_API_KEY = "unused-startup-test";
});
afterEach(async () => {
	if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY;
	else process.env.DEEPSEEK_API_KEY = originalKey;
	await rm(dir, { recursive: true, force: true });
});

async function freePort(): Promise<number> {
	const server = createServer();
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (address === null || typeof address === "string") throw new Error("Missing TCP address");
	await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
	return address.port;
}

describe("Bun gateway startup", () => {
	it("TUI starts, reuses and closes only its own gateway", async () => {
		const options = {
			credentialsPath: join(dir, "credentials.json"),
			storagePath: join(dir, "session.sqlite"),
			configDir: dir,
			spawnTimeoutMs: 5_000,
		};
		const owner = await connectToGateway(options);
		try {
			expect(owner.spawned).toBe(true);
			const reused = await connectToGateway(options);
			expect(reused.spawned).toBe(false);
			await reused.close();
			expect((await owner.client.listModels()).length).toBeGreaterThan(0);
		} finally {
			await owner.close();
		}
		expect(existsSync(owner.socketPath)).toBe(false);
	}, 10_000);

	it("Web uses Bun, forwards options, supports WS reconnect and releases its child", async () => {
		const options = {
			credentialsPath: join(dir, "credentials.json"),
			storagePath: join(dir, "session.sqlite"),
			port: await freePort(),
			cwd: dir,
			model: { provider: "deepseek", modelId: "deepseek-v4-pro" },
			spawnTimeoutMs: 5_000,
		};
		const owner = await ensureNekoGateway(options);
		try {
			expect(owner.spawned?.spawnfile).toBe(process.execPath);
			expect(owner.spawned?.spawnargs).toContain("--conditions=neko-source");
			expect(owner.spawned?.spawnargs).toContain(dir);
			const reused = await ensureNekoGateway(options);
			expect(reused.spawned).toBeNull();
			await reused.close();
			const address = { transport: "ws" as const, url: owner.wsUrl, serverId: owner.serverId };
			const client = await connectNekoGateway(address);
			let created: string;
			try {
				const chat = await client.attach("1");
				expect(chat.view.value?.model).toBe("deepseek/deepseek-v4-pro");
				created = (await client.management.create({}, BACKGROUND_CONTEXT)).id;
			} finally {
				await client.close();
			}
			const reconnected = await connectNekoGateway(address);
			try {
				expect(reconnected.directory.state.value?.sessions.some((session) => session.id === created)).toBe(true);
			} finally {
				await reconnected.close();
			}
		} finally {
			await owner.close();
		}
		expect(existsSync(owner.socketPath)).toBe(false);
		expect(owner.spawned?.exitCode).toBe(0);
		await owner.close();
	}, 10_000);

	it("startup timeout cleans up the child before returning", async () => {
		const socketPath = join(dir, "timeout.sock");
		await expect(
			ensureNekoGateway({
				credentialsPath: join(dir, "credentials.json"),
				storagePath: join(dir, "session.sqlite"),
				socketPath,
				port: await freePort(),
				spawnTimeoutMs: 0,
			}),
		).rejects.toThrow("超时");
		expect(existsSync(socketPath)).toBe(false);
	});

	it("starts a gateway without credentials for frontend configuration", async () => {
		delete process.env.DEEPSEEK_API_KEY;
		const socketPath = join(dir, "unconfigured.sock");
		const connected = await connectToGateway({
			credentialsPath: join(dir, "credentials.json"),
			storagePath: join(dir, "session.sqlite"),
			socketPath,
			configDir: dir,
			spawnTimeoutMs: 3_000,
		});
		expect(existsSync(socketPath)).toBe(true);
		await connected.close();
	});
});
