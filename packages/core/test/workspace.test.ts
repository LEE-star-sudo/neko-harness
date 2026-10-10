import { afterEach, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import { createNekoRuntime, normalizeWorkspace, projectChatView } from "../src/index.ts";

const dirs: string[] = [];
function directory() {
	const d = realpathSync(mkdtempSync(join(tmpdir(), "neko-workspace-")));
	dirs.push(d);
	return d;
}
afterEach(() => {
	for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const model = { provider: "faux", modelId: "faux-1" };
it("normalizes paths without promoting subdirectories; rejects invalid directories", () => {
	const a = directory();
	mkdirSync(join(a, "sub"));
	symlinkSync(a, join(a, "alias"));
	writeFileSync(join(a, "file"), "x");
	expect(normalizeWorkspace(relative(process.cwd(), a))).toBe(a);
	expect(normalizeWorkspace(join(a, "alias"))).toBe(a);
	expect(normalizeWorkspace(join(a, "sub"))).toBe(join(a, "sub"));
	expect(() => normalizeWorkspace(join(a, "missing"))).toThrow("Workspace");
	expect(() => normalizeWorkspace(join(a, "file"))).toThrow("Workspace");
});
it("persists workspaces and activity, forks empty and populated sessions, and executes tools after reopen", async () => {
	const a = directory(),
		b = directory();
	const storagePath = join(a, "history.sqlite");
	const faux = fauxProvider({ models: [{ id: "faux-1" }, { id: "faux-2" }] });
	const options = { storagePath, providers: [faux.provider], model };
	let runtime = await createNekoRuntime({ ...options, cwd: a });
	try {
		const session = await runtime.createConversation({ cwd: b, thinkingLevel: "high" });
		const empty = await runtime.forkConversation(session.id);
		expect((await runtime.getAgent(empty.id)).cwd).toBe(b);
		expect((await runtime.getAgent(empty.id)).thinkingLevel).toBe("high");
		const before = (await runtime.listConversations()).find((s) => s.id === session.id)!.lastUsedAt;
		faux.setResponses([fauxAssistantMessage([fauxText("ready")])]);
		await session.waitAnswer(await session.submit("hello"));
		const used = (await runtime.listConversations()).find((s) => s.id === session.id)!.lastUsedAt;
		expect(used).toBeGreaterThan(before);
		await runtime.configureConversation(session.id, {
			model: { provider: "faux", modelId: "faux-2" },
			thinkingLevel: "low",
		});
		const fork = await runtime.forkConversation(session.id);
		expect((await runtime.getAgent(fork.id)).cwd).toBe(b);
		expect((await runtime.getAgent(fork.id)).thinkingLevel).toBe("low");
		expect((await runtime.getAgent(fork.id)).model?.modelId).toBe("faux-2");
		await runtime.close();
		runtime = await createNekoRuntime({ ...options, cwd: b });
		expect((await runtime.getAgent()).cwd).toBe(a);
		expect((await runtime.listConversations()).find((s) => s.id === session.id)!.lastUsedAt).toBe(used);
		faux.setResponses([
			fauxAssistantMessage([fauxToolCall("write", { path: "local.txt", content: "before" })], {
				stopReason: "toolUse",
			}),
			fauxAssistantMessage([fauxToolCall("edit", { path: "local.txt", oldText: "before", newText: "after" })], {
				stopReason: "toolUse",
			}),
			fauxAssistantMessage([fauxToolCall("read", { path: "local.txt" })], { stopReason: "toolUse" }),
			fauxAssistantMessage([fauxToolCall("bash", { command: "pwd; cat local.txt" })], { stopReason: "toolUse" }),
			fauxAssistantMessage([fauxToolCall("write", { path: join(a, "outside.txt"), content: "allowed" })], {
				stopReason: "toolUse",
			}),
			fauxAssistantMessage([fauxText("done")]),
		]);
		const reopened = (await runtime.getConversation(session.id))!;
		await reopened.waitAnswer(await reopened.submit("tools"));
		expect(readFileSync(join(b, "local.txt"), "utf8")).toBe("after");
		expect(readFileSync(join(a, "outside.txt"), "utf8")).toBe("allowed");
		const state = await reopened.viewState();
		const view = projectChatView(state.value, "faux/faux-1");
		state.dispose();
		expect(view.cwd).toBe(b);
		const tools = view.items.filter((x) => x.type === "tool");
		expect(tools).toHaveLength(5);
		expect(tools.every((x) => !x.isError)).toBe(true);
		expect(tools.find((x) => x.name === "bash")?.result).toContain(b);
	} finally {
		await runtime.close();
	}
}, 30000);
it("rejects old storage without deleting it, and never rebinds a missing saved directory", async () => {
	const a = directory(),
		b = directory();
	const storagePath = join(a, "history.sqlite");
	const faux = fauxProvider();
	const options = { storagePath, model, providers: [faux.provider] };
	let runtime = await createNekoRuntime({ ...options, cwd: b });
	await runtime.close();
	rmSync(b, { recursive: true });
	runtime = await createNekoRuntime({ ...options, cwd: a });
	expect((await runtime.getAgent()).cwd).toBe(b);
	await expect(runtime.submit("no directory")).rejects.toThrow("Workspace is not available");
	await runtime.conversation.configure({ cwd: "relative-old-path" }, runtime.context);
	await runtime.close();
	await expect(createNekoRuntime({ ...options, cwd: a })).rejects.toThrow("Unsupported session storage");
	expect(readFileSync(storagePath).length).toBeGreaterThan(0);
});
