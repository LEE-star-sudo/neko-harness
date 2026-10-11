import { expect, it } from "bun:test";
import { chmod, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BACKGROUND_CONTEXT as ctx } from "@earendil-works/chord/context";
import { connectNekoGateway } from "../src/client.ts";
import { browseWorkspaces } from "../src/workspaces.ts";
import { cleanup, IS_WINDOWS, makeGateway, testAddress, waitFor } from "./helpers.ts";

// 依赖 POSIX 主机语义：symlink 无需特权、chmod(0) 产生访问错误、存在 / 根目录。
it.skipIf(IS_WINDOWS)(
	"browses host folders with query-bound pagination and explicit inaccessible entries",
	async () => {
		const dir = await realpath(await mkdtemp(join(tmpdir(), "neko-browse-")));
		try {
			await Promise.all(
				Array.from({ length: 105 }, (_, i) => mkdir(join(dir, `folder-${String(i).padStart(3, "0")}`))),
			);
			await mkdir(join(dir, ".hidden"));
			await writeFile(join(dir, "file"), "x");
			await symlink(join(dir, "folder-000"), join(dir, "alias"));
			await symlink(join(dir, "absent"), join(dir, "broken"));
			await mkdir(join(dir, "denied"));
			await chmod(join(dir, "denied"), 0);
			const first = await browseWorkspaces({ path: dir });
			const second = await browseWorkspaces({ path: dir, cursor: first.next! });
			expect(first.entries.length).toBe(100);
			expect([...first.entries, ...second.entries].length).toBe(108);
			expect(first.entries.find((e) => e.name === "broken")?.error).toBeDefined();
			expect(first.entries.find((e) => e.name === "denied")?.error).toBeDefined();
			expect((await browseWorkspaces({ path: dir, query: "hidden", showHidden: true })).entries.length).toBe(1);
			await expect(browseWorkspaces({ path: dir, query: "changed", cursor: first.next! })).rejects.toThrow("分页");
			await expect(browseWorkspaces({ path: join(dir, "file") })).rejects.toThrow();
			await expect(browseWorkspaces({ path: join(dir, "absent") })).rejects.toThrow();
			await expect(browseWorkspaces({ path: join(dir, "denied") })).rejects.toThrow();
			expect((await browseWorkspaces({ path: "/" })).parent).toBeNull();
			expect((await browseWorkspaces({ path: join(dir, "alias") })).path).toBe(join(dir, "folder-000"));
		} finally {
			await chmod(join(dir, "denied"), 0o700).catch(() => {});
			await rm(dir, { recursive: true, force: true });
		}
	},
);
it("shares independent workspace additions over Unix and WS and keeps them after archive", async () => {
	const target = await makeGateway();
	const unix = await connectNekoGateway(testAddress(target));
	const ws = await connectNekoGateway({ transport: "ws", url: target.wsUrl, serverId: target.serverId });
	try {
		const dir = await realpath(target.dir);
		await unix.workspaces.add({ path: dir }, ctx);
		await waitFor(
			() => ws.workspaces.state.value?.workspaces.some((w) => w.path === dir) === true,
			"workspace broadcast",
		);
		const session = await ws.management.create({ cwd: dir }, ctx);
		expect(session.workspaceRoot).toBe(dir);
		await ws.management.archive(session.id, ctx);
		expect(unix.workspaces.state.value?.workspaces.some((w) => w.path === dir)).toBe(true);
		expect((await ws.workspaces.browse({ path: dir }, ctx)).path).toBe(dir);
	} finally {
		await unix.close();
		await ws.close();
		await cleanup(target);
	}
});
