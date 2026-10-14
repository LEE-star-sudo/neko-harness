import type { JobLike } from "@neko-harness/core/job-summary";
import { formatDuration } from "@neko-harness/core/job-summary";

export const JOB_STATUS_LABELS: Record<JobLike["status"], string> = {
	running: "运行中",
	exited: "已退出",
	failed: "失败",
	stopped: "已停止",
	lost: "已丢失",
};

/** `运行中 · 1m 5s`, `失败 · 退出码 2`, `失败 · 超时`, `已丢失 · 网关重启`. */
export function jobStatusText(job: JobLike, now: number): string {
	const status = JOB_STATUS_LABELS[job.status];
	if (job.status === "running") return `${status} · ${formatDuration(now - job.startedAt)}`;
	if (job.reason === "timeout") return `${status} · 超时`;
	if (job.reason === "spawn-error") return `${status} · 无法启动`;
	if (job.exitCode !== null) return `${status} · 退出码 ${job.exitCode}`;
	if (job.reason === "restart") return `${status} · 网关重启`;
	return `${status} · ${formatDuration((job.endedAt ?? now) - job.startedAt)}`;
}

// CSI, OSC (BEL or ST terminated) and other two-character escapes.
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching terminal escape sequences is the point
const ESCAPES = /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007\u001b]*(?:\u0007|\u001b\\)|[@-Z\\-_])/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: dropping C0 controls other than \n and \t
const CONTROLS = /[\u0000-\u0008\u000b-\u001f\u007f]/g;

/** Job output as plain text: no colors or cursor codes, `\r` handled as a line break. */
export function sanitizeJobOutput(text: string): string {
	return text.replace(ESCAPES, "").replace(/\r\n?/g, "\n").replace(CONTROLS, "");
}

/** True when a scroll position counts as "at the bottom" and follow mode should stay on. */
export function atBottom(
	el: { scrollTop: number; scrollHeight: number; clientHeight: number },
	threshold = 24,
): boolean {
	return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
}
