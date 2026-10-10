import { IMAGE_LIMITS } from "@neko-harness/core";
export const IMAGE_CHUNK_BYTES = 256 * 1024;
type Upload = {
	name: string;
	mimeType: string;
	size: number;
	chunks: Buffer[];
	received: number;
	ready: boolean;
	expires: number;
};
/** Attachment-local ownership; disconnect disposes only this client's staging data. */
export class ImageUploads {
	#uploads = new Map<string, Upload>();
	#closed = false;
	#timer = setInterval(() => this.expire(), 60_000).unref();
	private expire() {
		for (const [id, u] of this.#uploads) if (u.expires < Date.now()) this.#uploads.delete(id);
	}
	begin(input: { name: string; mimeType: string; size: number }): string {
		if (this.#closed) throw new Error("Image attachment is closed");
		this.expire();
		if (!Number.isSafeInteger(input.size) || input.size < 1 || input.size > IMAGE_LIMITS.maxBytes)
			throw new Error("Image exceeds 20 MiB");
		if (!["image/png", "image/jpeg", "image/webp"].includes(input.mimeType))
			throw new Error("Only PNG, JPEG and WebP images are supported");
		const uploads = [...this.#uploads.values()];
		if (
			uploads.filter((u) => !u.ready).length >= 2 ||
			uploads.length >= 8 ||
			uploads.reduce((n, u) => n + u.size, 0) + input.size > 2 * IMAGE_LIMITS.maxTotalBytes
		)
			throw new Error("Too many pending images");
		const id = crypto.randomUUID();
		this.#uploads.set(id, {
			...input,
			name: input.name.slice(0, 200),
			chunks: [],
			received: 0,
			ready: false,
			expires: Date.now() + 15 * 60_000,
		});
		return id;
	}
	private get(id: string) {
		this.expire();
		const u = this.#uploads.get(id);
		if (!u) throw new Error("Image upload expired; add the image again");
		return u;
	}
	append(input: { id: string; offset: number; data: string }): void {
		const u = this.get(input.id);
		if (
			input.data.length > Math.ceil(IMAGE_CHUNK_BYTES / 3) * 4 ||
			!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.data)
		)
			throw new Error("Invalid image chunk");
		const bytes = Buffer.from(input.data, "base64");
		if (
			u.ready ||
			input.offset !== u.received ||
			!bytes.length ||
			bytes.length > IMAGE_CHUNK_BYTES ||
			u.received + bytes.length > u.size
		)
			throw new Error("Invalid image chunk order or size");
		u.chunks.push(bytes);
		u.received += bytes.length;
		u.expires = Date.now() + 15 * 60_000;
	}
	finish(id: string): void {
		const u = this.get(id);
		if (u.received !== u.size) throw new Error("Incomplete image upload");
		u.ready = true;
	}
	resolve(ids: readonly string[]) {
		if (ids.length > IMAGE_LIMITS.maxCount || new Set(ids).size !== ids.length)
			throw new Error("At most four distinct images per message");
		const images = ids.map((id) => {
			const u = this.get(id);
			if (!u.ready) throw new Error("Image is not ready");
			return u;
		});
		if (images.reduce((n, u) => n + u.size, 0) > IMAGE_LIMITS.maxTotalBytes) throw new Error("Images exceed 40 MiB");
		return images.map((u) => ({
			name: u.name,
			content: { type: "image" as const, mimeType: u.mimeType, data: Buffer.concat(u.chunks).toString("base64") },
		}));
	}
	read(id: string, offset: number) {
		const u = this.get(id);
		if (!u.ready || !Number.isSafeInteger(offset) || offset < 0 || offset > u.size)
			throw new Error("Invalid image range");
		return {
			data: Buffer.concat(u.chunks)
				.subarray(offset, offset + IMAGE_CHUNK_BYTES)
				.toString("base64"),
			total: u.size,
			mimeType: u.mimeType,
		};
	}
	release(id: string) {
		this.#uploads.delete(id);
	}
	close() {
		this.#closed = true;
		clearInterval(this.#timer);
		this.#uploads.clear();
	}
}
