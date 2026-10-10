import { expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compactInstructions } from "@neko-harness/core/image-transfer";
import { imagePaths, readImageFile } from "../src/image-input.ts";

it("recognizes quoted drag paths without interpreting ordinary prose or shell commands", () => {
	expect(imagePaths('"/tmp/my image.png" /tmp/a\\ b.webp')).toEqual(["/tmp/my image.png", "/tmp/a b.webp"]);
	expect(imagePaths("please look at image.png")).toBeNull();
	expect(imagePaths('"unfinished.png')).toBeNull();
	expect(imagePaths("/tmp/readme.md")).toBeNull();
	expect(compactInstructions("/compact preserve decisions")).toBe("preserve decisions");
	expect(compactInstructions("/compactly")).toBeNull();
	expect(compactInstructions("hello /compact")).toBeNull();
});
it("reads owned bytes without changing source files and reports unavailable paths", async () => {
	const dir = await mkdtemp(join(tmpdir(), "neko-tui-image-"));
	try {
		await writeFile(join(dir, "my image.png"), "fixture");
		expect((await readImageFile("my image.png", dir)).name).toBe("my image.png");
		await expect(readImageFile("missing.png", dir)).rejects.toThrow();
		await expect(readImageFile(".", dir)).rejects.toThrow("file");
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
it("clipboard adapters fall back to text and decode platform image payloads", async () => {
	const { clipboard } = await import("../src/image-input.ts");
	const text = await clipboard({
		platform: "darwin",
		command: async (tool) => {
			if (tool === "pbpaste") return "ordinary text";
			throw new Error("unavailable");
		},
	});
	expect(text).toEqual({ text: "ordinary text" });
	const png = await clipboard({ platform: "win32", command: async () => "IMAGE:AQID" });
	expect([...png.image!.bytes]).toEqual([1, 2, 3]);
	const calls: string[] = [];
	expect(
		await clipboard({
			platform: "linux",
			wayland: true,
			command: async (tool, args) => {
				calls.push(tool);
				if (args.includes("image/png")) throw new Error("no image");
				return "paste";
			},
		}),
	).toEqual({ text: "paste" });
	expect(calls).toEqual(["wl-paste", "wl-paste"]);
	await expect(
		clipboard({
			platform: "linux",
			command: async () => {
				throw new Error("backend missing");
			},
		}),
	).rejects.toThrow("backend missing");
});
it("renders PNG/JPEG/WebP through Pi Kitty protocol only when visible and falls back without graphics", async () => {
	const { HistoryImage } = await import("../src/components/history-image.ts");
	const { setCapabilities, getCapabilities } = await import("@earendil-works/pi-tui");
	const { terminalImage } = await import("@neko-harness/core");
	const sharp = (await import("sharp")).default;
	const original = getCapabilities();
	try {
		for (const format of ["png", "jpeg", "webp"] as const) {
			const bytes = await sharp({ create: { width: 16, height: 8, channels: 3, background: "red" } })
				.toFormat(format)
				.toBuffer();
			expect((await sharp(await terminalImage(bytes)).metadata()).format).toBe("png");
			let calls = 0,
				loaded = false;
			const preview = new HistoryImage(
				{
					entryId: 1,
					contentIndex: 0,
					name: `x.${format}`,
					mimeType: `image/${format}`,
					width: 16,
					height: 8,
					bytes: bytes.length,
				},
				async () => {
					calls++;
					return { name: `x.${format}`, mimeType: `image/${format}`, bytes };
				},
				() => {
					loaded = true;
				},
			);
			setCapabilities({ ...original, images: "kitty" });
			preview.render(60);
			expect(calls).toBe(0);
			preview.setVisible(true);
			preview.render(60);
			for (let n = 0; n < 100 && !loaded; n++) await Bun.sleep(5);
			expect(preview.render(60).join("\n")).toContain("\x1b_G");
			expect(preview.render(60).length).toBeLessThanOrEqual(8);
			preview.setVisible(false);
			setCapabilities({ ...original, images: null });
			expect(preview.render(60).join("\n")).toContain(`x.${format}`);
		}
	} finally {
		setCapabilities(original);
	}
});
