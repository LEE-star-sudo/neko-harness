// 2.4 配置层：查找（向上递归 + ~/.neko 兜底）、$ENV/${ENV} 插值、校验、
// 优先级合并（CLI > 配置文件 > 默认值）。
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	DEFAULT_NEKO_CONFIG,
	findNekoConfigFile,
	loadNekoConfig,
	mergeNekoConfig,
	parseNekoConfig,
} from "../src/index.ts";

let directories: string[] = [];
let home = "";

afterEach(async () => {
	for (const directory of directories) await rm(directory, { recursive: true, force: true });
	directories = [];
	if (home !== "") {
		process.env.HOME = home;
		home = "";
	}
});

async function makeDir(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "neko-config-"));
	directories.push(directory);
	return directory;
}

describe("neko.config.json (2.4)", () => {
	it("walks up from startDir to find neko.config.json", async () => {
		const root = await makeDir();
		await mkdir(join(root, "a", "b"), { recursive: true });
		await writeFile(join(root, "neko.config.json"), JSON.stringify({ theme: "dark" }));
		expect(findNekoConfigFile(join(root, "a", "b"))).toBe(join(root, "neko.config.json"));
		const config = loadNekoConfig(join(root, "a", "b"));
		expect(config.theme).toBe("dark");
	});

	it("falls back to ~/.neko/neko.config.json and returns {} when nothing is found", async () => {
		const root = await makeDir();
		home = process.env.HOME ?? "";
		process.env.HOME = root;
		expect(findNekoConfigFile(join(root, "nowhere"))).toBeUndefined();
		expect(loadNekoConfig(join(root, "nowhere"))).toEqual({});
		await mkdir(join(root, ".neko"), { recursive: true });
		await writeFile(join(root, ".neko", "neko.config.json"), JSON.stringify({ storagePath: "/tmp/x.sqlite" }));
		const config = loadNekoConfig(join(root, "nowhere"));
		expect(config.storagePath).toBe("/tmp/x.sqlite");
	});

	// biome-ignore lint/suspicious/noTemplateCurlyInString: naming the interpolation syntax under test
	it("interpolates $ENV and ${ENV} references", () => {
		const config = parseNekoConfig(
			JSON.stringify({
				apiKey: "$MY_KEY",
				// biome-ignore lint/suspicious/noTemplateCurlyInString: testing ${ENV} interpolation syntax
				storagePath: "${MY_DIR}/neko.sqlite",
				// biome-ignore lint/suspicious/noTemplateCurlyInString: testing ${ENV} interpolation syntax
				nested: { modelId: "${MY_MODEL}" },
			}),
			"test.json",
			{ MY_KEY: "secret", MY_DIR: "/data", MY_MODEL: "deepseek-flash" },
		);
		expect(config).toEqual({
			apiKey: "secret",
			storagePath: "/data/neko.sqlite",
			nested: { modelId: "deepseek-flash" },
		});
	});

	it("throws when a referenced environment variable is unset", () => {
		// biome-ignore lint/suspicious/noTemplateCurlyInString: testing ${ENV} interpolation syntax
		expect(() => parseNekoConfig('{"storagePath": "${NOPE}/x"}', "test.json", {})).toThrow(/NOPE/);
	});

	it("throws a clear error on bad JSON, naming the file", async () => {
		const root = await makeDir();
		await writeFile(join(root, "neko.config.json"), "{ oops");
		expect(() => loadNekoConfig(root)).toThrow(new RegExp(`${root.replace(/[/\\]/g, ".")}.*not valid JSON`));
	});

	it("rejects values of the wrong shape", () => {
		expect(() => parseNekoConfig('{"theme": "rainbow"}', "test.json", {})).toThrow(/theme/);
		expect(() => parseNekoConfig('{"defaultModel": {"provider": "x"}}', "test.json", {})).toThrow(/defaultModel/);
		expect(() => parseNekoConfig('{"gateway": {"port": "no"}}', "test.json", {})).toThrow(/gateway\.port/);
	});

	it("merges with CLI > config file > default priority", () => {
		const file = parseNekoConfig(
			JSON.stringify({
				defaultModel: { provider: "deepseek", modelId: "deepseek-v4-pro" },
				storagePath: "/file/x.sqlite",
				theme: "dark",
				gateway: { host: "127.0.0.1", port: 9000 },
			}),
			"test.json",
			{},
		);
		const cli = {
			storagePath: "/cli/y.sqlite",
			gateway: { port: 8321 },
		};
		const merged = mergeNekoConfig(mergeNekoConfig(DEFAULT_NEKO_CONFIG, file), cli);
		// CLI wins where given; the file fills the rest; defaults only where neither has a value.
		expect(merged.defaultModel).toEqual({ provider: "deepseek", modelId: "deepseek-v4-pro" });
		expect(merged.storagePath).toBe("/cli/y.sqlite");
		expect(merged.theme).toBe("dark");
		// gateway merges field by field: port from CLI, host from the file.
		expect(merged.gateway).toEqual({ host: "127.0.0.1", port: 8321 });
		// Defaults show through when nothing overrides them.
		expect(mergeNekoConfig(DEFAULT_NEKO_CONFIG, {}).defaultModel).toEqual(DEFAULT_NEKO_CONFIG.defaultModel);
		expect(mergeNekoConfig(DEFAULT_NEKO_CONFIG, {}).theme).toBe("auto");
	});
});
