import { execFile, spawn } from "node:child_process";
import { lstat, mkdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { installedVersion, UpdateChecker } from "@neko-harness/core/application-updates";
import { newer, stableVersion, upgradeCommand } from "@neko-harness/core/application-version";

export type UpdateCommandOptions = {
	entry?: string;
	runningVersion: string;
	platform?: NodeJS.Platform;
	run?: (args: string[], inherit?: boolean) => Promise<string>;
	checker?: UpdateChecker;
};
async function runBun(args: string[], inherit = false): Promise<string> {
	if (!inherit) {
		const { stdout } = await promisify(execFile)(process.execPath, args, { maxBuffer: 1048576 });
		return stdout.trim();
	}
	await new Promise<void>((resolve, reject) => {
		const child = spawn(process.execPath, args, { stdio: "inherit" });
		child.once("error", reject);
		child.once("exit", (code) => (code === 0 ? resolve() : reject(new Error("Bun command failed"))));
	});
	return "";
}
export async function confirmGlobalInstallation(
	entry: string,
	run = runBun,
): Promise<{ manifest: string; entry: string; lock: string }> {
	const bin = await run(["pm", "bin", "-g"]);
	const executable = await realpath(entry);
	const globalEntry = await realpath(join(bin, "neko"));
	const root = dirname(dirname(executable));
	const manifest = join(root, "package.json");
	if (
		globalEntry !== executable ||
		basename(root) !== "neko-harness" ||
		basename(dirname(root)) !== "node_modules" ||
		(await lstat(root)).isSymbolicLink() ||
		!(await installedVersion(manifest))
	)
		throw new Error("unsupported");
	const globalManifest = JSON.parse(await readFile(join(dirname(dirname(root)), "package.json"), "utf8"));
	const dependency = globalManifest.dependencies?.["neko-harness"];
	if (typeof dependency !== "string" || /^(file:|link:|workspace:)/.test(dependency)) throw new Error("unsupported");
	return { manifest, entry: executable, lock: join(dirname(dirname(root)), ".neko-update.lock") };
}
export async function acquireUpdateLock(path: string): Promise<() => Promise<void>> {
	const token = crypto.randomUUID();
	try {
		await stat(`${path}.reclaim`);
		throw new Error("升级进行中，请稍后重试。");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	try {
		await mkdir(path);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
		let owner: { pid: number; token: string };
		try {
			owner = JSON.parse(await readFile(join(path, "owner.json"), "utf8"));
		} catch {
			throw new Error("升级进行中，请稍后重试。");
		}
		if (!Number.isSafeInteger(owner.pid) || owner.pid < 1) throw new Error("升级进行中，请稍后重试。");
		try {
			process.kill(owner.pid, 0);
			throw new Error("升级进行中，请稍后重试。");
		} catch (e) {
			if ((e as NodeJS.ErrnoException).code !== "ESRCH") throw new Error("升级进行中，请稍后重试。");
		}
		// Serialize stale-owner reclamation so competing updaters cannot erase a new lock.
		const gate = `${path}.reclaim`;
		try {
			await mkdir(gate);
		} catch {
			throw new Error("升级进行中，请稍后重试。");
		}
		try {
			const current = JSON.parse(await readFile(join(path, "owner.json"), "utf8"));
			if (current.token !== owner.token) throw new Error("升级进行中，请稍后重试。");
			await rm(path, { recursive: true });
			await mkdir(path);
		} finally {
			await rm(gate, { recursive: true, force: true });
		}
	}
	try {
		await writeFile(join(path, "owner.json"), JSON.stringify({ pid: process.pid, token }));
	} catch (error) {
		await rm(path, { recursive: true, force: true });
		throw error;
	}
	return async () => {
		try {
			const owner = JSON.parse(await readFile(join(path, "owner.json"), "utf8"));
			if (owner.token === token) await rm(path, { recursive: true });
		} catch {}
	};
}
export async function updateCommand(options: UpdateCommandOptions): Promise<string> {
	if ((options.platform ?? process.platform) === "win32")
		return `请先退出 neko，然后运行：\n${upgradeCommand("win32")}\n完成后重新启动 neko。`;
	if (!stableVersion(options.runningVersion)) throw new Error("当前安装方式不支持自升级，请按原方式更新。");
	const run = options.run ?? runBun;
	let install: Awaited<ReturnType<typeof confirmGlobalInstallation>>;
	try {
		install = await confirmGlobalInstallation(options.entry ?? fileURLToPath(import.meta.url), run);
	} catch {
		throw new Error("当前安装方式不支持自升级，请按原方式更新。");
	}
	const release = await acquireUpdateLock(install.lock);
	const checker =
		options.checker ?? new UpdateChecker({ manifest: install.manifest, runningVersion: options.runningVersion });
	try {
		const state = await checker.check(true);
		const current = await installedVersion(install.manifest);
		if (state.checkState !== "ok" || !state.latestVersion || !current)
			throw new Error("检查失败，请重试 neko update。");
		if (!newer(state.latestVersion, current)) return `已是最新版 v${current}。`;
		await run(["add", "--global", `neko-harness@${state.latestVersion}`], true);
		const actual = await installedVersion(install.manifest);
		const fresh = await run([install.entry, "--version"]);
		if (!actual || actual !== fresh || newer(state.latestVersion, actual))
			throw new Error("Installation verification failed");
		return `已升级至 v${actual}。重新启动 neko 生效。`;
	} catch (error) {
		if (error instanceof Error && error.message.startsWith("检查失败")) throw error;
		throw new Error("升级失败，请重试 neko update。");
	} finally {
		checker.close();
		await release();
	}
}
