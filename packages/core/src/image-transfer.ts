/** Browser-safe transfer helpers. Ownership stays with the captured session facade. */
export type ImageFile = { name: string; mimeType: string; bytes: Uint8Array };
export function encodeChunk(bytes: Uint8Array): string {
	let text = "";
	for (const b of bytes) text += String.fromCharCode(b);
	return btoa(text);
}
export function decodeChunk(data: string): Uint8Array {
	return Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
}
export async function uploadImage(
	file: ImageFile,
	api: {
		begin(input: { name: string; mimeType: string; size: number }): Promise<string>;
		append(input: { id: string; offset: number; data: string }): Promise<void>;
		finish(id: string): Promise<void>;
		release(id: string): Promise<void>;
	},
): Promise<string> {
	const id = await api.begin({ name: file.name, mimeType: file.mimeType, size: file.bytes.length });
	try {
		for (let offset = 0; offset < file.bytes.length; offset += 256 * 1024)
			await api.append({ id, offset, data: encodeChunk(file.bytes.subarray(offset, offset + 256 * 1024)) });
		await api.finish(id);
		return id;
	} catch (error) {
		await api.release(id).catch(() => {});
		throw error;
	}
}
export async function downloadImage(
	read: (offset: number) => Promise<{ data: string; total: number; mimeType: string }>,
): Promise<ImageFile> {
	const chunks: Uint8Array[] = [];
	let offset = 0;
	let total = 0;
	let mimeType = "";
	do {
		const chunk = await read(offset);
		if (
			!Number.isSafeInteger(chunk.total) ||
			chunk.total <= 0 ||
			chunk.total > 20 * 1024 * 1024 ||
			(offset > 0 && (chunk.total !== total || chunk.mimeType !== mimeType))
		)
			throw new Error("Invalid image size or format");
		total = chunk.total;
		mimeType = chunk.mimeType;
		if (chunk.data.length > Math.ceil((256 * 1024) / 3) * 4) throw new Error("Image chunk is too large");
		const bytes = decodeChunk(chunk.data);
		if (bytes.length > 256 * 1024 || offset + bytes.length > total || (!bytes.length && offset < total))
			throw new Error("Incomplete image");
		chunks.push(bytes);
		offset += bytes.length;
	} while (offset < total);
	const bytes = new Uint8Array(offset);
	let at = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, at);
		at += chunk.length;
	}
	return { name: "Image", mimeType, bytes };
}
export function compactInstructions(text: string): string | null {
	const match = /^\/compact(?:\s+([\s\S]*))?$/.exec(text.trim());
	return match ? (match[1]?.trim() ?? "") : null;
}
