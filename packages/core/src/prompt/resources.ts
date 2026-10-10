import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { isMissing, type PromptDiagnostic, type ReportPromptDiagnostic, warnPromptDiagnostic } from "./diagnostics.ts";
import { mergeSkills, type Skill, scanSkillsDir } from "./skills.ts";

export type PromptResources = {
	/** AGENTS.md files in injection order: user level first, then workspace level. */
	readonly contextFiles: readonly { path: string; content: string }[];
	readonly skills: readonly Skill[];
};

export const userAgentsFile = (home: string): string => join(home, ".agents", "AGENTS.md");
export const userSkillsDir = (home: string): string => join(home, ".agents", "skills");
export const workspaceAgentsFile = (workspace: string): string => join(workspace, "AGENTS.md");
export const workspaceSkillsDir = (workspace: string): string => join(workspace, ".agents", "skills");

const readResources = async (
	workspace: string,
	home: string,
	report: ReportPromptDiagnostic,
): Promise<PromptResources> => {
	const contextFiles: { path: string; content: string }[] = [];
	for (const path of [userAgentsFile(home), workspaceAgentsFile(workspace)]) {
		try {
			const content = await readFile(path, "utf8");
			if (Buffer.byteLength(content, "utf8") > 64 * 1024)
				report({
					path,
					message:
						"Project instructions exceed 64 KiB; included in full. History compaction does not reduce this input.",
				});
			contextFiles.push({ path, content });
		} catch (error) {
			if (!isMissing(error)) report({ path, message: "Cannot read project instructions; skipped." });
		}
	}
	const [user, project] = await Promise.all([
		scanSkillsDir(userSkillsDir(home), report),
		scanSkillsDir(workspaceSkillsDir(workspace), report),
	]);
	return { contextFiles, skills: mergeSkills([user, project]) };
};

/** Re-read on each load; the prompt extension shares one load across a request's sections. */
export const createResourceLoader = (
	home: string = homedir(),
	report: ReportPromptDiagnostic = warnPromptDiagnostic,
) => {
	// Remember diagnostics only, never file contents or stat fingerprints.
	const previous = new Map<string, Set<string>>();
	return async (workspace: string): Promise<PromptResources> => {
		const diagnostics: PromptDiagnostic[] = [];
		const resources = await readResources(workspace, home, (d) => diagnostics.push(d));
		const known = previous.get(workspace);
		const current = new Set<string>();
		for (const diagnostic of diagnostics) {
			const key = JSON.stringify(diagnostic);
			if (!known?.has(key) && !current.has(key)) report(diagnostic);
			current.add(key);
		}
		if (current.size) previous.set(workspace, current);
		else previous.delete(workspace);
		return resources;
	};
};
