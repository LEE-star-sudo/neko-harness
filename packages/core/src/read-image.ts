import { resolve } from "node:path";
import { Type } from "@earendil-works/pi-ai";
import { defineExtension, defineTool } from "@earendil-works/pi-durable";
import { getOrThrow } from "@earendil-works/pi-durable/env";
import { ImageMetadataDoc, imageKey } from "./image-metadata.ts";
import { IMAGE_LIMITS, prepareImage } from "./images.ts";

export const ImageTools = defineExtension({
	name: "neko-images",
	tools: [
		defineTool({
			name: "read_image",
			description:
				"Read a static PNG, JPEG or WebP image from the workspace (absolute paths also supported). Requires a vision model. Describe task-relevant observations in your answer so later text compaction can retain them.",
			parameters: Type.Object({
				path: Type.String({ description: "Image file path, relative to the conversation workspace or absolute" }),
			}),
			async execute({ path }, api, context) {
				const agent = await api.agent(context);
				const model = agent.model && api.models.getModel(agent.model.provider, agent.model.modelId);
				if (!model?.input.includes("image"))
					return {
						content: [{ type: "text", text: "This model does not support images. Switch to a vision model." }],
						isError: true,
					};
				if (!api.env) throw new Error("File environment is unavailable");
				if (/^[a-z]+:\/\//i.test(path)) throw new Error("Remote image URLs are not supported");
				const fullPath = resolve(api.env.cwd, path);
				const reader = getOrThrow(await api.env.openBinaryReader(fullPath, undefined, context));
				try {
					const before = getOrThrow(await reader.info(context));
					if (before.size > IMAGE_LIMITS.maxBytes) throw new Error("Image exceeds 20 MiB");
					const chunks: Uint8Array[] = [];
					let position = 0;
					while (position < before.size) {
						const chunk = getOrThrow(
							await reader.read(position, Math.min(256 * 1024, before.size - position), context),
						);
						if (!chunk.length) throw new Error("Image changed while reading");
						chunks.push(chunk);
						position += chunk.length;
					}
					const after = getOrThrow(await reader.info(context));
					if (before.size !== after.size || before.mtimeMs !== after.mtimeMs)
						throw new Error("Image changed while reading");
					const bytes = Buffer.concat(chunks);
					const { default: sharp } = await import("sharp");
					const meta = await sharp(bytes, { limitInputPixels: IMAGE_LIMITS.maxPixels }).metadata();
					const image = await prepareImage(bytes, `image/${meta.format}`, path, model);
					await api.commit(async (tx) => {
						const doc = await tx.doc(ImageMetadataDoc, api.conversationId);
						doc.images[imageKey(image.content.data)] = image.info;
						doc.images[`tool:${api.callId}:1`] = image.info;
					}, context);
					return {
						content: [
							{
								type: "text",
								text: `${path} (${image.info.mimeType}, ${image.info.width}x${image.info.height}, ${image.info.bytes} bytes)`,
							},
							image.content,
						],
					};
				} finally {
					await reader.close(context);
				}
			},
		}),
	],
});
