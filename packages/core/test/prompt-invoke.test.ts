import { afterEach, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expandSkillCommand } from "../src/prompt/invoke.ts";
import type { Skill } from "../src/prompt/skills.ts";

const dirs: string[] = [];
function directory() {
	const d = realpathSync(mkdtempSync(join(tmpdir(), "neko-invoke-")));
	dirs.push(d);
	return d;
}
afterEach(() => {
	for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const read = (path: string) => readFile(path, "utf8");

it("expands a known skill into a skill block with args appended", async () => {
	const dir = directory();
	const filePath = join(dir, "pdf", "SKILL.md");
	mkdirSync(join(dir, "pdf"), { recursive: true });
	writeFileSync(filePath, "---\ndescription: Read PDFs\n---\nDo the PDF thing.\n");
	const skills: Skill[] = [{ name: "pdf", description: "Read PDFs", filePath, disableModelInvocation: false }];

	const expanded = await expandSkillCommand("/skill:pdf summarize this", skills, read);
	expect(expanded).toBe(
		`<skill name="pdf" location="${filePath}">\nReferences are relative to ${join(dir, "pdf")}.\n\nDo the PDF thing.\n</skill>\n\nsummarize this`,
	);
	const bare = await expandSkillCommand("/skill:pdf", skills, read);
	expect(bare).toBe(
		`<skill name="pdf" location="${filePath}">\nReferences are relative to ${join(dir, "pdf")}.\n\nDo the PDF thing.\n</skill>`,
	);
});

it("passes through non-commands, unknown skills, and unreadable files", async () => {
	const skills: Skill[] = [
		{ name: "pdf", description: "Read PDFs", filePath: "/missing/SKILL.md", disableModelInvocation: false },
		{ name: "hidden", description: "h", filePath: "/missing/SKILL.md", disableModelInvocation: true },
	];
	expect(await expandSkillCommand("hello", skills, read)).toBe("hello");
	expect(await expandSkillCommand("/skill:nope hi", skills, read)).toBe("/skill:nope hi");
	expect(await expandSkillCommand("/compact", skills, read)).toBe("/compact");
	// Unreadable file passes through unchanged.
	expect(await expandSkillCommand("/skill:pdf", skills, read)).toBe("/skill:pdf");
	// disable-model-invocation only hides the skill from the prompt, not from explicit invocation;
	// with a readable file it expands like any other skill.
	const dir = directory();
	const filePath = join(dir, "hidden", "SKILL.md");
	mkdirSync(join(dir, "hidden"), { recursive: true });
	writeFileSync(filePath, "---\ndescription: h\n---\nsecret body");
	const expanded = await expandSkillCommand("/skill:hidden", [{ ...skills[1]!, filePath }], read);
	expect(expanded).toContain("secret body");
});

it("escapes skill metadata in XML attributes", async () => {
	const skills: Skill[] = [
		{ name: 'a"b', description: "test", filePath: '/a&b/"test"/SKILL.md', disableModelInvocation: false },
	];
	const output = await expandSkillCommand('/skill:a"b args', skills, async () => "body");
	expect(output).toContain('name="a&quot;b" location="/a&amp;b/&quot;test&quot;/SKILL.md"');
	expect(output).toEndWith("</skill>\n\nargs");
});

it("reports unreadable known skills but passes unknown commands through silently", async () => {
	const reports: string[] = [];
	const skills: Skill[] = [
		{ name: "known", description: "demo", filePath: "/x/SKILL.md", disableModelInvocation: false },
	];
	const read = async (): Promise<string> => {
		throw new Error("private file contents");
	};
	const report = (d: { message: string }) => reports.push(d.message);
	expect(await expandSkillCommand("/skill:known args", skills, read, report)).toBe("/skill:known args");
	expect(reports).toHaveLength(1);
	expect(reports[0]).not.toContain("private file contents");
	await expandSkillCommand("/skill:unknown", skills, read, report);
	expect(reports).toHaveLength(1);
});
