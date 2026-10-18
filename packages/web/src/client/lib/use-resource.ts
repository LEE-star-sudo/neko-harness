import { useCallback, useEffect, useRef, useState } from "react";
import { errorText } from "./workspace.ts";

export type Resource<T> = {
	status: "loading" | "ready" | "error";
	/** Data of the current key; kept while a reload for the same key is in flight. */
	data: T | undefined;
	error: string | undefined;
	reload(): void;
};

type Slot<T> = { key: string; status: Resource<T>["status"]; data: T | undefined; error: string | undefined };

/**
 * Loads one keyed value while `enabled`. Every (re)load gets its own AbortController: a key change, a
 * `version` bump, `reload()` or `enabled` turning false aborts the previous request, and results of an
 * aborted request are dropped. Data of an older key is never shown for the current one.
 */
export function useResource<T>(
	key: string,
	enabled: boolean,
	load: (signal: AbortSignal) => Promise<T>,
	version: string | number = 0,
): Resource<T> {
	const [slot, setSlot] = useState<Slot<T>>({ key, status: "loading", data: undefined, error: undefined });
	const [nonce, setNonce] = useState(0);
	const loader = useRef(load);
	loader.current = load;
	// biome-ignore lint/correctness/useExhaustiveDependencies: `version` and `nonce` only re-trigger the load.
	useEffect(() => {
		if (!enabled) return;
		const controller = new AbortController();
		setSlot((previous) => ({
			key,
			status: "loading",
			data: previous.key === key ? previous.data : undefined,
			error: undefined,
		}));
		const settle = (next: (previous: Slot<T>) => Slot<T>) => {
			if (!controller.signal.aborted) setSlot(next);
		};
		Promise.resolve()
			.then(() => loader.current(controller.signal))
			.then(
				(data) => settle(() => ({ key, status: "ready", data, error: undefined })),
				(error: unknown) =>
					settle((previous) => ({
						key,
						status: "error",
						data: previous.key === key ? previous.data : undefined,
						error: errorText(error),
					})),
			);
		return () => controller.abort();
	}, [key, enabled, version, nonce]);
	const reload = useCallback(() => setNonce((value) => value + 1), []);
	const current = slot.key === key;
	return {
		status: current ? slot.status : "loading",
		data: current ? slot.data : undefined,
		error: current ? slot.error : undefined,
		reload,
	};
}
