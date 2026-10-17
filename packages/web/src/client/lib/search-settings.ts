import { SEARCH_PROVIDERS, type SearchProviderId } from "@neko-harness/core/search-providers";
import type { NekoCredentialState, NekoSearchSettingsState } from "./contract.ts";

export const SEARCH_NAMES: Record<SearchProviderId, string> = {
	tavily: "Tavily",
	deepseek: "DeepSeek",
};

export type SearchOptionView = {
	value: SearchProviderId;
	label: string;
	description: string;
	selected: boolean;
};

const SOURCES: Record<NekoCredentialState["statuses"]["deepseek"]["source"], string> = {
	saved: "已保存密钥",
	environment: "环境变量",
	runtime: "运行时配置",
	keyless: "keyless 限流",
	none: "未配置密钥",
};

export function searchOptions(
	settings: NekoSearchSettingsState | null,
	credentials: NekoCredentialState | null,
): SearchOptionView[] {
	const source = (provider: SearchProviderId) => {
		const status = credentials?.statuses[provider];
		return status ? SOURCES[status.source] : "读取中…";
	};
	const descriptions: Record<SearchProviderId, string> = {
		tavily: `使用 Tavily 搜索与抓取（${source("tavily")}），默认选项`,
		deepseek: `使用 DeepSeek 搜索与抓取，共用 DeepSeek 密钥（${source("deepseek")}）`,
	};
	return SEARCH_PROVIDERS.map((value) => ({
		value,
		label: SEARCH_NAMES[value],
		description: descriptions[value],
		selected: settings?.selected === value,
	}));
}

/** DeepSeek without a key cannot search; the page points the user to the credential entry. */
export function searchWarning(
	settings: NekoSearchSettingsState | null,
	credentials: NekoCredentialState | null,
): string | null {
	if (settings?.selected === "deepseek" && credentials?.statuses.deepseek.source === "none")
		return "尚未配置 DeepSeek 密钥，搜索将不可用。请在下方配置密钥，或改选 Tavily。";
	return null;
}
