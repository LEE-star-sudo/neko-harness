import { realpath, stat } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { BACKGROUND_CONTEXT, withAbortSignal } from "@earendil-works/chord/context";
import { type FileListing, type FileWatcher, getOrThrow } from "@earendil-works/pi-durable/env";
import { Connection, LocalExecutionEnv, localDaemon } from "@earendil-works/pi-env";
import type { FileCandidates } from "./file-mentions.ts";

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

export const FILE_CACHE_LIMITS = {
	keys: 8,
	entries: 200_000,
	bytes: 32 * 1024 * 1024,
	maxEntries: 50_000,
	maxBytes: 4 * 1024 * 1024,
	scanMs: 2000,
	startupMs: 5000,
	ttlMs: 30_000,
	idleMs: 300_000,
	concurrent: 2,
};
type Cached = {
	base: string;
	root: string;
	generation: number;
	used: number;
	loaded: number;
	bytes: number;
	listing?: FileListing;
	watch?: WorkspaceWatch;
	work?: Promise<FileListing>;
	controller?: AbortController;
	waiters: number;
};

type WorkspaceWatch = { users: Set<Cached>; controller: AbortController; work: Promise<void>; watcher?: FileWatcher };

/** One local helper and bounded directory snapshots, shared across all frontend queries. */
export class WorkspaceFiles {
	#connection?: Connection;
	#starting?: Promise<void>;
	#session?: number;
	#cache = new Map<string, Cached>();
	#disposing = new Set<Promise<void>>();
	#watches = new Map<string, WorkspaceWatch>();
	#jobs = new Set<Promise<FileListing>>();
	#closed = false;
	#closing?: Promise<void>;
	#active = 0;
	#waiting = new Set<() => void>();
	#timer: ReturnType<typeof setInterval>;
	private limits: typeof FILE_CACHE_LIMITS;
	constructor(limits = FILE_CACHE_LIMITS) {
		this.limits = limits;
		this.#timer = setInterval(
			() => {
				for (const [key, item] of this.#cache)
					if (!item.waiters && Date.now() - item.used >= this.limits.idleMs) this.#drop(key, item);
			},
			Math.min(10_000, limits.idleMs),
		);
		this.#timer.unref();
	}
	get stats() {
		const items = [...this.#cache.values()];
		return {
			keys: items.length,
			watchers: [...this.#watches.values()].filter((watch) => watch.watcher).length,
			entries: items.reduce((n, item) => n + (item.listing?.entries.length ?? 0), 0),
			bytes: items.reduce((n, item) => n + item.bytes, 0),
			active: this.#active,
			queued: this.#waiting.size,
		};
	}

	env(cwd: string) {
		if (this.#closed) throw new Error("File environment closed");
		this.#connection ??= new Connection({ command: [localDaemon()] });
		return new LocalExecutionEnv({
			connection: this.#connection,
			cwd,
			...(process.platform === "win32" ? { shellEnv: { PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" } } : {}),
		});
	}
	async #ready() {
		if (!this.#starting) {
			this.env(process.cwd());
			const connection = this.#connection!;
			let timer: ReturnType<typeof setTimeout>;
			const work = Promise.race([
				connection.info().then(() => connection.session()),
				new Promise<never>((_, reject) => {
					timer = setTimeout(
						() => reject(new Error("File discovery startup timed out. Retry.")),
						this.limits.startupMs,
					);
				}),
			])
				.then((session) => {
					if (this.#session !== undefined && session !== this.#session)
						for (const item of this.#cache.values()) {
							item.generation++;
							item.loaded = 0;
						}
					this.#session = session;
				})
				.catch((error) => {
					if (this.#connection === connection) {
						connection.close();
						this.#connection = undefined;
						this.#session = undefined;
						this.#starting = undefined;
						for (const item of this.#cache.values()) {
							item.generation++;
							item.loaded = 0;
						}
					}
					throw error;
				})
				.finally(() => {
					clearTimeout(timer);
					if (this.#starting === work) this.#starting = undefined;
				});
			this.#starting = work;
		}
		return this.#starting;
	}
	#drop(key: string, item: Cached) {
		this.#cache.delete(key);
		item.generation++;
		item.controller?.abort();
		this.#closeWatcher(item);
	}
	#disposeWatch(watch: WorkspaceWatch) {
		watch.controller.abort();
		const closing = watch.work
			.catch(() => {})
			.then(() => watch.watcher?.close(BACKGROUND_CONTEXT))
			.then(() => {})
			.catch(() => {})
			.finally(() => this.#disposing.delete(closing));
		this.#disposing.add(closing);
	}
	#closeWatcher(item: Cached) {
		const watch = item.watch;
		item.watch = undefined;
		if (!watch) return;
		watch.users.delete(item);
		if (!watch.users.size) {
			if (this.#watches.get(item.root) === watch) this.#watches.delete(item.root);
			this.#disposeWatch(watch);
		}
	}
	async #watch(item: Cached, env: LocalExecutionEnv) {
		let watch = this.#watches.get(item.root);
		if (!watch) {
			const current: WorkspaceWatch = { users: new Set(), controller: new AbortController(), work: Promise.resolve() };
			watch = current;
			this.#watches.set(item.root, current);
			const forget = () => {
				current.controller.abort();
				if (this.#watches.get(item.root) === current) this.#watches.delete(item.root);
				for (const user of current.users) user.watch = undefined;
				current.users.clear();
			};
			current.work = (async () => {
				const targets: import("@earendil-works/pi-durable/env").WatchTarget[] = [
					{ path: item.root, recursive: true, exclude: { names: [".git"] } },
				];
				const git = resolve(item.root, ".git");
				if (
					await stat(git).then(
						() => true,
						() => false,
					)
				)
					targets.push({ path: git, recursive: true, exclude: { names: ["objects", "logs", "refs"] } });
				const result = await env.watch(
					targets,
					(change) => {
						for (const user of current.users) {
							user.generation++;
							user.loaded = 0;
						}
						if ("error" in change) {
							if (this.#watches.get(item.root) === current) this.#watches.delete(item.root);
							for (const user of [...current.users]) this.#closeWatcher(user);
						}
					},
					withAbortSignal(current.controller.signal, BACKGROUND_CONTEXT),
				);
				if (result.ok) {
					current.watcher = result.value;
					if (current.controller.signal.aborted) await result.value.close(BACKGROUND_CONTEXT);
				} else {
					forget();
				}
			})().catch(forget);
		}
		watch.users.add(item);
		item.watch = watch;
		await watch.work;
	}

	#bound() {
		for (;;) {
			const values = [...this.#cache.entries()];
			if (
				values.length <= this.limits.keys &&
				values.reduce((n, [, i]) => n + (i.listing?.entries.length ?? 0), 0) <= this.limits.entries &&
				values.reduce((n, [, i]) => n + i.bytes, 0) <= this.limits.bytes
			)
				return;
			const oldest = values.filter(([, i]) => !i.waiters && !i.work).sort((a, b) => a[1].used - b[1].used)[0];
			if (!oldest) throw new Error("File discovery busy. Retry shortly.");
			this.#drop(...oldest);
		}
	}
	async #scan(item: Cached): Promise<FileListing> {
		const controller = new AbortController();
		item.controller = controller;
		const context = withAbortSignal(controller.signal, BACKGROUND_CONTEXT);
		while (this.#active >= this.limits.concurrent) {
			await new Promise<void>((resolve, reject) => {
				const wake = () => {
						cleanup();
						resolve();
					},
					abort = () => {
						cleanup();
						reject(new Error("File search cancelled."));
					};
				const cleanup = () => {
					this.#waiting.delete(wake);
					controller.signal.removeEventListener("abort", abort);
				};
				this.#waiting.add(wake);
				controller.signal.addEventListener("abort", abort, { once: true });
				if (controller.signal.aborted) abort();
			});
		}
		this.#active++;
		try {
			await this.#ready();
			controller.signal.throwIfAborted();
			const env = this.env(item.base);
			if (!item.watch) await this.#watch(item, env);
			const generation = item.generation;
			const result = await env.listFiles(
				".",
				{
					hidden: true,
					gitignore: true,
					maxEntries: this.limits.maxEntries,
					maxBytes: this.limits.maxBytes,
					timeoutMs: this.limits.scanMs,
				},
				context,
			);
			if (!result.ok && (result.error.code === "unknown" || result.error.code === "not_supported")) {
				this.#connection?.close();
				this.#connection = undefined;
				this.#session = undefined;
				this.#starting = undefined;
				for (const i of this.#cache.values()) {
					i.loaded = 0;
					i.generation++;
				}
			}
			const listing = getOrThrow(result);
			controller.signal.throwIfAborted();
			if (this.#closed || item.generation !== generation)
				throw new Error("Workspace changed during file search. Retry.");
			item.listing = listing;
			item.loaded = Date.now();
			item.bytes = Buffer.byteLength(JSON.stringify(listing));
			return listing;
		} finally {
			this.#active--;
			for (const wake of this.#waiting) wake();
		}
	}
	async search(root: string, query: string, signal: AbortSignal): Promise<FileCandidates> {
		signal.throwIfAborted();
		if (this.#closed) throw new Error("File environment closed");
		query = relativeQuery(query);
		const slash = query.lastIndexOf("/"),
			prefix = slash < 0 ? "" : query.slice(0, slash + 1),
			needle = query.slice(slash + 1);
		root = await realpath(root);
		const base = await workspaceTarget(root, prefix);
		if (!(await stat(base)).isDirectory()) throw new Error("Workspace directory is unavailable.");
		const key = `${this.env(base).id}\0git-hidden\0${root}\0${base}`;
		let item = this.#cache.get(key);
		if (!item) {
			item = { base, root, generation: 0, used: Date.now(), loaded: 0, bytes: 0, waiters: 1 };
			this.#cache.set(key, item);
			try {
				this.#bound();
			} catch (error) {
				this.#drop(key, item);
				throw error;
			}
			item.waiters--;
		}
		item.used = Date.now();
		item.waiters++;
		try {
			if (!item.listing || Date.now() - item.loaded >= this.limits.ttlMs) {
				if (!item.work) {
					const current = item;
					current.work = this.#scan(current).finally(() => {
						this.#jobs.delete(current.work!);
						current.work = undefined;
						current.controller = undefined;
					});
					this.#jobs.add(current.work);
				}
				await cancellable(item.work!, signal);
			}
			const pattern = new RegExp(
				[...needle].map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*"),
				/[A-Z]/.test(needle) ? "" : "i",
			);
			const entries: FileCandidates["entries"] = [];
			const candidates = item
				.listing!.entries.filter(
					(candidate) =>
						candidate.kind !== "symlink" &&
						(needle || !candidate.path.includes("/")) &&
						pattern.test(basename(candidate.path)),
				)
				.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "directory" ? -1 : 1) || a.path.localeCompare(b.path));
			for (const candidate of candidates) {
				if (candidate.kind === "symlink") continue;
				const local = prefix + candidate.path;
				if ([...local].some((c) => c.charCodeAt(0) < 32 || c === '"' || c === "\\")) continue;
				try {
					await workspaceTarget(root, local);
					entries.push({ name: basename(local), path: local, kind: candidate.kind });
				} catch {
					/* disappeared or outside */
				}
				signal.throwIfAborted();
				if (entries.length > 100) break;
			}
			return { entries: entries.slice(0, 100), limited: entries.length > 100, incomplete: item.listing!.truncated };
		} finally {
			item.waiters--;
			if (!item.waiters && item.work) {
				item.controller?.abort();
				if (!item.listing) this.#drop(key, item);
			}
			this.#bound();
		}
	}
	remove(root: string) {
		for (const [key, item] of this.#cache) if (item.root === root) this.#drop(key, item);
	}
	close() {
		this.#closing ??= (async () => {
			this.#closed = true;
			clearInterval(this.#timer);
			const pending = [...this.#jobs];
			for (const [key, item] of this.#cache) this.#drop(key, item);
			this.#connection?.close();
			await Promise.allSettled(pending);
			await Promise.allSettled([...this.#disposing]);
		})();
		return this.#closing;
	}
}
function cancellable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
	return new Promise((resolve, reject) => {
		const abort = () => {
				cleanup();
				reject(new Error("File search cancelled."));
			},
			cleanup = () => signal.removeEventListener("abort", abort);
		signal.addEventListener("abort", abort, { once: true });
		work.then(
			(value) => {
				cleanup();
				resolve(value);
			},
			(error) => {
				cleanup();
				reject(error);
			},
		);
		if (signal.aborted) abort();
	});
}
