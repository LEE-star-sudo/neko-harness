import { afterEach, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxAssistantMessage, fauxText, getCurrentSystemMessage, type TranscriptContext } from "@earendil-works/pi-ai";
import { fauxProvider } from "../../../test/faux.ts";
import { MemoryCredentialStore } from "../src/credentials.ts";
import { createNekoRuntime } from "../src/index.ts";

const dirs: string[] = [];
function directory() {
	const d = realpathSync(mkdtempSync(join(tmpdir(), "neko-prompt-e2e-")));
	dirs.push(d);
	return d;
}
afterEach(() => {
	for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

it("injects five prompt sections with AGENTS.md and skills, refreshing after edits", async () => {
	const home = directory();
	const workspace = directory();
	mkdirSync(join(home, ".agents"), { recursive: true });
	writeFileSync(join(home, ".agents", "AGENTS.md"), "user rules");
	writeFileSync(join(workspace, "AGENTS.md"), "project rules v1");
	const skillDir = join(workspace, ".agents", "skills", "pdf");
	mkdirSync(skillDir, { recursive: true });
	writeFileSync(join(skillDir, "SKILL.md"), `---\ndescription: Read PDFs\n---\nbody`);

	const contexts: TranscriptContext[] = [];
	const faux = fauxProvider({ models: [{ id: "faux-1" }] });
	faux.setResponses([
		(context) => {
			contexts.push(context);
			return fauxAssistantMessage([fauxText("one")]);
		},
		(context) => {
			contexts.push(context);
			return fauxAssistantMessage([fauxText("two")]);
		},
		(context) => {
			contexts.push(context);
			return fauxAssistantMessage([fauxText("three")]);
		},
	]);
	const runtime = await createNekoRuntime({
		storage: "memory",
		credentials: new MemoryCredentialStore(),
		providers: [faux.provider],
		model: { provider: "faux", modelId: "faux-1" },
		cwd: workspace,
		promptHome: home,
	});
	try {
		await runtime.waitAnswer(await runtime.submit("hello"));
		const first = getCurrentSystemMessage(contexts[0]!.messages)?.sections ?? {};
		expect(first.preamble).toContain("expert coding assistant");
		expect(first.rules).toContain("Use read to examine files");
		expect(first.project_context).toContain("user rules");
		expect(first.project_context).toContain("project rules v1");
		expect(first.skills).toContain("<name>pdf</name>");
		expect(first.skills).toContain(join(skillDir, "SKILL.md"));
		expect(first.cwd).toBe(`<cwd>\n${workspace}\n</cwd>`);

		writeFileSync(join(workspace, "AGENTS.md"), "project rules v2");
		await runtime.waitAnswer(await runtime.submit("again"));
		const second = getCurrentSystemMessage(contexts[1]!.messages)?.sections ?? {};
		expect(second.project_context).toContain("project rules v2");
		expect(second.project_context).not.toContain("project rules v1");
		rmSync(join(workspace, "AGENTS.md"));
		rmSync(join(home, ".agents", "AGENTS.md"));
		rmSync(skillDir, { recursive: true });
		await runtime.waitAnswer(await runtime.submit("after deletion"));
		const third = getCurrentSystemMessage(contexts[2]!.messages)?.sections ?? {};
		expect(third.project_context).toBeUndefined();
		expect(third.skills).toBeUndefined();
		expect(third.preamble).toContain("expert coding assistant");
	} finally {
		await runtime.close();
	}
});
