import { type Component, Text, VStack } from "@earendil-works/pi-tui";

export const usableSize = (width: number, height: number): boolean => width >= 40 && height >= 10;

/** Only the transcript grows. Bottom rows have an explicit, bounded budget. */
export function createAppLayout(parts: {
	transcript: Component;
	panel: Component & { height: number };
	editor: Component & { maxRows?: number };
	footer: Component & { panelOpen?: boolean };
	notices: Component;
	panelOpen: () => boolean;
	/** 忙碌行(Loader,自带前导空行);仅在 busyVisible() 时占位。 */
	approval?: Component & { height: number };
	approvalVisible?: () => boolean;
	busy?: Component;
	busyVisible?: () => boolean;
}): VStack {
	const normal = (v: { width: number; height: number }) => {
		if (parts.approval) parts.approval.height = Math.min(10, Math.max(7, Math.floor(v.height / 2)));
		parts.footer.panelOpen = parts.panelOpen();
		parts.editor.maxRows = parts.panelOpen() ? 3 : v.height >= 24 ? 7 : 5;
		parts.panel.height = Math.max(
			1,
			v.height -
				(parts.approvalVisible?.() ? (parts.approval?.height ?? 0) : 0) -
				Math.min(7, Math.max(3, parts.editor.render(v.width).length)) -
				2 -
				Math.min(1, parts.notices.render(v.width).length) -
				(parts.busyVisible?.() ? Math.min(2, parts.busy?.render(v.width).length ?? 0) : 0),
		);
		return usableSize(v.width, v.height);
	};
	return new VStack([
		{
			component: new Text("Terminal too small. Resize to 40x10. Ctrl+C Exit", 0, 0),
			visible: (v) => !normal(v),
			grow: 1,
		},
		{ component: parts.transcript, grow: 1, shrink: 1, minSize: 1, visible: (v) => normal(v) && !parts.panelOpen() },
		{ component: parts.panel, basis: 0, grow: 1, minSize: 1, visible: (v) => normal(v) && parts.panelOpen() },
		{ component: parts.notices, maxSize: 1, shrink: 0, visible: normal },
		{
			component: parts.busy ?? new Text("", 0, 0),
			maxSize: 2,
			shrink: 0,
			visible: (v) => normal(v) && (parts.busyVisible?.() ?? false),
		},
		{
			component: parts.approval ?? new Text("", 0, 0),
			shrink: 0,
			visible: (v) => normal(v) && (parts.approvalVisible?.() ?? false),
		},
		{ component: parts.editor, minSize: 3, maxSize: 7, shrink: 0, visible: normal },
		{ component: parts.footer, basis: 2, minSize: 2, shrink: 0, visible: normal },
	]);
}
