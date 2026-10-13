import { expect, it } from "bun:test";
import { cell, createHost } from "@earendil-works/chord";
import { DirectoryStateSchema, NekoModels, NekoSessionDirectory } from "../src/contract.ts";

it("validates shared contract results and state before publishing them", async () => {
	const host = createHost({ name: "contract-test", dev: true, onError() {} });
	host.serve(NekoModels, () => ({ kind: "ready", list: async () => [{ provider: "invalid" }] as never }));
	let invalidState = () => Promise.resolve();
	host.serve(NekoSessionDirectory, (_input, _principal, self) => {
		const { state } = self.state({ state: cell(DirectoryStateSchema, { revision: 1, sessions: [] }) });
		invalidState = () => host.root((ctx) => state.replace(ctx, { revision: 1, sessions: [{ id: 42 }] } as never));
		return { kind: "ready", state };
	});
	try {
		const models = host.get(NekoModels, {});
		const directory = host.get(NekoSessionDirectory, {});
		const stop = directory.state.subscribe(() => {});
		await Promise.all([models.ready, directory.ready]);
		await expect(models.list(null)).rejects.toMatchObject({ code: "invalid", reason: "result" });
		await expect(invalidState()).rejects.toMatchObject({ code: "invalid", reason: "state" });
		expect(directory.state.value).toEqual({ revision: 1, sessions: [] });
		stop();
	} finally {
		await host.close();
	}
});
