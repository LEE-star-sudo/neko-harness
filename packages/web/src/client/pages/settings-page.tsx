import type { CredentialStatus } from "@neko-harness/core";
import { CREDENTIAL_PROVIDERS, type CredentialProviderSpec } from "@neko-harness/core/credential-providers";
import { useRef, useState } from "react";
import { SearchServiceCard } from "../components/search-service-card";
import { SettingsShell } from "../components/settings-shell";
import { appActions } from "../lib/bootstrap";
import { useNekoState } from "../lib/store";

const sources: Record<CredentialStatus["source"], string> = {
	saved: "使用已保存密钥",
	environment: "使用环境变量",
	runtime: "使用运行时配置",
	keyless: "keyless（限流）",
	none: "尚未配置",
};

const providerNames: Record<string, string> = { deepseek: "DeepSeek", tavily: "Tavily" };

function ProviderCredentialCard(props: {
	spec: CredentialProviderSpec;
	status: CredentialStatus | undefined;
	ready: boolean;
}) {
	const { spec, status, ready } = props;
	const name = providerNames[spec.id] ?? spec.id;
	const [key, setKey] = useState("");
	const [busy, setBusy] = useState(false);
	const pending = useRef(false);
	const [message, setMessage] = useState("");
	async function update(remove: boolean) {
		if (pending.current) return;
		pending.current = true;
		setBusy(true);
		setMessage("");
		try {
			if (remove) await appActions.removeCredential(spec.id);
			else await appActions.saveCredential(spec.id, key);
			setKey("");
			setMessage(remove ? "已移除保存的密钥" : "已保存，下次请求生效");
		} catch {
			setMessage("操作失败，请检查连接后重试。");
		} finally {
			pending.current = false;
			setBusy(false);
		}
	}
	const disabled = busy || !ready || !status;
	return (
		<section id={`credential-${spec.id}`} className="rounded-2xl border border-sakura-200 bg-surface p-5 shadow-soft">
			<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
				<h2 className="text-base font-bold text-ink-900">{name}</h2>
				<span className="rounded-full bg-tianyi-50 px-3 py-1 text-xs text-tianyi-800">
					{status ? sources[status.source] : "读取中…"}
				</span>
			</div>
			<p className="mb-3 text-xs text-ink-500">
				环境变量：{status ? (status.environmentConfigured ? "已配置" : "未配置") : "读取中…"}
				{spec.keyless ? " · 未配置时以 keyless 限流模式运行" : ""}
			</p>
			<form
				onSubmit={(event) => {
					event.preventDefault();
					void update(false);
				}}
			>
				<label className="sr-only" htmlFor={`${spec.id}-key`}>
					{name} API Key
				</label>
				<input
					id={`${spec.id}-key`}
					type="password"
					autoComplete="off"
					spellCheck={false}
					value={key}
					maxLength={4096}
					disabled={disabled}
					onChange={(event) => setKey(event.target.value)}
					placeholder={status?.savedConfigured ? "输入新密钥以替换" : "粘贴你的 API Key"}
					className="focus-neko w-full min-w-0 rounded-xl border border-sakura-200 bg-base px-3 py-2.5 text-sm"
				/>
				<div className="mt-3 flex flex-wrap items-center gap-3">
					<button
						type="submit"
						disabled={disabled || !key.trim()}
						className="focus-neko rounded-full bg-sakura-100 px-4 py-1.5 text-sm font-semibold text-sakura-800 disabled:opacity-50"
					>
						{busy ? "处理中…" : "保存密钥"}
					</button>
					{status?.savedConfigured && (
						<button
							type="button"
							disabled={disabled}
							onClick={() => void update(true)}
							className="focus-neko rounded-full px-3 py-1.5 text-sm text-ink-500 disabled:opacity-50"
						>
							移除已保存密钥
						</button>
					)}
					<a
						href={spec.signupUrl}
						target="_blank"
						rel="noreferrer"
						className="focus-neko ml-auto inline-block rounded text-xs text-sakura-700"
					>
						获取 {name} API Key ↗
					</a>
				</div>
			</form>
			<output className="mt-2 block min-h-4 text-xs text-tianyi-800">{message}</output>
		</section>
	);
}

export function SettingsPage() {
	const { credentials, searchSettings, phase } = useNekoState();
	const ready = phase === "ready" && credentials !== null;
	return (
		<SettingsShell active="credentials">
			<div className="mx-auto w-full max-w-4xl px-5 pt-6 pb-3">
				<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
					<h1 className="text-xl font-bold text-ink-900">密钥</h1>
					<span className="ml-auto text-xs text-ink-500">{phase === "ready" ? "已连接" : "连接中…"}</span>
				</div>
				<p className="mt-1 text-sm text-ink-500">管理 API Key，保存值优先于环境变量，所有工作区共用。</p>
			</div>
			<main className="mx-auto w-full max-w-4xl px-5 pb-8">
				<div className="flex flex-col gap-4">
					<SearchServiceCard
						settings={searchSettings}
						credentials={credentials}
						ready={ready}
						onSelect={(provider) => appActions.setSearchProvider(provider)}
					/>
					{CREDENTIAL_PROVIDERS.map((spec) => (
						<ProviderCredentialCard key={spec.id} spec={spec} status={credentials?.statuses[spec.id]} ready={ready} />
					))}
				</div>
			</main>
		</SettingsShell>
	);
}
