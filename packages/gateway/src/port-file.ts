import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Windows 网关地址发现：Windows 没有 Unix socket，ws-only 网关以随机端口启动，
 * 把实际 ws 地址写入 `<数据目录>/<serverId>.port` 供本机前端（TUI/Web）发现。
 * POSIX 不产生该文件，前端沿用 Unix socket 发现。
 */

export function gatewayPortFilePath(nekoDir: string, serverId: string): string {
	return join(nekoDir, `${serverId}.port`);
}

/** 网关启动后调用；数据目录由 serverId 文件的写入方保证存在。 */
export async function writeGatewayPortFile(nekoDir: string, serverId: string, wsUrl: string): Promise<void> {
	await writeFile(gatewayPortFilePath(nekoDir, serverId), `${wsUrl}\n`, { mode: 0o600 });
}

/** 前端发现用；文件缺失或内容非法返回 undefined（按无活跃网关处理）。 */
export async function readGatewayPortFile(nekoDir: string, serverId: string): Promise<string | undefined> {
	let content: string;
	try {
		content = await readFile(gatewayPortFilePath(nekoDir, serverId), "utf8");
	} catch {
		return undefined;
	}
	const url = content.trim();
	return url.startsWith("ws://") || url.startsWith("wss://") ? url : undefined;
}

/** 网关关闭时清理；残留文件由前端连接失败兜底，不强制要求删除成功。 */
export async function removeGatewayPortFile(nekoDir: string, serverId: string): Promise<void> {
	await rm(gatewayPortFilePath(nekoDir, serverId), { force: true });
}
