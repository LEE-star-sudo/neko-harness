import { expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NekoSelectableModel } from "@neko-harness/core";
import { startGateway } from "../../gateway/src/gateway.ts";
import { waitFor } from "../../gateway/test/helpers.ts";
import { GatewayConnection } from "../src/client/lib/gateway.ts";

it("refetches the selectable models when provider enablement or keys change", async () => {
	const dir = await mkdtemp(join(tmpdir(), "neko-web-models-"));
	const previous = process.env.OPENROUTER_API_KEY;
	delete process.env.OPENROUTER_API_KEY;
	const gateway = await startGateway({
		storage: "memory",
		storagePath: join(dir, "db.sqlite"),
		credentialsPath: join(dir, "credentials.json"),
		port: 0,
	});
	let models: readonly NekoSelectableModel[] = [];
	const connection = new GatewayConnection({
		url: gateway.wsUrl!,
		serverId: gateway.serverId,
		workspaceRoot: dir,
		events: {
			onPhase: () => {},
			onError: () => {},
			onDirectory: () => {},
			onWorkspaces: () => {},
			onWorkspace: () => {},
			onOperation: () => {},
			onModels: (value) => {
				models = value;
			},
			onSessionChange: () => {},
			onView: () => {},
		},
	});
	const providers = () => new Set(models.map((m) => m.provider));
	try {
		await connection.start();
		await waitFor(() => models.length > 0, "initial models");
		expect(providers()).toEqual(new Set(["deepseek"]));
		await connection.setProviderEnabled("openrouter", true);
		await waitFor(() => providers().has("openrouter"), "openrouter models");
		expect(models.filter((m) => m.provider === "openrouter").every((m) => !m.available)).toBe(true);
		await connection.saveCredential("openrouter", "test-openrouter");
		await waitFor(
			() =>
				models.some((m) => m.provider === "openrouter") &&
				models.filter((m) => m.provider === "openrouter").every((m) => m.available),
			"openrouter available",
		);
		await connection.setProviderEnabled("openrouter", false);
		await waitFor(() => !providers().has("openrouter"), "openrouter hidden");
		await expect(connection.setProviderEnabled("deepseek", false)).rejects.toThrow();
	} finally {
		connection.dispose();
		await gateway.close();
		await rm(dir, { recursive: true, force: true });
		if (previous !== undefined) process.env.OPENROUTER_API_KEY = previous;
	}
});
