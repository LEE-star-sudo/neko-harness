import { defineEntry } from "@earendil-works/pi-durable";
import type { DefaultImagePrompt } from "./image-prompt.ts";
import type { ImageInfo } from "./images.ts";
import type { SkillInvocation } from "./skill-invocation.ts";

export type InputData = {
	at: number;
	subagentRoundId?: number;
	prompt: string;
	images: (ImageInfo & { contentIndex: number })[];
	skill?: SkillInvocation;
	defaultImagePrompt?: DefaultImagePrompt;
};
/** Content and UI metadata travel in the same durable input, including while queued. */
export const NekoInput = defineEntry<InputData>("app.neko.input");
