import type { ExportFormat } from "@neko-harness/core/conversation-export";
import { sessionName } from "@neko-harness/core/session-display";
import { useRef, useState } from "react";
import { appActions } from "../lib/bootstrap";
import { buildSessionExport, downloadFile, ExportCancelledError, exportNotice } from "../lib/session-export";
import { getState, storeActions, useNekoState } from "../lib/store";
import { Icon, Popover } from "./primitives";

const FORMATS: readonly { format: ExportFormat; label: string }[] = [
	{ format: "markdown", label: "Markdown (.md)" },
	{ format: "html", label: "HTML (.html)" },
	{ format: "json", label: "JSON (.json)" },
];

export function ExportMenu() {
	const { view, currentSessionId, sessions } = useNekoState();
	const [anchor, setAnchor] = useState<HTMLElement | null>(null);
	const [includeThinking, setIncludeThinking] = useState(false);
	const [busy, setBusy] = useState(false);
	const busyRef = useRef(false);
	const empty = view === null || currentSessionId === null || view.items.length === 0;
	const title = busy ? "导出中…" : empty ? "当前会话还没有内容可导出" : "导出会话";

	const run = async (format: ExportFormat): Promise<void> => {
		if (busyRef.current || view === null || currentSessionId === null) return;
		busyRef.current = true;
		setBusy(true);
		setAnchor(null);
		const current = sessions.find((session) => session.id === currentSessionId);
		try {
			const result = await buildSessionExport({
				format,
				includeThinking,
				snapshot: {
					sessionId: currentSessionId,
					title: current ? sessionName(current, "新会话") : "新会话",
					model: view.model,
					cwd: view.cwd,
					items: view.items,
				},
				currentSessionId: () => getState().currentSessionId,
				readImage: (image, sessionId) => appActions.image(image.entryId, image.contentIndex, sessionId),
			});
			downloadFile(result.fileName, result.content, result.mimeType);
			storeActions.notice({ level: "info", text: exportNotice(result) });
		} catch (error) {
			storeActions.notice({
				level: "error",
				text:
					error instanceof ExportCancelledError
						? error.message
						: `导出失败：${error instanceof Error ? error.message : String(error)}`,
			});
		} finally {
			busyRef.current = false;
			setBusy(false);
		}
	};

	return (
		<>
			<button
				type="button"
				className="icon-btn export-btn"
				aria-label="导出会话"
				aria-haspopup="dialog"
				aria-expanded={anchor !== null}
				aria-disabled={busy || undefined}
				disabled={empty && !busy}
				title={title}
				onClick={(event) => {
					if (busy) return;
					setAnchor(anchor === null ? event.currentTarget : null);
				}}
			>
				<Icon name="download" />
				<span className="export-label">{busy ? "导出中…" : "导出"}</span>
			</button>
			{anchor && (
				<Popover anchor={anchor} label="导出会话" onClose={() => setAnchor(null)}>
					<div className="section-label">导出格式</div>
					{FORMATS.map(({ format, label }) => (
						<button type="button" key={format} className="chrome-row" onClick={() => void run(format)}>
							<Icon name="download" />
							{label}
						</button>
					))}
					<button
						type="button"
						role="switch"
						aria-checked={includeThinking}
						className="chrome-row export-option"
						onClick={() => setIncludeThinking(!includeThinking)}
					>
						<span className="export-check" aria-hidden="true">
							{includeThinking ? "✓" : ""}
						</span>
						包含思考过程
					</button>
				</Popover>
			)}
		</>
	);
}
