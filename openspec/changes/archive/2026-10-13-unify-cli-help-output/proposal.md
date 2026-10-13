# Proposal

## Why

`neko --help` 与各子命令帮助文案分散在四个文件中，语言（tui 全英文、其余中文）、用法行（web/serve 误显示 `main.ts`）、术语（gateway/网关混用）、凭据与环境变量说明口径均不一致；`neko web` 启动日志中 gateway 子进程行带 `[gateway]` 前缀而 web 自身行没有，且重复打印模型行。用户面对的第一界面口径混乱，需要统一。

## What Changes

- 统一全部帮助文案为中文，术语统一用「网关」，结构统一为：`用法: neko <命令> [选项]` + `选项:` 段（两空格缩进、描述列对齐）+ `-h, --help 显示此帮助` 固定收尾 + 尾部补充段。
- 根 help（`packages/cli/src/main.ts`）：命令按 tui / web / serve / update 排序，补充 `-v, --version`，占位符 `[options]` 改 `[选项]`。
- `neko tui --help`：USAGE 整体中文化，补充 `NEKO_THEME` 环境变量与凭据配置说明。
- `neko web --help` / `neko serve --help`：用法行由 `main.ts [选项]` 改为 `neko web [选项]` / `neko serve [选项]`；修正 `--no-open` 缩进对齐。
- `neko update --help`：改为统一结构（`选项:` 段 + `-h, --help 显示此帮助`），保留 Windows 手动升级命令说明。
- `neko web` 启动日志：web 自身行加 `[web]` 前缀；`网关:` 标签改为 `gateway:`；删除「模型」行；去掉 `[gateway]` 前缀的前导空格使两者对齐。
- gateway 退出提示 `Ctrl-C 停止。` 统一为 `按 Ctrl+C 停止。`（影响 `neko serve` 独立运行与 web 拉起的子进程日志）。

## Capabilities

### New Capabilities

- `cli-interface`: neko CLI 的用户可见文本约定——根命令与子命令帮助输出的语言、结构、术语，以及 `neko web` 启动日志的前缀与字段格式。

### Modified Capabilities

（无。`application-updates` 中 `neko update --help` 场景要求的行为——说明手动更新命令、无效参数非零退出——在重排格式后仍然成立。）

## Impact

- 代码：`packages/cli/src/main.ts`、`packages/tui/src/main.ts`（仅 USAGE 常量）、`packages/web/src/main.ts`（USAGE 常量 + 启动日志打印）、`packages/gateway/src/cli-args.ts`（GATEWAY_USAGE 常量）、`packages/gateway/src/main.ts`（退出提示文案）。
- 纯用户可见文本变更，无参数解析行为、API 或存储变更；不影响脚本化处理（帮助输出本就面向人读）。
