import type { ChatView } from "@neko-harness/core";
import { useSyncExternalStore } from "react";
import type { NekoSessionSummary } from "./gateway.ts";

export type ConnPhase = "connecting" | "ready" | "reconnecting" | "error";

export type NekoNotice = { level: "info" | "error"; text: string };

export type NekoState = {
	/** 网关连接阶段；error = /api/info 获取失败（不会自动恢复，需刷新页面）。 */
	phase: ConnPhase;
	/** 会话目录（neko.session-directory 订阅推送，实时）。 */
	sessions: readonly NekoSessionSummary[];
	currentSessionId: string | null;
	/** 当前会话的 ChatView 快照（neko.chat.view 订阅）；切换/断线中可能为 null。 */
	view: ChatView | null;
	notice: NekoNotice | null;
};

let state: NekoState = {
	phase: "connecting",
	sessions: [],
	currentSessionId: null,
	view: null,
	notice: null,
};
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

/** 整个网关驱动 UI 的外部 store（D4：只存服务订阅的最新快照）。 */
export function useNekoState(): NekoState {
	return useSyncExternalStore(subscribe, () => state);
}

/** 组件外读取当前状态（storeActions 内部与操作回调用）。 */
export function getState(): NekoState {
	return state;
}

export const storeActions = {
	setPhase(phase: ConnPhase): void {
		emit({ ...state, phase });
	},
	setDirectory(sessions: readonly NekoSessionSummary[]): void {
		emit({ ...state, sessions });
	},
	setSession(currentSessionId: string | null): void {
		emit({ ...state, currentSessionId });
	},
	setView(view: ChatView | null): void {
		emit({ ...state, view });
	},
	notice(notice: NekoNotice): void {
		emit({ ...state, notice });
	},
	clearNotice(): void {
		if (state.notice !== null) emit({ ...state, notice: null });
	},
};
