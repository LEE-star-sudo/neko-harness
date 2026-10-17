/** Shared browser-safe connection and first-snapshot orchestration. Native handles pass through unchanged. */
import type { Ctx, Host, Link } from "@earendil-works/chord";
import { APPLICATION_PROTOCOL, ApplicationProtocolError } from "@neko-harness/core/application-version";
import {
	NekoApplicationInfo,
	type NekoAttachment,
	NekoChat,
	NekoCredentials,
	NekoModels,
	NekoSearchSettings,
	NekoSessionDirectory,
	NekoSessionManagement,
	NekoSkillMarket,
	NekoSubagent,
	NekoWorkspaceFiles,
	NekoWorkspaces,
	type WireJobOutput,
	type WireJobSummary,
} from "./contract.ts";
import { createClientHost } from "./link.ts";
import { type SubagentClient, subagentClient } from "./subagent-client.ts";
/** The gateway behind the link is not the one the caller discovered (its server id differs). */
export class GatewayIdentityError extends Error {
	constructor() {
		super("Gateway identity mismatch");
		this.name = "GatewayIdentityError";
	}
}
/** Verifies from the gateway's own application info that it is the expected server before anything else is sent to it. */
export async function assertGatewayIdentity(host: Host, serverId: string, signal?: AbortSignal): Promise<void> {
	const application = await host.get(NekoApplicationInfo, {}, signal ? { signal } : {});
	try {
		if (application.info.value.serverId !== serverId) throw new GatewayIdentityError();
	} finally {
		application.release();
	}
}
export const JOBS_UNSUPPORTED = "This gateway does not support background jobs. Restart the gateway to enable them.";
export type JobsClient = {
	/** False for a gateway built before background jobs: the view carries no `jobs` field at all. */
	readonly supported: boolean;
	/** Current summaries; empty when unsupported. */
	list(): readonly WireJobSummary[];
	output(jobId: string, since?: number): Promise<WireJobOutput>;
	stop(jobId: string): Promise<WireJobSummary>;
};
/** Capability-probed access to a chat's background jobs; an old gateway degrades instead of failing. */
export function jobsClient(chat: NekoChat): JobsClient {
	const supported = () => chat.view.value?.jobs !== undefined;
	const require = () => {
		if (!supported()) throw new Error(JOBS_UNSUPPORTED);
	};
	return {
		get supported() {
			return supported();
		},
		list: () => chat.view.value?.jobs ?? [],
		async output(jobId, since) {
			require();
			return chat.jobOutput({ jobId, ...(since === undefined ? {} : { since }) });
		},
		async stop(jobId) {
			require();
			return chat.jobStop({ jobId });
		},
	};
}
export type NekoGatewayConnection = {
	readonly application: NekoApplicationInfo;
	readonly host: Host;
	readonly link: Link;
	readonly directory: NekoSessionDirectory;
	readonly management: NekoSessionManagement;
	readonly models: NekoModels;
	readonly workspaces: NekoWorkspaces;
	readonly workspaceFiles: NekoWorkspaceFiles;
	readonly credentials: NekoCredentials;
	readonly searchSettings: NekoSearchSettings;
	readonly skillMarket: NekoSkillMarket;
	readonly attachment: NekoAttachment | undefined;
	ready(signal?: AbortSignal): Promise<void>;
	attach(id: string, ctx?: Ctx): Promise<NekoChat>;
	subagent(target: number | string): SubagentClient;
	detach(): Promise<void>;
	close(): Promise<void>;
};
export function createGatewayConnection(link: Link, serverId: string): NekoGatewayConnection {
	let protocolMismatch = false;
	const linkClosed = new AbortController();
	let closeReason = "";
	link.onClose((reason) => {
		closeReason = reason;
		linkClosed.abort(new Error(`Gateway connection closed: ${reason}`));
	});
	const host = createClientHost(link, {
		onProtocolMismatch: () => {
			protocolMismatch = true;
		},
	});
	const get = <C extends Parameters<Host["hold"]>[0]>(type: C) => host.hold(type, {} as never);
	const application = get(NekoApplicationInfo);
	const keep: (() => void)[] = [application.info.subscribe(() => {})];
	let business: ReturnType<typeof bindBusiness> | undefined;
	let protocolChecked = false;
	function bindBusiness() {
		const directory = get(NekoSessionDirectory),
			management = get(NekoSessionManagement),
			models = get(NekoModels),
			workspaces = get(NekoWorkspaces),
			workspaceFiles = get(NekoWorkspaceFiles),
			credentials = get(NekoCredentials),
			searchSettings = get(NekoSearchSettings),
			skillMarket = get(NekoSkillMarket);
		keep.push(
			directory.state.subscribe(() => {}),
			workspaces.state.subscribe(() => {}),
			credentials.state.subscribe(() => {}),
			searchSettings.state.subscribe(() => {}),
		);
		return { directory, management, models, workspaces, workspaceFiles, credentials, searchSettings, skillMarket };
	}
	const services = () => {
		if (!protocolChecked) throw new Error("Gateway protocol not checked");
		if (!business) business = bindBusiness();
		return business;
	};
	const checkReady = async (signal?: AbortSignal) => {
		await deadline(application.ready, signal);
		const info = application.info.value;
		// Identity is verified from the gateway's own state before any business service is bound.
		if (info.serverId !== serverId) throw new GatewayIdentityError();
		if (info.protocolVersion !== APPLICATION_PROTOCOL) throw new ApplicationProtocolError();
		protocolChecked = true;
		const { directory, management, models, workspaces, credentials, searchSettings, workspaceFiles, skillMarket } =
			services();
		await deadline(
			Promise.all([
				directory.ready,
				management.ready,
				models.ready,
				workspaces.ready,
				credentials.ready,
				searchSettings.ready,
				workspaceFiles.ready,
				skillMarket.ready,
			]),
			signal,
		);
	};
	let chat: NekoChat | undefined;
	let attachment: NekoAttachment | undefined;
	let stopView: (() => void) | undefined;
	let closed = false;
	let closing: Promise<void> | undefined;
	const connection: NekoGatewayConnection = {
		application,
		subagent(target) {
			if (!attachment) throw new Error("No active session");
			const input = { ...attachment, ...(typeof target === "string" ? { agentId: target } : { taskId: target }) };
			return subagentClient(() => host.hold(NekoSubagent, input));
		},
		host,
		link,
		get directory() {
			return services().directory;
		},
		get management() {
			return services().management;
		},
		get models() {
			return services().models;
		},
		get workspaces() {
			return services().workspaces;
		},
		get workspaceFiles() {
			return services().workspaceFiles;
		},
		get credentials() {
			return services().credentials;
		},
		get searchSettings() {
			return services().searchSettings;
		},
		get skillMarket() {
			return services().skillMarket;
		},
		get attachment() {
			return attachment;
		},
		async ready(signal) {
			try {
				await checkReady(signal ? AbortSignal.any([signal, linkClosed.signal]) : linkClosed.signal);
			} catch (error) {
				// Another Chord protocol version, or a peer (e.g. a Pi 1.2 gateway) whose handshake we cannot parse.
				if (protocolMismatch || closeReason.startsWith("protocol")) throw new ApplicationProtocolError();
				throw error;
			}
		},
		async attach(sessionId: string, ctx?: Ctx): Promise<NekoChat> {
			const next = await connection.management.attach(sessionId, ctx);
			if (chat?.status === "live" && chat.view.value !== undefined && attachment?.attachmentId === next.attachmentId)
				return chat;
			stopView?.();
			chat?.release();
			attachment = next;
			const current = host.hold(NekoChat, next);
			chat = current;
			stopView = current.view.subscribe(() => {});
			try {
				await deadline(current.ready, ctx?.signal);
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
			if (!closed) await connection.management.detach(null);
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

export { ApprovalQueue, type PendingApproval } from "./approval-queue.ts";
