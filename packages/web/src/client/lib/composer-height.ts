export const COMPOSER_MAX_HEIGHT = 160;

interface Measurable {
	style: { height: string };
	readonly scrollHeight: number;
}

/** 先清除内联高度再按内容高度（不超过上限）重设，使空草稿回到最小高度。 */
export function fitHeight(el: Measurable, max = COMPOSER_MAX_HEIGHT): void {
	el.style.height = "auto";
	el.style.height = `${Math.min(el.scrollHeight, max)}px`;
}
