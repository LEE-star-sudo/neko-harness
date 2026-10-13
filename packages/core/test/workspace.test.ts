import { afterEach, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fauxAssistantMessage, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import { fauxProvider } from "../../../test/faux.ts";
import { InMemoryCredentialStore } from "../src/credentials.ts";
import { createNekoRuntime, normalizeWorkspace, projectChatView } from "../src/index.ts";

import { SessionMetadataDoc } from "../src/session-metadata.ts";

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
	const faux = fauxProvider({
		models: [
			{ id: "faux-1", reasoning: true },
			{ id: "faux-2", reasoning: true },
		],
	});
	const options = { storagePath, providers: [faux.provider], model };
	let runtime = await createNekoRuntime({ credentials: new InMemoryCredentialStore(), ...options, cwd: a });
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
		runtime = await createNekoRuntime({ credentials: new InMemoryCredentialStore(), ...options, cwd: b });
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
	let runtime = await createNekoRuntime({ credentials: new InMemoryCredentialStore(), ...options, cwd: b });
	await runtime.close();
	rmSync(b, { recursive: true });
	runtime = await createNekoRuntime({ credentials: new InMemoryCredentialStore(), ...options, cwd: a });
	expect((await runtime.getAgent()).cwd).toBe(b);
	await expect(runtime.submit("no directory")).rejects.toThrow("Workspace is not available");
	await runtime.conversation.configure({ cwd: "relative-old-path" }, runtime.context);
	await runtime.close();
	await expect(createNekoRuntime({ credentials: new InMemoryCredentialStore(), ...options, cwd: a })).rejects.toThrow(
		"Unsupported session storage",
	);
	expect(readFileSync(storagePath).length).toBeGreaterThan(0);
});

it("registers independent workspaces across restart, archives and forks", async () => {
	const a = directory(),
		b = directory();
	mkdirSync(join(b, "sub"));
	symlinkSync(b, join(a, "link"));
	const faux = fauxProvider();
	const options = { storagePath: join(a, "registry.sqlite"), cwd: a, providers: [faux.provider], model };
	let runtime = await createNekoRuntime(options);
	try {
		await Promise.all([runtime.addWorkspace(b), runtime.addWorkspace(join(a, "link"))]);
		await runtime.addWorkspace(join(b, "sub"));
		expect((await runtime.listConversations()).length).toBe(1);
		expect((await runtime.listWorkspaces()).map((w) => w.path).sort()).toEqual([a, b, join(b, "sub")].sort());
		const child = await runtime.forkConversation(runtime.root.id);
		await runtime.archiveConversation(child.id);
		await runtime.archiveConversation(runtime.root.id);
		await runtime.close();
		rmSync(join(b, "sub"), { recursive: true });
		runtime = await createNekoRuntime(options);
		expect(await runtime.listConversations()).toEqual([]);
		expect((await runtime.listWorkspaces()).length).toBe(3);
		await expect(runtime.addWorkspace(join(b, "sub"))).rejects.toThrow("Workspace");
	} finally {
		await runtime.close();
	}
});

it("rejects archived sessions without new metadata and preserves storage", async () => {
	const a = directory(),
		b = directory();
	const faux = fauxProvider();
	const options = { storagePath: join(a, "backfill.sqlite"), cwd: a, providers: [faux.provider], model };
	const runtime = await createNekoRuntime(options);
	try {
		const older = await runtime.harness.createConversation(
			{ ownership: { kind: "ownerless" }, agent: { model, cwd: b } },
			runtime.context,
		);
		await runtime.harness.commit(async (tx) => {
			(await tx.doc(SessionMetadataDoc, older.id)).createdAt = 0;
		}, runtime.context);
		await runtime.archiveConversation(older.id);
		expect((await runtime.listWorkspaces()).map((w) => w.path)).toEqual([a]);
		await runtime.close();
		rmSync(b, { recursive: true });
		await expect(createNekoRuntime(options)).rejects.toThrow("Unsupported session metadata");
		expect(readFileSync(options.storagePath).length).toBeGreaterThan(0);
	} finally {
		await runtime.close();
	}
});
