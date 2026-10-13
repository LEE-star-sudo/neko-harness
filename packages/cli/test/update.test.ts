import { expect, it } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { UpdateChecker } from "../../core/src/application-updates.ts";
import { acquireUpdateLock, confirmGlobalInstallation, updateCommand } from "../src/update.ts";

it("only updates the same global installation and verifies a fresh executable", async () => {
	const dir = await mkdtemp(join(tmpdir(), "neko-update-cli-"));
	try {
		const root = join(dir, "global/node_modules/neko-harness"),
			bin = join(dir, "custom-bin"),
			entry = join(root, "dist/neko.js"),
			manifest = join(root, "package.json");
		await mkdir(join(root, "dist"), { recursive: true });
		await mkdir(bin);
		await writeFile(entry, "fixture");
		await writeFile(join(dir, "global/package.json"), JSON.stringify({ dependencies: { "neko-harness": "^1.0.0" } }));
		await symlink(entry, join(bin, "neko"));
		let installations = 0,
			fail = false,
			fake = false;
		let latest = "1.1.0";
		const reset = () => writeFile(manifest, JSON.stringify({ name: "neko-harness", version: "1.0.0" }));
		await reset();
		const run = async (args: string[]) => {
			if (args[0] === "pm") return bin;
			if (args[0] === "add") {
				expect(args).toEqual(["add", "--global", "neko-harness@1.1.0"]);
				installations++;
				latest = "1.2.0"; // The registry tag moves after the install target has been selected.
				if (fail) throw Object.assign(new Error("permission denied"), { code: "EACCES" });
				if (!fake) await writeFile(manifest, JSON.stringify({ name: "neko-harness", version: "1.1.0" }));
				return "";
			}
			expect(args).toEqual([await realpath(entry), "--version"]);
			return fake ? "1.0.0" : "1.1.0";
		};
		const checker = () =>
			new UpdateChecker({
				runningVersion: "1.0.0",
				manifest,
				cachePath: join(dir, "cache"),
				fetch: async () => Response.json({ name: "neko-harness", version: latest }),
			});
		expect(await updateCommand({ entry, runningVersion: "1.0.0", run, checker: checker() })).toContain(
			"已升级至 v1.1.0",
		);
		expect(latest).toBe("1.2.0");
		latest = "1.1.0";
		expect(await updateCommand({ entry, runningVersion: "1.0.0", run, checker: checker() })).toContain("已是最新版");
		expect(installations).toBe(1);
		await writeFile(manifest, JSON.stringify({ name: "neko-harness", version: "1.2.0" }));
		expect(await updateCommand({ entry, runningVersion: "1.0.0", run, checker: checker() })).toContain("v1.2.0");
		expect(installations).toBe(1);
		const offline = new UpdateChecker({
			runningVersion: "1.0.0",
			manifest,
			cachePath: join(dir, "offline-cache"),
			fetch: async () => new Response("offline", { status: 503 }),
		});
		await expect(updateCommand({ entry, runningVersion: "1.0.0", run, checker: offline })).rejects.toThrow("检查失败");
		await reset();
		fail = true;
		await expect(updateCommand({ entry, runningVersion: "1.0.0", run, checker: checker() })).rejects.toThrow(
			"升级失败",
		);
		fail = false;
		latest = "1.1.0";
		fake = true;
		await expect(updateCommand({ entry, runningVersion: "1.0.0", run, checker: checker() })).rejects.toThrow(
			"升级失败",
		);
		await expect(updateCommand({ entry, runningVersion: "development", run })).rejects.toThrow("不支持自升级");
		await expect(confirmGlobalInstallation(join(dir, "other"), run)).rejects.toThrow();
		await writeFile(
			join(dir, "global/package.json"),
			JSON.stringify({ dependencies: { "neko-harness": "link:neko-harness" } }),
		);
		await expect(confirmGlobalInstallation(entry, run)).rejects.toThrow("unsupported");
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
it("serializes update attempts and releases ownership", async () => {
	const dir = await mkdtemp(join(tmpdir(), "neko-update-lock-")),
		lock = join(dir, "lock");
	try {
		const release = await acquireUpdateLock(lock);
		await expect(acquireUpdateLock(lock)).rejects.toThrow("稍后重试");
		await release();
		await (await acquireUpdateLock(lock))();
		await mkdir(lock);
		await writeFile(join(lock, "owner.json"), JSON.stringify({ pid: 2147483647, token: "dead" }));
		await (await acquireUpdateLock(lock))();
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

it("only returns manual instructions on Windows, before touching installation or updates", async () => {
	for (const runningVersion of ["0.2.7", "development"]) {
		const text = await updateCommand({
			platform: "win32",
			runningVersion,
			get entry(): string {
				throw new Error("Installation must not be inspected");
			},
			get run(): never {
				throw new Error("Bun must not be invoked");
			},
			get checker(): never {
				throw new Error("Updates must not be checked");
			},
		});
		expect(text).toBe("请先退出 neko，然后运行：\nbun add --global neko-harness@latest\n完成后重新启动 neko。");
		expect(text).not.toContain("已升级");
		expect(text).not.toContain("已是最新版");
	}
});

it("documents manual Windows updates and rejects invalid update arguments", async () => {
	const entry = fileURLToPath(new URL("../src/main.ts", import.meta.url));
	for (const args of [["--help"], ["--invalid"], ["--help", "extra"]]) {
		const child = Bun.spawn([process.execPath, "--conditions=neko-source", entry, "update", ...args], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const [out, err, code] = await Promise.all([
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
			child.exited,
		]);
		if (args.length === 1 && args[0] === "--help") {
			expect(code).toBe(0);
			expect(out).toContain("Windows：先退出 neko，再运行 bun add --global neko-harness@latest");
		} else {
			expect(code).not.toBe(0);
			expect(err).toContain("用法: neko update");
		}
	}
});
