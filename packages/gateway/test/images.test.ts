import { expect, it } from "bun:test";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BACKGROUND_CONTEXT as context } from "@earendil-works/chord/context";
import { fauxAssistantMessage, fauxText } from "@earendil-works/pi-ai";
import { downloadImage, uploadImage } from "@neko-harness/core/image-transfer";
import sharp from "sharp";
import { fauxProvider } from "../../../test/faux.ts";
import { connectNekoGateway, startGateway } from "../src/index.ts";
import { waitFor } from "./helpers.ts";

it("transfers images across Unix/WS without embedding bytes in replicated views", async () => {
	const dir = await mkdtemp(join(tmpdir(), "neko-image-gateway-"));
	const faux = fauxProvider({ models: [{ id: "vision", input: ["text", "image"] }] });
	faux.setResponses([fauxAssistantMessage([fauxText("A blue image")])]);
	const gateway = await startGateway({
		storage: "memory",
		providers: [faux.provider],
		model: { provider: "faux", modelId: "vision" },
		socketPath: join(dir, "gateway.sock"),
		port: 0,
	});
	const a = await connectNekoGateway({
		transport: "unix",
		socketPath: gateway.socketPath!,
		serverId: gateway.serverId,
	});
	const b = await connectNekoGateway({ transport: "ws", url: gateway.wsUrl!, serverId: gateway.serverId });
	try {
		const id = String(gateway.runtime.root.id);
		const ac = await a.attach(id);
		const bc = await b.attach(id);
		const bytes = await sharp(randomBytes(800 * 600 * 3), { raw: { width: 800, height: 600, channels: 3 } })
			.png()
			.toBuffer();
		const upload = await uploadImage(
			{ name: "blue.png", mimeType: "image/png", bytes },
			{
				begin: (i) => ac.beginImage(i, context),
				append: (i) => ac.appendImage(i, context),
				finish: (i) => ac.finishImage(i, context),
				release: (i) => ac.releaseImage(i, context),
			},
		);
		await expect(bc.finishImage(upload, context)).rejects.toThrow();
		await ac.submit({ content: "", images: [upload], requestId: "one-image" }, context);
		await waitFor(() => !!bc.view.value?.items.some((i) => i.type === "user" && i.images?.length), "image view");
		const item = bc.view.value!.items.find((i) => i.type === "user")!;
		if (item.type !== "user") throw new Error("missing user");
		expect(item.images![0]!.name).toBe("blue.png");
		expect(JSON.stringify(bc.view.value)).not.toContain(bytes.toString("base64"));
		const image = item.images![0]!;
		const downloaded = await downloadImage((offset) =>
			bc.getImage({ entryId: image.entryId, contentIndex: image.contentIndex, offset }, context),
		);
		expect((await sharp(downloaded.bytes).metadata()).width).toBe(800);
		await ac.submit({ content: "", images: [upload], requestId: "one-image" }, context);
		expect(bc.view.value!.items.filter((i) => i.type === "user")).toHaveLength(1);
		await Promise.all([ac.compact({}, context), bc.compact({}, context)]);
		await waitFor(() => bc.view.value?.compaction?.latest?.phase === "nothing", "no-op compaction");
		await expect(bc.getImage({ entryId: 999999, contentIndex: 0, offset: 0 }, context)).rejects.toThrow();
		const fork = await gateway.runtime.forkConversation(gateway.runtime.root.id);
		const forkChat = await b.attach(String(fork.id));
		expect(
			(
				await downloadImage((offset) =>
					forkChat.getImage({ entryId: image.entryId, contentIndex: image.contentIndex, offset }, context),
				)
			).bytes,
		).toEqual(downloaded.bytes);
		await expect(bc.beginImage({ name: "late.png", mimeType: "image/png", size: 1 }, context)).rejects.toThrow();
		const empty = await gateway.runtime.createConversation();
		const emptyChat = await b.attach(String(empty.id));
		await expect(
			emptyChat.getImage({ entryId: image.entryId, contentIndex: image.contentIndex, offset: 0 }, context),
		).rejects.toThrow("not part");
	} finally {
		await a.close();
		await b.close();
		await gateway.close();
		await rm(dir, { recursive: true, force: true });
	}
}, 15000);
