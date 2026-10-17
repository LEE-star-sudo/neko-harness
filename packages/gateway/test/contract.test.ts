import { expect, it } from "bun:test";
import { createHost } from "@earendil-works/chord";
import { Value } from "typebox/value";
import {
	ChatViewSchema,
	DirectoryStateSchema,
	GATEWAY_HOST,
	NekoModels,
	NekoSessionDirectory,
} from "../src/contract.ts";

it("validates shared contract results and state before publishing them", async () => {
	const host = createHost({ name: GATEWAY_HOST, self: { kind: "host" }, dev: true, onError() {} });
	host.serve(NekoModels, () => ({ variant: "ready", list: async () => [{ provider: "invalid" }] as never }));
	let invalidState = () => Promise.resolve();
	host.serve(NekoSessionDirectory, (_input, _principal, self) => {
		const state = self.state("state", DirectoryStateSchema, { revision: 1, sessions: [] });
		invalidState = () => host.root((ctx) => state.replace(ctx, { revision: 1, sessions: [{ id: 42 }] } as never));
		return { variant: "ready", state };
	});
	try {
		const [models, directory] = await Promise.all([host.get(NekoModels, {}), host.get(NekoSessionDirectory, {})]);
		const stop = directory.state.subscribe(() => {});
		await expect(models.list(null)).rejects.toMatchObject({ code: "invalid", reason: "result" });
		await expect(invalidState()).rejects.toMatchObject({ code: "invalid", reason: "state" });
		expect(directory.state.value).toEqual({ revision: 1, sessions: [] });
		stop();
	} finally {
		await host.close();
	}
});

it("accepts nullable diff fields on tool items and streaming calls", () => {
	const baseView = {
		model: "deepseek/deepseek-chat",
		agent: { model: null, thinkingLevel: "off" },
		cwd: "/tmp",
		busy: false,
		status: null,
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
		items: [],
		streaming: null,
	};
	const toolItem = {
		type: "tool",
		key: "t1",
		callId: "c1",
		name: "edit",
		summary: "src/a.ts (1 edits)",
		detail: null,
		phase: "done",
		isError: false,
		output: null,
		result: "done",
		durationMs: 12,
		note: null,
		diff: "+ 1 export const a = 1",
		diffAdded: 1,
		diffRemoved: 0,
	};
	const streamCall = {
		callId: "c2",
		name: "write",
		summary: "b.ts",
		detail: null,
		phase: "running",
		output: null,
		diff: null,
		diffAdded: null,
		diffRemoved: null,
	};
	const view = { ...baseView, items: [toolItem], streaming: { thinking: "", text: "", toolCalls: [streamCall] } };
	expect(Value.Check(ChatViewSchema, view)).toBe(true);
	const truncatedView = {
		...view,
		items: [{ ...toolItem, diffTruncated: true }],
		streaming: { ...view.streaming, toolCalls: [{ ...streamCall, diffTruncated: true }] },
	};
	expect(Value.Check(ChatViewSchema, truncatedView)).toBe(true);
	expect(Value.Check(ChatViewSchema, { ...truncatedView, items: [{ ...toolItem, diffTruncated: "true" }] })).toBe(
		false,
	);
	// Fields are required-nullable: omitting them on a tool item is a contract violation.
	const missingDiff = {
		...view,
		items: [Object.fromEntries(Object.entries(toolItem).filter(([key]) => key !== "diff"))],
	};
	expect(Value.Check(ChatViewSchema, missingDiff)).toBe(false);
});
