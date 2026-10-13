import { chmod, cp, rm } from "node:fs/promises";
import manifest from "../package.json";

// The ordinary workspace build labels the client as development. Build the published client with the same release marker as the Bun bundles.
const clientBuild = Bun.spawn([process.execPath, "run", "--cwd", "packages/web", "build"], {
	env: { ...process.env, NEKO_RELEASE_BUILD: "1" },
	stdout: "inherit",
	stderr: "inherit",
});
if ((await clientBuild.exited) !== 0) throw new Error("Release client build failed");
await rm("dist", { recursive: true, force: true });
for (const [name, entry] of Object.entries({ neko: "cli", gateway: "gateway" })) {
	const result = await Bun.build({
		entrypoints: [`packages/${entry}/src/main.ts`],
		outdir: "dist",
		naming: `${name}.js`,
		target: "bun",
		format: "esm",
		conditions: ["neko-source"],
		external: Object.keys(manifest.dependencies),
		define: {
			"process.env.NEKO_RELEASE_BUILD": JSON.stringify("1"),
			"process.env.NEKO_RELEASE_VERSION": JSON.stringify(manifest.version),
			NEKO_BUILD_VERSION: JSON.stringify(manifest.version),
		},
	});
	if (!result.success) throw new AggregateError(result.logs, `Failed to build ${name}`);
}
await cp("packages/web/dist/client", "dist/client", { recursive: true });
// Builtin skills ship as runtime files next to the bundled binaries (dist/skills/),
// resolved by core's BUILTIN_SKILLS_DIR probe from dist/neko.js / dist/gateway.js.
await cp("packages/core/skills", "dist/skills", { recursive: true });
await chmod("dist/neko.js", 0o755);
console.log(`Built neko-harness ${manifest.version}`);
