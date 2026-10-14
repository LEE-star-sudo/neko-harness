# Proposal

## Why

软件开发中常需要让命令长期挂在后台：`npm run dev`、`uv run ...`、`mvn spring-boot:run`、watcher 或测试服务。当前 agent 只有前台 `bash`：它在一次工具调用内一直等进程退出，且默认无超时，长跑命令会让整轮对话卡死，模型也无法在服务运行期间继续读写代码、再回头查看日志。pi-durable 1.2.0 已具备后台 task 与 followUp 回投递能力，但没有现成的后台 bash，需要在 neko 内补齐，并让用户在 Web 与 TUI 中看到、停止这些后台任务。

## What Changes

- 新增会话级后台任务（job）能力：模型通过新增的 `job` 工具启动、查看输出、停止、列出后台命令；命令不阻塞当前轮次。
- job 基于 `env.exec` 非交互执行（无 stdin），不使用 pty；不改动上游 `bash` 工具与其审批包装。
- 每个 job 有稳定身份与状态（running / exited / failed / stopped / lost），输出以有界尾部保留；运行期间可按需读取增量输出。
- job 终止后自动向所属会话回投一条 followUp 输入（带标记的报告，含状态、退出码与有界输出尾部），空闲会话由此开启新一轮；模型自己 `stop` 与启动时已提前结束的情形不重复回报。
- gateway 重启或进程丢失后，运行中的 job 不重新执行，状态落为 `lost` 并回报；会话归档时停止其运行中 job。
- 限制：每会话并发运行 job 上限；子 agent 不获得 `job` 工具。
- gateway：`ChatView` 增加 `jobs` 摘要，并提供按需读取输出与停止 job 的接口；应用协议向后兼容旧客户端。
- TUI：新增 `/jobs` 面板（列表、输出详情、停止）与状态栏运行数；Web：新增顶栏运行数与 job 面板（列表、输出详情、停止）。面板只查看与停止，不能由用户启动。
- 提示词新增 `job` 工具规则；job 回报在 transcript 中呈现为系统提示而非用户消息，并不进入输入历史。

## Capabilities

### New Capabilities

- `background-jobs`: 会话级后台命令的生命周期、输出保留、停止、重启与归档语义、并发上限、完成回报。

### Modified Capabilities

- `session-gateway`: 后台任务摘要、输出读取与停止服务，以及与旧客户端的兼容。
- `terminal-ui`: `/jobs` 面板、状态栏运行数、job 回报的呈现。
- `web-ui`: job 面板、顶栏运行数、job 回报的呈现。
- `tool-approvals`: 说明 job 入口不绕过 explore 子 agent 的审批边界。
- `prompt-context`: `job` 工具规则与实际参数一致。
- `input-history`: job 回报输入不进入输入历史。

## Impact

- `packages/core`: 新增 `jobs.ts`（扩展、工具、后台 task、文档、进程注册表）；`subagents.ts` 的工具白名单排除 `job`；`input.ts`/`projection.ts` 增加回报标记与系统项投影；`input-history.ts` 排除回报；`prompt/prompt.ts` 增加规则；`runtime.ts` 安装扩展并在归档/关闭时清理。
- `packages/gateway`: `contract.ts`、`session-host.ts` 增加 `jobs` 摘要及输出/停止方法，与进行中的 `add-flutter-mobile-control` 同时改动契约，需协调。
- `packages/tui`、`packages/web`: 新增 `/jobs` 面板与 job 面板，更新帮助与状态栏/顶栏。
- 无新增依赖；不修改 pi 上游代码；不含 pty、stdin 输入与用户手动启动 job（留给后续变更）。
