import { type ConversationId, defineExtension, type PromptInput, section } from "@earendil-works/pi-durable";
import type { PromptResources } from "./resources.ts";
import { escapeXml, formatSkillsForPrompt } from "./skills.ts";

/** Section order; empty sections are omitted. Text carries its own tags (`tag: false`). */
const KEYS = ["preamble", "rules", "project_context", "skills", "cwd"] as const;

const PREAMBLE =
	"You are an expert coding assistant operating inside neko, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.";

/** Rules contributed per tool, in the spirit of pi's promptGuidelines. */
const TOOL_GUIDELINES: Record<string, readonly string[]> = {
	read: ["Use read to examine files instead of cat or sed."],
	write: ["Use write only for new files or complete rewrites."],
	edit: [
		"Use edit for precise changes (edits[].oldText must match exactly)",
		"When changing multiple separate locations in one file, use one edit call with multiple entries in edits[] instead of multiple edit calls",
		"Each edits[].oldText is matched against the original file, not after earlier edits are applied. Do not emit overlapping or nested edits. Merge nearby changes into one edit.",
		"Keep edits[].oldText as small as possible while still being unique in the file. Do not pad with large unchanged regions.",
	],
	bash: ["Use bash for file operations like ls, rg, find"],
	read_image: ["Use read_image to view image files; the read tool only returns text."],
	web_search: ["Use web_search for current information from the internet instead of guessing."],
	web_extract: ["Use web_extract to read the full content of a web page when you have its URL."],
};

const GENERIC_RULES = ["Be concise in your responses", "Show file paths clearly when working with files"];

const buildRules = (toolNames: readonly string[]): string => {
	const rules: string[] = [];
	const seen = new Set<string>();
	for (const rule of [...toolNames.flatMap((name) => TOOL_GUIDELINES[name] ?? []), ...GENERIC_RULES]) {
		if (seen.has(rule)) continue;
		seen.add(rule);
		rules.push(`- ${rule}`);
	}
	return rules.join("\n");
};

const renderProjectContext = (files: PromptResources["contextFiles"]): string | undefined =>
	files.length === 0
		? undefined
		: [
				"Project-specific instructions and guidelines:",
				...files.map(
					({ path, content }) =>
						`<project_instructions path="${escapeXml(path)}">\n${content}\n</project_instructions>`,
				),
			].join("\n\n");

/** Five ordered sections share one build per request and the conversation's placement-selected resource snapshot. */
export const createNekoPrompt = (
	loadResources: (id: ConversationId, workspace: string) => Promise<PromptResources>,
) => {
	const built = new WeakMap<PromptInput, Promise<Record<string, string | undefined>>>();
	const build = async (input: PromptInput): Promise<Record<string, string | undefined>> => {
		const cwd = input.agent.cwd;
		const resources = cwd ? await loadResources(input.conversationId, cwd) : { contextFiles: [], skills: [] };
		const sections: Record<string, string | undefined> = {
			preamble: PREAMBLE,
			rules: buildRules(input.agent.tools.map((tool) => tool.name)),
			project_context: renderProjectContext(resources.contextFiles),
			skills: formatSkillsForPrompt(resources.skills) || undefined,
			cwd: cwd?.replace(/\\/g, "/"),
		};
		return sections;
	};
	return defineExtension({
		name: "neko-prompt",
		sections: KEYS.map((key) =>
			section(
				key,
				async (input) => {
					let pending = built.get(input);
					if (!pending) {
						pending = build(input);
						built.set(input, pending);
					}
					const text = (await pending)[key];
					if (text === undefined) return undefined;
					return key === "preamble" ? text : `<${key}>\n${text}\n</${key}>`;
				},
				{ tag: false },
			),
		),
	});
};
