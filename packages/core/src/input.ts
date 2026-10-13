import { defineEntry } from "@earendil-works/pi-durable";
import type { ImageInfo } from "./images.ts";
import type { SkillInvocation } from "./skill-invocation.ts";

export type InputData = {
	at: number;
	prompt: string;
	images: (ImageInfo & { contentIndex: number })[];
	skill?: SkillInvocation;
};
/** Content and UI metadata travel in the same durable input, including while queued. */
export const NekoInput = defineEntry<InputData>("app.neko.input");
