import type { NekoModelRef } from "@neko-harness/core";
import type { NekoBrowseOptions } from "./contract.ts";
import { GatewayConnection } from "./gateway.ts";
import { storeActions } from "./store.ts";

/**
 * 应用启动接线：从 /api/info 拿 gateway WebSocket 地址 + serverId，
 * 建 GatewayConnection 并把服务事件接到 store；组件经 appActions 触发操作。
 */

export type GatewayInfo = {
	gatewayWs: string;
	workspaceRoot: string;
	serverId: string;
	socketPath: string;
};

export async function fetchGatewayInfo(): Promise<GatewayInfo> {
	const response = await fetch("/api/info");
	if (!response.ok) throw new Error(`GET /api/info 失败（${response.status}）`);
	return (await response.json()) as GatewayInfo;
}

let connection: GatewayConnection | undefined;

/** 启动连接；供 main.tsx 模块级调用一次。 */
export function startNekoApp(): void {
	void (async () => {
		let info: GatewayInfo;
		try {
			info = await fetchGatewayInfo();
		} catch (error) {
			storeActions.setPhase("error");
			storeActions.notice({
				level: "error",
				text: `获取网关信息失败：${error instanceof Error ? error.message : String(error)}`,
			});
			return;
		}
		connection = new GatewayConnection({
			url: info.gatewayWs,
			serverId: info.serverId,
			workspaceRoot: info.workspaceRoot,
			events: {
				onPhase: storeActions.setPhase,
				onWorkspaces: (state) => storeActions.setWorkspaces(state.workspaces),
				onWorkspace: storeActions.setWorkspace,
				onOperation: storeActions.setOperation,
				onError: (text) => storeActions.notice({ level: "error", text }),
				onDirectory: (directory) => storeActions.setDirectory(directory.sessions),
				onModels: storeActions.setModels,
				onSessionChange: storeActions.setSession,
				onView: storeActions.setView,
			},
		});
		await connection.start();
	})();
}

function notReady(): void {
	storeActions.notice({ level: "error", text: "网关连接未就绪，请稍候或刷新页面。" });
}

export const appActions = {
	submit(content: string): void {
		if (connection?.ready !== true) {
			notReady();
			return;
		}
		connection.submit(content);
	},
	abort(): void {
		if (connection?.ready !== true) {
			notReady();
			return;
		}
		connection.abort();
	},
	selectSession(sessionId: string): Promise<void> {
		return requireConnection().attachTo(sessionId);
	},
	selectWorkspace(path: string): Promise<void> {
		return requireConnection().selectWorkspace(path);
	},
	addWorkspace(path: string): Promise<void> {
		return requireConnection().addWorkspace(path);
	},
	browse(options: NekoBrowseOptions) {
		return requireConnection().browse(options);
	},
	createSession(): Promise<void> {
		return requireConnection().createSession();
	},
	/** 会话级切换模型；下一次请求生效，状态条随投影 agent.model 即时更新。 */
	configureModel(model: NekoModelRef): void {
		if (connection === undefined) {
			notReady();
			return;
		}
		connection.configure({ model }).catch((error: unknown) => {
			storeActions.notice({ level: "error", text: error instanceof Error ? error.message : String(error) });
		});
	},
	archiveSession(sessionId: string): Promise<void> {
		return requireConnection().archiveSession(sessionId);
	},
};
function requireConnection(): GatewayConnection {
	if (!connection) throw new Error("网关尚未连接");
	return connection;
}
export function reportError(error: unknown): void {
	storeActions.notice({ level: "error", text: error instanceof Error ? error.message : String(error) });
}
