import type { ChatView, NekoModelInfo } from "@neko-harness/core";
import type { UpdateState } from "@neko-harness/core/application-version";
import { useSyncExternalStore } from "react";
import type { NekoCredentialState, NekoSearchSettingsState, NekoWorkspaceSummary } from "./contract.ts";
import type { NekoSessionSummary } from "./gateway.ts";

export type ConnPhase = "connecting" | "ready" | "reconnecting" | "error";

export type NekoNotice = { level: "info" | "error"; text: string };

export type NekoState = {
	/** 网关连接阶段；error = /api/info 获取失败（不会自动恢复，需刷新页面）。 */
	phase: ConnPhase;
	updates: UpdateState | null;
	webInfo: { webVersion: string; installedVersion: string | null; serverId: string; gatewaySpawned: boolean } | null;
	credentials: NekoCredentialState | null;
	searchSettings: NekoSearchSettingsState | null;
	workspaceRoot: string;
	workspaces: readonly NekoWorkspaceSummary[];
	operating: boolean;
	/** 会话目录（neko.session-directory 订阅推送，实时）。 */
	sessions: readonly NekoSessionSummary[];
	/** 模型目录（neko.models.list 全局快照）；拉取失败为空数组。 */
	models: readonly NekoModelInfo[];
	currentSessionId: string | null;
	/** 当前会话的 ChatView 快照（neko.chat.view 订阅）；切换/断线中可能为 null。 */
	view: ChatView | null;
	notice: NekoNotice | null;
};

let state: NekoState = {
	phase: "connecting",
	updates: null,
	webInfo: null,
	credentials: null,
	searchSettings: null,
	workspaceRoot: "",
	workspaces: [],
	operating: false,
	sessions: [],
	models: [],
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
	setUpdates(updates: UpdateState | null) {
		emit({ ...state, updates });
	},
	setWebInfo(webInfo: NekoState["webInfo"]) {
		emit({ ...state, webInfo });
	},
	setCredentials(credentials: NekoCredentialState | null): void {
		if (credentials && state.credentials && credentials.revision < state.credentials.revision) return;
		emit({ ...state, credentials });
	},
	setSearchSettings(searchSettings: NekoSearchSettingsState | null): void {
		if (searchSettings && state.searchSettings && searchSettings.revision < state.searchSettings.revision) return;
		emit({ ...state, searchSettings });
	},
	setWorkspace(workspaceRoot: string): void {
		emit({ ...state, workspaceRoot });
	},
	setWorkspaces(workspaces: readonly NekoWorkspaceSummary[]): void {
		emit({ ...state, workspaces });
	},
	setOperation(operating: boolean): void {
		emit({ ...state, operating });
	},
	setPhase(phase: ConnPhase): void {
		emit({ ...state, phase });
	},
	setDirectory(sessions: readonly NekoSessionSummary[]): void {
		emit({ ...state, sessions });
	},
	setModels(models: readonly NekoModelInfo[]): void {
		emit({ ...state, models });
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
