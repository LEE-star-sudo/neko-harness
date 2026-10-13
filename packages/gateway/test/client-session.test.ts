import { expect, it } from "bun:test";
import { createHost, type Frame, type Link, memoryLinkPair } from "@earendil-works/chord";
import { createNekoRuntime } from "@neko-harness/core";
import { fauxProvider } from "../../../test/faux.ts";
import { createGatewayConnection } from "../src/client-session.ts";
import { createNekoServerServices } from "../src/server-services.ts";

class HeldLink implements Link {
	private link: Link;
	private receiver?: (frame: Frame) => void;
	frames: Frame[] = [];
	hold = true;
	constructor(link: Link) {
		this.link = link;
	}
	get closed() {
		return this.link.closed;
	}
	send(frame: Frame) {
		this.link.send(frame);
	}
	onClose(handler: (reason: string) => void) {
		this.link.onClose(handler);
	}
	close(reason?: string) {
		this.link.close(reason);
	}
	receive(handler: (frame: Frame) => void) {
		this.receiver = handler;
		this.link.receive((frame) => {
			if (this.hold) this.frames.push(frame);
			else handler(frame);
		});
	}
	flush() {
		this.hold = false;
		for (const frame of this.frames.splice(0)) this.receiver!(frame);
	}
}

it("waits for delayed initial state and returns native handles through async boundaries", async () => {
	const faux = fauxProvider();
	const runtime = await createNekoRuntime({
		storage: "memory",
		providers: [faux.provider],
		model: { provider: "faux", modelId: "faux-1" },
	});
	const server = createHost({ name: "session-test", dev: true, onError() {} });
	const services = await createNekoServerServices({
		host: server,
		runtime,
		context: runtime.context,
		marketUrl: "https://unused.invalid",
	});
	const [clientLink, serverLink] = memoryLinkPair();
	server.accept(serverLink, { principal: { connectionId: "test" } });
	const link = new HeldLink(clientLink);
	const client = createGatewayConnection(link, server.name);
	try {
		let ready = false;
		const pending = client.ready().then(() => {
			ready = true;
		});
		await Bun.sleep(10);
		expect(ready).toBe(false);
		expect(client.application.info.value).toBeUndefined();
		expect(() => client.directory).toThrow("Gateway protocol not checked");
		link.flush();
		await pending;
		expect(client.directory.state.value?.sessions[0]?.id).toBe("1");
		const chat = await (async () => client.attach("1"))();
		expect("then" in chat).toBe(false);
		expect(chat.view.value?.cwd).toBeDefined();
		expect((await client.models.list(null)).length).toBeGreaterThan(0);
		await Promise.all([client.detach(), client.detach()]);
		await expect(chat.usage(null)).rejects.toThrow();
		link.hold = true;
		const controller = new AbortController();
		const cancelled = client.host.root((ctx) => client.attach("1", ctx), { signal: controller.signal });
		await Bun.sleep(10);
		controller.abort();
		await expect(cancelled).rejects.toThrow();
		link.flush();
		expect((await client.attach("1")).view.value).toBeDefined();
	} finally {
		await Promise.all([client.close(), client.close()]);
		await server.close();
		await services.dispose();
		await runtime.close();
	}
});

it("bounds gateway readiness when the peer never delivers a snapshot", async () => {
	const [link, peer] = memoryLinkPair();
	const client = createGatewayConnection(link, "absent");
	try {
		await expect(client.ready()).rejects.toThrow("timed out");
	} finally {
		await Promise.all([client.close(), client.close()]);
		peer.close();
	}
}, 10000);
