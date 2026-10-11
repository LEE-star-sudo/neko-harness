import { expect, it } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { connectNekoGateway, startGateway } from "../src/index.ts";
import { testAddress, testSocketPath, waitFor as wait } from "./helpers.ts";

const waitFor = (predicate: () => boolean) => wait(predicate, "credential synchronization");

it("shares private credential state and Pi configuration across Unix and WebSocket, including restart", async () => {
	const dir = await mkdtemp(join(tmpdir(), "neko-credential-gateway-"));
	const old = process.env.DEEPSEEK_API_KEY;
	const oldTavily = process.env.TAVILY_API_KEY;
	delete process.env.DEEPSEEK_API_KEY;
	delete process.env.TAVILY_API_KEY;
	const options = {
		storage: "memory" as const,
		credentialsPath: join(dir, "credentials.json"),
		socketPath: testSocketPath(dir),
		port: 0,
		serverId: crypto.randomUUID(),
	};
	let gateway = await startGateway(options);
	let unix = await connectNekoGateway(testAddress(gateway));
	let web = await connectNekoGateway({ transport: "ws", url: gateway.wsUrl!, serverId: gateway.serverId });
	try {
		await waitFor(() => !!web.credentials.state.value);
		expect(web.credentials.state.value!.statuses.deepseek.source).toBe("none");
		expect(web.credentials.state.value!.statuses.tavily.source).toBe("keyless");
		const initial = (await gateway.runtime.listConversations())[0]!;
		const initialChat = await unix.attach(String(initial.id));
		await expect(initialChat.submit({ content: "no key" }, context)).rejects.toThrow("DEEPSEEK_KEY_REQUIRED");
		expect((await gateway.runtime.listConversations())[0]!.lastMessageAt).toBeNull();
		await unix.detach();
		await unix.credentials.save({ provider: "deepseek", key: "test-private-value" }, context);
		await waitFor(() => web.credentials.state.value?.statuses.deepseek.source === "saved");
		expect(JSON.stringify(web.credentials.state.value)).not.toContain("test-private-value");
		await expect(web.credentials.save({ provider: "deepseek", key: " " }, context)).rejects.toThrow();
		expect(web.credentials.state.value!.statuses.deepseek.source).toBe("saved");
		const contents = await readFile(options.credentialsPath, "utf8");
		const revision = web.credentials.state.value!.revision;
		await writeFile(options.credentialsPath, "invalid-file-test-secret");
		await expect(unix.credentials.save({ provider: "deepseek", key: "test-rejected-secret" }, context)).rejects.toThrow(
			"Internal server error",
		);
		expect(web.credentials.state.value!.revision).toBe(revision);
		expect(await readFile(options.credentialsPath, "utf8")).toBe("invalid-file-test-secret");
		await writeFile(options.credentialsPath, contents);
		const session = await unix.management.create({}, context);
		const a = await unix.attach(session.id),
			b = await web.attach(session.id);
		await waitFor(() => !!b.view.value);
		expect(b.view.value!.agent.thinkingLevel).toBe("high");
		await a.configure({ thinkingLevel: "low" }, context);
		await b.configure({ model: { provider: "deepseek", modelId: "deepseek-v4-pro" } }, context);
		await waitFor(
			() => a.view.value?.agent.model?.modelId === "deepseek-v4-pro" && a.view.value?.agent.thinkingLevel === "high",
		);
		expect((await web.listModels()).find((m) => m.modelId === "deepseek-v4-pro")!.supportedThinkingLevels).toEqual([
			"off",
			"high",
			"max",
		]);
		await unix.close();
		await web.close();
		await gateway.close();
		gateway = await startGateway(options);
		unix = await connectNekoGateway(testAddress(gateway));
		web = await connectNekoGateway({ transport: "ws", url: gateway.wsUrl!, serverId: gateway.serverId });
		await waitFor(() => web.credentials.state.value?.statuses.deepseek.source === "saved");
		process.env.DEEPSEEK_API_KEY = "test-env";
		await web.credentials.remove({ provider: "deepseek" }, context);
		await waitFor(() => unix.credentials.state.value?.statuses.deepseek.source === "environment");
		expect(unix.credentials.state.value!.statuses.deepseek.environmentConfigured).toBe(true);
		await web.credentials.save({ provider: "tavily", key: "test-tavily-value" }, context);
		await waitFor(() => unix.credentials.state.value?.statuses.tavily.source === "saved");
		expect(unix.credentials.state.value!.statuses.deepseek.source).toBe("environment");
		await Promise.all([
			unix.credentials.save({ provider: "deepseek", key: "test-a" }, context),
			web.credentials.save({ provider: "deepseek", key: "test-b" }, context),
		]);
		await waitFor(
			() =>
				unix.credentials.state.value?.revision === web.credentials.state.value?.revision &&
				unix.credentials.state.value?.statuses.deepseek.source === "saved",
		);
	} finally {
		await unix.close();
		await web.close();
		await gateway.close();
		await rm(dir, { recursive: true, force: true });
		if (old === undefined) delete process.env.DEEPSEEK_API_KEY;
		else process.env.DEEPSEEK_API_KEY = old;
		if (oldTavily === undefined) delete process.env.TAVILY_API_KEY;
		else process.env.TAVILY_API_KEY = oldTavily;
	}
});
