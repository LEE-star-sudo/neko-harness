// Pi 1.3 acceptance: upstream behavior changes neko relies on and must not regress or patch around.

import { expect, it } from "bun:test";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AssistantMessage, fauxAssistantMessage, fauxText, type Message } from "@earendil-works/pi-ai";
import { transformMessages } from "@earendil-works/pi-ai/api/transform-messages";
import { deepseekProvider } from "@earendil-works/pi-ai/providers/deepseek";
import { fauxProvider } from "../../../test/faux.ts";
import { createNekoRuntime, projectChatView } from "../src/index.ts";

const usage = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

it("sends another model's thinking neither as text nor at all, and leaves stored history untouched", () => {
	const models = deepseekProvider().getModels();
	const flash = models.find((m) => m.id === "deepseek-flash")!;
	const pro = models.find((m) => m.id === "deepseek-v4-pro")!;
	const history = [
		{ role: "user", content: "hi", timestamp: 1 },
		{
			role: "assistant",
			content: [
				{ type: "thinking", thinking: "secret reasoning" },
				{ type: "text", text: "answer" },
			],
			api: flash.api,
			provider: flash.provider,
			model: flash.id,
			usage,
			stopReason: "stop",
			timestamp: 2,
		},
	] as Message[];
	const stored = structuredClone(history);

	const switched = transformMessages(history, pro)[1] as AssistantMessage;
	expect(switched.content).toEqual([{ type: "text", text: "answer" }]);
	expect(JSON.stringify(switched)).not.toContain("secret reasoning");
	expect(history).toEqual(stored);

	const same = transformMessages(history, flash)[1] as AssistantMessage;
	expect(same.content.map((block) => block.type)).toEqual(["thinking", "text"]);
});

it("fails a tool call with malformed arguments before running it and shows the model what it sent", async () => {
	const dir = await mkdtemp(join(tmpdir(), "neko-args-error-"));
	const faux = fauxProvider();
	const sent = String.raw`{"path":"never.txt","content":"\usepackage`;
	faux.setResponses([
		fauxAssistantMessage(
			[{ type: "toolCall", id: "call-bad", name: "write", arguments: {}, argumentsError: `Invalid JSON: ${sent}` }],
			{ stopReason: "toolUse" },
		),
		fauxAssistantMessage([fauxText("understood")]),
	]);
	const runtime = await createNekoRuntime({
		storage: "memory",
		cwd: dir,
		providers: [faux.provider],
		model: { provider: "faux", modelId: "faux-1" },
	});
	try {
		await runtime.waitAnswer(await runtime.submit("write it"));
		const state = await runtime.viewState();
		const tool = projectChatView(state.value, "test")
			.items.filter((item) => item.type === "tool")
			.at(-1)!;
		state.dispose();
		expect(tool.type === "tool" && tool.isError).toBe(true);
		expect(JSON.stringify(tool)).toContain("usepackage");
		await expect(stat(join(dir, "never.txt"))).rejects.toThrow();
	} finally {
		await runtime.close();
		await rm(dir, { recursive: true, force: true });
	}
}, 15000);
