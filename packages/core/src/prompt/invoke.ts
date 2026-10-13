import { dirname } from "node:path";
import type { SkillInvocation } from "../skill-invocation.ts";
import { type ReportPromptDiagnostic, warnPromptDiagnostic } from "./diagnostics.ts";
import { stripFrontmatter } from "./frontmatter.ts";
import { escapeXml, type Skill } from "./skills.ts";

/**
 * Expand a `/skill:name [args]` input into a user message carrying the skill body, pi-style:
 * an XML block with the skill's name, location, and base directory note, args appended after.
 * Unknown names and non-matching input pass through unchanged. Never throws.
 */
export const expandSkillCommand = async (
	text: string,
	skills: readonly Skill[],
	readFile: (path: string) => Promise<string>,
	report: ReportPromptDiagnostic = warnPromptDiagnostic,
	metadata?: (skill: SkillInvocation) => void,
): Promise<string> => {
	if (!text.startsWith("/skill:")) return text;
	const spaceIndex = text.indexOf(" ");
	const skillName = spaceIndex === -1 ? text.slice(7) : text.slice(7, spaceIndex);
	const args = spaceIndex === -1 ? "" : text.slice(spaceIndex + 1).trim();
	const skill = skills.find((s) => s.name === skillName);
	if (!skill) return text;
	let body: string;
	try {
		body = stripFrontmatter(await readFile(skill.filePath)).trim();
	} catch {
		report({ path: skill.filePath, message: "Cannot expand known skill; original input preserved." });
		return text;
	}
	metadata?.({
		name: skill.name,
		location: skill.filePath,
		body: `References are relative to ${dirname(skill.filePath)}.\n\n${body}`,
		args,
	});
	const block = `<skill name="${escapeXml(skill.name)}" location="${escapeXml(skill.filePath)}">\nReferences are relative to ${dirname(skill.filePath)}.\n\n${body}\n</skill>`;
	return args ? `${block}\n\n${args}` : block;
};
