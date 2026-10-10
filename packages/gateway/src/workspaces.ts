import { constants } from "node:fs";
import { access, readdir, stat } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { accessibleWorkspace } from "@neko-harness/core";
import type { NekoBrowseOptions, NekoDirectoryPage } from "./contract.ts";

/** Browse one host directory. Cursors are bound to the query, never filesystem paths. */
export async function browseWorkspaces(options: NekoBrowseOptions): Promise<NekoDirectoryPage> {
	if (!isAbsolute(options.path)) throw new Error("请选择完整的绝对目录路径");
	const path = accessibleWorkspace(options.path);
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
