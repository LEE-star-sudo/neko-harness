#!/usr/bin/env bun
// neko 网关独立入口（供后续 `neko serve` 接入）：
//   bun --conditions=neko-source packages/gateway/src/main.ts [选项]
// 选项优先级：CLI flag > neko.config.json（向上查找，兜底 ~/.neko/） > 内置默认。
import { GATEWAY_USAGE, parseGatewayArgs } from "./cli-args.ts";
import { startGateway } from "./gateway.ts";

const argv = process.argv.slice(2);
if (argv.includes("-h") || argv.includes("--help")) {
	console.log(GATEWAY_USAGE);
	process.exit(0);
}
const options = parseGatewayArgs(argv);
const gateway = await startGateway({
	...options,
	onError: (error) => console.error("gateway error:", error.message),
});
console.log(`neko gateway 已启动（serverId: ${gateway.serverId}）`);
if (gateway.socketPath !== undefined) console.log(`  Unix socket: ${gateway.socketPath}`);
if (gateway.wsUrl !== undefined) console.log(`  WebSocket:   ${gateway.wsUrl}`);
console.log("Ctrl-C 停止。");

let stopping = false;
const stop = (): void => {
	if (stopping) return;
	stopping = true;
	gateway
		.close()
		.then(() => process.exit(0))
		.catch((error: unknown) => {
			console.error("关闭失败:", error instanceof Error ? error.message : String(error));
			process.exit(1);
		});
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
