import type { NekoSkillInfo } from "@neko-harness/core";

export const isCommandQuery = (text: string): boolean => /^\/[^\s]*$/.test(text);

export function commandSuggestions(text: string, skills: readonly NekoSkillInfo[]) {
	const query = isCommandQuery(text) ? text : "/";
	return [
		{ key: "compact", label: "/compact", description: "压缩上下文（可附加要求）" },
		...skills.map((skill) => ({
			key: `skill:${skill.name}`,
			label: `/skill:${skill.name}`,
			description: skill.description,
		})),
	].filter((item) => item.label.startsWith(query));
}
