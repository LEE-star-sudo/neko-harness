import { MODEL_PROVIDERS, SEARCH_CREDENTIAL_PROVIDERS } from "@neko-harness/core/credential-providers";
import { ProviderCredentialCard } from "../components/provider-credential-card";
import { SearchServiceCard } from "../components/search-service-card";
import { SettingsShell } from "../components/settings-shell";
import { appActions } from "../lib/bootstrap";
import { useNekoState } from "../lib/store";

const DEEPSEEK = MODEL_PROVIDERS.find((spec) => spec.id === "deepseek");

export function SettingsSearchPage() {
	const { credentials, searchSettings, phase } = useNekoState();
	const ready = phase === "ready" && credentials !== null;
	return (
		<SettingsShell active="search">
			<div className="mx-auto w-full max-w-4xl px-5 pt-6 pb-3">
				<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
					<h1 className="text-xl font-bold text-ink-900">联网搜索</h1>
					<span className="ml-auto text-xs text-ink-500">{phase === "ready" ? "已连接" : "连接中…"}</span>
				</div>
				<p className="mt-1 text-sm text-ink-500">选择助手联网搜索使用的服务，并管理 Tavily 与 DeepSeek 的 API Key。</p>
			</div>
			<main className="mx-auto w-full max-w-4xl px-5 pb-8">
				<div className="flex flex-col gap-4">
					<SearchServiceCard
						settings={searchSettings}
						credentials={credentials}
						ready={ready}
						onSelect={(provider) => appActions.setSearchProvider(provider)}
					/>
					{SEARCH_CREDENTIAL_PROVIDERS.map((spec) => (
						<ProviderCredentialCard key={spec.id} spec={spec} status={credentials?.statuses[spec.id]} ready={ready} />
					))}
					{DEEPSEEK && (
						<ProviderCredentialCard
							spec={DEEPSEEK}
							status={credentials?.statuses[DEEPSEEK.id]}
							ready={ready}
							note="与「模型服务」共用同一个 DeepSeek Key，在任一页面保存或移除都会同步。"
						/>
					)}
				</div>
			</main>
		</SettingsShell>
	);
}
