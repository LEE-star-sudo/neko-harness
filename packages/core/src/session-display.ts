export type SessionDisplay = {
	id: string;
	title: string;
	firstPromptPreview: string;
	createdAt: number;
	lastMessageAt: number | null;
	lastUsedAt: number;
	workspaceRoot: string;
};
export const sessionName = (session: Pick<SessionDisplay, "title" | "firstPromptPreview">, empty = "New session") =>
	session.title || session.firstPromptPreview || empty;
export const messageTime = (session: Pick<SessionDisplay, "lastMessageAt" | "createdAt">) =>
	session.lastMessageAt ?? session.createdAt;
export const byMessage = (a: SessionDisplay, b: SessionDisplay) =>
	messageTime(b) - messageTime(a) || Number(b.id) - Number(a.id);
export const byVisited = (a: SessionDisplay, b: SessionDisplay) =>
	b.lastUsedAt - a.lastUsedAt || Number(b.id) - Number(a.id);
export const matchesSession = (session: SessionDisplay, query: string) =>
	`${session.title} ${session.firstPromptPreview} ${session.id}`
		.toLocaleLowerCase()
		.includes(query.trim().toLocaleLowerCase());
export function relativeTime(at: number, now: number, language: "zh" | "en" = "en"): string {
	const minutes = Math.floor(Math.max(0, now - at) / 60_000);
	if (minutes < 1) return language === "zh" ? "刚刚" : "now";
	const hours = Math.floor(minutes / 60),
		days = Math.floor(hours / 24);
	if (days >= 30) return new Date(at).toLocaleDateString(language === "zh" ? "zh-CN" : "en-GB");
	const value = days || hours || minutes;
	const unit = days ? ["天", "d"] : hours ? ["小时", "h"] : ["分钟", "m"];
	return language === "zh" ? `${value} ${unit[0]}前` : `${value}${unit[1]}`;
}
