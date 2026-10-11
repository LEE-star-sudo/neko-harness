import type { ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Match this package's source/compiled entry without relying on a development loader. */
export function gatewayCommand(args: readonly string[]): { binary: string; args: string[] } {
	const source = import.meta.url.endsWith(".ts");
	return {
		binary: process.execPath,
		args: [
			...(source ? ["--conditions=neko-source"] : []),
			fileURLToPath(
				new URL(
					process.env.NEKO_RELEASE_BUILD === "1" ? "./gateway.js" : source ? "./main.ts" : "./main.js",
					import.meta.url,
				),
			),
			...args,
		],
	};
}

/** Wait for an owned child to exit, escalating only if graceful shutdown stalls. */
export async function stopGatewayProcess(child: ChildProcess): Promise<void> {
	if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
	await new Promise<void>((resolve) => {
		const timer = setTimeout(() => child.kill("SIGKILL"), 3_000);
		child.once("exit", () => {
			clearTimeout(timer);
			resolve();
		});
		child.kill("SIGTERM");
	});
}
