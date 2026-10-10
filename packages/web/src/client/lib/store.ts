import { useSyncExternalStore } from "react";
import type { ChatView } from "../../protocol";

export type ConnState = "connecting" | "open" | "reconnecting";

export type NekoNotice = { level: "info" | "error"; text: string };

export type NekoState = {
	/** 最近一次快照；尚未收到为 null。 */
	view: ChatView | null;
	conn: ConnState;
	notice: NekoNotice | null;
};

let state: NekoState = { view: null, conn: "connecting", notice: null };
const listeners = new Set<() => void>();

function emit(next: NekoState): void {
	state = next;
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/** 整个 WS 驱动 UI 的外部 store（D4：只存服务器投影的最新快照）。 */
export function useNekoState(): NekoState {
	return useSyncExternalStore(subscribe, () => state);
}

export const storeActions = {
	setView(view: ChatView): void {
		emit({ ...state, view });
	},
	setConn(conn: ConnState): void {
		emit({ ...state, conn });
	},
	notice(notice: NekoNotice): void {
		emit({ ...state, notice });
	},
	clearNotice(): void {
		if (state.notice !== null) emit({ ...state, notice: null });
	},
};
