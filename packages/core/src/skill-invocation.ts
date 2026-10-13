/** UI payload produced alongside the model-facing skill text, never parsed from XML. */
export type SkillInvocation = {
	readonly name: string;
	readonly location: string;
	readonly body: string;
	readonly args: string;
};
