import { afterEach, expect, it } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createResourceLoader } from "../src/prompt/resources.ts";

const dirs: string[] = [];
function directory() {
	const d = realpathSync(mkdtempSync(join(tmpdir(), "neko-resources-")));
	dirs.push(d);
	return d;
}
afterEach(() => {
	for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const writeAgents = (dir: string, content: string) => writeFileSync(join(dir, "AGENTS.md"), content);
const writeSkill = (dir: string, name: string, description: string) => {
	const skillDir = join(dir, ".agents", "skills", name);
	mkdirSync(skillDir, { recursive: true });
	writeFileSync(join(skillDir, "SKILL.md"), `---\ndescription: ${description}\n---\nbody`);
};

it("loads user-level then workspace-level AGENTS.md and merges skills with project winning", async () => {
	const home = directory();
	const workspace = directory();
	mkdirSync(join(home, ".agents"), { recursive: true });
	writeAgents(join(home, ".agents"), "user rules");
	writeAgents(workspace, "project rules");
	writeSkill(join(home), "shared", "user shared");
	writeSkill(join(home), "only-user", "user only");
	writeSkill(workspace, "shared", "project shared");

	const load = createResourceLoader(home);
	const resources = await load(workspace);
	expect(resources.contextFiles.map((f) => f.content)).toEqual(["user rules", "project rules"]);
	expect(resources.contextFiles[0]!.path).toBe(join(home, ".agents", "AGENTS.md"));
	expect(resources.contextFiles[1]!.path).toBe(join(workspace, "AGENTS.md"));
	const byName = new Map(resources.skills.map((s) => [s.name, s.description]));
	expect(byName.get("shared")).toBe("project shared");
	expect(byName.get("only-user")).toBe("user only");
});

it("omits missing files and survives unreadable ones", async () => {
	const home = directory();
	const workspace = directory();
	writeAgents(workspace, "project rules");
	const unreadable = join(home, ".agents");
	mkdirSync(unreadable, { recursive: true });
	writeAgents(unreadable, "user rules");
	chmodSync(join(unreadable, "AGENTS.md"), 0o000);
	try {
		const resources = await createResourceLoader(home)(workspace);
		expect(resources.contextFiles.map((f) => f.content)).toEqual(["project rules"]);
	} finally {
		chmodSync(join(unreadable, "AGENTS.md"), 0o644);
	}
	const empty = await createResourceLoader(directory())(directory());
	expect(empty.contextFiles).toEqual([]);
	expect(empty.skills).toEqual([]);
});

it("reloads each workspace on AGENTS.md edits and new skills", async () => {
	const home = directory();
	const workspace = directory();
	writeAgents(workspace, "v1");
	const load = createResourceLoader(home);

	expect((await load(workspace)).contextFiles[0]!.content).toBe("v1");
	// Same loader, second workspace: independent cache entries.
	expect((await load(directory())).contextFiles).toEqual([]);

	writeAgents(workspace, "v2");
	expect((await load(workspace)).contextFiles[0]!.content).toBe("v2");

	writeSkill(workspace, "fresh", "added later");
	expect((await load(workspace)).skills.map((s) => s.name)).toEqual(["fresh"]);

	writeFileSync(join(workspace, ".agents", "skills", "fresh", "SKILL.md"), "---\ndescription: edited\n---\nbody");
	expect((await load(workspace)).skills[0]!.description).toBe("edited");
});

it("refreshes permissions without mtime changes and reports failures without instruction contents", async () => {
	const home = directory();
	const workspace = directory();
	const file = join(workspace, "AGENTS.md");
	writeAgents(workspace, "private instruction body");
	const diagnostics: { path: string; message: string }[] = [];
	const load = createResourceLoader(home, (d) => diagnostics.push(d));
	expect((await load(workspace)).contextFiles).toHaveLength(1);
	chmodSync(file, 0o000);
	try {
		expect((await load(workspace)).contextFiles).toHaveLength(0);
		expect(diagnostics).toHaveLength(1);
		expect((await load(workspace)).contextFiles).toHaveLength(0);
		expect(diagnostics).toHaveLength(1);
		expect(JSON.stringify(diagnostics)).not.toContain("private instruction body");
	} finally {
		chmodSync(file, 0o600);
	}
	expect((await load(workspace)).contextFiles).toHaveLength(1);
	rmSync(file);
	expect((await load(workspace)).contextFiles).toHaveLength(0);
});

it("diagnoses large instructions without truncating them", async () => {
	const home = directory();
	const workspace = directory();
	const content = "x".repeat(65537);
	writeAgents(workspace, content);
	const messages: string[] = [];
	const resources = await createResourceLoader(home, (d) => messages.push(d.message))(workspace);
	expect(resources.contextFiles[0]?.content).toBe(content);
	expect(messages[0]).toContain("compaction does not reduce");
});
