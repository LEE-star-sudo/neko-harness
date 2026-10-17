import type { SearchProviderId } from "@neko-harness/core/search-providers";
import { useRef, useState } from "react";
import type { NekoCredentialState, NekoSearchSettingsState } from "../lib/contract";
import { SEARCH_NAMES, searchOptions, searchWarning } from "../lib/search-settings";

export function SearchServiceCard(props: {
	settings: NekoSearchSettingsState | null;
	credentials: NekoCredentialState | null;
	ready: boolean;
	onSelect: (provider: SearchProviderId) => Promise<void>;
}) {
	const { settings, credentials, ready, onSelect } = props;
	const [busy, setBusy] = useState(false);
	const pending = useRef(false);
	const [message, setMessage] = useState("");
	const warning = searchWarning(settings, credentials);
	async function choose(provider: SearchProviderId) {
		if (pending.current || provider === settings?.selected) return;
		pending.current = true;
		setBusy(true);
		setMessage("");
		try {
			await onSelect(provider);
			setMessage(`已切换为${SEARCH_NAMES[provider]}，下次搜索生效`);
		} catch {
			setMessage("保存失败，请检查连接后重试。");
		} finally {
			pending.current = false;
			setBusy(false);
		}
	}
	const disabled = busy || !ready || !settings;
	return (
		<section
			className="rounded-2xl border border-sakura-200 bg-surface p-5 shadow-soft"
			aria-labelledby="search-service"
		>
			<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
				<h2 id="search-service" className="text-base font-bold text-ink-900">
					搜索服务
				</h2>
				<span className="rounded-full bg-tianyi-50 px-3 py-1 text-xs text-tianyi-800">
					{settings ? `当前使用：${SEARCH_NAMES[settings.selected]}` : "读取中…"}
				</span>
			</div>
			<p className="mb-3 text-xs text-ink-500">选择助手联网搜索与读取网页使用的服务；保存后下一次调用生效。</p>
			<fieldset className="flex flex-col gap-2" disabled={disabled}>
				<legend className="sr-only">搜索服务</legend>
				{searchOptions(settings, credentials).map((option) => (
					<label
						key={option.value}
						className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm ${
							option.selected ? "border-sakura-400 bg-sakura-50" : "border-sakura-100"
						} ${disabled ? "opacity-60" : ""}`}
					>
						<input
							type="radio"
							name="search-provider"
							value={option.value}
							checked={option.selected}
							onChange={() => void choose(option.value)}
							className="mt-1"
						/>
						<span className="min-w-0 flex-1">
							<span className="font-semibold text-ink-900">{option.label}</span>
							<span className="block text-xs text-ink-500">{option.description}</span>
						</span>
					</label>
				))}
			</fieldset>
			{warning && (
				<p className="mt-3 text-xs text-sakura-800">
					{warning}{" "}
					<a href="#credential-deepseek" className="focus-neko rounded underline">
						前往配置
					</a>
				</p>
			)}
			<output className="mt-2 block min-h-4 text-xs text-tianyi-800">{message}</output>
		</section>
	);
}
