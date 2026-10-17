import { expect, it } from "bun:test";
import { fileURLToPath } from "node:url";

async function help(entry: string, args: string[]): Promise<string> {
	const child = Bun.spawn(
		[process.execPath, "--conditions=neko-source", fileURLToPath(new URL(entry, import.meta.url)), ...args],
		{
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	const [out, code] = await Promise.all([new Response(child.stdout).text(), child.exited]);
	expect(code).toBe(0);
	return out;
}

it("documents the web search provider selection and credential variables in help", async () => {
	const root = await help("../src/main.ts", ["--help"]);
	for (const text of ["TAVILY_API_KEY", "DEEPSEEK_API_KEY", "/search", "webSearch.provider", "Tavily"])
		expect(root).toContain(text);
	const tui = await help("../../tui/src/main.ts", ["--help"]);
	for (const text of ["DEEPSEEK_API_KEY", "/search", "tavily"]) expect(tui).toContain(text);
	const serve = await help("../../gateway/src/main.ts", ["--help"]);
	for (const text of ["TAVILY_API_KEY", "webSearch.provider", "tavily"]) expect(serve).toContain(text);
});
