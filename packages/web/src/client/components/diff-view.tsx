import DOMPurify from "dompurify";
import { useMemo } from "react";
import { languageFromPath, renderDiffRows } from "../lib/diff-highlight.ts";

/**
 * Display diff as two-layer coloured rows (syntax tokens + add/remove background). `format` follows the tool:
 * edit diffs carry upstream line numbers, write diffs are plain "+ " additions.
 */
export function DiffView(props: {
	diff: string;
	/** Target file path, used to pick the syntax language. */
	path: string | null;
	format: "edit" | "write";
	className?: string;
}) {
	const rows = useMemo(
		() =>
			renderDiffRows(props.diff, languageFromPath(props.path), props.format).rows.map((row) => ({
				...row,
				// Same DOMPurify pass as the Markdown component (hljs output is escaped already; defence in depth).
				html: DOMPurify.sanitize(row.html, { USE_PROFILES: { html: true } }),
			})),
		[props.diff, props.path, props.format],
	);
	return (
		<div className={props.className}>
			{rows.map((row, index) => (
				<div
					// biome-ignore lint/suspicious/noArrayIndexKey: rows derive from the memoised diff, so their order is fixed and they have no id.
					key={index}
					className={`whitespace-pre ${
						row.kind === "added" ? "diff-line-add" : row.kind === "removed" ? "diff-line-del" : ""
					}`}
				>
					<span className="diff-gutter">{row.gutter}</span>
					{/* biome-ignore lint/security/noDangerouslySetInnerHtml: row HTML went through DOMPurify.sanitize above. */}
					<span dangerouslySetInnerHTML={{ __html: row.html }} />
				</div>
			))}
		</div>
	);
}
