import { MODEL_PROVIDERS } from "@neko-harness/core/credential-providers";
import { useEffect, useState } from "react";
import { ProviderCredentialCard } from "../components/provider-credential-card";
import { SettingsShell } from "../components/settings-shell";
import { appActions } from "../lib/bootstrap";
import { useNekoState } from "../lib/store";

export function SettingsPage() {
	const { credentials, phase } = useNekoState();
	const ready = phase === "ready" && credentials !== null;
	const [query, setQuery] = useState("");
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	const matches = (spec: (typeof MODEL_PROVIDERS)[number]) =>
		words.every((word) => `${spec.name} ${spec.id} ${spec.envVar}`.toLowerCase().includes(word));
	const enabled = MODEL_PROVIDERS.filter((spec) => credentials?.statuses[spec.id]?.enabled !== false);
	const others = MODEL_PROVIDERS.filter((spec) => credentials?.statuses[spec.id]?.enabled === false);
	const shown = others.filter(matches);
	const hash = typeof window === "undefined" ? "" : window.location.hash.slice(1);
	useEffect(() => {
		if (hash && credentials) document.getElementById(hash)?.scrollIntoView({ block: "center" });
	}, [hash, credentials]);
	const card = (spec: (typeof MODEL_PROVIDERS)[number]) => (
		<ProviderCredentialCard
			key={spec.id}
			spec={spec}
			status={credentials?.statuses[spec.id]}
			ready={ready}
			enable={{
				enabled: credentials?.statuses[spec.id]?.enabled !== false,
				locked: spec.id === "deepseek",
				onChange: (value) => appActions.setProviderEnabled(spec.id, value),
			}}
		/>
	);
	return (
		<SettingsShell active="credentials">
			<div className="mx-auto w-full max-w-4xl px-5 pt-6 pb-3">
				<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
					<h1 className="text-xl font-bold text-ink-900">模型服务</h1>
					<span className="ml-auto text-xs text-ink-500">{phase === "ready" ? "已连接" : "连接中…"}</span>
				</div>
				<p className="mt-1 text-sm text-ink-500">
					启用要使用的模型服务并配置 API Key；保存值优先于环境变量，所有工作区共用。DeepSeek 始终启用。
				</p>
			</div>
			<main className="mx-auto w-full max-w-4xl px-5 pb-8">
				<div className="flex flex-col gap-4">
					{enabled.map(card)}
					<details className="rounded-2xl border border-sakura-200 bg-surface p-4 shadow-soft" open={words.length > 0}>
						<summary className="focus-neko cursor-pointer rounded text-sm font-semibold text-ink-900">
							更多模型服务（{others.length}，未启用）
						</summary>
						<div className="mt-3 flex flex-col gap-4">
							<input
								type="search"
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								aria-label="搜索模型服务"
								placeholder="搜索名称或环境变量"
								className="focus-neko w-full min-w-0 rounded-xl border border-sakura-200 bg-base px-3 py-2 text-sm"
							/>
							{shown.map(card)}
							{shown.length === 0 && <p className="text-xs text-ink-500">没有匹配的模型服务。</p>}
						</div>
					</details>
				</div>
			</main>
		</SettingsShell>
	);
}
