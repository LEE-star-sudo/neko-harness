# Design

## Context

动机与范围见 proposal.md；行为契约见 `specs/background-jobs` 及各 delta spec。已验证的现状：

- pi-durable 1.2.0 的内置 `bash` 是前台工具：一次 `env.exec()` 占住整个工具调用，无默认超时；`ExecutionEnv.exec` 只有 `cwd/env/timeout/onOutput/spill/window`，没有 detach、stdin、pid，终止只能靠 abort `Context`。
- pi-durable 支持后台 task：`createTask(..., { background: true })` 是边界，父级 Esc 与空闲等待不会波及；`abandonOnRestart: true` 让重启后仍活着的 task 被 abort（`abortReason: "restart"`）；`submit({ whenBusy: "followUp", requestId })` 可由 task 向会话回投输入且按 requestId 幂等。官方范例 `reference/pi/packages/durable/test/examples/23-subagent-background.ts` 是 anchor/reporter 模式。
- durable 只保存 task checkpoint，不保存进程：gateway 重启后子进程必然消失。gateway 是 `neko tui/web` 的 owned child，前端退出即退出；只有 `neko serve` 长期存活。
- core 的 `subagents.ts` 工具白名单：coder 获得除 `subagent` 外全部工具，因此新增工具默认会泄漏给 coder，必须显式排除。
- 用户输入以 `NekoInput` entry（`InputData`）持久化，`projection.ts` 据此区分 `subagentRoundId`、`skill` 等；ChatView 由 gateway 的 `session-host.ts` 在对应文档 kind 变化时刷新。
- pi-env 的 pty（`openTerminal`）在 Windows 上返回 `ENOTSUP`，本期不使用；普通 `env.exec` 在 Windows 经 Git Bash 可用。

## Goals / Non-Goals

**Goals:**
- 模型可启动不阻塞轮次的后台命令，读取日志、停止，并在终止时被自动通知。
- 重启、归档、关闭时不重复执行、不遗留孤儿进程。
- 用户在 Web 与 TUI 中可查看输出与停止任务；对新旧 gateway/客户端向后兼容。
- 抽象与执行体解耦，使后续加入 pty、stdin 输入不需重做生命周期、回报、面板。

**Non-Goals:**
- pty、stdin 输入、终端保真（ANSI/resize）、交互式命令。
- 用户在面板中启动 job、job 跨 gateway 重启存活、job 的审批（主 agent 与 bash 保持一致）。
- 子 agent 使用 job；跨会话共享 job；远程执行环境的专门支持。

## Decisions

### D1：新增独立 `job` 工具，不扩展 `bash`

`job` 动作为 `start / output / stop / list`，作为新扩展 `neko-jobs` 安装。备选：给 `bash` 加 `background: true`。否决原因：需要 `wrapTool` 改变上游工具语义，与 `tool-approvals` 对 bash 的包装叠加，违背“上游薄封装”；独立工具边界清晰，与 `subagent` 工具同构，也便于子 agent 白名单排除。

### D2：后台 Runner task + 进程内注册表

`start` 在一次 commit 内写入 job 文档并创建 `Runner` task（`ownership: conversation`、`background: true`、`abandonOnRestart: true`）。Runner 在 task 的 context 中调用 `env.exec`（环境来自 `api.env`，沿用 `workspaceFiles` 的共享 Connection），`onOutput` 写入进程内注册表的环形缓冲。注册表以 `jobId` 为键保存 `AbortController`、缓冲、偏移与退出 Promise。`start` 等待“退出 Promise 或 2 秒”，之后返回，并带上已产生输出。

备选：在工具 `execute` 内直接 detach 进程。否决：工具 task 结束时 context 取消会杀死进程，且无 durable 记录。

### D3：状态落在 `JobsDoc`，输出尾部只在终止时持久化

新增会话级文档 `app.neko.jobs`（`history: "latest"`，`fork: "initial"`，所以分叉得到空列表），保存摘要与终态尾部（≤64 KiB）。运行中输出只在内存，避免高频提交；代价是 gateway 崩溃时丢失该运行期输出，`lost` 的 job 只剩最后持久信息，已写入 spec。摘要列表保留运行中全部与最近 20 个终态，超出的最老终态被裁剪。

### D4：终态结算与回报分离，保证“单终态、至多一次回报”

结算在一次 commit 内完成：若文档中 job 已是终态则放弃（终态不可变，解决 stop 与退出、stop 与重启的竞争）；否则写入终态与尾部，并在同一 commit 创建 `Reporter` task（`background: true`，非 abandon，使重启后可恢复）。Reporter 以 `requestId = job-report:<jobId>` 向会话 `submit({ whenBusy: "followUp" })`，幂等保证至多一次。是否回报由结算时的 `stopOrigin` 决定：`model` 与 `startup-window` 不创建 Reporter。会话归档时停止 running job 的来源为 `archive`，同样不回报（会话已不可见）；用户在面板中停止（`user`）才回报。

### D5：重启语义由 `abandonOnRestart` 驱动

重启后仍 live 的 Runner 被 abort 且 `abortReason === "restart"`，其 abort 处理把 job 结算为 `lost` 并走 D4。命令绝不重跑。Runner 的 `run` 阶段不得在重启后再次进入 exec，通过先提交“running”checkpoint、再调用 exec 的顺序以及 abandon 标记保证；实现时用测试固化（见 tasks 1.1）。

### D6：停止

`stop` 在 commit 中记录 `stopOrigin`（`model` 或 `user`）后调用注册表中的 `AbortController.abort()`，由 Runner 结算为 `stopped`。前端停止与模型停止走同一实现，区别只在 `stopOrigin`（用户停止要回报，因为模型此时可能毫不知情）。杀进程树依赖 pi-env 的 abort 行为，必须在 spike 中验证 shell 及其子孙（`npm → node`）都被终止，否则在 Runner 中补充进程组级别的终止。

### D7：回报输入的标记与投影兼容

`InputData` 增加可选 `jobReport?: { jobId; status; exitCode }`，回报通过 `submit` 的 `entry` 与内容原子持久化。`projection.ts` 将其投影为已有的 `system` 类型项，并附可选 `jobId`（旧客户端当作普通系统提示显示，无需识别新类型）。`promptHistory` 排除带该标记的输入；导出沿用系统项处理。回报文案为英文模型可读文本（状态、退出码、≤40 行/4 KiB 尾部、`output` 提示）。

### D8：gateway 采用可选字段与可选方法，不升应用协议

`ChatView.jobs` 作为可选数组：支持 job 的 gateway 总是下发（可为空数组），客户端以 `jobs !== undefined` 判断能力。`session-host.ts` 在 `app.neko.jobs` 变化时刷新视图。`jobOutput({ jobId, since })` 与 `jobStop({ jobId })` 作为 `neko.chat` 上新增的方法；旧 gateway 缺方法时客户端因 `jobs` 缺失根本不会调用。输出读取单次上限 64 KiB，前端在详情打开期间以约 1 秒间隔带偏移轮询。备选：为输出做 watch 推送。否决：本期输出量级有限，轮询实现与失败模式更简单；若后续需要再升级。

### D9：前端复用 subagent 面板模式

TUI 用 `PickerPanel + PickerDetail`（参照 `subagents-ui.ts`）实现 `/jobs`，`labels.ts` 与 `help-ui.ts` 补充命令；状态栏增加运行数。Web 新增 `job-panel.tsx`（参照 `subagent-panel.tsx`）与顶栏入口。状态文案、时长格式、排序放在 core 的纯函数 `summarizeJobs`，两端共用以保持一致。面板只读加停止。

### D10：常量

并发上限 4、保留终态 20、启动等待 2 秒、内存尾部 64 KiB/1000 行、回报尾部 40 行/4 KiB。集中定义于 core `jobs.ts` 常量，spec 中的数值以其为准，改动需同步 spec。

## Risks / Trade-offs

- [abort 不能杀整棵进程树，遗留 `node` 子进程] → 已验证（spike 后并入 `packages/core/test/job-engine.test.ts`）：abort exec Context 会终止 `sh -c 'sleep 300 & wait'` 及多层嵌套的孙进程，无需自行实现进程组终止；runtime 关闭同样终止全部命令；读取 stdin 的命令立即得到 EOF。
- [gateway 被 SIGKILL 时 daemon 不回收子进程] → 已验证：gateway 进程被 SIGKILL 后，其启动的孙进程仍然存活（孤儿）。正常停止（runtime `close`）会终止全部命令；SIGKILL/崩溃无法保证，属已知限制。设计上“进程随 gateway 生命周期”，重启后 job 记为 `lost` 且不尝试接管旧进程，文档与提示词不承诺崩溃后的清理。
- [崩溃循环的服务触发反复回报与模型回合] → 每个 job 只回报一次，并发上限 4；是否反复重启由模型决定，提示词规则要求先读取输出再重试。
- [运行期输出只在内存，崩溃时丢失] → 已在 spec 声明；若后续需要可再加日志文件，不改变接口。
- [与 `add-flutter-mobile-control` 同时修改 gateway 契约] → 本变更只做可选字段/方法的增量；实现时先 rebase 契约再改，避免覆盖对方改动。
- [`submit` 的 followUp 在用户 Esc 时被丢弃] → 接受：与官方 subagent 范例一致，job 状态仍可在面板与 `list` 查到。
- [Windows 经 Git Bash 执行] → 不使用 pty，沿用 `env.exec`；进程树终止在 Windows 上的表现未在本机验证（spike 测试仅在 POSIX 断言进程存活检查），作为已知限制记录，不满足时在文档说明。

## Migration Plan

纯增量：新增文档 kind 与扩展，不迁移既有数据；旧会话没有 `app.neko.jobs` 时按空处理。发布后旧 gateway 与新前端的组合按 session-gateway 的兼容要求降级。回滚时卸载 `neko-jobs` 扩展即可，存量 job 记录被忽略，运行中的进程随 gateway 停止而终止。

## Open Questions

- 面板轮询间隔与单次读取上限（暂定 1 秒/64 KiB）是否需要依据真实输出量调整，可实现后再定，不影响 spec。
- 是否需要在会话列表层面提示“该会话有运行中 job”，留待后续变更。
