import { spawn } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { basename, delimiter, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { FileCandidates } from "./file-mentions.ts";
export function findFd(): string | null {
	for (const name of process.platform === "win32" ? ["fd.exe", "fdfind.exe"] : ["fd", "fdfind"]) {
		for (const directory of (process.env.PATH ?? "").split(delimiter)) {
			if (!directory) continue;
			const path = join(directory, name);
			try {
				accessSync(path, constants.X_OK);
				return path;
			} catch {}
		}
	}
	return null;
}
export function relativeQuery(query: string): string {
	if (
		query.length > 2048 ||
		[...query].some((c) => c.charCodeAt(0) < 32 || c === '"' || c === "\\") ||
		isAbsolute(query) ||
		query.startsWith("~") ||
		query.split("/").some((part) => part === ".." || part === ".git")
	)
		throw new Error("Use a relative path inside the workspace.");
	return query.replace(/^\.\//, "");
}
export async function workspaceTarget(root: string, path: string): Promise<string> {
	const base = await realpath(root);
	const target = await realpath(resolve(base, relativeQuery(path)));
	const local = relative(base, target);
	if (local === ".." || local.startsWith(`..${sep}`) || isAbsolute(local))
		throw new Error("Path is outside the workspace.");
	return target;
}
export async function searchWorkspaceFiles(
	root: string,
	query: string,
	signal: AbortSignal,
	fd = findFd(),
): Promise<FileCandidates> {
	if (!fd) throw new Error("Install fd (or fdfind) to search workspace files.");
	query = relativeQuery(query);
	const slash = query.lastIndexOf("/");
	const prefix = slash < 0 ? "" : query.slice(0, slash + 1);
	const needle = query.slice(slash + 1);
	const base = await workspaceTarget(root, prefix);
	if (!(await stat(base)).isDirectory()) throw new Error("Workspace directory is unavailable.");
	const combined = AbortSignal.any([signal, AbortSignal.timeout(2000)]);
	combined.throwIfAborted();
	const pattern = [...needle].map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
	const args = [
		"--base-directory",
		base,
		"--type",
		"f",
		"--type",
		"d",
		"--hidden",
		"--exclude",
		".git",
		"--max-results",
		"101",
		"--print0",
		"--color",
		"never",
	];
	if (!needle) args.push("--max-depth", "1");
	args.push("--", pattern);
	const output = await new Promise<string>((done, fail) => {
		const child = spawn(fd, args, { stdio: ["ignore", "pipe", "pipe"] });
		const chunks: Buffer[] = [];
		let bytes = 0;
		let overflow = false;
		const abort = () => child.kill("SIGKILL");
		combined.addEventListener("abort", abort, { once: true });
		child.stdout.on("data", (chunk: Buffer) => {
			bytes += chunk.length;
			if (bytes > 1024 * 1024) {
				overflow = true;
				abort();
			} else chunks.push(chunk);
		});
		child.stderr.resume();
		child.on("error", () => {
			combined.removeEventListener("abort", abort);
			fail(new Error("File search could not start. Check fd installation."));
		});
		child.on("close", (code) => {
			combined.removeEventListener("abort", abort);
			if (combined.aborted)
				fail(new Error(signal.aborted ? "File search cancelled." : "File search timed out. Narrow the query."));
			else if (overflow) fail(new Error("Too many file results. Narrow the query."));
			else if (code) fail(new Error("File search failed."));
			else done(Buffer.concat(chunks).toString("utf8"));
		});
		if (combined.aborted) abort();
	});
	const paths = output.split("\0").filter(Boolean);
	const entries: FileCandidates["entries"] = [];
	for (const path of paths) {
		combined.throwIfAborted();
		const local = (prefix + path.replace(/^\.\//, "")).replace(/\/$/, "");
		if (local.split("/").includes(".git") || [...local].some((c) => c.charCodeAt(0) < 32 || c === '"' || c === "\\"))
			continue;
		try {
			const target = await workspaceTarget(root, local);
			const info = await stat(target);
			if (info.isDirectory() || info.isFile())
				entries.push({ name: basename(local), path: local, kind: info.isDirectory() ? "directory" : "file" });
		} catch {
			/* Disappeared or outside the workspace. */
		}
	}
	entries.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "directory" ? -1 : 1) || a.path.localeCompare(b.path));
	return { entries: entries.slice(0, 100), limited: paths.length > 100 };
}
