/** Diagnostics contain paths and reasons only, never instruction bodies or YAML excerpts. */
export type PromptDiagnostic = { path: string; message: string };
export type ReportPromptDiagnostic = (diagnostic: PromptDiagnostic) => void;

export const ignorePromptDiagnostic: ReportPromptDiagnostic = () => {};
export const warnPromptDiagnostic: ReportPromptDiagnostic = ({ path, message }) => {
	console.warn(`[neko-prompt] ${JSON.stringify(path)}: ${message}`);
};
export const isMissing = (error: unknown): boolean =>
	typeof error === "object" &&
	error !== null &&
	"code" in error &&
	(error.code === "ENOENT" || error.code === "ENOTDIR");
