import { expect, it } from "bun:test";
import {
	createModels,
	fauxAssistantMessage,
	fauxProvider,
	InMemoryCredentialStore,
	type RefreshModelsContext,
} from "@earendil-works/pi-ai";
import { createNekoRuntime } from "../src/runtime.ts";

it("uses published DeepSeek 1.2 capabilities directly", async () => {
	const runtime = await createNekoRuntime({ storage: "memory" });
	try {
		const models = runtime.listModels();
		expect(models.map((m) => m.provider)).toEqual(["deepseek", "deepseek"]);
		expect(models.find((m) => m.modelId === "deepseek-flash")).toMatchObject({
			input: ["text", "image"],
			supportedThinkingLevels: ["off", "low", "high", "max"],
		});
		expect(models.find((m) => m.modelId === "deepseek-v4-pro")).toMatchObject({
			input: ["text"],
			supportedThinkingLevels: ["off", "high", "max"],
		});
	} finally {
		await runtime.close();
	}
});

it("delegates custom provider URLs and refresh context to Pi 1.2", async () => {
	const faux = fauxProvider();
	const baseUrl = "https://custom-provider.invalid/v1";
	const contexts: RefreshModelsContext[] = [];
	const provider = {
		...faux.provider,
		baseUrl,
		getModels: () => faux.models.map((model) => ({ ...model, baseUrl })),
		refreshModels: async (context: RefreshModelsContext) => {
			contexts.push(context);
		},
	};
	const models = createModels({ credentials: new InMemoryCredentialStore() });
	models.setProvider(provider);
	const signal = new AbortController().signal;
	expect(await models.refresh({ providers: [provider.id], force: true, signal })).toMatchObject({ aborted: false });
	expect(contexts.at(-1)).toMatchObject({ baseUrl, allowNetwork: true, force: true });
	expect(contexts.at(-1)!.signal.aborted).toBe(false);
	let url = "";
	faux.setResponses([
		(_ctx, _options, _state, model) => {
			url = model.baseUrl;
			return fauxAssistantMessage("answer");
		},
	]);
	const runtime = await createNekoRuntime({
		storage: "memory",
		providers: [provider],
		model: { provider: provider.id, modelId: faux.models[0].id },
	});
	try {
		await runtime.waitAnswer(await runtime.submit("custom URL"));
		expect(url).toBe(baseUrl);
	} finally {
		await runtime.close();
	}
});
