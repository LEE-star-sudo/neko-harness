import { expect, it } from "bun:test";
import { mkdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { BACKGROUND_CONTEXT as ctx } from "@earendil-works/chord/context";
import { connectNekoGateway } from "../../gateway/src/client.ts";
import { cleanup, makeGateway, waitFor } from "../../gateway/test/helpers.ts";
import { GatewayConnection, type GatewayEvents, workspaceSessions } from "../src/client/lib/gateway.ts";
import { startWebServer } from "../src/server.ts";

it("scopes Web discovery to its launch directory while reusing another workspace gateway", async () => {
	const target = await makeGateway();
	const dir = await realpath(target.dir);
	const b = join(dir, "B");
	await mkdir(b);
	try {
		for (const cwd of [b, undefined]) {
			const web = await startWebServer({
				port: 0,
				gateway: {
					socketPath: target.socketPath,
					serverId: target.serverId,
					port: Number(new URL(target.wsUrl).port),
					storagePath: join(dir, "unused.sqlite"),
					...(cwd ? { cwd } : {}),
				},
			});
			try {
				const info = (await (await fetch(`${web.url}/api/info`)).json()) as { workspaceRoot: string };
				expect(info.workspaceRoot).toBe(cwd ?? (await realpath(process.cwd())));
			} finally {
				await web.close();
			}
		}
	} finally {
		await cleanup(target);
	}
});
it("navigates, creates and archives only within the selected workspace", async () => {
	const target = await makeGateway();
	const dir = await realpath(target.dir);
	const b = join(dir, "B");
	await mkdir(b);
	const events: GatewayEvents = {
		onPhase: () => {},
		onError: () => {},
		onDirectory: () => {},
		onWorkspaces: () => {},
		onWorkspace: () => {},
		onOperation: () => {},
		onModels: () => {},
		onSessionChange: () => {},
		onView: () => {},
	};
	const web = new GatewayConnection({
		url: target.wsUrl,
		serverId: target.serverId,
		workspaceRoot: b,
		events,
		retryBaseMs: 20,
	});
	const peer = await connectNekoGateway({
		transport: "unix",
		socketPath: target.socketPath,
		serverId: target.serverId,
	});
	try {
		await web.start();
		expect(web.managementReady).toBe(true);
		expect(web.ready).toBe(false);
		expect(web.currentSessionId).toBeUndefined();
		const create = web.createSession();
		await expect(web.createSession()).rejects.toThrow("操作");
		await create;
		const id = web.currentSessionId!;
		expect(web.ready).toBe(true);
		await waitFor(() => peer.directory.state.value?.sessions.some((s) => s.id === id) === true, "new session");
		expect(peer.directory.state.value?.sessions.find((s) => s.id === id)?.workspaceRoot).toBe(b);
		await web.createSession();
		const newer = web.currentSessionId!;
		await web.attachTo(id);
		const root = peer.directory.state.value!.sessions.find((s) => s.id === "1")!;
		await web.selectWorkspace(root.workspaceRoot);
		await web.selectWorkspace(b);
		expect(web.currentSessionId).toBe(id);
		await peer.management.archive(id, ctx);
		await waitFor(() => web.currentSessionId === newer && web.ready, "same-workspace fallback");
		await web.archiveSession(newer);
		expect(web.currentSessionId).toBeUndefined();
		expect(web.workspaceRoot).toBe(b);
		expect(web.managementReady).toBe(true);
		await expect(web.attachTo("1")).rejects.toThrow("工作区");
		await expect(web.addWorkspace(join(b, "absent"))).rejects.toThrow();
		expect(web.workspaceRoot).toBe(b);
	} finally {
		web.dispose();
		await peer.close();
		await cleanup(target);
	}
});
it("orders only matching workspaces by activity and stable id", () => {
	expect(
		workspaceSessions(
			[
				{
					id: "1",
					workspaceRoot: "a",
					lastUsedAt: 2,
					createdAt: 2,
					lastMessageAt: null,
					title: "",
					firstPromptPreview: "",
					model: null,
					status: "idle",
				},
				{
					id: "3",
					workspaceRoot: "a",
					lastUsedAt: 2,
					createdAt: 2,
					lastMessageAt: null,
					title: "",
					firstPromptPreview: "",
					model: null,
					status: "idle",
				},
				{
					id: "4",
					workspaceRoot: "b",
					lastUsedAt: 9,
					createdAt: 9,
					lastMessageAt: null,
					title: "",
					firstPromptPreview: "",
					model: null,
					status: "idle",
				},
			],
			"a",
		).map((s) => s.id),
	).toEqual(["3", "1"]);
});

it("reconnects within the selected workspace and a fresh page uses the launch workspace", async () => {
	const target = await makeGateway();
	const dir = await realpath(target.dir);
	const b = join(dir, "reconnect-b");
	await mkdir(b);
	const OriginalWebSocket = globalThis.WebSocket;
	const sockets: WebSocket[] = [];
	globalThis.WebSocket = new Proxy(OriginalWebSocket, {
		construct(target, args) {
			const socket = Reflect.construct(target, args) as WebSocket;
			sockets.push(socket);
			return socket;
		},
	});
	let phase = "";
	const events: GatewayEvents = {
		onPhase: (p) => {
			phase = p;
		},
		onError: () => {},
		onDirectory: () => {},
		onWorkspaces: () => {},
		onWorkspace: () => {},
		onOperation: () => {},
		onModels: () => {},
		onSessionChange: () => {},
		onView: () => {},
	};
	const options = { url: target.wsUrl, serverId: target.serverId, workspaceRoot: b, events, retryBaseMs: 100 };
	const web = new GatewayConnection(options);
	const peer = await connectNekoGateway({
		transport: "unix",
		socketPath: target.socketPath,
		serverId: target.serverId,
	});
	try {
		await web.start();
		await web.createSession();
		const first = web.currentSessionId!;
		await web.createSession();
		const second = web.currentSessionId!;
		sockets[0]!.close();
		await waitFor(() => phase === "reconnecting", "disconnect");
		await peer.management.archive(second, ctx);
		await waitFor(() => phase === "ready" && web.ready, "reconnect");
		expect(web.currentSessionId).toBe(first);
		expect(web.workspaceRoot).toBe(b);
		const root = peer.directory.state.value!.sessions.find((s) => s.id === "1")!;
		await web.selectWorkspace(root.workspaceRoot);
		web.dispose();
		const fresh = new GatewayConnection(options);
		try {
			await fresh.start();
			expect(fresh.workspaceRoot).toBe(b);
			expect(fresh.currentSessionId).toBe(first);
		} finally {
			fresh.dispose();
		}
	} finally {
		web.dispose();
		globalThis.WebSocket = OriginalWebSocket;
		await peer.close();
		await cleanup(target);
	}
});
