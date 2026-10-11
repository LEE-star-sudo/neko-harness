import { constants } from "node:fs";
import { access, readdir, stat } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { accessibleWorkspace } from "@neko-harness/core";
import type { NekoBrowseOptions, NekoDirectoryPage } from "./contract.ts";

/** Browse one host directory. Cursors are bound to the query, never filesystem paths. */
export async function browseWorkspaces(options: NekoBrowseOptions): Promise<NekoDirectoryPage> {
	// 兜底归一化 "/D:\code" 这类"前导斜杠 + 盘符"形态（旧客户端面包屑/手输）；POSIX 路径不可能命中。
	const requested = options.path.replace(/^\/+([A-Za-z]:[\\/])/, "$1");
	// Windows 没有跨盘根目录：根请求返回可用盘符列表（虚拟层），POSIX 的 "/" 行为不变。
	if (process.platform === "win32" && (requested === "/" || requested === "\\")) {
		return { path: "/", parent: null, entries: await listDrives(), next: null };
	}
	if (!isAbsolute(requested)) throw new Error("请选择完整的绝对目录路径");
	const path = accessibleWorkspace(requested);
	const query = options.query?.toLowerCase() ?? "";
	const key = JSON.stringify([path, query, options.showHidden === true]);
	let offset = 0;
	if (options.cursor) {
		try {
			const cursor = JSON.parse(options.cursor);
			if (cursor.key !== key || !Number.isSafeInteger(cursor.offset) || cursor.offset < 0) throw new Error();
			offset = cursor.offset;
		} catch {
			throw new Error("目录分页已失效，请刷新列表");
		}
	}
	const entries = (await readdir(path, { withFileTypes: true }))
		.filter((entry) => (options.showHidden || !entry.name.startsWith(".")) && entry.name.toLowerCase().includes(query))
		.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
	const directories: NekoDirectoryPage["entries"][number][] = [];
	// Only scan until this page fills; no recursive traversal and bounded stat concurrency.
	let next = offset;
	for (; next < entries.length && directories.length < 100; next++) {
		const entry = entries[next]!;
		const target = join(path, entry.name);
		if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
		try {
			if (!(await stat(target)).isDirectory()) continue;
			await access(target, constants.R_OK | constants.X_OK);
			directories.push({ name: entry.name, path: target });
		} catch {
			directories.push({ name: entry.name, path: target, error: "目录不可访问" });
		}
	}
	return {
		path,
		parent: dirname(path) === path ? null : dirname(path),
		entries: directories,
		next: next < entries.length ? JSON.stringify({ key, offset: next }) : null,
	};
}

/** win32 虚拟根层：探测 A:\–Z:\，可用盘符以 `C:` / `C:\` 形态返回。 */
async function listDrives(): Promise<NekoDirectoryPage["entries"]> {
	const drives: NekoDirectoryPage["entries"][number][] = [];
	for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
		const root = `${letter}:\\`;
		try {
			await access(root);
			drives.push({ name: `${letter}:`, path: root });
		} catch {
			// 盘不存在或不可访问。
		}
	}
	return drives;
}
