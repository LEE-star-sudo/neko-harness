import { createHash } from "node:crypto";
import type { Context } from "@earendil-works/chord";
import { type ConversationId, defineDoc, type Harness, type Storage } from "@earendil-works/pi-durable";
import type { ImageInfo } from "./images.ts";
export const ImageMetadataDoc = defineDoc<{
	images: Record<string, ImageInfo>;
	pending: Record<string, (ImageInfo & { contentIndex: number })[]>;
}>({
	kind: "app.neko.images",
	version: 1,
	scope: "conversation",
	history: "rewindable",
	fork: "asOf",
	initial: () => ({ images: {}, pending: {} }),
});
export function imageKey(data: string): string {
	return createHash("sha256").update(data).digest("hex");
}

/** Bind names to immutable entry positions, including inputs queued behind a running answer. */
export function trackImageMetadata(harness: Harness, storage: Storage, context: Context) {
	let tail = Promise.resolve();
	const reconcile = async (id: ConversationId) => {
		const state = await harness.snapshot(ImageMetadataDoc, id, context);
		for (const requestId of Object.keys(state?.pending ?? {})) {
			const submission = await storage.submissionByRequest(id, requestId, context);
			if (submission?.type !== "input" || submission.status === "queued") continue;
			await harness.commit(async (tx) => {
				const doc = await tx.doc(ImageMetadataDoc, id);
				const infos = doc.pending?.[requestId];
				if (!infos) return;
				if (submission.entry !== undefined)
					for (const { contentIndex, ...info } of infos) doc.images[`entry:${submission.entry}:${contentIndex}`] = info;
				delete doc.pending[requestId];
			}, context);
		}
	};
	const stop = harness.subscribeCommits(({ changes }) => {
		const ids = new Set(
			changes.flatMap((c) => (c.type === "submission" && c.value.type === "input" ? [c.value.conversationId] : [])),
		);
		if (ids.size)
			queueMicrotask(() => {
				for (const id of ids) tail = tail.catch(() => {}).then(() => reconcile(id));
			});
	});
	return {
		reconcile,
		async close() {
			stop();
			await tail.catch(() => {});
		},
	};
}
