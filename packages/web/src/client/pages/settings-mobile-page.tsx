import { MobilePairing } from "../components/mobile-pairing";
import { SettingsShell } from "../components/settings-shell";

export function SettingsMobilePage() {
	return (
		<SettingsShell active="mobile">
			<div className="mx-auto w-full max-w-4xl px-5 pt-6 pb-3">
				<h1 className="text-xl font-bold text-ink-900">手机配对</h1>
				<p className="mt-1 text-sm text-ink-500">在手机 App 上控制电脑上的 Agent；配对管理仅限电脑本机。</p>
			</div>
			<main className="mx-auto w-full max-w-4xl px-5 pb-8">
				<MobilePairing />
			</main>
		</SettingsShell>
	);
}
