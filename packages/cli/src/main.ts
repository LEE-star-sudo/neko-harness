#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = `用法: neko <command> [options]

命令:
  tui     启动终端交互界面
  web     启动 Web 服务器（托管 Web UI + WebSocket）

两个命令的选项透传，详见 neko tui --help / neko web --help。
需要环境变量 DEEPSEEK_API_KEY。`;

const here = path.dirname(fileURLToPath(import.meta.url));
const isSource = path.basename(here) === "src";
const entry = (pkg: string): string =>
	path.join(here, "..", "..", pkg, isSource ? "src" : "dist", isSource ? "main.ts" : "main.js");

const [command, ...rest] = process.argv.slice(2);

switch (command) {
	case "tui":
	case "web": {
		// 子命令的 main 自行解析 process.argv.slice(2)，剥离子命令名后透传
		process.argv = [process.argv[0] ?? "node", process.argv[1] ?? "neko", ...rest];
		await import(entry(command));
		break;
	}
	case undefined:
	case "-h":
	case "--help":
		console.log(USAGE);
		break;
	default:
		console.error(`未知命令: ${command}\n\n${USAGE}`);
		process.exitCode = 1;
}
