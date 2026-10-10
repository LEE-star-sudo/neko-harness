#!/usr/bin/env bun
import path from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = `用法: neko <command> [options]

命令:
  tui     启动终端交互界面（自动拉起 gateway）
  web     启动 Web UI 静态托管（自动拉起 gateway）
  serve   仅启动 gateway（Unix socket + WebSocket）

各命令的选项透传，详见 neko <command> --help。
可通过 TUI /login、Web 设置页或 DEEPSEEK_API_KEY 配置凭据。`;

const here = path.dirname(fileURLToPath(import.meta.url));
const isSource = path.basename(here) === "src";
const entry = (pkg: string): string =>
	path.join(here, "..", "..", pkg, isSource ? "src" : "dist", isSource ? "main.ts" : "main.js");

const [command, ...rest] = process.argv.slice(2);

switch (command) {
	case "tui":
	case "web":
	case "serve": {
		// 子命令的 main 自行解析 process.argv.slice(2)，剥离子命令名后透传
		process.argv = [process.argv[0] ?? "bun", process.argv[1] ?? "neko", ...rest];
		const pkg = command === "serve" ? "gateway" : command;
		await import(entry(pkg));
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
