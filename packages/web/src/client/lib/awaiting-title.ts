import { useEffect } from "react";
import { awaitingTitle } from "./interactions.ts";

/**
 * While the tab is hidden and the session waits for an answer, prefix the page title; restore it once the
 * question settles or the tab is visible again. Passive only: no sound and no Notification permission.
 */
export function useAwaitingTitle(pending: number): void {
	useEffect(() => {
		let applied: { base: string; title: string } | null = null;
		const sync = () => {
			const current = document.title;
			// A title that changed in the meantime is not ours to overwrite or restore.
			const base = applied !== null && current === applied.title ? applied.base : current;
			if (!(document.hidden && pending > 0)) {
				if (applied !== null && current === applied.title) document.title = base;
				applied = null;
				return;
			}
			const title = awaitingTitle(base, pending);
			document.title = title;
			applied = { base, title };
		};
		sync();
		document.addEventListener("visibilitychange", sync);
		return () => {
			document.removeEventListener("visibilitychange", sync);
			if (applied !== null && document.title === applied.title) document.title = applied.base;
		};
	}, [pending]);
}
