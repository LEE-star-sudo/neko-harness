import { realpath, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { isAbsolute } from "node:path";
import { checkLocalOrigin, type LocalGuardContext, readGuardedJson, writeJson } from "./local-guard.ts";
import { isOpenTargetId, OpenError, type OpenService } from "./open-target.ts";

/**
 * /api/local/session 与 /api/open：用本机 VS Code 或文件管理器打开工作区目录。
 * 守卫与 /api/mobile/* 共用（local-guard）；非本机访问得到 403，前端据此隐藏入口。
 */

const MAX_PATH_LENGTH = 4096;
// biome-ignore lint/suspicious/noControlCharactersInRegex: 拒绝路径中的控制字符。
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

async function validateDirectory(value: unknown): Promise<string | undefined> {
	if (typeof value !== "string" || value === "" || value.length > MAX_PATH_LENGTH) return undefined;
	if (CONTROL_CHARS.test(value) || !isAbsolute(value)) return undefined;
	try {
		const resolved = await realpath(value);
		return (await stat(resolved)).isDirectory() ? resolved : undefined;
	} catch {
		return undefined;
	}
}

/** 处理 /api/local/session 与 /api/open；非本路由返回 false 交还原路由。 */
export async function handleOpenRequest(
	request: IncomingMessage,
	response: ServerResponse,
	context: LocalGuardContext,
	service: OpenService,
): Promise<boolean> {
	const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
	const isSession = pathname === "/api/local/session";
	if (!isSession && pathname !== "/api/open") return false;
	if (!checkLocalOrigin(request, response, context.allowedHosts, "this endpoint is only available from this computer"))
		return true;

	if (isSession) {
		if (request.method !== "GET") {
			writeJson(response, 404, { code: "not_found", message: "unknown route" });
			return true;
		}
		writeJson(response, 200, { csrf: context.csrf, targets: service.targets() });
		return true;
	}

	if (request.method !== "POST") {
		writeJson(response, 404, { code: "not_found", message: "unknown route" });
		return true;
	}
	const guarded = await readGuardedJson(request, response, context.csrf);
	if (guarded === undefined) return true;
	const params = guarded.params;
	const input = typeof params === "object" && params !== null ? (params as Record<string, unknown>) : {};
	if (!isOpenTargetId(input.target)) {
		writeJson(response, 400, { code: "invalid", message: "unknown open target" });
		return true;
	}
	const dir = await validateDirectory(input.path);
	if (dir === undefined) {
		writeJson(response, 400, { code: "invalid_path", message: "path must be an existing absolute directory" });
		return true;
	}
	try {
		await service.open(input.target, dir);
		writeJson(response, 200, { opened: true });
	} catch (error) {
		if (error instanceof OpenError) {
			writeJson(response, error.code === "unavailable" ? 409 : 502, { code: error.code, message: error.message });
		} else {
			writeJson(response, 502, {
				code: "launch_failed",
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}
	return true;
}
