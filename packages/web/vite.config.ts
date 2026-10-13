import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	define: {
		NEKO_BUILD_VERSION: JSON.stringify(
			process.env.NEKO_RELEASE_BUILD === "1"
				? (await import("../../package.json", { with: { type: "json" } })).default.version
				: "development",
		),
	},
	plugins: [react(), tailwindcss()],
	build: {
		outDir: "dist/client",
		emptyOutDir: true,
	},
});
