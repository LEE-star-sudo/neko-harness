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
import { IS_WINDOWS, testAddress, testSocketPath, waitFor } from "./helpers.ts";

// Windows 上本用例不稳定（约半数失败）：bc 经 ws 大图下载 + finishImage 被拒 + 双端 compact 后，
// 同连接上下一个 RPC（getImage 未知 entryId）的响应可能被延迟约 20s 才到达（超出 15s 用例超时；
// 疑似 pi ws 传输层/attachment 串行化的竞态，POSIX 低载未见）。挂起时响应最终仍会到达，非永久丢失。
// 修复上游竞态后移除本跳过。
it.skipIf(IS_WINDOWS)(
	"transfers images across Unix/WS without embedding bytes in replicated views",
	async () => {
		const dir = await mkdtemp(join(tmpdir(), "neko-image-gateway-"));
		const faux = fauxProvider({ models: [{ id: "vision", input: ["text", "image"] }] });
		faux.setResponses([fauxAssistantMessage([fauxText("A blue image")])]);
		const gateway = await startGateway({
			storage: "memory",
			providers: [faux.provider],
			model: { provider: "faux", modelId: "vision" },
			socketPath: testSocketPath(dir),
			port: 0,
		});
		const a = await connectNekoGateway(testAddress(gateway));
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
	},
	15000,
);
