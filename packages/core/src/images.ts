import type { Api, ImageContent, Model, UserMessage } from "@earendil-works/pi-ai";

export const IMAGE_LIMITS = {
	maxBytes: 20 * 1024 * 1024,
	maxPixels: 40_000_000,
	maxCount: 4,
	maxTotalBytes: 40 * 1024 * 1024,
	maxProcessedBytes: 18 * 1024 * 1024,
} as const;
export type ImageInfo = { name: string; mimeType: string; width: number; height: number; bytes: number };
export type PreparedImage = { content: ImageContent; info: ImageInfo };
export function imagePrompt(content: UserMessage["content"]): string {
	if (typeof content === "string") return content;
	const text = content
		.flatMap((b) => (b.type === "text" ? [b.text] : []))
		.join("\n")
		.trim();
	return text || `[Image message: ${content.filter((b) => b.type === "image").length}]`;
}
export function decodeImage(data: string): Buffer {
	if (
		data.length > Math.ceil(IMAGE_LIMITS.maxBytes / 3) * 4 ||
		!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)
	)
		throw new Error("Invalid or oversized image data");
	return Buffer.from(data, "base64");
}
export async function prepareImage(
	bytes: Uint8Array,
	mimeType: string,
	name: string,
	model: Model<Api>,
): Promise<PreparedImage> {
	if (!model.input.includes("image"))
		throw new Error("This model does not support images. Switch model or remove the images.");
	if (!bytes.length || bytes.length > IMAGE_LIMITS.maxBytes) throw new Error("Image must be between 1 byte and 20 MiB");
	const { default: sharp } = await import("sharp");
	const input = Buffer.from(bytes);
	const options = { limitInputPixels: IMAGE_LIMITS.maxPixels, failOn: "warning" as const };
	try {
		const meta = await sharp(input, options).metadata();
		// libvips can report only the first APNG frame; inspect its animation control chunk.
		if (meta.format === "png") {
			for (let offset = 8; offset + 12 <= input.length; ) {
				const size = input.readUInt32BE(offset);
				if (input.toString("ascii", offset + 4, offset + 8) === "acTL")
					throw new Error("Only static PNG, JPEG and WebP images are supported");
				offset += size + 12;
			}
		}
		if (!meta.format || !["png", "jpeg", "webp"].includes(meta.format) || (meta.pages ?? 1) > 1)
			throw new Error("Only static PNG, JPEG and WebP images are supported");
		if (mimeType !== `image/${meta.format}`) throw new Error("Image format does not match its declared type");
		const resize = model.inputLimits?.images?.resize;
		const maxEncoded = resize?.maxBytes ?? 4718592;
		const pipeline = () =>
			sharp(input, options)
				.rotate()
				.resize({
					width: resize?.maxWidth ?? 2000,
					height: resize?.maxHeight ?? 2000,
					fit: "inside",
					withoutEnlargement: true,
				});
		let output = await pipeline().toBuffer({ resolveWithObject: true });
		if (Math.ceil(output.data.length / 3) * 4 > maxEncoded) {
			output = await (meta.hasAlpha
				? pipeline().webp({ quality: resize?.jpegQuality ?? 80 })
				: pipeline().jpeg({ quality: resize?.jpegQuality ?? 80 })
			).toBuffer({ resolveWithObject: true });
		}
		if (Math.ceil(output.data.length / 3) * 4 > maxEncoded)
			throw new Error("Image exceeds the model's encoded size limit after resizing");
		return {
			content: { type: "image", data: output.data.toString("base64"), mimeType: `image/${output.info.format}` },
			info: {
				name: name.replace(/\p{Cc}/gu, "").slice(0, 200) || "Image",
				mimeType: `image/${output.info.format}`,
				width: output.info.width,
				height: output.info.height,
				bytes: output.data.length,
			},
		};
	} catch (error) {
		if (error instanceof Error && /^(Only static|Image format|Image exceeds)/.test(error.message)) throw error;
		throw new Error("Cannot decode image, or image exceeds the 40 megapixel limit");
	}
}
export async function prepareInput(
	content: UserMessage["content"],
	model: Model<Api>,
): Promise<UserMessage["content"]> {
	if (typeof content === "string") return content;
	const images = content.filter((b) => b.type === "image");
	if (!images.length) return content;
	const maxCount = Math.min(IMAGE_LIMITS.maxCount, model.inputLimits?.images?.maxPerMessage ?? Infinity);
	if (images.length > maxCount) throw new Error(`At most ${maxCount} images per message`);
	let total = 0;
	const decoded = images.map((image) => {
		const bytes = decodeImage(image.data);
		total += bytes.length;
		return bytes;
	});
	if (total > IMAGE_LIMITS.maxTotalBytes) throw new Error("Images exceed the 40 MiB total limit");
	const prepared: ImageContent[] = [];
	for (let i = 0; i < images.length; i++)
		prepared.push((await prepareImage(decoded[i]!, images[i]!.mimeType, "Image", model)).content);
	if (prepared.reduce((n, b) => n + decodeImage(b.data).length, 0) > IMAGE_LIMITS.maxProcessedBytes)
		throw new Error("Processed images exceed the total limit");
	let index = 0;
	return content.map((b) => (b.type === "image" ? prepared[index++]! : b));
}

/** Pi's Kitty renderer accepts PNG. Decode at the display boundary, never mutate stored images. */
export async function terminalImage(bytes: Uint8Array): Promise<Uint8Array> {
	const { default: sharp } = await import("sharp");
	return sharp(bytes, { limitInputPixels: IMAGE_LIMITS.maxPixels })
		.resize({ width: 1200, height: 800, fit: "inside", withoutEnlargement: true })
		.png()
		.toBuffer();
}
