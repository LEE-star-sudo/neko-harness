/** Browser-safe job list presentation shared by the TUI and Web panels: ordering, status text, durations. */

export type JobLike = {
	readonly jobId: string;
	readonly title: string;
	readonly command: string;
	readonly status: "running" | "exited" | "failed" | "stopped" | "lost";
	readonly startedAt: number;
	readonly endedAt: number | null;
	readonly exitCode: number | null;
	readonly reason?: string | undefined;
};

export type JobRow<T extends JobLike = JobLike> = {
	readonly job: T;
	/** Title, or the first non-empty line of the command when the title is blank. */
	readonly label: string;
	readonly running: boolean;
	/** `running`, `exited`, `failed`, `stopped` or `lost`. */
	readonly statusText: string;
	/** Elapsed time for a running job, otherwise the exit code or reason. */
	readonly meta: string;
	readonly durationMs: number;
};

export type JobsSummary<T extends JobLike = JobLike> = {
	/** Newest started first. */
	readonly rows: readonly JobRow<T>[];
	readonly running: number;
};

export function formatDuration(ms: number): string {
	const total = Math.max(0, Math.floor(ms / 1000));
	if (total < 60) return `${total}s`;
	const minutes = Math.floor(total / 60);
	if (total < 3600) return `${minutes}m ${total % 60}s`;
	const hours = Math.floor(total / 3600);
	if (total < 86400) return `${hours}h ${minutes % 60}m`;
	return `${Math.floor(total / 86400)}d ${hours % 24}h`;
}

const firstLine = (text: string): string =>
	text
		.split("\n")
		.map((line) => line.trim())
		.find(Boolean) ?? "";

export function jobLabel(job: Pick<JobLike, "title" | "command">): string {
	return job.title.trim() || firstLine(job.command) || "(empty command)";
}

export function jobMeta(job: JobLike, now: number): string {
	if (job.status === "running") return formatDuration(now - job.startedAt);
	if (job.reason === "timeout") return "timeout";
	if (job.exitCode !== null) return `exit ${job.exitCode}`;
	if (job.reason === "restart") return "restart";
	return formatDuration((job.endedAt ?? now) - job.startedAt);
}

const jobNumber = (jobId: string): number => Number.parseInt(jobId.replace(/^\D+/, ""), 10) || 0;

export function summarizeJobs<T extends JobLike>(jobs: readonly T[], now: number): JobsSummary<T> {
	const rows = [...jobs]
		.sort((a, b) => b.startedAt - a.startedAt || jobNumber(b.jobId) - jobNumber(a.jobId))
		.map((job): JobRow<T> => {
			const running = job.status === "running";
			return {
				job,
				label: jobLabel(job),
				running,
				statusText: job.status,
				meta: jobMeta(job, now),
				durationMs: Math.max(0, (job.endedAt ?? now) - job.startedAt),
			};
		});
	return { rows, running: rows.filter((row) => row.running).length };
}

export type JobReportParts = {
	/** `[Background job j1 "title" failed, exit code 1]` */
	readonly head: string;
	readonly command: string | undefined;
	/** The output tail; undefined when the job produced none. */
	readonly output: string | undefined;
};

/** Split the report text posted to the session so views can fold the output tail. */
export function splitJobReport(text: string): JobReportParts {
	const lines = text.split("\n");
	const head = lines[0] ?? "";
	const command = lines[1]?.startsWith("Command: ") ? lines[1].slice("Command: ".length) : undefined;
	const at = lines.findIndex((line, i) => i > 0 && line.startsWith("Last output ("));
	const output = at < 0 ? undefined : lines.slice(at + 1).join("\n");
	return { head, command, output: output === "" ? undefined : output };
}

export type JobTailRead = {
	readonly text: string;
	/** Pass back as `since` to continue reading. */
	readonly offset: number;
	readonly truncated: boolean;
	readonly dropped: number;
};

const TAIL_KEEP_CHARS = 256 * 1024;

/** Client-side view of one job's output: resumes by offset, counts dropped bytes, bounds memory. */
export class JobTail {
	#text = "";
	#dropped = 0;
	#offset: number | undefined;
	readonly #keep: number;
	constructor(keepChars = TAIL_KEEP_CHARS) {
		this.#keep = keepChars;
	}
	get text(): string {
		return this.#text;
	}
	/** Bytes of earlier output that are no longer visible (server cap or local cap). */
	get dropped(): number {
		return this.#dropped;
	}
	/** Offset for the next read; undefined before the first one. */
	get offset(): number | undefined {
		return this.#offset;
	}
	apply(read: JobTailRead, transform: (text: string) => string = (text) => text): void {
		if (this.#offset === undefined) this.#dropped = read.dropped;
		else if (read.truncated) this.#dropped += read.dropped;
		this.#offset = read.offset;
		this.#text += transform(read.text);
		if (this.#text.length > this.#keep) {
			const cut = this.#text.length - this.#keep;
			this.#text = this.#text.slice(cut);
			this.#dropped += cut;
		}
	}
}
