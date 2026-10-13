# Spec Delta

## Purpose

定义 neko CLI 用户可见文本的统一约定：根命令与各子命令的帮助输出（语言、结构、术语），以及 `neko web` 启动日志的行前缀与字段格式，保证用户在任何入口看到的口径一致。

## ADDED Requirements

### Requirement: 帮助输出语言与术语统一

根命令与全部子命令的帮助输出 SHALL 使用中文，网关组件的术语 SHALL 统一为「网关」，用法行中的占位符（如 `[选项]`、`<路径>`）SHALL 使用中文。

#### Scenario: 各入口语言一致

- **WHEN** 用户分别运行 `neko --help`、`neko tui --help`、`neko web --help`、`neko serve --help`、`neko update --help`
- **THEN** 输出均为中文，且网关组件均称「网关」，无中英文混排（协议名、文件名、环境变量名等专有标识除外）

### Requirement: 帮助输出结构统一

每个命令的帮助输出 SHALL 以 `用法: neko <命令> [选项]`（无选项时可省略 `[选项]`）开头，选项列于 `选项:` 段、两空格缩进且描述列对齐，并以 `-h, --help 显示此帮助` 作为选项段收尾；根命令 SHALL 额外列出全部子命令与 `-v, --version`。

#### Scenario: 子命令用法行显示真实命令名

- **WHEN** 用户运行 `neko web --help` 或 `neko serve --help`
- **THEN** 用法行分别为 `用法: neko web [选项]` 与 `用法: neko serve [选项]`，不出现 `main.ts`

#### Scenario: 根命令帮助列出全部入口

- **WHEN** 用户运行 `neko --help` 或不带参数运行 `neko`
- **THEN** 输出按 tui、web、serve、update 顺序列出子命令，并包含 `-v, --version` 说明

### Requirement: 帮助输出覆盖环境变量与凭据配置

涉及环境变量或凭据的命令帮助 SHALL 在尾部补充段说明：`neko tui --help` SHALL 说明 `NEKO_THEME`；配置凭据的入口（TUI `/login`、Web 设置页、`DEEPSEEK_API_KEY` / `TAVILY_API_KEY`）SHALL 在相应帮助中说明。

#### Scenario: tui 帮助说明主题环境变量

- **WHEN** 用户运行 `neko tui --help`
- **THEN** 输出说明 `--theme` 覆盖 `NEKO_THEME`，并提示可用 `/login` 或 `DEEPSEEK_API_KEY` 配置凭据

### Requirement: web 启动日志前缀统一

`neko web` 启动日志中，web 自身的输出 SHALL 带 `[web]` 前缀，网关子进程透传的输出 SHALL 带 `[gateway]` 前缀，两者均无额外前导空格；`[gateway]` 行保留子进程原始内容。

#### Scenario: 启动日志两类前缀对齐

- **WHEN** 用户运行 `neko web` 且网关被拉起
- **THEN** 网关行以 `[gateway] ` 开头、web 行以 `[web] ` 开头，前缀列对齐，无行首空格

### Requirement: web 启动日志字段

web 自身启动日志 SHALL 包含：启动行 `neko web 已启动: <url>`、网关行 `gateway: <wsUrl>（serverId: <id>）`、退出提示 `按 Ctrl+C 停止。`；SHALL NOT 打印模型行。

#### Scenario: 启动日志无模型行

- **WHEN** `neko web` 启动完成
- **THEN** 输出不含「模型」行，网关地址以 `gateway:` 标签展示

### Requirement: 退出提示文案统一

gateway 与 web 的启动日志中，退出提示 SHALL 统一为 `按 Ctrl+C 停止。`。

#### Scenario: serve 与 web 提示一致

- **WHEN** 用户分别运行 `neko serve` 与 `neko web`
- **THEN** 两者的退出提示均为 `按 Ctrl+C 停止。`（web 中该行由 `[gateway]` / `[web]` 前缀引出）
