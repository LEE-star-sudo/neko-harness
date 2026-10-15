#!/usr/bin/env bun
// neko 网关独立入口（供后续 `neko serve` 接入）：
//   bun --conditions=neko-source packages/gateway/src/main.ts [选项]
// 选项优先级：CLI flag > neko.config.json（向上查找，兜底 ~/.neko/） > 内置默认。
import { GATEWAY_USAGE, parseGatewayArgs } from "./cli-args.ts";
import { startGateway } from "./gateway.ts";
import { installShutdown } from "./shutdown.ts";

const argv = process.argv.slice(2);
if (argv.includes("-h") || argv.includes("--help")) {
	console.log(GATEWAY_USAGE);
	process.exit(0);
}
const shutdown = installShutdown({
	log: (message) => console.log(message),
	exit: (code) => process.exit(code),
});
const options = parseGatewayArgs(argv);
const gateway = await startGateway({
	...options,
	onError: (error) => console.error("gateway error:", error.message),
});
console.log(`neko gateway 已启动（serverId: ${gateway.serverId}）`);
if (gateway.socketPath !== undefined) console.log(`  Unix socket: ${gateway.socketPath}`);
if (gateway.wsUrl !== undefined) console.log(`  WebSocket:   ${gateway.wsUrl}`);
console.log("按 Ctrl+C 停止。");

shutdown.setCleanup(() => gateway.close());
