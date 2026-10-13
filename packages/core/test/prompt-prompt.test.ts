import { afterEach, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { PromptInput } from "@earendil-works/pi-durable";
import { createNekoPrompt } from "../src/prompt/prompt.ts";
import { createResourceLoader } from "../src/prompt/resources.ts";

const dirs: string[] = [];
function directory() {
	const d = realpathSync(mkdtempSync(join(tmpdir(), "neko-prompt-")));
	dirs.push(d);
	return d;
}
afterEach(() => {
	for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const input = (cwd: string, tools: string[]): PromptInput =>
	({
		agent: { cwd, tools: tools.map((name) => ({ name })) },
		read: { snapshot: async () => ({ role: null, parentId: null }) },
	}) as unknown as PromptInput;

const renderAll = async (home: string, cwd: string, tools: string[]) => {
	const load = createResourceLoader(home, undefined, { builtinDir: null });
	const extension = createNekoPrompt((_id, workspace) => load(workspace));
	const out: Record<string, string | undefined> = {};
	const shared = input(cwd, tools);
	for (const s of extension.sections ?? []) out[s.key] = await s.render(shared, BACKGROUND_CONTEXT);
	return { keys: (extension.sections ?? []).map((s) => s.key), out };
};

it("renders five ordered sections, untagged preamble, tagged rest", async () => {
	const home = directory();
	const workspace = directory();
	const { keys, out } = await renderAll(home, workspace, ["read", "bash"]);
	expect(keys).toEqual(["preamble", "rules", "project_context", "skills", "cwd"]);
	expect(out.preamble).not.toContain("<preamble>");
	expect(out.rules).toMatch(/^<rules>\n/);
	expect(out.project_context).toBeUndefined();
	expect(out.skills).toBeUndefined();
	expect(out.cwd).toBe(`<cwd>\n${workspace}\n</cwd>`);
});

it("renders project_context and skills when resources exist", async () => {
	const home = directory();
	const workspace = directory();
	mkdirSync(join(home, ".agents"), { recursive: true });
	writeFileSync(join(home, ".agents", "AGENTS.md"), "user rules");
	writeFileSync(join(workspace, "AGENTS.md"), "project rules");
	const skillDir = join(workspace, ".agents", "skills", "pdf");
	mkdirSync(skillDir, { recursive: true });
	writeFileSync(join(skillDir, "SKILL.md"), "---\ndescription: Read PDFs\n---\nbody");

	const { out } = await renderAll(home, workspace, ["read"]);
	expect(out.project_context).toContain(`<project_instructions path="${join(home, ".agents", "AGENTS.md")}">`);
	expect(out.project_context).toContain("user rules");
	expect(out.project_context).toContain("project rules");
	expect(out.skills).toContain("<available_skills>");
	expect(out.skills).toContain("<name>pdf</name>");
});

it("escapes instruction paths embedded in XML attributes", async () => {
	const extension = createNekoPrompt(async () => ({
		contextFiles: [{ path: '/project/"quoted"/AGENTS.md', content: "rules" }],
		skills: [],
	}));
	const shared = input("/project", ["read"]);
	const output = await Promise.all((extension.sections ?? []).map((s) => s.render(shared, BACKGROUND_CONTEXT)));
	expect(output.join("\n")).toContain('path="/project/&quot;quoted&quot;/AGENTS.md"');
});
