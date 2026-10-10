// 单实例约束（design Risks）：地址被活跃网关占用时拒绝启动并给出可操作的提示。
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startGateway } from "../src/index.ts";
import { cleanup, makeGateway, type TestGateway } from "./helpers.ts";

let target: TestGateway;

beforeEach(async () => {
	target = await makeGateway();
});

afterEach(async () => {
	await cleanup(target);
});

describe("single-instance constraint", () => {
	it("refuses to start when the unix socket is owned by a live gateway", async () => {
		let message = "";
		try {
			await startGateway({
				storage: "memory",
				socketPath: target.socketPath,
				port: 0,
				serverId: randomUUID(),
				model: { provider: "faux", modelId: "faux-1" },
				providers: [target.faux.provider],
			});
		} catch (error) {
			message = error instanceof Error ? error.message : String(error);
		}
		expect(message).toMatch(/already running/);
		// 提示如何连接已有实例。
		expect(message).toContain(target.socketPath);
	}, 30_000);

	it("derives the live serverId in the hint when the socket is named <serverId>.sock", async () => {
		// socket 命名为 <serverId>.sock 时（默认命名规则），提示中给出可推导的 serverId。
		// macOS sun_path 上限约 104 字符，/var/folders 下的长临时目录会触发 connect EINVAL，
		// 故本用例用短路径 /tmp（真实路径 /private/tmp 仍远低于上限）。
		const shortDir = await mkdtemp("/tmp/neko-si-");
		const liveServerId = randomUUID();
		const livePath = join(shortDir, `${liveServerId}.sock`);
		const live = await startGateway({
			storage: "memory",
			socketPath: livePath,
			port: 0,
			serverId: randomUUID(),
			model: { provider: "faux", modelId: "faux-1" },
			providers: [target.faux.provider],
		});
		try {
			let message = "";
			try {
				await startGateway({
					storage: "memory",
					socketPath: livePath,
					port: 0,
					serverId: randomUUID(),
					model: { provider: "faux", modelId: "faux-1" },
					providers: [target.faux.provider],
				});
			} catch (error) {
				message = error instanceof Error ? error.message : String(error);
			}
			expect(message).toMatch(/already running/);
			expect(message).toContain(liveServerId);
		} finally {
			await live.close();
			await rm(shortDir, { recursive: true, force: true });
		}
	}, 30_000);

	it("refuses to start when the ws port is taken", async () => {
		const port = target.gateway.port;
		expect(port).toBeDefined();
		let message = "";
		try {
			await startGateway({
				storage: "memory",
				socketPath: `${target.dir}/other.sock`,
				port,
				serverId: randomUUID(),
				model: { provider: "faux", modelId: "faux-1" },
				providers: [target.faux.provider],
			});
		} catch (error) {
			message = error instanceof Error ? error.message : String(error);
		}
		expect(message).toMatch(/EADDRINUSE/);
	}, 30_000);
});
