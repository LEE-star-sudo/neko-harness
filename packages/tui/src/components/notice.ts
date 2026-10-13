import { theme } from "../theme/index.ts";

export type NoticeLevel = "info" | "warning" | "error";

const LEVELS: Record<NoticeLevel, { glyph: string; slot: (text: string) => string }> = {
	info: { glyph: "i", slot: theme.muted },
	warning: { glyph: "!", slot: theme.warning },
	error: { glyph: "✗", slot: theme.error },
};

/** 底部通知行文本(design D6):三级语义色 + 符号前缀。 */
export function formatNotice(text: string, level: NoticeLevel = "info"): string {
	const { glyph, slot } = LEVELS[level];
	return slot(`${glyph} ${text}`);
}
