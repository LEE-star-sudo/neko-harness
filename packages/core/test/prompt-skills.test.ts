import { afterEach, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatSkillsForPrompt, mergeSkills, parseSkillFile, scanSkillsDir } from "../src/prompt/skills.ts";

const dirs: string[] = [];
function directory() {
	const d = realpathSync(mkdtempSync(join(tmpdir(), "neko-skills-")));
	dirs.push(d);
	return d;
}
afterEach(() => {
	for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function skill(dir: string, name: string, content: string) {
	const skillDir = join(dir, name);
	mkdirSync(skillDir, { recursive: true });
	writeFileSync(join(skillDir, "SKILL.md"), content);
}

it("parses frontmatter with name/description and disable-model-invocation", () => {
	const parsed = parseSkillFile(
		"---\nname: pdf\ndescription: Read PDFs\ndisable-model-invocation: true\n---\nbody",
		"/x/pdf/SKILL.md",
	);
	expect(parsed).toEqual({
		name: "pdf",
		description: "Read PDFs",
		filePath: "/x/pdf/SKILL.md",
		disableModelInvocation: true,
	});
});

it("falls back to the directory name and skips missing or empty descriptions", () => {
	expect(parseSkillFile("---\ndescription: Works\n---\nbody", "/x/backup/SKILL.md")?.name).toBe("backup");
	expect(parseSkillFile("no frontmatter at all", "/x/a/SKILL.md")).toBeNull();
	expect(parseSkillFile('---\ndescription: ""\n---\nbody', "/x/b/SKILL.md")).toBeNull();
	expect(parseSkillFile(`---\ndescription: ${"x".repeat(1025)}\n---\nbody`, "/x/c/SKILL.md")).toBeNull();
	expect(parseSkillFile("---\n: bad yaml: [\n---\nbody", "/x/d/SKILL.md")).toBeNull();
});

it("scans first-level subdirectories and skips unreadable or invalid skills", async () => {
	const dir = directory();
	skill(dir, "good", "---\ndescription: Good skill\n---\nbody");
	skill(dir, "broken", "no frontmatter");
	writeFileSync(join(dir, "loose.md"), "---\ndescription: Not in a directory\n---\n");
	mkdirSync(join(dir, "empty"));
	const skills = await scanSkillsDir(dir);
	expect(skills.map((s) => s.name)).toEqual(["good"]);
	expect(skills[0]!.filePath).toBe(join(dir, "good", "SKILL.md"));
	expect(await scanSkillsDir(join(dir, "missing"))).toEqual([]);
});

it("merges directories with later ones overriding by name", () => {
	const user = [{ name: "a", description: "user a", filePath: "/u/a/SKILL.md", disableModelInvocation: false }];
	const project = [
		{ name: "a", description: "project a", filePath: "/p/a/SKILL.md", disableModelInvocation: false },
		{ name: "b", description: "project b", filePath: "/p/b/SKILL.md", disableModelInvocation: false },
	];
	const merged = mergeSkills([user, project]);
	expect(merged.map((s) => `${s.name}:${s.description}`)).toEqual(["a:project a", "b:project b"]);
});

it("formats metadata only, escapes XML, and hides disabled skills", () => {
	const text = formatSkillsForPrompt([
		{ name: "pdf", description: "Read <PDFs> & more", filePath: "/skills/pdf/SKILL.md", disableModelInvocation: false },
		{ name: "hidden", description: "nope", filePath: "/skills/hidden/SKILL.md", disableModelInvocation: true },
	]);
	expect(text).toContain("<available_skills>");
	expect(text).toContain("<name>pdf</name>");
	expect(text).toContain("<description>Read &lt;PDFs&gt; &amp; more</description>");
	expect(text).toContain("<location>/skills/pdf/SKILL.md</location>");
	expect(text).toContain("Use the read tool to load a skill's file");
	expect(text).not.toContain("hidden");
	expect(text).not.toContain("body");
	expect(formatSkillsForPrompt([])).toBe("");
});

it("rejects uncallable names with diagnostics but preserves namespaced skills", () => {
	const messages: string[] = [];
	for (const name of ["my skill", "my\tskill", "my\nskill", "my\u0000skill"]) {
		const skill = parseSkillFile(
			`---\nname: ${JSON.stringify(name)}\ndescription: demo\n---\nbody`,
			"/x/SKILL.md",
			(d) => messages.push(d.message),
		);
		expect(skill).toBeNull();
	}
	expect(messages).toHaveLength(4);
	expect(parseSkillFile("---\nname: plugin:task\ndescription: demo\n---\nbody", "/x/SKILL.md")?.name).toBe(
		"plugin:task",
	);
});
