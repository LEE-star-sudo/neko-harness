import { expect, it } from "bun:test";
import type { ConversationView } from "@earendil-works/pi-durable";
import { type ChatItem, projectChatView } from "../src/projection.ts";

type ToolChatItem = Extract<ChatItem, { type: "tool" }>;

const USAGE = { totalTokens: 10, input: 8, output: 2, cacheRead: 0, cacheWrite: 0 };

function assistantWithToolCall(id: number, callId: string, name: string, args: unknown) {
	return {
		id,
		kind: "pi.assistant",
		model: [
			{
				role: "assistant",
				content: [{ type: "toolCall", id: callId, name, arguments: args }],
				stopReason: "toolUse",
				usage: USAGE,
			},
		],
	};
}

function toolResult(id: number, callId: string, toolName: string, details?: unknown) {
	return {
		id,
		kind: "pi.tool-result",
		model: [
			{
				role: "toolResult",
				toolCallId: callId,
				toolName,
				content: [{ type: "text", text: "done" }],
				isError: false,
				timestamp: 0,
				...(details === undefined ? {} : { details }),
			},
		],
	};
}

const BASE_DOCS = { "pi.agent": { cwd: "/work/demo" } };

function makeView(entries: unknown[], docs: Record<string, unknown> = BASE_DOCS): ConversationView {
	return { docs, entries } as unknown as ConversationView;
}

function toolItems(entries: unknown[], docs?: Record<string, unknown>): ToolChatItem[] {
	return projectChatView(makeView(entries, docs), "test/model").items.filter(
		(item): item is ToolChatItem => item.type === "tool",
	);
}

it("passes through edit details.diff and counts added/removed lines", () => {
	const diff = [
		'  1 import { a } from "x"',
		"- 2 export const old = 1",
		"- 3 const tail = true",
		"+++ synthetic header excluded from counts",
		"--- synthetic header excluded from counts",
		"+ 2 export const next = 2",
		"+ 3 const tail = false",
	].join("\n");
	const [item] = toolItems([
		assistantWithToolCall(1, "c1", "edit", { path: "src/a.ts", edits: [{ oldText: "x", newText: "y" }] }),
		toolResult(2, "c1", "edit", { diff, patch: "...", firstChangedLine: 2 }),
	]);
	expect(item?.diff).toBe(diff);
	expect(item?.diffAdded).toBe(2);
	expect(item?.diffRemoved).toBe(2);
});

it("synthesizes an all-added diff for write from its content argument", () => {
	const [item] = toolItems([
		assistantWithToolCall(1, "c2", "write", { path: "a.ts", content: "one\ntwo\nthree" }),
		toolResult(2, "c2", "write"),
	]);
	expect(item?.diff).toBe("+ one\n+ two\n+ three");
	expect(item?.diffAdded).toBe(3);
	expect(item?.diffRemoved).toBe(0);
	expect(item?.diffTruncated).toBe(false);
});

it("drops the trailing newline line and empties for write content", () => {
	const [item] = toolItems([
		assistantWithToolCall(1, "c3", "write", { path: "a.ts", content: "one\ntwo\n" }),
		toolResult(2, "c3", "write"),
	]);
	expect(item?.diff).toBe("+ one\n+ two");
	expect(item?.diffAdded).toBe(2);
	expect(item?.diffRemoved).toBe(0);
});

it("truncates synthesized write diffs beyond the line cap", () => {
	const content = Array.from({ length: 2100 }, (_, i) => `line ${i}`).join("\n");
	const [item] = toolItems([
		assistantWithToolCall(1, "c4", "write", { path: "a.ts", content }),
		toolResult(2, "c4", "write"),
	]);
	expect(item?.diff?.split("\n")).toHaveLength(2000);
	expect(item?.diff?.startsWith("+ line 0\n")).toBe(true);
	expect(item?.diffAdded).toBe(2000);
	expect(item?.diffRemoved).toBe(0);
	expect(item?.diffTruncated).toBe(true);
	expect(item?.detail).toBe(`a.ts\n${content}`);
});

it("bounds a 9 MiB single-line write without duplicating it in the payload", () => {
	const content = "x".repeat(9 * 1024 * 1024);
	const view = projectChatView(
		makeView([assistantWithToolCall(1, "big", "write", { path: "big.txt", content }), toolResult(2, "big", "write")]),
		"test/model",
	);
	const item = view.items.find((item) => item.type === "tool");
	expect(item).toMatchObject({ diff: "", diffAdded: 0, diffRemoved: 0, diffTruncated: true });
	if (item?.type !== "tool") throw new Error("missing write card");
	expect(item.detail).toBe(`big.txt\n${content}`);
	expect(Buffer.byteLength(JSON.stringify(view))).toBeLessThan(16 * 1024 * 1024);
});

it("budgets UTF-8 bytes including diff prefixes and separators, retaining complete lines", () => {
	for (const content of ["x".repeat(65534), "x".repeat(65535), `${"猫".repeat(20000)}\n${"猫".repeat(2000)}`]) {
		const [item] = toolItems([assistantWithToolCall(1, "bytes", "write", { path: "big.txt", content })]);
		expect(Buffer.byteLength(item?.diff ?? "")).toBeLessThanOrEqual(65536);
		if (content.length === 65534) {
			expect(item).toMatchObject({ diff: `+ ${content}`, diffAdded: 1, diffTruncated: false });
		} else if (content.length === 65535) {
			expect(item).toMatchObject({ diff: "", diffAdded: 0, diffTruncated: true });
		} else {
			expect(item).toMatchObject({ diff: `+ ${"猫".repeat(20000)}`, diffAdded: 1, diffTruncated: true });
		}
		expect(item?.detail).toBe(`big.txt\n${content}`);
	}
});

it("marks exact line limits and empty writes as complete", () => {
	for (const content of ["", "\n", `${"line\n".repeat(2000)}`]) {
		const [item] = toolItems([assistantWithToolCall(1, "complete", "write", { path: "a.txt", content })]);
		expect(item?.diffTruncated).toBe(false);
		expect(item?.diffAdded).toBe(content === "" ? 0 : content === "\n" ? 1 : 2000);
	}
});

it("propagates truncation on streaming writes", () => {
	const content = "x".repeat(65535);
	const view = projectChatView(
		makeView([], {
			...BASE_DOCS,
			"pi.live": {
				generation: { message: assistantWithToolCall(1, "stream", "write", { path: "a.txt", content }).model[0] },
			},
		}),
		"test/model",
	);
	expect(view.streaming?.toolCalls[0]).toMatchObject({
		diff: "",
		diffAdded: 0,
		diffTruncated: true,
		detail: `a.txt\n${content}`,
	});
});

it("falls back to null diff when edit details are missing or malformed", () => {
	const project = (details?: unknown) =>
		toolItems([
			assistantWithToolCall(1, "c5", "edit", { path: "a.ts", edits: [{ oldText: "x", newText: "y" }] }),
			toolResult(2, "c5", "edit", details),
		])[0];
	for (const details of [undefined, { patch: "..." }, "not-an-object", { diff: 42 }, null]) {
		expect(project(details)).toMatchObject({ diff: null, diffAdded: null, diffRemoved: null });
	}
});

it("leaves diff fields null for tools other than edit/write", () => {
	const [item] = toolItems([
		assistantWithToolCall(1, "c6", "bash", { command: "ls" }),
		toolResult(2, "c6", "bash", { diff: "ignored for non-edit tools" }),
	]);
	expect(item).toMatchObject({ diff: null, diffAdded: null, diffRemoved: null });
});

it("synthesizes write diff on cards for calls that never ran", () => {
	const [item] = toolItems([
		{
			id: 1,
			kind: "pi.assistant",
			model: [
				{
					role: "assistant",
					content: [{ type: "toolCall", id: "c7", name: "write", arguments: { path: "a.ts", content: "x" } }],
					stopReason: "stop",
					usage: USAGE,
				},
			],
		},
	]);
	expect(item?.diff).toBe("+ x");
	expect(item?.diffAdded).toBe(1);
	expect(item?.diffRemoved).toBe(0);
	expect(item?.note).toBe("Not run: response interrupted.");
});

it("fills streaming call diff fields (write synthesized, others null)", () => {
	const view = projectChatView(
		makeView([], {
			"pi.agent": { cwd: "/work/demo" },
			"pi.live": {
				generation: {
					attempt: 0,
					message: {
						role: "assistant",
						content: [
							{ type: "toolCall", id: "c8", name: "write", arguments: { path: "a.ts", content: "hi" } },
							{ type: "toolCall", id: "c9", name: "edit", arguments: { path: "a.ts", edits: [] } },
						],
						stopReason: "toolUse",
						usage: USAGE,
					},
				},
				tools: [
					{ callId: "c8", name: "write", status: "running", output: "writing" },
					{ callId: "c9", name: "edit", status: "pending" },
				],
			},
		}),
		"test/model",
	);
	expect(view.streaming?.toolCalls[0]).toMatchObject({
		diff: "+ hi",
		diffAdded: 1,
		diffRemoved: 0,
		phase: "running",
	});
	expect(view.streaming?.toolCalls[1]).toMatchObject({
		diff: null,
		diffAdded: null,
		diffRemoved: null,
		phase: "pending",
	});
});
