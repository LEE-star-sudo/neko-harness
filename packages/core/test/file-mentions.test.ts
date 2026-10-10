import { expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mentionAt, replaceMention } from "../src/file-mentions.ts";
import { searchWorkspaceFiles, workspaceTarget } from "../src/workspace-files.ts";

it("replaces only the active reference and preserves quoted directory cursors", () => {
	expect(mentionAt("mail@example.com", 16)).toBeNull();
	const text = '查看 @"my fi 后文';
	const token = mentionAt(text, 10)!;
	const result = replaceMention(text, token, "my files/a.ts", false);
	expect(result.text).toBe('查看 @"my files/a.ts"  后文');
	const directory = replaceMention("@src", mentionAt("@src", 4)!, "my files", true);
	expect(directory.text).toBe('@"my files/"');
	expect(directory.cursor).toBe(directory.text.length - 1);
});
it("scopes discovery, honors ignores and never returns outside symlinks", async () => {
	const root = await mkdtemp(join(tmpdir(), "neko-files-"));
	try {
		await mkdir(join(root, ".git"));
		await mkdir(join(root, "src"));
		await mkdir(join(root, "ignored"));
		await writeFile(join(root, ".gitignore"), "ignored/\n");
		await writeFile(join(root, ".hidden"), "h");
		await writeFile(join(root, "src/runtime.ts"), "secret body");
		await writeFile(join(root, "ignored/runtime.ts"), "no");
		await symlink(tmpdir(), join(root, "outside"));
		const signal = new AbortController().signal;
		const result = await searchWorkspaceFiles(root, "runtime", signal);
		expect(result.entries.map((e) => e.path)).toEqual(["src/runtime.ts"]);
		expect(JSON.stringify(result)).not.toContain("secret body");
		expect((await searchWorkspaceFiles(root, "", signal)).entries.some((e) => e.path === ".hidden")).toBe(true);
		await expect(workspaceTarget(root, "outside")).rejects.toThrow("outside");
		await expect(searchWorkspaceFiles(root, "../", signal)).rejects.toThrow("relative");
		await expect(searchWorkspaceFiles(root, "", signal, null)).rejects.toThrow("Install fd");
		const abort = new AbortController();
		abort.abort();
		await expect(searchWorkspaceFiles(root, "", abort.signal)).rejects.toThrow();
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

it("bounds subprocess lifetime and marks capped results", async () => {
	const { chmod } = await import("node:fs/promises");
	const root = await mkdtemp(join(tmpdir(), "neko-files-budget-"));
	try {
		await Promise.all(Array.from({ length: 105 }, (_, i) => writeFile(join(root, `file-${i}.txt`), "x")));
		const result = await searchWorkspaceFiles(root, "file", new AbortController().signal);
		expect(result.entries).toHaveLength(100);
		expect(result.limited).toBe(true);
		const fake = join(root, "slow-fd");
		await writeFile(fake, `#!${process.execPath}\nawait Bun.sleep(60000);\n`);
		await chmod(fake, 0o755);
		const controller = new AbortController();
		const pending = searchWorkspaceFiles(root, "", controller.signal, fake);
		setTimeout(() => controller.abort(), 30);
		await expect(pending).rejects.toThrow("cancelled");
		await expect(searchWorkspaceFiles(root, "", new AbortController().signal, fake)).rejects.toThrow("timed out");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
