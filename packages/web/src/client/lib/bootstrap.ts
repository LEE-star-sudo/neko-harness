import type { NekoModelRef } from "@neko-harness/core";
import { GatewayConnection } from "./gateway.ts";
import { getState, storeActions } from "./store.ts";

/**
 * 应用启动接线：从 /api/info 拿 gateway WebSocket 地址 + serverId，
 * 建 GatewayConnection 并把服务事件接到 store；组件经 appActions 触发操作。
 */

export type GatewayInfo = {
	gatewayWs: string;
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
			events: {
				onPhase: storeActions.setPhase,
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
	selectSession(sessionId: string): void {
		if (connection === undefined) {
			notReady();
			return;
		}
		connection.attachTo(sessionId).catch((error: unknown) => {
			storeActions.notice({ level: "error", text: error instanceof Error ? error.message : String(error) });
		});
	},
	createSession(): void {
		if (connection === undefined) {
			notReady();
			return;
		}
		connection.createSession().catch((error: unknown) => {
			storeActions.notice({ level: "error", text: error instanceof Error ? error.message : String(error) });
		});
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
	archiveSession(sessionId: string): void {
		if (connection === undefined) {
			notReady();
			return;
		}
		connection
			.archiveSession(sessionId)
			.then(() => {
				const { sessions, currentSessionId } = getState();
				if (currentSessionId !== sessionId) return;
				const next = sessions.find((session) => session.id !== sessionId);
				if (next !== undefined) appActions.selectSession(next.id);
				else connection?.clearSession().catch(() => {});
			})
			.catch((error: unknown) => {
				storeActions.notice({ level: "error", text: error instanceof Error ? error.message : String(error) });
			});
	},
};
