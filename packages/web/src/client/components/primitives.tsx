import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MOBILE_QUERY } from "../lib/layout";

export function Icon({
	name,
	size = 18,
	className,
}: {
	name:
		| "folder"
		| "plus"
		| "chevron"
		| "panel"
		| "search"
		| "more"
		| "chat"
		| "close"
		| "settings"
		| "archive"
		| "up"
		| "bolt"
		| "check"
		| "clock"
		| "spinner";
	size?: number;
	className?: string;
}) {
	const paths = {
		folder: "M3 6h6l2 2h10v11H3z",
		plus: "M12 5v14M5 12h14",
		chevron: "m8 10 4 4 4-4",
		panel: "M3 4h18v16H3zM9 4v16",
		search: "M20 20l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
		more: "M5 12h.01M12 12h.01M19 12h.01",
		chat: "M4 4h16v12H9l-5 4z",
		close: "m6 6 12 12M6 18 18 6",
		settings:
			"M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0",
		archive: "M3 4h18v4H3zM5 8v12h14V8M10 12h4",
		up: "m5 12 7-7 7 7M12 5v14",
		bolt: "M13 2 4 14h6l-1 8 9-12h-6l1-8z",
		check: "M5 12.5l4.5 4.5L19 7.5",
		clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2",
		spinner: "M21 12a9 9 0 1 1-9-9",
	};
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={name === "more" ? 3 : 1.6}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			className={className}
		>
			<path d={paths[name]} />
		</svg>
	);
}
export function useMobile(): boolean {
	const [mobile, setMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
	useEffect(() => {
		const query = window.matchMedia(MOBILE_QUERY);
		const update = () => setMobile(query.matches);
		query.addEventListener("change", update);
		return () => query.removeEventListener("change", update);
	}, []);
	return mobile;
}
let modalCount = 0;
let bodyOverflow = "";

export function Modal(props: {
	title: string;
	children: ReactNode;
	onClose: () => void;
	locked?: boolean;
	drawer?: boolean;
}) {
	const ref = useRef<HTMLDialogElement>(null);
	const id = useId();
	useEffect(() => {
		const previous = document.activeElement as HTMLElement | null;
		const dialog = ref.current!;
		if (modalCount === 0) bodyOverflow = document.body.style.overflow;
		modalCount += 1;
		document.body.style.overflow = "hidden";
		dialog.showModal();
		return () => {
			dialog.close();
			modalCount -= 1;
			if (modalCount === 0) document.body.style.overflow = bodyOverflow;
			if (previous?.isConnected) previous.focus();
		};
	}, []);
	return createPortal(
		<dialog
			ref={ref}
			className={`chrome dialog ${props.drawer ? "drawer" : ""}`}
			aria-labelledby={id}
			onCancel={(e) => {
				e.preventDefault();
				if (!props.locked) props.onClose();
			}}
			onKeyDown={(e) => {
				if (e.key !== "Tab") return;
				const items = [
					...e.currentTarget.querySelectorAll<HTMLElement>(
						"button:not(:disabled), input:not(:disabled), a[href], [tabindex='0']",
					),
				].filter((item) => item.getClientRects().length > 0);
				const first = items[0];
				const last = items.at(-1);
				if (e.shiftKey && document.activeElement === first) {
					e.preventDefault();
					last?.focus();
				} else if (!e.shiftKey && document.activeElement === last) {
					e.preventDefault();
					first?.focus();
				}
			}}
		>
			<div className="dialog-heading">
				<h2 id={id}>{props.title}</h2>
				<button
					type="button"
					className="icon-btn"
					aria-label="关闭"
					title="关闭"
					disabled={props.locked}
					onClick={props.onClose}
				>
					<Icon name="close" />
				</button>
			</div>
			{props.children}
		</dialog>,
		document.body,
	);
}
export function Popover(props: { anchor: HTMLElement; label: string; onClose: () => void; children: ReactNode }) {
	const ref = useRef<HTMLDivElement>(null);
	const close = useRef(props.onClose);
	close.current = props.onClose;
	const [position, setPosition] = useState({ left: 8, top: 8 });
	useLayoutEffect(() => {
		const panel = ref.current!;
		const place = () => {
			const rect = props.anchor.getBoundingClientRect();
			const top =
				rect.bottom + 4 + panel.offsetHeight > window.innerHeight
					? Math.max(8, rect.top - panel.offsetHeight - 4)
					: rect.bottom + 4;
			setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - panel.offsetWidth - 8)), top });
		};
		place();
		panel.querySelector<HTMLElement>("button:not(:disabled), input, a")?.focus();
		const outside = (e: PointerEvent) => {
			if (!panel.contains(e.target as Node) && !props.anchor.contains(e.target as Node)) close.current();
		};
		document.addEventListener("pointerdown", outside);
		window.addEventListener("resize", place);
		return () => {
			document.removeEventListener("pointerdown", outside);
			window.removeEventListener("resize", place);
			if (props.anchor.isConnected) props.anchor.focus();
		};
	}, [props.anchor]);
	return createPortal(
		<div
			ref={ref}
			className="chrome popover"
			role="dialog"
			aria-label={props.label}
			style={position}
			onKeyDown={(e) => {
				if (e.key === "Escape") {
					e.preventDefault();
					e.stopPropagation();
					props.onClose();
				}
				if (e.key === "Tab") {
					props.onClose();
					return;
				}
				if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
				e.preventDefault();
				const items = [...e.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), a")];
				const index = items.indexOf(document.activeElement as HTMLElement);
				items[(index + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
			}}
		>
			{props.children}
		</div>,
		props.anchor.closest("dialog") ?? document.body,
	);
}
export const folderName = (path: string) => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
