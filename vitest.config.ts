import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const packageSrc = (name: string): string => fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
	resolve: {
		alias: [
			{ find: /^@neko-harness\/core$/, replacement: packageSrc("core") },
			{ find: /^@neko-harness\/gateway$/, replacement: packageSrc("gateway") },
			{ find: /^@neko-harness\/tui$/, replacement: packageSrc("tui") },
			{ find: /^@neko-harness\/web$/, replacement: packageSrc("web") },
			{ find: /^@neko-harness\/cli$/, replacement: packageSrc("cli") },
		],
	},
	test: {
		include: ["packages/*/test/**/*.test.ts"],
	},
});
