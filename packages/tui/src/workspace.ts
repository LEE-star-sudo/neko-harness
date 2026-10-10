import type { NekoSessionSummary } from "@neko-harness/gateway";

export function workspaceSessions(sessions: readonly NekoSessionSummary[], cwd: string): NekoSessionSummary[] {
	return sessions
		.filter((s) => s.workspaceRoot === cwd)
		.sort((a, b) => b.lastUsedAt - a.lastUsedAt || Number(b.id) - Number(a.id));
}
