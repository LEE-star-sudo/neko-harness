/** Shared browser-safe connection and first-snapshot orchestration. Native handles pass through unchanged. */
import { type Ctx, createHost, type Host, type Link, type Readable } from "@earendil-works/chord";
import {
	type NekoAttachment,
	NekoChat,
	NekoCredentials,
	NekoModels,
	NekoSessionDirectory,
	NekoSessionManagement,
	NekoSkillMarket,
	NekoWorkspaceFiles,
	NekoWorkspaces,
} from "./contract.ts";
import { identifiedLink } from "./link.ts";
export function waitForValue<T>(state: Readable<T | undefined>, signal?: AbortSignal): Promise<T> {
	return new Promise((resolve, reject) => {
		let stop = () => {};
		let settled = false;
		const finish = (error?: unknown, value?: T) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			stop();
			signal?.removeEventListener("abort", abort);
			if (error) reject(error);
			else resolve(value!);
		};
		const abort = () => finish(signal?.reason ?? new Error("Cancelled"));
		const timer = setTimeout(() => finish(new Error("Timed out waiting for first snapshot")), 5000);
		stop = state.subscribe((value) => {
			if (value !== undefined) finish(undefined, value);
		});
		if (settled) stop();
		signal?.addEventListener("abort", abort, { once: true });
		if (signal?.aborted) abort();
	});
}
export type NekoGatewayConnection = {
	readonly host: Host;
	readonly link: Link;
	readonly directory: NekoSessionDirectory;
	readonly management: NekoSessionManagement;
	readonly models: NekoModels;
	readonly workspaces: NekoWorkspaces;
	readonly workspaceFiles: NekoWorkspaceFiles;
	readonly credentials: NekoCredentials;
	readonly skillMarket: NekoSkillMarket;
	readonly attachment: NekoAttachment | undefined;
	ready(): Promise<void>;
	attach(id: string, ctx?: Ctx): Promise<NekoChat>;
	detach(): Promise<void>;
	close(): Promise<void>;
};
export function createGatewayConnection(link: Link, serverId: string): NekoGatewayConnection {
	const host = createHost({ kind: "client", upstream: identifiedLink(link, serverId), onError: () => {} });
	const get = <C extends Parameters<Host["get"]>[0]>(type: C) => host.get(type, {} as never, { at: serverId });
	const directory = get(NekoSessionDirectory),
		management = get(NekoSessionManagement),
		models = get(NekoModels),
		workspaces = get(NekoWorkspaces),
		workspaceFiles = get(NekoWorkspaceFiles),
		credentials = get(NekoCredentials),
		skillMarket = get(NekoSkillMarket);
	const keep = [
		directory.state.subscribe(() => {}),
		workspaces.state.subscribe(() => {}),
		credentials.state.subscribe(() => {}),
	];
	let chat: NekoChat | undefined;
	let attachment: NekoAttachment | undefined;
	let stopView: (() => void) | undefined;
	let closed = false;
	let closing: Promise<void> | undefined;
	const connection: NekoGatewayConnection = {
		host,
		link,
		directory,
		management,
		models,
		workspaces,
		workspaceFiles,
		credentials,
		skillMarket,
		get attachment() {
			return attachment;
		},
		async ready() {
			await deadline(
				Promise.all([
					directory.ready,
					management.ready,
					models.ready,
					workspaces.ready,
					credentials.ready,
					workspaceFiles.ready,
					skillMarket.ready,
				]),
			);
			await Promise.all([
				waitForValue(directory.state),
				waitForValue(workspaces.state),
				waitForValue(credentials.state),
			]);
		},
		async attach(sessionId: string, ctx?: Ctx): Promise<NekoChat> {
			const next = await management.attach(sessionId, ctx);
			if (chat?.status === "live" && chat.view.value !== undefined && attachment?.attachmentId === next.attachmentId)
				return chat;
			stopView?.();
			chat?.release();
			attachment = next;
			const current = host.get(NekoChat, next, { at: serverId });
			chat = current;
			stopView = current.view.subscribe(() => {});
			try {
				await deadline(current.ready, ctx?.signal);
				await waitForValue(current.view, ctx?.signal);
				if (current !== chat) throw new Error("Attachment changed");
				return current;
			} catch (error) {
				current.release();
				if (current === chat) {
					stopView?.();
					stopView = undefined;
					chat = undefined;
					attachment = undefined;
				}
				throw error;
			}
		},
		async detach() {
			stopView?.();
			stopView = undefined;
			chat?.release();
			chat = undefined;
			attachment = undefined;
			if (!closed) await management.detach(null);
		},
		async close() {
			if (closing) return closing;
			closed = true;
			closing = (async () => {
				stopView?.();
				chat?.release();
				for (const stop of keep) stop();
				await host.close();
			})();
			return closing;
		},
	};
	link.onClose(() => {
		void connection.close().catch(() => {});
	});
	return connection;
}

function deadline<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
	let timer: ReturnType<typeof setTimeout>;
	let abort: () => void = () => {};
	return Promise.race([
		work,
		new Promise<never>((_, reject) => {
			timer = setTimeout(() => reject(new Error("Gateway readiness timed out")), 5000);
			abort = () => reject(signal?.reason ?? new Error("Cancelled"));
			signal?.addEventListener("abort", abort, { once: true });
			if (signal?.aborted) abort();
		}),
	]).finally(() => {
		clearTimeout(timer);
		signal?.removeEventListener("abort", abort);
	});
}
