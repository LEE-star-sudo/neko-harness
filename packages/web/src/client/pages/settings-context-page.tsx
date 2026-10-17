import { ContextSettingsPanel } from "../components/context-settings-panel";
import { SettingsShell } from "../components/settings-shell";
import { appActions } from "../lib/bootstrap";
import { useNekoState } from "../lib/store";

export function SettingsContextPage() {
	const { contextSettings, phase } = useNekoState();
	return (
		<SettingsShell active="context">
			<div className="mx-auto w-full max-w-4xl px-5 pt-6 pb-3">
				<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
					<h1 className="text-xl font-bold text-ink-900">上下文</h1>
					<span className="ml-auto text-xs text-ink-500">{phase === "ready" ? "已连接" : "连接中…"}</span>
				</div>
				<p className="mt-1 text-sm text-ink-500">
					管理长对话如何节省上下文。点选即保存、立即生效，所有工作区共用；不选“默认”则沿用原有行为。
				</p>
			</div>
			<main className="mx-auto w-full max-w-4xl px-5 pb-8">
				<ContextSettingsPanel
					settings={contextSettings}
					ready={phase === "ready"}
					onChange={(patch) => appActions.setContextSettings(patch)}
					onReset={() => appActions.resetContextSettings()}
				/>
			</main>
		</SettingsShell>
	);
}
