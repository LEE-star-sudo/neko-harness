import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import manifest from "../package.json";

async function run(cmd: string[], cwd: string, env = process.env) {
	const child = Bun.spawn(cmd, { cwd, env, stdout: "pipe", stderr: "pipe" });
	const [stdout, stderr, code] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	if (code !== 0) throw new Error(`${cmd[0]} failed (${code})\n${stdout}\n${stderr}`);
	return stdout;
}
const root = resolve(import.meta.dir, "..");
await mkdir(join(root, "artifacts"), { recursive: true });
await run([process.execPath, "pm", "pack", "--destination", "artifacts"], root);
const archive = join(root, "artifacts", `neko-harness-${manifest.version}.tgz`);
const listing = await run(["tar", "-tzf", archive], root);
const files = listing
	.trim()
	.split("\n")
	.filter((name) => !name.endsWith("/"));
for (const file of files) {
	if (!/^package\/(dist\/|package\.json$|README\.md$|LICENSE$)/.test(file)) {
		throw new Error(`Unexpected published file: ${file}`);
	}
}
for (const required of [
	"dist/neko.js",
	"dist/gateway.js",
	"dist/client/index.html",
	"dist/skills/skill-creator/SKILL.md",
	"dist/skills/skill-finder/SKILL.md",
	"LICENSE",
]) {
	if (!files.includes(`package/${required}`)) throw new Error(`Missing ${required}`);
}
const packed = JSON.parse(await run(["tar", "-xOf", archive, "package/package.json"], root));
if (packed.private || packed.name !== "neko-harness" || packed.version !== manifest.version) {
	throw new Error("Invalid published manifest");
}
if (Object.keys(packed.dependencies).some((name) => name.startsWith("@neko-harness/"))) {
	throw new Error("Internal workspace dependency escaped into published package");
}
const temp = await mkdtemp(join(tmpdir(), "neko-package-"));
let web: ReturnType<typeof Bun.spawn> | undefined;
try {
	await Bun.write(
		join(temp, "package.json"),
		JSON.stringify({ private: true, dependencies: { "neko-harness": archive } }),
	);
	await run([process.execPath, "install", "--production", "--ignore-scripts"], temp);
	const cli = join(temp, "node_modules", ".bin", "neko");
	const env = { ...process.env, HOME: join(temp, "home"), DEEPSEEK_API_KEY: "", TAVILY_API_KEY: "" };
	await mkdir(env.HOME, { recursive: true });
	if ((await run([cli, "--version"], temp, env)).trim() !== manifest.version) throw new Error("Version mismatch");
	for (const command of ["tui", "web", "serve"]) {
		const help = await run([cli, command, "--help"], temp, env);
		if (!help.includes("--help")) throw new Error(`Missing ${command} help`);
	}
	await run(
		[
			process.execPath,
			"-e",
			`const p = Bun.resolveSync('sharp', './node_modules/neko-harness/dist/neko.js'); const {default: sharp} = await import(p); await sharp({create:{width:1,height:1,channels:3,background:'#fff'}}).png().toBuffer();`,
		],
		temp,
		env,
	);
	const port = await new Promise<number>((resolvePort, reject) => {
		const server = createServer();
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (!address || typeof address === "string") throw new Error("Missing port");
			server.close(() => resolvePort(address.port));
		});
	});
	web = Bun.spawn(
		[
			cli,
			"web",
			"--no-open",
			"--port",
			"0",
			"--gateway-port",
			String(port),
			"--storage",
			join(temp, "data", "neko.sqlite"),
		],
		{ cwd: temp, env, stdout: "pipe", stderr: "pipe" },
	);
	let logs = "";
	const collect = async (stream: ReadableStream<Uint8Array>) => {
		for await (const chunk of stream) logs += new TextDecoder().decode(chunk);
	};
	const readers = Promise.all([
		collect(web.stdout as ReadableStream<Uint8Array>),
		collect(web.stderr as ReadableStream<Uint8Array>),
	]);
	let url: string | undefined;
	for (let i = 0; i < 150; i++) {
		url = logs.match(/neko web 已启动: (http:\/\/[^\s]+)/)?.[1];
		if (url) break;
		if (web.exitCode !== null) throw new Error(`Web exited early: ${logs}`);
		await Bun.sleep(200);
	}
	if (!url) throw new Error(`Web startup timed out: ${logs}`);
	const response = await fetch(url);
	const html = await response.text();
	if (!response.ok || !html.includes('id="root"')) throw new Error("Web HTML unavailable");
	const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)];
	if (assets.length < 2) throw new Error("Missing Web assets");
	for (const asset of assets) {
		if (!(await fetch(new URL(asset[1]!, url))).ok) throw new Error(`Missing asset ${asset[1]}`);
	}
	web.kill("SIGTERM");
	const exit = await Promise.race([
		web.exited,
		Bun.sleep(10_000).then(() => {
			throw new Error("Web shutdown timed out");
		}),
	]);
	await readers;
	if (exit !== 0) throw new Error(`Web failed to shut down: ${logs}`);
	console.log(`Package smoke test passed: ${archive} (${files.length} files)`);
} finally {
	if (web && web.exitCode === null) web.kill("SIGKILL");
	await rm(temp, { recursive: true, force: true });
}
