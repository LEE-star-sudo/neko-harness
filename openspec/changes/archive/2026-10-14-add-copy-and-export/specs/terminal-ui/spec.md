# Spec Delta

## ADDED Requirements

### Requirement: TUI 复制最后回答
TUI SHALL 提供 `/copy` 命令，把"最后一条回答"（不含 thinking）写入系统剪贴板并显示成功提示及字符数。无可复制内容时 MUST 显示提示且不改动剪贴板；命令 MUST NOT 发送给模型，也不改变草稿与运行状态，忙碌时亦可使用。

#### Scenario: 复制回答
- **WHEN** 会话已有回答，用户提交 `/copy`
- **THEN** 最后一条回答的正文进入剪贴板，不含 thinking，并显示已复制提示

#### Scenario: 没有回答
- **WHEN** 会话尚无 assistant 正文时提交 `/copy`
- **THEN** 显示无内容可复制的提示，剪贴板保持原样

#### Scenario: 运行中使用
- **WHEN** agent 正在生成时提交 `/copy`
- **THEN** 复制已提交的最后一条回答，当前运行不受影响

### Requirement: TUI 剪贴板写入与降级
TUI 写入剪贴板 SHALL 优先使用平台原生方式（macOS、Windows 与 Linux 的 Wayland/X11 常用命令），原生方式不可用或失败时 MUST 降级到 OSC 52 终端序列；通过 SSH 等远程会话运行时 MUST 额外发出 OSC 52。所有方式均失败或内容超出 OSC 52 上限时 MUST 显示具体错误，不得谎报已复制。

#### Scenario: 原生命令可用
- **WHEN** 平台剪贴板命令可用
- **THEN** 内容经原生方式写入，成功提示出现

#### Scenario: 无图形环境
- **WHEN** Linux 无 Wayland/X11 剪贴板工具且内容在 OSC 52 上限内
- **THEN** 通过 OSC 52 写入并提示已发送到终端剪贴板

#### Scenario: 全部失败
- **WHEN** 原生方式失败且内容超出 OSC 52 上限
- **THEN** 显示无法写入剪贴板的错误及原因，并建议使用 `/export`

### Requirement: TUI 导出命令
TUI SHALL 提供 `/export [path] [--thinking]`，把当前会话导出为文件并显示最终写入路径。格式由路径扩展名决定：`.md`、`.html`、`.json`；缺省路径时生成 Markdown 的默认文件名并写入 TUI 工作区目录。路径 MAY 用引号包裹含空格的内容，支持 `~/` 前缀，相对路径相对工作区目录解析。`--thinking` 选择包含思考过程。

#### Scenario: 默认导出
- **WHEN** 用户提交 `/export`
- **THEN** 在工作区目录生成带默认名称的 `.md` 文件并显示其完整路径

#### Scenario: 按扩展名选格式
- **WHEN** 用户提交 `/export out/chat.html`
- **THEN** 生成 HTML 文件，图片内嵌，完成时提示路径及未能内嵌的图片数量（若有）

#### Scenario: 包含思考过程
- **WHEN** 用户提交 `/export notes.md --thinking`
- **THEN** 导出的 Markdown 包含每条回答的思考过程

#### Scenario: 路径含空格
- **WHEN** 用户提交 `/export "my chats/a.json"`
- **THEN** 引号内整体作为路径，导出 JSON 到该文件

### Requirement: TUI 导出的安全与错误
TUI 导出 MUST NOT 覆盖已存在的文件；不支持的扩展名、父目录不存在、无写入权限或空会话 MUST 以明确原因提示失败，且不留下部分文件。导出为异步执行，期间 TUI SHALL 保持可用；导出的内容 MUST 是发起命令时刻的会话转录，即使期间切换了会话也不混入其他会话。

#### Scenario: 目标文件已存在
- **WHEN** 目标路径已有同名文件
- **THEN** 导出失败并提示换一个路径，原文件内容不变

#### Scenario: 不支持的扩展名
- **WHEN** 用户提交 `/export chat.txt`
- **THEN** 提示仅支持 `.md`、`.html`、`.json`，不生成文件

#### Scenario: 导出期间切换会话
- **WHEN** 含图片的 HTML 导出进行中用户切换到另一会话
- **THEN** 文件内容仍属于发起导出的会话，完成提示指明该会话

### Requirement: TUI 复制与导出命令可发现
`/copy` 与 `/export` SHALL 出现在斜杠命令补全中并附简短说明，也 SHALL 出现在 `/help` 的命令列表里。

#### Scenario: 命令补全
- **WHEN** 用户输入 `/c` 或 `/ex`
- **THEN** 补全候选分别包含 `/copy` 与 `/export` 及其说明
