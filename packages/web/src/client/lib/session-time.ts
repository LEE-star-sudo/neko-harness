import { useSyncExternalStore } from "react";

let now = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
const tick = () => {
	now = Date.now();
	for (const listener of listeners) listener();
};
const subscribe = (listener: () => void) => {
	listeners.add(listener);
	if (listeners.size === 1) {
		tick();
		timer = setInterval(tick, 60_000);
		window.addEventListener("focus", tick);
	}
	return () => {
		listeners.delete(listener);
		if (!listeners.size) {
			clearInterval(timer);
			window.removeEventListener("focus", tick);
		}
	};
};
export const useSessionTime = () => useSyncExternalStore(subscribe, () => now);
