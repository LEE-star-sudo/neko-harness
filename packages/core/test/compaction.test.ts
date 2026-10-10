import { expect, it } from "bun:test";
import { fauxAssistantMessage, fauxText } from "@earendil-works/pi-ai";
import { fauxProvider } from "../../../test/faux.ts";
import { CompactionDoc } from "../src/compaction.ts";
import { createNekoRuntime } from "../src/runtime.ts";

it("uses native compaction, distinguishes no-op and applied, preserves recency", async () => {
	const faux = fauxProvider({ models: [{ id: "compact", contextWindow: 1000000 }] });
	faux.setResponses(Array.from({ length: 12 }, () => fauxAssistantMessage([fauxText("Summary or answer")])));
	const runtime = await createNekoRuntime({
		storage: "memory",
		model: { provider: "faux", modelId: "compact" },
		providers: [faux.provider],
	});
	const result = async (phase: string) => {
		for (let i = 0; i < 200; i++) {
			const doc = await runtime.harness.snapshot(CompactionDoc, runtime.root.id, runtime.context);
			if (doc?.latest?.phase === phase) return doc.latest;
			await Bun.sleep(10);
		}
		throw new Error(`No ${phase} result`);
	};
	try {
		await runtime.root.compact();
		await result("nothing");
		await runtime.waitAnswer(await runtime.submit(`first ${"a".repeat(90000)}`));
		await runtime.waitAnswer(await runtime.submit(`second ${"b".repeat(90000)}`));
		const before = (await runtime.listConversations())[0]!;
		await Promise.all([runtime.root.compact("Keep the task"), runtime.root.compact("Keep the task")]);
		await result("applied");
		expect((await runtime.listConversations())[0]!.lastMessageAt).toBe(before.lastMessageAt);
		expect((await runtime.root.conversation.context(runtime.context)).head?.kind).toBe("pi.compaction");
	} finally {
		await runtime.close();
	}
}, 15000);

for (const [label, extra, expectedBlocking] of [
	["background", 40000, false],
	["blocking", 300000, true],
] as const) {
	it(`keeps native ${label} thresholds`, async () => {
		const faux = fauxProvider({ models: [{ id: "threshold", contextWindow: 100000 }] });
		faux.setResponses(Array.from({ length: 20 }, () => fauxAssistantMessage([fauxText("ok")])));
		const runtime = await createNekoRuntime({
			storage: "memory",
			model: { provider: "faux", modelId: "threshold" },
			providers: [faux.provider],
		});
		const states: { blocking: boolean; reason: string }[] = [];
		const stop = runtime.harness.subscribeCommits(({ changes }) => {
			for (const c of changes)
				if (c.type === "document" && c.record.kind === "pi.live")
					for (const status of (c.value?.compactions ?? []) as { blocking: boolean; reason: string }[])
						states.push(status);
		});
		try {
			await runtime.waitAnswer(await runtime.submit("a".repeat(80000)));
			await runtime.waitAnswer(await runtime.submit("b".repeat(80000)));
			await runtime.waitAnswer(await runtime.submit("c".repeat(extra)));
			expect(states.some((s) => s.reason === "threshold" && s.blocking === expectedBlocking)).toBe(true);
		} finally {
			stop();
			await runtime.close();
		}
	}, 15000);
}

async function untilPhase(runtime: Awaited<ReturnType<typeof createNekoRuntime>>, phase: string) {
	for (let n = 0; n < 600; n++) {
		if ((await runtime.harness.snapshot(CompactionDoc, runtime.root.id, runtime.context))?.latest?.phase === phase)
			return;
		await Bun.sleep(10);
	}
	throw new Error(`Missing phase ${phase}`);
}
for (const mode of ["failure", "cancel", "retry", "overflow"] as const) {
	it(`projects native ${mode} without changing policy`, async () => {
		const faux = fauxProvider({ models: [{ id: "compact", contextWindow: 1000000 }] });
		const runtime = await createNekoRuntime({
			storage: "memory",
			model: { provider: "faux", modelId: "compact" },
			providers: [faux.provider],
		});
		const statuses: { reason: string; retry?: unknown }[] = [];
		const stop = runtime.harness.subscribeCommits(({ changes }) => {
			for (const c of changes)
				if (c.type === "document" && c.record.kind === "pi.live")
					statuses.push(...((c.value?.compactions ?? []) as typeof statuses));
		});
		try {
			faux.setResponses(Array.from({ length: 2 }, () => fauxAssistantMessage([fauxText("ok")])));
			await runtime.waitAnswer(await runtime.submit("a".repeat(90000)));
			await runtime.waitAnswer(await runtime.submit("b".repeat(90000)));
			const before = (await runtime.listConversations())[0]!;
			if (mode === "failure") {
				faux.setResponses([fauxAssistantMessage([], { stopReason: "error", errorMessage: "invalid request" })]);
				await runtime.compact();
				await untilPhase(runtime, "failed");
			} else if (mode === "cancel") {
				faux.setResponses([
					async (_ctx, options) => {
						await new Promise<void>((r) => {
							if (options?.signal?.aborted) r();
							else options?.signal?.addEventListener("abort", () => r(), { once: true });
						});
						return fauxAssistantMessage([], { stopReason: "aborted" });
					},
				]);
				await runtime.compact();
				await Bun.sleep(30);
				await runtime.abort();
				await untilPhase(runtime, "cancelled");
			} else if (mode === "retry") {
				faux.setResponses([
					fauxAssistantMessage([], { stopReason: "error", errorMessage: "503 service unavailable" }),
					fauxAssistantMessage([fauxText("summary")]),
				]);
				await runtime.compact();
				await untilPhase(runtime, "applied");
				expect(statuses.some((s) => s.retry)).toBe(true);
			} else {
				faux.setResponses([
					fauxAssistantMessage([], { stopReason: "error", errorMessage: "maximum context length exceeded" }),
					fauxAssistantMessage([fauxText("summary")]),
					fauxAssistantMessage([fauxText("retried answer")]),
				]);
				expect((await runtime.waitAnswer(await runtime.submit("continue"))).status).toBe("done");
				expect(statuses.some((s) => s.reason === "overflow")).toBe(true);
			}
			if (mode !== "overflow") expect((await runtime.listConversations())[0]!.lastMessageAt).toBe(before.lastMessageAt);
		} finally {
			stop();
			await runtime.close();
		}
	}, 15000);
}

it("waits for the native write boundary and restores terminal state after reopening", async () => {
	const { mkdtemp, rm } = await import("node:fs/promises");
	const { tmpdir } = await import("node:os");
	const { join } = await import("node:path");
	const dir = await mkdtemp(join(tmpdir(), "neko-compact-recovery-"));
	const faux = fauxProvider({ models: [{ id: "compact", contextWindow: 1000000 }] });
	const options = {
		storagePath: join(dir, "history.sqlite"),
		model: { provider: "faux", modelId: "compact" },
		providers: [faux.provider],
	};
	let runtime = await createNekoRuntime(options);
	let release = () => {};
	try {
		faux.setResponses(Array.from({ length: 2 }, () => fauxAssistantMessage([fauxText("answer")])));
		await runtime.waitAnswer(await runtime.submit("a".repeat(90000)));
		await runtime.waitAnswer(await runtime.submit("b".repeat(90000)));
		const gate = new Promise<void>((r) => {
			release = r;
		});
		faux.setResponses([
			async () => {
				await gate;
				return fauxAssistantMessage([fauxText("finished")]);
			},
			fauxAssistantMessage([fauxText("summary")]),
		]);
		const running = await runtime.submit("continue");
		await Bun.sleep(20);
		await runtime.compact();
		await untilPhase(runtime, "waiting-to-apply");
		const waiting = (await runtime.harness.snapshot(CompactionDoc, runtime.root.id, runtime.context))!.latest!;
		await runtime.compact();
		expect((await runtime.harness.snapshot(CompactionDoc, runtime.root.id, runtime.context))!.latest!.taskId).toBe(
			waiting.taskId,
		);
		release();
		await runtime.waitAnswer(running);
		await untilPhase(runtime, "applied");
		const usage = await runtime.usage();
		const recency = (await runtime.listConversations())[0]!.lastMessageAt;
		await runtime.close();
		runtime = await createNekoRuntime(options);
		await untilPhase(runtime, "applied");
		expect(await runtime.usage()).toEqual(usage);
		expect((await runtime.listConversations())[0]!.lastMessageAt).toBe(recency);
	} finally {
		release();
		await runtime.close();
		await rm(dir, { recursive: true, force: true });
	}
}, 15000);

it("resumes an interrupted native summary after runtime restart", async () => {
	const { mkdtemp, rm } = await import("node:fs/promises");
	const { tmpdir } = await import("node:os");
	const { join } = await import("node:path");
	const dir = await mkdtemp(join(tmpdir(), "neko-summary-restart-"));
	const faux = fauxProvider({ models: [{ id: "compact", contextWindow: 1000000 }] });
	const options = {
		storagePath: join(dir, "history.sqlite"),
		model: { provider: "faux", modelId: "compact" },
		providers: [faux.provider],
	};
	let runtime = await createNekoRuntime(options);
	let started = false;
	try {
		faux.setResponses(Array.from({ length: 2 }, () => fauxAssistantMessage([fauxText("answer")])));
		await runtime.waitAnswer(await runtime.submit("a".repeat(90000)));
		await runtime.waitAnswer(await runtime.submit("b".repeat(90000)));
		faux.setResponses([
			async (_ctx, opts) => {
				started = true;
				await new Promise<void>((r) => opts?.signal?.addEventListener("abort", () => r(), { once: true }));
				return fauxAssistantMessage([], { stopReason: "aborted" });
			},
		]);
		await runtime.compact();
		for (let n = 0; n < 100 && !started; n++) await Bun.sleep(10);
		expect(started).toBe(true);
		await runtime.close();
		faux.setResponses([fauxAssistantMessage([fauxText("recovered summary")])]);
		runtime = await createNekoRuntime(options);
		await untilPhase(runtime, "applied");
		expect((await runtime.root.conversation.context(runtime.context)).head?.kind).toBe("pi.compaction");
	} finally {
		await runtime.close();
		await rm(dir, { recursive: true, force: true });
	}
}, 15000);

it("reports a native stale summary as skipped instead of applied", async () => {
	const faux = fauxProvider({ models: [{ id: "compact", contextWindow: 1000000 }] });
	const runtime = await createNekoRuntime({
		storage: "memory",
		providers: [faux.provider],
		model: { provider: "faux", modelId: "compact" },
	});
	let release = () => {};
	let started = false;
	try {
		faux.setResponses(Array.from({ length: 2 }, () => fauxAssistantMessage([fauxText("answer")])));
		await runtime.waitAnswer(await runtime.submit("a".repeat(90000)));
		await runtime.waitAnswer(await runtime.submit("b".repeat(90000)));
		const gate = new Promise<void>((r) => {
			release = r;
		});
		faux.setResponses([
			async () => {
				started = true;
				await gate;
				return fauxAssistantMessage([fauxText("stale summary")]);
			},
		]);
		await runtime.compact();
		for (let n = 0; n < 100 && !started; n++) await Bun.sleep(10);
		await runtime.root.conversation.reset("new context", runtime.context);
		release();
		await untilPhase(runtime, "skipped");
	} finally {
		release();
		await runtime.close();
	}
}, 15000);
