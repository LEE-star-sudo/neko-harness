import { expect, it } from "bun:test";
import { fauxAssistantMessage, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import { totalUsage } from "@neko-harness/core";
import { connectNekoGateway } from "../src/index.ts";
import { cleanup, makeGateway, testAddress, waitFor } from "./helpers.ts";

it("publishes child history through a read-only service and rejects stale attachment", async () => {
	const target = await makeGateway();
	target.faux.setResponses([
		fauxAssistantMessage([fauxToolCall("subagent", { type: "explore", title: "Inspect", task: "Inspect files" })], {
			stopReason: "toolUse",
		}),
		fauxAssistantMessage([fauxText("Child report")]),
		fauxAssistantMessage([fauxText("Main report")]),
	]);
	const client = await connectNekoGateway(testAddress(target));
	let stop = () => {};
	try {
		const chat = await client.attach(String(target.gateway.runtime.root.id));
		await chat.submit({ content: "Investigate" });
		await waitFor(() => chat.view.value?.subagents?.[0]?.status === "completed", "delegation complete");
		const entry = chat.view.value!.subagents![0]!;
		const child = client.subagent(entry.taskId);
		stop = child.view.subscribe(() => {});
		await waitFor(
			() => child.view.value?.items.some((i) => i.type === "assistant" && i.text === "Child report") ?? false,
			"child report",
		);
		expect(child.view.value!.items.some((i) => i.type === "user" && i.text === "Inspect files")).toBe(true);
		expect(JSON.stringify(await child.history({}))).toContain("Child report");
		expect("submit" in child).toBe(false);
		const global = totalUsage(await target.gateway.runtime.globalUsage());
		expect(chat.view.value!.taskUsage?.input).toBe(global.input);
		expect(chat.view.value!.taskUsage?.output).toBe(global.output);
		const other = await connectNekoGateway(testAddress(target));
		try {
			await expect(other.attach(String(entry.childId))).rejects.toThrow();
			const session = await target.gateway.runtime.createConversation();
			await other.attach(String(session.id));
			await expect(other.subagent(entry.taskId).history({})).rejects.toThrow();
		} finally {
			await other.close();
		}
		await client.detach();
		await expect(child.history({})).rejects.toThrow();
	} finally {
		stop();
		await client.close();
		await cleanup(target);
	}
}, 30000);

it("pages a long multi-tool transcript, transfers large text in chunks, and preserves fork read-only boundaries", async () => {
	const target = await makeGateway();
	const report = "完整报告".repeat(50000);
	target.faux.setResponses([
		fauxAssistantMessage(
			[fauxToolCall("subagent", { type: "explore", title: "Long investigation", task: "Inspect missing evidence" })],
			{ stopReason: "toolUse" },
		),
		...Array.from({ length: 55 }, (_, i) =>
			fauxAssistantMessage([fauxToolCall("read", { path: `/nonexistent-neko-evidence-${i}` }, { id: `read-${i}` })], {
				stopReason: "toolUse",
			}),
		),
		fauxAssistantMessage(report),
		fauxAssistantMessage("Main summary"),
	]);
	const client = await connectNekoGateway(testAddress(target));
	let stop = () => {};
	try {
		const chat = await client.attach(String(target.gateway.runtime.root.id));
		await chat.submit({ content: "Long investigation" });
		await waitFor(() => chat.view.value?.subagents?.[0]?.status === "completed", "long child complete");
		const entry = chat.view.value!.subagents![0]!;
		const child = client.subagent(entry.taskId);
		stop = child.view.subscribe(() => {});
		await waitFor(
			() => child.view.value?.items.some((i) => i.type === "assistant" && i.text === report) ?? false,
			"full chunked report",
		);
		const items = new Map<string, import("@neko-harness/core").ChatItem>();
		let before: number | undefined;
		let pages = 0;
		for (;;) {
			const page = await child.history({ before });
			pages++;
			for (const item of page.items) items.set(item.key, item);
			if (page.next === null) break;
			before = page.next;
		}
		expect(pages).toBeGreaterThan(1);
		const tools = [...items.values()].filter((i) => i.type === "tool");
		expect(tools).toHaveLength(55);
		for (const tool of tools) {
			expect(tool.phase).toBe("done");
			expect(tool.detail ?? tool.summary).toContain("nonexistent-neko-evidence");
		}
		const fork = await target.gateway.runtime.forkConversation(target.gateway.runtime.root.id);
		stop();
		await client.attach(String(fork.id));
		const historical = client.subagent(entry.taskId);
		stop = historical.view.subscribe(() => {});
		await waitFor(
			() => historical.view.value?.items.some((i) => i.type === "assistant" && i.text === report) ?? false,
			"fork history",
		);
		await expect(historical.stop(null)).rejects.toThrow();
		await expect(historical.getImage({ entryId: 999999, contentIndex: 0, offset: 0 })).rejects.toThrow();
	} finally {
		stop();
		await client.close();
		await cleanup(target);
	}
}, 30000);

it("shares one native child observer across clients and releases it after both close", async () => {
	const target = await makeGateway();
	target.faux.setResponses([
		fauxAssistantMessage([fauxToolCall("subagent", { type: "explore", title: "Shared", task: "Inspect" })], {
			stopReason: "toolUse",
		}),
		fauxAssistantMessage("Shared report"),
		fauxAssistantMessage("Main report"),
	]);
	await target.gateway.runtime.waitAnswer(await target.gateway.runtime.submit("Inspect"));
	const clients = await Promise.all([connectNekoGateway(testAddress(target)), connectNekoGateway(testAddress(target))]);
	const stops: (() => void)[] = [];
	let opened = 0,
		closed = 0;
	const harness = target.gateway.runtime.harness;
	const original = harness.conversation.bind(harness);
	harness.conversation = async (id, ctx) => {
		const child = await original(id, ctx);
		if (!child || id === target.gateway.runtime.root.id) return child;
		return new Proxy(child, {
			get(object, key) {
				if (key === "viewState")
					return async (...args: Parameters<typeof child.viewState>) => {
						opened++;
						const view = await child.viewState(...args);
						return new Proxy(view, {
							get(target, property) {
								if (property === "dispose")
									return () => {
										closed++;
										view.dispose();
									};
								const value = Reflect.get(target, property);
								return typeof value === "function" ? value.bind(target) : value;
							},
						});
					};
				const value = Reflect.get(object, key);
				return typeof value === "function" ? value.bind(object) : value;
			},
		});
	};
	try {
		const chats = await Promise.all(clients.map((c) => c.attach(String(target.gateway.runtime.root.id))));
		for (const [i, chat] of chats.entries()) {
			const child = clients[i]!.subagent(chat.view.value!.subagents![0]!.taskId);
			stops.push(child.view.subscribe(() => {}));
			await waitFor(
				() =>
					child.view.value?.items.some((item) => item.type === "assistant" && item.text === "Shared report") ?? false,
				"shared child",
			);
		}
		expect(opened).toBe(1);
		stops[0]!();
		expect(closed).toBe(0);
		stops[1]!();
		await waitFor(() => closed === 1, "child subscription release");
	} finally {
		for (const stop of stops) stop();
		await Promise.all(clients.map((c) => c.close()));
		await cleanup(target);
	}
}, 30000);

it("reads child tool images in chunks and rejects parent/child cross reads", async () => {
	const { defineExtension, defineTool } = await import("@earendil-works/pi-durable");
	const { Type } = await import("typebox");
	const { downloadImage } = await import("@neko-harness/core/image-transfer");
	const target = await makeGateway();
	const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
	target.gateway.runtime.installExtension(
		defineExtension({
			name: "fixture-image",
			tools: [
				defineTool({
					name: "fixture_image",
					description: "Return image",
					parameters: Type.Object({}),
					execute: async () => ({ output: [{ type: "image", mimeType: "image/png", data: png }] }),
				}),
			],
		}),
	);
	target.faux.setResponses([
		fauxAssistantMessage([fauxToolCall("subagent", { type: "coder", title: "Image", task: "Inspect image" })], {
			stopReason: "toolUse",
		}),
		fauxAssistantMessage([fauxToolCall("fixture_image", {})], { stopReason: "toolUse" }),
		fauxAssistantMessage("Image report"),
		fauxAssistantMessage("Main report"),
	]);
	const client = await connectNekoGateway(testAddress(target));
	let stop = () => {};
	try {
		const chat = await client.attach(String(target.gateway.runtime.root.id));
		await chat.submit({ content: "Inspect image" });
		await waitFor(() => chat.view.value?.subagents?.[0]?.status === "completed", "image child");
		const child = client.subagent(chat.view.value!.subagents![0]!.taskId);
		stop = child.view.subscribe(() => {});
		await waitFor(
			() => child.view.value?.items.some((i) => i.type === "tool" && !!i.images?.length) ?? false,
			"tool image metadata",
		);
		const item = child.view.value!.items.find((i) => i.type === "tool" && i.images?.length)!;
		if (item.type !== "tool") throw new Error("missing image");
		const image = item.images![0]!;
		const file = await downloadImage((offset) =>
			child.getImage({ entryId: image.entryId, contentIndex: image.contentIndex, offset }),
		);
		expect(Buffer.from(file.bytes).toString("base64")).toBe(png);
		expect(JSON.stringify(child.view.value)).not.toContain(png);
		await expect(
			chat.getImage({ entryId: image.entryId, contentIndex: image.contentIndex, offset: 0 }),
		).rejects.toThrow();
		const parent = chat.view.value!.items.find((i) => i.type === "user")!;
		if (parent.type !== "user") throw new Error("missing parent input");
		await expect(child.getImage({ entryId: parent.id, contentIndex: 0, offset: 0 })).rejects.toThrow();
	} finally {
		stop();
		await client.close();
		await cleanup(target);
	}
}, 30000);

it("stops one live child through the read-only service while its siblings continue", async () => {
	const target = await makeGateway();
	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	target.faux.setResponses([
		fauxAssistantMessage(
			Array.from({ length: 3 }, (_, i) =>
				fauxToolCall("subagent", { type: "explore", title: `Child ${i}`, task: `Task ${i}` }),
			),
			{ stopReason: "toolUse" },
		),
		...Array.from(
			{ length: 3 },
			() => async (_ctx: unknown, options: import("@earendil-works/pi-ai").SimpleStreamOptions | undefined) => {
				await Promise.race([
					gate,
					new Promise<void>((resolve) => {
						if (options?.signal?.aborted) resolve();
						else options?.signal?.addEventListener("abort", () => resolve(), { once: true });
					}),
				]);
				return fauxAssistantMessage("child report", { stopReason: options?.signal?.aborted ? "aborted" : "stop" });
			},
		),
		fauxAssistantMessage("integrated"),
	]);
	const client = await connectNekoGateway(testAddress(target));
	try {
		const chat = await client.attach(String(target.gateway.runtime.root.id));
		await chat.submit({ content: "Investigate" });
		await waitFor(
			() => chat.view.value?.subagents?.filter((d) => d.status === "running").length === 3,
			"three children",
		);
		const child = client.subagent(chat.view.value!.subagents![0]!.taskId);
		await child.stop(null);
		await waitFor(
			() => chat.view.value?.subagents?.filter((d) => d.status === "cancelled").length === 1,
			"one stopped",
		);
		expect(chat.view.value!.subagents!.filter((d) => d.status === "running")).toHaveLength(2);
		release();
		await waitFor(
			() => chat.view.value?.subagents?.filter((d) => d.status === "completed").length === 2,
			"siblings complete",
		);
	} finally {
		release();
		await client.close();
		await cleanup(target);
	}
}, 30000);
