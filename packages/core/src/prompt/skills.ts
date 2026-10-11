import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { ignorePromptDiagnostic, isMissing, type ReportPromptDiagnostic } from "./diagnostics.ts";
import { parseFrontmatter } from "./frontmatter.ts";

const MAX_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1024;

export type Skill = {
	readonly name: string;
	readonly description: string;
	/** Absolute path of the SKILL.md file. */
	readonly filePath: string;
	readonly disableModelInvocation: boolean;
};

type SkillFrontmatter = {
	name?: string;
	description?: string;
	"disable-model-invocation"?: boolean;
};

/** Parse one SKILL.md's content; null when the skill must be skipped. Never throws. */
export const parseSkillFile = (
	content: string,
	filePath: string,
	report: ReportPromptDiagnostic = ignorePromptDiagnostic,
): Skill | null => {
	const skip = (message: string) => {
		report({ path: filePath, message });
		return null;
	};
	try {
		const { frontmatter } = parseFrontmatter<SkillFrontmatter>(content);
		const description = frontmatter.description;
		if (typeof description !== "string" || description.trim() === "")
			return skip("Skill description is missing or empty; skipped.");
		if (description.length > MAX_DESCRIPTION_LENGTH) return skip("Skill description is too long; skipped.");
		const name =
			typeof frontmatter.name === "string" && frontmatter.name.trim() !== ""
				? frontmatter.name
				: basename(dirname(filePath));
		if (name.length > MAX_NAME_LENGTH || /[\s\p{Cc}]/u.test(name))
			return skip("Skill name is too long or contains whitespace/control characters; skipped.");
		return {
			name,
			description,
			filePath,
			disableModelInvocation: frontmatter["disable-model-invocation"] === true,
		};
	} catch {
		return skip("Invalid skill frontmatter; skipped.");
	}
};

/** Scan first-level skill directories; capture receives the same text used to parse valid metadata. */
export const scanSkillsDir = async (
	dir: string,
	report: ReportPromptDiagnostic = ignorePromptDiagnostic,
	capture?: (skill: Skill, content: string) => void,
): Promise<Skill[]> => {
	let entries: Dirent[];
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch (error) {
		if (!isMissing(error)) report({ path: dir, message: "Cannot scan skills directory; skipped." });
		return [];
	}
	const skills: Skill[] = [];
	for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
		if (!entry.isDirectory()) continue;
		const filePath = join(dir, entry.name, "SKILL.md");
		let content: string;
		try {
			content = await readFile(filePath, "utf8");
		} catch (error) {
			if (!isMissing(error)) report({ path: filePath, message: "Cannot read skill; skipped." });
			continue;
		}
		const skill = parseSkillFile(content, filePath, report);
		if (skill) {
			skills.push(skill);
			capture?.(skill, content);
		}
	}
	return skills;
};

/** Merge skills from several directories; a later directory's skill overrides an earlier same-named one. */
export const mergeSkills = (groups: readonly Skill[][]): Skill[] => {
	const byName = new Map<string, Skill>();
	for (const group of groups) for (const skill of group) byName.set(skill.name, skill);
	return [...byName.values()];
};

export const escapeXml = (value: string): string =>
	value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");

/** Metadata-only skill listing for the system prompt; bodies load on demand via the read tool. */
export const formatSkillsForPrompt = (skills: readonly Skill[]): string => {
	const visible = skills.filter((skill) => !skill.disableModelInvocation);
	if (visible.length === 0) return "";
	const lines = [
		"The following skills provide specialized instructions for specific tasks.",
		"Use the read tool to load a skill's file when the task matches its description.",
		"When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md) and use that absolute path in tool commands.",
		"",
		"<available_skills>",
	];
	for (const skill of visible) {
		lines.push("  <skill>");
		lines.push(`    <name>${escapeXml(skill.name)}</name>`);
		lines.push(`    <description>${escapeXml(skill.description)}</description>`);
		lines.push(`    <location>${escapeXml(skill.filePath)}</location>`);
		lines.push("  </skill>");
	}
	lines.push("</available_skills>");
	return lines.join("\n");
};
