import { chmod, cp, rm } from "node:fs/promises";
import manifest from "../package.json";

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
