import { realpathSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

/** Workspace identity is the physical directory, not the enclosing repository. */
export function normalizeWorkspace(directory: string = process.cwd()): string {
	try {
		const path = realpathSync(resolve(directory));
		if (!statSync(path).isDirectory()) throw new Error("Not a directory");
		return path;
	} catch (cause) {
		throw new Error(`Workspace is not available: ${directory}`, { cause });
	}
}

/** Restoring a session never rebinds its directory or requires it to still exist. */
export function savedWorkspace(directory: string | undefined): string {
	if (!directory || !isAbsolute(directory)) {
		throw new Error("Unsupported session storage: missing absolute workspace. Use a fresh storage file.");
	}
	return directory;
}

/** Validate execution without resolving the saved identity again. */
export function executionWorkspace(directory: string | undefined): string {
	const path = savedWorkspace(directory);
	try {
		if (!statSync(path).isDirectory()) throw new Error("Not a directory");
	} catch (cause) {
		throw new Error(`Workspace is not available: ${path}`, { cause });
	}
	return path;
}
