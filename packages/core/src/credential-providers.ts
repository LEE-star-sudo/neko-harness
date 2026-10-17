/**
 * Credential provider descriptors. Free of Node imports so browser bundles
 * (the Web settings page) can use it via the `@neko-harness/core/credential-providers` subpath.
 */

/** Credential-bearing providers the runtime knows about; the set is deliberately closed. */
export type CredentialProviderId = "deepseek" | "tavily";

export type CredentialProviderSpec = {
	readonly id: CredentialProviderId;
	/** Environment variable probed for status display and request auth; the DeepSeek key serves both the model and web search. */
	readonly envVar: string;
	/** Where users obtain a key; surfaced by frontends. */
	readonly signupUrl: string;
	/** True when the provider works without any key in a rate-limited keyless mode. */
	readonly keyless: boolean;
};

export const CREDENTIAL_PROVIDERS: readonly CredentialProviderSpec[] = [
	{ id: "deepseek", envVar: "DEEPSEEK_API_KEY", signupUrl: "https://platform.deepseek.com/api_keys", keyless: false },
	{ id: "tavily", envVar: "TAVILY_API_KEY", signupUrl: "https://app.tavily.com", keyless: true },
];

export function credentialProvider(id: string): CredentialProviderSpec {
	const spec = CREDENTIAL_PROVIDERS.find((item) => item.id === id);
	if (!spec) throw new Error(`Unknown credential provider: ${id}`);
	return spec;
}
