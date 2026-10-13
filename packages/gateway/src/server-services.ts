import { randomUUID } from "node:crypto";
import {
	ChordError,
	type Context,
	cell,
	type Host,
	hostPrincipal,
	listener,
	local,
	method,
} from "@earendil-works/chord";
import type { ConversationId } from "@earendil-works/pi-durable";
import { CREDENTIAL_PROVIDERS, type NekoRuntime } from "@neko-harness/core";
import { Type } from "typebox";
import {
	CredentialStateSchema,
	DirectoryStateSchema,
	type NekoCredentialState,
	NekoCredentials,
	type NekoMarketSkill,
	NekoModels,
	NekoSessionDirectory,
	NekoSessionManagement,
	type NekoSessionSummary,
	NekoSkillMarket,
	NekoWorkspaceFiles,
	NekoWorkspaces,
	WorkspaceStateSchema,
} from "./contract.ts";
import { Owner, serveSessions } from "./session-host.ts";
import { activeLevelOf, createSkillMarketClient, SkillMarketError } from "./skill-market.ts";
import { browseWorkspaces } from "./workspaces.ts";

const ServerState = local("neko.server-state", {
	version: 1,
	input: Type.Object({}),
	members: {
		directory: DirectoryStateSchema,
		workspaces: WorkspaceStateSchema,
		credentials: CredentialStateSchema,
		refreshCredentials: method(Type.Null(), Type.Null()),
	},
});
export async function createNekoServerServices(options: {
	host: Host;
	runtime: NekoRuntime;
	context: Context;
	marketUrl: string;
	promptHome?: string;
}) {
	const { runtime, context, host } = options;
	const market = createSkillMarketClient({
		marketUrl: options.marketUrl,
		...(options.promptHome !== undefined ? { home: options.promptHome } : {}),
	});
	// Chord 的 reason 保留业务原因，前端无需解析格式化后的 message。
	const toRemote = (error: unknown): never => {
		if (error instanceof SkillMarketError) {
			const code = error.code === "skill_not_found" || error.code === "skill_not_installed" ? "gone" : "invalid";
			throw new ChordError(code, error.message, { reason: error.code });
		}
		throw error;
	};
	const withInstallState = async (
		skill: {
			name: string;
			description: string;
			category: string;
			source: string;
			license: string;
			version: string;
			sha256: string;
			sizeBytes: number;
			uploadedAt: string;
		},
		workspaceRoot: string | undefined,
	): Promise<NekoMarketSkill> => {
		const locals = await runtime.listSkillsByLevel(workspaceRoot);
		const installed = {
			project: locals.some((s) => s.name === skill.name && s.level === "project"),
			user: locals.some((s) => s.name === skill.name && s.level === "user"),
			builtin: locals.some((s) => s.name === skill.name && s.level === "builtin"),
		};
		return { ...skill, installed, activeLevel: activeLevelOf(installed) };
	};
	const list = async (): Promise<NekoSessionSummary[]> =>
		(await runtime.listConversations()).map((info) => ({
			id: String(info.id),
			workspaceRoot: info.workspaceRoot,
			lastUsedAt: info.lastUsedAt,
			title: info.title,
			firstPromptPreview: info.firstPromptPreview,
			createdAt: info.createdAt,
			lastMessageAt: info.lastMessageAt,
			model: info.model,
			status: info.status,
		}));

	const readStatuses = async (): Promise<NekoCredentialState["statuses"]> =>
		Object.fromEntries(
			await Promise.all(CREDENTIAL_PROVIDERS.map(async (spec) => [spec.id, await runtime.credentialStatus(spec.id)])),
		) as NekoCredentialState["statuses"];
	const [sessions, workspaces, statuses] = await Promise.all([list(), runtime.listWorkspaces(), readStatuses()]);
	let mutationTail = Promise.resolve();
	const serialize = <T>(fn: () => Promise<T>): Promise<T> => {
		const result = mutationTail.catch(() => {}).then(fn);
		mutationTail = result.then(
			() => {},
			() => {},
		);
		return result;
	};
	host.serve(
		ServerState,
		(_input, _principal, self) => {
			const state = self.state({
				directory: cell(DirectoryStateSchema, { revision: 1, sessions }),
				workspaces: cell(WorkspaceStateSchema, { revision: 1, workspaces }),
				credentials: cell(CredentialStateSchema, { revision: 1, statuses }),
			});
			self.listen({
				directory: listener(
					{ subscribe: runtime.harness.subscribeCommits.bind(runtime.harness) },
					async (event, ctx) => {
						if (
							!event.changes.some(
								(change) =>
									change.type === "conversation" ||
									(change.type === "document" &&
										[
											"app.neko.session-metadata",
											"app.neko.activity",
											"app.neko.conversation",
											"app.neko.workspaces",
											"pi.agent",
										].includes(change.record.kind)),
							)
						)
							return;
						await serialize(async () => {
							const [items, roots] = await Promise.all([list(), runtime.listWorkspaces()]);
							state.directory.replace(ctx, { revision: state.directory.value.revision + 1, sessions: items });
							state.workspaces.replace(ctx, { revision: state.workspaces.value.revision + 1, workspaces: roots });
						});
					},
				),
			});
			return {
				...state,
				async refreshCredentials(_input: null, ctx: import("@earendil-works/chord").Ctx) {
					state.credentials.replace(ctx, {
						revision: state.credentials.value.revision + 1,
						statuses: await readStatuses(),
					});
					return null;
				},
			};
		},
		{ eager: { input: {} } },
	);
	const shared = (self: import("@earendil-works/chord").Self) =>
		self.get(ServerState, {}, { principal: hostPrincipal });
	host.serve(NekoSessionDirectory, (_input, _principal, self) => ({ kind: "ready", state: shared(self).directory }));
	host.serve(NekoWorkspaces, (_input, _principal, self) => ({
		kind: "ready",
		state: shared(self).workspaces,
		browse: (input) => browseWorkspaces(input),
		add: (input) => serialize(() => runtime.addWorkspace(input.path)),
	}));
	host.serve(NekoCredentials, (_input, _principal, self) => {
		const hub = shared(self);
		return {
			kind: "ready",
			state: hub.credentials,
			save: async (input, ctx) => {
				await runtime.saveCredential(input.provider, input.key);
				return hub.refreshCredentials(null, ctx);
			},
			remove: async (input, ctx) => {
				await runtime.removeCredential(input.provider);
				return hub.refreshCredentials(null, ctx);
			},
		};
	});
	host.serve(NekoModels, () => ({
		kind: "ready",
		list: async () =>
			[...runtime.listModels()].map((value) => ({
				...value,
				input: [...value.input],
				supportedThinkingLevels: [...value.supportedThinkingLevels],
			})),
	}));
	host.serve(NekoWorkspaceFiles, () => ({
		kind: "ready",
		search: async (input, ctx) => {
			const roots = await runtime.listWorkspaces();
			if (!roots.some((root) => root.path === input.workspaceRoot))
				throw new ChordError("invalid", "Unknown workspace.");
			return runtime.workspaceFiles.search(input.workspaceRoot, input.query, ctx.signal);
		},
	}));
	serveSessions(host, runtime, context);
	host.serve(NekoSessionManagement, (_input, principal, self) => {
		const owner = self.get(Owner, {}, { principal });
		const summary = async (id: ConversationId) => {
			const found = (await list()).find((item) => item.id === String(id));
			if (!found) throw new ChordError("gone", "Session unavailable");
			return found;
		};
		return {
			kind: "ready",
			create: (input) => serialize(async () => summary((await runtime.createConversation(input)).id)),
			fork: (id) => serialize(async () => summary((await runtime.forkConversation(toConversationId(id))).id)),
			archive: async (id) => {
				await runtime.archiveConversation(toConversationId(id));
				return null;
			},
			attach: (id) =>
				serialize(async () => {
					if (!(await runtime.getConversation(toConversationId(id))))
						throw new ChordError("gone", `Unknown session: ${id}`);
					if (owner.owner!.active?.sessionId !== id) {
						owner.owner!.active = { sessionId: id, attachmentId: randomUUID() };
						await runtime.touchConversation(toConversationId(id));
					}
					return owner.owner!.active!;
				}),
			detach: async () => {
				owner.owner!.active = null;
				return null;
			},
		};
	});
	host.serve(NekoSkillMarket, () => ({
		kind: "ready",
		list: (input) =>
			market
				.list(input.query)
				.then((skills) => Promise.all(skills.map((skill) => withInstallState(skill, input.workspaceRoot))))
				.catch(toRemote),
		detail: (input) =>
			market
				.detail(input.name)
				.then((skill) => withInstallState(skill, input.workspaceRoot))
				.catch(toRemote),
		preview: (input) =>
			market
				.preview(input.name)
				.then((value) => ({ ...value, files: [...value.files] }))
				.catch(toRemote),
		install: (input) =>
			serialize(() =>
				market
					.install(input)
					.then((result) => ({ ...result }))
					.catch(toRemote),
			),
		uninstall: (input) =>
			serialize(async () => {
				await market.uninstall(input).catch(toRemote);
				return null;
			}),
	}));
	await host.ready();
	return {
		async dispose() {
			await mutationTail;
		},
	};
}
export function toConversationId(sessionId: string): ConversationId {
	const numeric = Number(sessionId);
	if (!Number.isSafeInteger(numeric) || numeric < 1 || String(numeric) !== sessionId)
		throw new ChordError("invalid", `Invalid neko session id: ${sessionId}`);
	return numeric as ConversationId;
}
