import { RUNNING_VERSION, updateAction } from "@neko-harness/core/application-version";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { storeActions, useNekoState } from "../lib/store";
import { reloadForUpgrade } from "./composer";
import { DismissButton } from "./primitives";

export async function copyUpdateCommand(): Promise<string> {
	let text: string;
	try {
		await navigator.clipboard.writeText("neko update");
		text = "已复制 neko update，在运行 neko 的电脑上执行";
	} catch {
		text = "请复制命令：neko update";
	}
	storeActions.notice({ level: "info", text });
	return text;
}
export function useUpdateAction() {
	const { updates, webInfo } = useNekoState();
	return updateAction({
		gateway: updates,
		frontend: RUNNING_VERSION,
		installed: webInfo?.installedVersion ?? null,
		web: webInfo ? { runningVersion: webInfo.webVersion, installedVersion: webInfo.installedVersion } : undefined,
	});
}
export function UpdateNotice() {
	const action = useUpdateAction();
	// 仅本次页面内关闭；状态变化（如新版本或需重启）会重新提示。
	const [dismissed, setDismissed] = useState<string | null>(null);
	if (action === "none" || dismissed === action) return null;
	const text =
		action === "install"
			? "发现新版本 · 运行 neko update"
			: action === "refresh-page"
				? "页面已更新"
				: action === "incompatible"
					? "版本不兼容 · 更新并重启 neko"
					: "已升级 · 请重新启动本地 neko";
	return (
		<output className="flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-1 border-b border-sakura-100 bg-sakura-50 px-4 py-1.5 text-xs text-ink-700">
			<span>{text}</span>
			{action === "install" ? (
				<button
					type="button"
					className="focus-neko rounded px-2 py-1 text-sakura-700"
					onClick={() => void copyUpdateCommand()}
				>
					复制命令
				</button>
			) : action === "refresh-page" ? (
				<button type="button" className="focus-neko rounded px-2 py-1 text-sakura-700" onClick={reloadForUpgrade}>
					刷新
				</button>
			) : (
				<Link to="/about" className="focus-neko rounded px-2 py-1 text-sakura-700">
					查看步骤
				</Link>
			)}
			<DismissButton label="关闭更新提示" onClick={() => setDismissed(action)} />
		</output>
	);
}
