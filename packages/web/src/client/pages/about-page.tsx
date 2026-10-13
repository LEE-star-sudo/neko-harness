import { RUNNING_VERSION } from "@neko-harness/core/application-version";
import { useState } from "react";
import { reloadForUpgrade } from "../components/composer";
import { SettingsShell } from "../components/settings-shell";
import { copyUpdateCommand, useUpdateAction } from "../components/update-notice";
import { appActions } from "../lib/bootstrap";
import { useNekoState } from "../lib/store";
import { readUpgradeDraft } from "../lib/upgrade-draft";
export function AboutPage() {
	const { updates, webInfo } = useNekoState();
	const action = useUpdateAction();
	const [checking, setChecking] = useState(false),
		[message, setMessage] = useState("");
	const recovery = readUpgradeDraft();
	async function check() {
		if (checking) return;
		setChecking(true);
		setMessage("");
		try {
			const value = await appActions.checkUpdates();
			setMessage(
				value.checkState === "ok"
					? "检查完成"
					: value.checkState === "development"
						? "开发版本不检查发布更新"
						: "检查失败，请重试",
			);
		} catch {
			setMessage("检查失败，请重试");
		} finally {
			setChecking(false);
		}
	}
	return (
		<SettingsShell active="about">
			<main className="mx-auto w-full max-w-3xl px-5 py-5">
				<h1 className="text-xl font-bold text-ink-900">关于与更新</h1>
				<dl className="my-5 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
					<dt>页面</dt>
					<dd>{RUNNING_VERSION}</dd>
					<dt>Web 服务</dt>
					<dd>{webInfo?.webVersion ?? "未知"}</dd>
					<dt>已安装</dt>
					<dd>{webInfo?.installedVersion ?? "未知"}</dd>
					<dt>网关</dt>
					<dd>{updates?.runningVersion ?? "未知"}</dd>
					<dt>网关已安装</dt>
					<dd>{updates?.installedVersion ?? "未知"}</dd>
					<dt>最新稳定版</dt>
					<dd>
						{updates?.latestVersion ?? "未知"}
						{updates?.checkState === "failed" ? "（检查失败）" : ""}
					</dd>
				</dl>
				<div className="flex flex-wrap gap-3">
					<button
						type="button"
						className="btn-primary focus-neko rounded-full px-4 py-2"
						disabled={checking}
						onClick={() => void check()}
					>
						{checking ? "检查中…" : "检查更新"}
					</button>
					<button
						type="button"
						className="focus-neko rounded-full border border-sakura-200 px-4 py-2 text-sm"
						onClick={() => void copyUpdateCommand().then(setMessage)}
					>
						复制 neko update
					</button>
					{action === "refresh-page" && (
						<button
							type="button"
							className="focus-neko rounded-full border border-sakura-200 px-4 py-2 text-sm"
							onClick={reloadForUpgrade}
						>
							刷新页面
						</button>
					)}
				</div>
				<output className="mt-3 block text-sm text-ink-600">{message}</output>
				<p className="mt-5 text-sm text-ink-600">
					在运行 neko 的电脑上执行 <code className="select-all">neko update</code>。
				</p>
				<p className="mt-2 text-sm text-ink-600">
					完成任务后，退出使用同一数据目录的 TUI/Web 和独立 neko serve，再运行 neko tui 或 neko
					web。仅页面需要更新时，点击刷新。
				</p>
				{recovery?.text && (
					<details className="mt-5 text-sm">
						<summary className="focus-neko cursor-pointer">升级前保留的草稿</summary>
						<p className="mt-2 whitespace-pre-wrap break-words select-text">{recovery.text}</p>
					</details>
				)}
			</main>
		</SettingsShell>
	);
}
