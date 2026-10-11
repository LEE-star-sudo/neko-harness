import type { ChatImage } from "@neko-harness/core";
import { useEffect, useRef, useState } from "react";
import { appActions } from "../lib/bootstrap";
import { useNekoState } from "../lib/store";
import { Modal } from "./primitives";

function HistoryImage({ image }: { image: ChatImage }) {
	const { currentSessionId, phase } = useNekoState();
	const [url, setUrl] = useState("");
	const [error, setError] = useState("");
	const [open, setOpen] = useState(false);
	const [retry, setRetry] = useState(0);
	const ref = useRef<HTMLDivElement>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: retry intentionally starts a fresh image request.
	useEffect(() => {
		if (!currentSessionId) return;
		setUrl("");
		let disposed = false;
		let resource = "";
		let started = false;
		const observer = new IntersectionObserver((entries) => {
			if (started || !entries.some((e) => e.isIntersecting) || phase !== "ready") return;
			started = true;
			void appActions
				.image(image.entryId, image.contentIndex, currentSessionId)
				.then((file) => {
					if (disposed) return;
					resource = URL.createObjectURL(new Blob([file.bytes as Uint8Array<ArrayBuffer>], { type: file.mimeType }));
					setUrl(resource);
					setError("");
				})
				.catch(() => {
					if (!disposed) setError("图片加载失败，点击重试");
				});
		});
		if (ref.current) observer.observe(ref.current);
		return () => {
			disposed = true;
			observer.disconnect();
			if (resource) URL.revokeObjectURL(resource);
		};
	}, [currentSessionId, phase, image.entryId, image.contentIndex, retry]);
	return (
		<div ref={ref} className="max-w-full">
			<button
				type="button"
				aria-label={`查看图片 ${image.name}`}
				className="focus-neko max-w-full rounded-xl border border-sakura-200 p-1"
				onClick={() => {
					if (error) {
						setError("");
						setRetry(retry + 1);
					} else if (url) setOpen(true);
				}}
			>
				{url ? (
					<img src={url} alt={image.name} className="max-h-40 max-w-full rounded-lg object-contain" />
				) : (
					<span className="text-sm">{error || "加载图片…"}</span>
				)}
			</button>
			{open && url && (
				<Modal title={image.name} onClose={() => setOpen(false)}>
					<div className="min-h-0 overflow-auto bg-surface p-3 sm:p-4">
						<img src={url} alt={image.name} className="max-h-[65dvh] w-full rounded-lg object-contain" />
					</div>
					<div className="flex shrink-0 justify-end border-t border-sakura-200 bg-surface px-4 py-3">
						<a
							href={url}
							download={image.name}
							className="btn-primary focus-neko inline-flex min-h-10 items-center gap-2 rounded-full px-5 py-2 text-sm font-medium no-underline"
						>
							<svg
								aria-hidden="true"
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="1.8"
							>
								<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4" />
							</svg>
							保存图片
						</a>
					</div>
				</Modal>
			)}
		</div>
	);
}
export function ImageGallery({ images }: { images: readonly ChatImage[] }) {
	return (
		<div className="my-2 flex flex-wrap gap-2">
			{images.map((image) => (
				<HistoryImage key={`${image.entryId}:${image.contentIndex}`} image={image} />
			))}
		</div>
	);
}
