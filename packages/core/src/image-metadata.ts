import { defineExtension, hook, ToolTask } from "@earendil-works/pi-durable";
import sharp from "sharp";
import type { ImageInfo } from "./images.ts";

export type ImageMetadata = ImageInfo & { contentIndex: number };

/** Enrich UI details; the SDK persists them atomically with the actual tool result. */
export const ImageDetails = defineExtension({
	name: "neko-image-details",
	hooks: [
		hook(ToolTask, {
			async afterTool(call, result) {
				if (call.name !== "read" || result.isError) return;
				const images: ImageMetadata[] = [];
				for (const [contentIndex, block] of (result.output ?? []).entries()) {
					if (block.type !== "image") continue;
					const data = Buffer.from(block.data, "base64");
					const info = await sharp(data).metadata();
					images.push({
						contentIndex,
						name: String(call.arguments.path ?? "Image"),
						mimeType: block.mimeType,
						width: info.width!,
						height: info.height!,
						bytes: data.length,
					});
				}
				if (!images.length) return;
				return {
					...result,
					details: {
						...(typeof result.details === "object" && result.details !== null && !Array.isArray(result.details)
							? result.details
							: { upstream: result.details ?? null }),
						neko: { images },
					},
				};
			},
		}),
	],
});
