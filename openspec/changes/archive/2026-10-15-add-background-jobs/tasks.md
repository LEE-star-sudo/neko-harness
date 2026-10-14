# Tasks

## 1. 可行性验证（先于实现）

- [x] 1.1 写一个使用真实 `LocalExecutionEnv` 的 spike 测试（`packages/core/test/jobs-spike.test.ts`，可保留为回归测试），在后台 task 的 context 中调用 `env.exec`，验证：命令在工具调用结束后继续运行；abort 后 `sh -c 'sleep 300 & wait'` 及 `npm` 风格的子孙进程都被终止；读取 stdin 的命令立即得到 EOF 而不是永久挂起；重启（重开 Harness）后 `abandonOnRestart` 的 Runner 以 `abortReason: "restart"` 被中止且命令不重跑。测试通过；若进程树未被终止，记录结论并在 2.3 中补进程组终止，若 Windows 行为不满足则在 design.md 风险中记录限制

## 2. core：job 引擎与工具

- [x] 2.1 新增 `packages/core/src/jobs.ts` 常量与类型（并发 4、保留终态 20、启动等待 2 秒、内存尾部 64 KiB/1000 行、回报尾部 40 行/4 KiB）、`JobsDoc`（`app.neko.jobs`，`history: "latest"`，`fork: "initial"`）及环形输出缓冲（偏移、截断标记、增量读取）；用单测覆盖缓冲上限、偏移续读、截断标注，`bun run test` 通过
- [x] 2.2 实现进程内注册表与 `Runner` task（`background: true`、`abandonOnRestart: true`）：先提交 running checkpoint 再 `env.exec`，`onOutput` 写缓冲，超时视为 failed；终态结算 commit 保证“已终态则放弃”，终止时持久化 ≤64 KiB 尾部；用假执行环境测试 exited/failed/超时/终态不可变，测试通过
- [x] 2.3 实现 `Reporter` task 与 `stopOrigin` 规则：结算 commit 内创建 Reporter，`submit({ whenBusy: "followUp", requestId: job-report:<jobId> })` 至多一次；模型 `stop` 与启动窗口内结束不回报，用户停止回报；按 1.1 的结论实现停止与（必要的）进程组终止；测试覆盖忙时排队、重复投递被幂等、stop 与退出竞争只有一个终态，测试通过
- [x] 2.4 实现 `job` 工具（`start/output/stop/list`，参数校验、启动 2 秒窗口、上限 4 的拒绝、越界/已结束 jobId 的处理）并以扩展 `neko-jobs` 在 `runtime.ts` 安装；重启后 running 记录结算为 `lost` 并回报一次，会话归档停止其 running job，runtime 关闭终止全部进程；测试覆盖重启 lost 且不重跑、归档与关闭清理、分叉不含 running job，测试通过
- [x] 2.5 在 `subagents.ts` 的工具白名单中排除 `job`（explore/plan/coder 均无）；用测试断言各角色工具集不含 `job` 且审批流程不变，`bun run test` 通过

## 3. core：回报标记、投影、输入历史与提示词

- [x] 3.1 `InputData` 增加可选 `jobReport`，`projection.ts` 将其投影为带可选 `jobId` 的 `system` 项（不产生 user 项），导出沿用系统项处理；补投影与导出测试，旧数据与无该字段的输入行为不变，测试通过
- [x] 3.2 `input-history.ts` 排除带 `jobReport` 的输入并补测试（回报不产生历史条目、其余规则不变）；同步确认 `packages/core/test/input-history.test.ts` 全部通过
- [x] 3.3 `prompt/prompt.ts` 为 `job` 增加 `TOOL_GUIDELINES` 规则（长期命令用 `job start`，`output`/`stop`，无 stdin，终止后自动回报；使用实际参数名），未启用时不出现，子 agent 不含；补提示词测试，`bun run test` 通过

## 4. gateway

- [x] 4.1 `contract.ts` 增加 `JobSummarySchema`、可选 `ChatView.jobs` 及 `neko.chat` 的 `jobOutput`、`jobStop`（均为可选扩展，不升应用协议）；`session-host.ts` 在 `app.neko.jobs` 变化时刷新视图，`jobs` 恒下发（可为空数组），摘要不含输出正文；与 `add-flutter-mobile-control` 对契约的改动先对齐再合并；`contract.test.ts` 与新增测试验证旧客户端忽略新字段、摘要有界
- [x] 4.2 实现 `jobOutput`（单次 ≤64 KiB，偏移续读）与 `jobStop`（校验归属、只作用于当次运行、已结束返回终态）；测试覆盖越界 jobId、已结束 job、多客户端同时停止只终止一次、重连后可继续读取，`bun run test` 通过
- [x] 4.3 client-session 层暴露 jobs 能力探测（`jobs === undefined` 视为不支持）及读取/停止方法；测试验证新客户端对旧网关降级而非报协议不兼容，测试通过

## 5. TUI

- [x] 5.1 core 增加共享纯函数 `summarizeJobs`（排序、状态文案、时长格式）并导出子路径；单测覆盖，`bun run test` 通过
- [x] 5.2 新增 `packages/tui/src/jobs-ui.ts`（`PickerPanel` + `JobDetail`：列表、输出尾部、自动跟随与上滚停止跟随、`S` 停止、`←` 返回、1 秒带偏移轮询），在 `tui.ts` 接入 `/jobs`，`labels.ts` 与 `help-ui.ts` 补充；测试覆盖空状态、停止、切换会话迟到响应不覆盖、保留草稿，测试通过
- [x] 5.3 状态栏显示运行数，job 回报系统项以主题样式呈现（折叠输出尾部）；测试覆盖数量变化与回报渲染，`bun run check` 通过

## 6. Web

- [x] 6.1 新增 `packages/web/src/client/components/job-panel.tsx` 与顶栏运行数入口：列表、详情输出尾部、自动跟随与回到底部、停止按钮（防重复提交）、旧网关隐藏入口或给出更新提示；纯逻辑测试覆盖偏移续读与状态映射，测试通过
- [x] 6.2 `message-list.tsx` 将带 `jobId` 的系统项渲染为系统提示卡（输出尾部默认折叠、可展开），与面板状态一致；`bun run check` 与 Web 客户端类型检查通过
- [x] 6.3 浏览器手动验证（隔离实例，使用假命令如 `sh -c 'while true; do date; sleep 1; done'`，不调用真实模型）：375/768/1440/1920 宽度无横向溢出、输出自动跟随与上滚、停止、旧网关降级；将操作记录写入 PR 描述

## 7. 集成验证与文档

- [x] 7.1 端到端：以脚本化会话启动后台服务，期间继续对话，服务崩溃触发回报与新一轮，gateway 重启后状态为 lost 且命令不重跑，归档后无残留进程；记录验证命令与结果
- [x] 7.2 更新 README/AGENTS 中与工具、命令（`/jobs`）相关的说明，并确认文档中的命令可运行
- [x] 7.3 `bun run check`、`bun run test`、`bun run build` 全部通过，且 `openspec validate add-background-jobs --strict` 通过，各 delta spec 的 Scenario 与实现行为一一对应
