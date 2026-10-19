import { beforeEach, expect, it, mock } from "bun:test";
import type { NekoSelectableModel } from "@neko-harness/core";
import { JSDOM } from "jsdom";
import * as React from "react";
import type { NekoCredentialState } from "../src/client/lib/contract.ts";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
Object.assign(globalThis, {
	window: dom.window,
	document: dom.window.document,
	navigator: dom.window.navigator,
	localStorage: dom.window.localStorage,
	HTMLElement: dom.window.HTMLElement,
	HTMLDialogElement: dom.window.HTMLDialogElement,
	IS_REACT_ACT_ENVIRONMENT: true,
});
const dialog = dom.window.HTMLDialogElement.prototype as unknown as { showModal?: () => void; close?: () => void };
dialog.showModal ??= function (this: HTMLDialogElement) {
	this.setAttribute("open", "");
};
dialog.close ??= function (this: HTMLDialogElement) {
	this.removeAttribute("open");
};

const configured: unknown[][] = [];
const enabledCalls: unknown[][] = [];
mock.module("../src/client/lib/bootstrap", () => ({
	appActions: {
		configure: async (...args: unknown[]) => void configured.push(args),
		setProviderEnabled: async (...args: unknown[]) => void enabledCalls.push(args),
		saveCredential: async () => {},
		removeCredential: async () => {},
		setSearchProvider: async () => {},
	},
}));
mock.module("@tanstack/react-router", () => ({
	Link: ({
		to,
		hash,
		children,
		...rest
	}: { to: string; hash?: string; children?: React.ReactNode } & Record<string, unknown>) =>
		React.createElement("a", { href: `${to}${hash ? `#${hash}` : ""}`, ...rest }, children),
}));

const { createRoot } = await import("react-dom/client");
const { act } = React;
const { storeActions } = await import("../src/client/lib/store.ts");
const { ModelPicker } = await import("../src/client/components/model-picker.tsx");
const { SettingsPage } = await import("../src/client/pages/settings-page.tsx");
const { SettingsSearchPage } = await import("../src/client/pages/settings-search-page.tsx");

const model = (provider: string, modelId: string, name: string, available: boolean): NekoSelectableModel => ({
	provider,
	modelId,
	name,
	available,
	contextWindow: 128_000,
	input: ["text"],
	reasoning: true,
	supportedThinkingLevels: ["off", "high", "max"],
	thinkingLevelAdjustments: {
		off: "off",
		minimal: "off",
		low: "high",
		medium: "high",
		high: "high",
		xhigh: "max",
		max: "max",
	},
});
const status = (source: "saved" | "none" | "keyless", enabled?: boolean) => ({
	savedConfigured: source === "saved",
	environmentConfigured: false,
	source,
	...(enabled === undefined ? {} : { enabled }),
});
const credentials = (): NekoCredentialState => ({
	revision: 1,
	statuses: {
		deepseek: status("saved", true),
		openrouter: status("none", true),
		openai: status("saved", false),
		tavily: status("keyless"),
	},
});
const view = (provider: string, modelId: string) =>
	({
		model: `${provider}/${modelId}`,
		agent: { model: { provider, modelId }, thinkingLevel: "high" },
		cwd: "/w",
		busy: false,
		status: null,
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
		items: [],
		streaming: null,
	}) as unknown as import("@neko-harness/core").ChatView;

async function mount(element: React.ReactElement) {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	await act(async () => root.render(element));
	return { host, unmount: () => act(async () => root.unmount()) };
}
const click = (element: Element | null) => act(async () => (element as HTMLElement).click());

beforeEach(() => {
	configured.length = 0;
	enabledCalls.length = 0;
	document.body.innerHTML = "";
	storeActions.setPhase("ready");
	storeActions.setSession("s1");
	storeActions.setCredentials(null);
	storeActions.setCredentials({ ...credentials(), revision: 100 });
	storeActions.setModels([
		model("deepseek", "deepseek-flash", "DeepSeek Flash", true),
		model("deepseek", "deepseek-v4-pro", "DeepSeek Pro", true),
		model("openrouter", "anthropic/claude-haiku-4.5", "Claude Haiku", false),
		model("openrouter", "openai/gpt-x", "GPT X", false),
	]);
});

it("groups models, collapses other providers, blocks keyless ones and applies a choice", async () => {
	storeActions.setView(view("deepseek", "deepseek-flash"));
	const picker = await mount(
		React.createElement(ModelPicker, {
			current: { provider: "deepseek", modelId: "deepseek-flash" },
			fallbackLabel: "x",
		}),
	);
	await click(picker.host.querySelector("button"));
	const body = document.body;
	const headers = [...body.querySelectorAll("button[aria-expanded]")];
	expect(headers.map((header) => header.getAttribute("aria-expanded"))).toEqual(["true", "false"]);
	expect(body.textContent).toContain("DeepSeek Pro");
	expect(body.textContent).not.toContain("Claude Haiku");
	expect(body.textContent).toContain("未配置 Key");
	expect(body.querySelector('a[href="/settings#credential-openrouter"]')).not.toBeNull();

	await click(headers[1]!);
	const blocked = [...body.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")].find((b) =>
		b.textContent?.includes("Claude Haiku"),
	)!;
	expect(blocked.disabled).toBe(true);

	const pro = [...body.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")].find((b) =>
		b.textContent?.includes("DeepSeek Pro"),
	)!;
	await click(pro);
	const apply = [...body.querySelectorAll("button")].find((b) => b.textContent === "应用")!;
	await click(apply);
	expect(configured).toEqual([
		[{ model: { provider: "deepseek", modelId: "deepseek-v4-pro" }, thinkingLevel: "high" }, "s1"],
	]);
	await picker.unmount();
});

it("searches across providers, expanding matching groups, and reports an empty result", async () => {
	storeActions.setView(view("deepseek", "deepseek-flash"));
	const picker = await mount(
		React.createElement(ModelPicker, {
			current: { provider: "deepseek", modelId: "deepseek-flash" },
			fallbackLabel: "x",
		}),
	);
	await click(picker.host.querySelector("button"));
	const search = document.body.querySelector<HTMLInputElement>("#model-search")!;
	const setValue = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")!.set!;
	const type = (value: string) =>
		act(async () => {
			setValue.call(search, value);
			search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
		});
	await type("claude");
	expect(document.body.querySelector("dialog")!.textContent).toContain("Claude Haiku");
	expect(document.body.querySelector("dialog")!.textContent).not.toContain("DeepSeek Flash");
	await type("zzz");
	expect(document.body.querySelector("dialog")!.textContent).toContain("没有匹配的模型");
	await picker.unmount();
});

it("still opens for a session whose provider was disabled and explains why", async () => {
	storeActions.setView(view("openai", "gpt-x"));
	const picker = await mount(
		React.createElement(ModelPicker, {
			current: { provider: "openai", modelId: "gpt-x" },
			fallbackLabel: "openai/gpt-x",
		}),
	);
	const trigger = picker.host.querySelector("button")!;
	expect(trigger.disabled).toBe(false);
	await click(trigger);
	expect(document.body.textContent).toContain("已取消启用");
	expect(document.body.querySelector('a[href="/settings#credential-openai"]')).not.toBeNull();
	const apply = [...document.body.querySelectorAll("button")].find((b) => b.textContent === "应用")!;
	expect(apply.disabled).toBe(true);
	await picker.unmount();
});

it("lists model providers with DeepSeek locked and toggles enablement through the gateway", async () => {
	const page = await mount(React.createElement(SettingsPage));
	const body = page.host;
	expect(body.querySelector("h1")?.textContent).toBe("模型服务");
	expect(body.textContent).not.toContain("Tavily");
	const deepseek = body.querySelector<HTMLInputElement>('input[aria-label="启用 DeepSeek"]')!;
	expect(deepseek.checked).toBe(true);
	expect(deepseek.disabled).toBe(true);
	const openrouter = body.querySelector<HTMLInputElement>('input[aria-label="启用 OpenRouter"]')!;
	expect(openrouter.checked).toBe(true);
	const openai = body.querySelector<HTMLInputElement>('input[aria-label="启用 OpenAI"]')!;
	expect(openai.checked).toBe(false);
	await click(openai);
	expect(enabledCalls).toEqual([["openai", true]]);
	expect(body.querySelectorAll("details").length).toBe(1);
	await page.unmount();
});

it("keeps web search and the Tavily key on their own page", async () => {
	storeActions.setSearchSettings({ revision: 1, selected: "tavily" });
	const page = await mount(React.createElement(SettingsSearchPage));
	const text = page.host.textContent ?? "";
	expect(page.host.querySelector("h1")?.textContent).toBe("联网搜索");
	expect(text).toContain("搜索服务");
	expect(page.host.querySelector("#credential-tavily")).not.toBeNull();
	expect(page.host.querySelector("#credential-deepseek")).toBeNull();
	expect(page.host.querySelector('input[aria-label^="启用"]')).toBeNull();
	expect(page.host.querySelector('a[href="/settings/search"][aria-current="page"]')).not.toBeNull();
	expect(page.host.querySelector('a[href="/settings"]')).not.toBeNull();
	await page.unmount();
});
