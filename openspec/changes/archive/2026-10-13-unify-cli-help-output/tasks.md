# Tasks

## 1. 帮助文案统一

- [x] 1.1 重写 `packages/cli/src/main.ts` 根 USAGE：`用法: neko <命令> [选项]`；命令按 tui / web / serve / update 排序并附一行中文说明；补充 `-v, --version  显示版本号`；尾部保留「各命令的选项详见 neko <命令> --help」与凭据配置说明（DEEPSEEK_API_KEY / TAVILY_API_KEY）。验证：`bun packages/cli/src/main.ts --help` 输出符合结构，未知命令错误路径同步使用该 USAGE。
- [x] 1.2 重写 `packages/cli/src/main.ts` 中 `neko update --help` 的内联帮助为统一结构：`用法: neko update` + 说明行（升级当前 Bun 全局安装；Windows 先退出再运行 `bun add --global neko-harness@latest`）+ `选项:` 段（`-h, --help 显示此帮助`）。验证：`bun packages/cli/src/main.ts update --help` 输出中文统一结构，无效参数仍非零退出。
- [x] 1.3 将 `packages/tui/src/main.ts` 的 USAGE 翻译为中文：`用法: neko tui [选项]`；选项说明中文化（--cwd 工作目录、--model provider/modelId、--storage SQLite 存储文件、--socket-path 网关 Unix socket 路径、--theme light/dark/auto 覆盖 NEKO_THEME、`-h, --help 显示此帮助`）；尾部补充恢复会话/拉起网关说明与 `/login`、`DEEPSEEK_API_KEY` 凭据提示。验证：`bun --conditions=neko-source packages/tui/src/main.ts --help` 全中文输出。
- [x] 1.4 修正 `packages/web/src/main.ts` 的 USAGE：用法行改 `用法: neko web [选项]`；`--no-open` 缩进与描述列对齐；统一「网关」术语。验证：`bun --conditions=neko-source packages/web/src/main.ts --help` 用法行无 `main.ts`，描述列对齐。
- [x] 1.5 修正 `packages/gateway/src/cli-args.ts` 的 GATEWAY_USAGE：用法行改 `用法: neko serve [选项]`，其余选项措辞与 web 对齐（「网关」「SQLite 存储文件」等）。验证：`bun --conditions=neko-source packages/gateway/src/main.ts --help` 用法行为 `neko serve`。

## 2. 启动日志统一

- [x] 2.1 修改 `packages/web/src/main.ts` 启动日志：onLog 前缀由 `  [gateway]` 改为 `[gateway]`（去前导空格）；web 自身四行改为 `[web] neko web 已启动: <url>`、`[web]   gateway: <wsUrl>（serverId: <id>）`、`[web] 按 Ctrl+C 停止。`，删除「模型」行与 DEFAULT_MODEL 引用。验证：`bun run neko web --no-open` 输出两类前缀列对齐、无模型行。
- [x] 2.2 修改 `packages/gateway/src/main.ts` 退出提示 `Ctrl-C 停止。` 为 `按 Ctrl+C 停止。`。验证：`bun --conditions=neko-source packages/gateway/src/main.ts` 启动后显示新文案。

## 3. 整体校验

- [x] 3.1 运行 `bun run check` 与 `bun run test`，确认无类型/lint/测试回归。
- [x] 3.2 逐条对照 `specs/cli-interface/spec.md` 场景人工验证五个 `--help` 输出与 `neko web` 启动日志。
