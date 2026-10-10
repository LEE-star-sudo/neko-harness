import { byMessage, byVisited, messageTime, relativeTime, sessionName } from "@neko-harness/core/session-display";
import type { NekoSessionSummary } from "@neko-harness/gateway";

export function workspaceSessions(sessions: readonly NekoSessionSummary[], cwd: string): NekoSessionSummary[] {
	return sessions.filter((s) => s.workspaceRoot === cwd).sort(byMessage);
}

export function recentlyVisited(sessions: readonly NekoSessionSummary[], cwd: string): NekoSessionSummary[] {
	return workspaceSessions(sessions, cwd).sort(byVisited);
}

export function sessionPickerItems(
	sessions: readonly NekoSessionSummary[],
	cwd: string,
	current: string,
	now = Date.now(),
) {
	return workspaceSessions(sessions, cwd).map((s) => ({
		value: s.id,
		label: `${s.id === current ? "* " : ""}${sessionName(s)}`,
		rightLabel: relativeTime(messageTime(s), now),
		searchText: `${s.firstPromptPreview} ${s.id}`,
		description: `${s.model ? `${s.model.provider}/${s.model.modelId}` : "No model"} | ${s.status === "running" ? "Running" : s.status === "error" ? "Error" : "Idle"}${s.id === current ? " | Current" : ""}\n${new Date(messageTime(s)).toLocaleString("en-GB")}`,
	}));
}
