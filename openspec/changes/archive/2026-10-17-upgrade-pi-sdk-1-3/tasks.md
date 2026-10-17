# Tasks

## 1. 基线与依赖

- [x] 1.1 在 Pi 1.2.0 上运行 `bun run check` 与 `bun run test` 记录基线；验证基线结果已记录。
- [x] 1.2 将根与 `packages/{core,gateway,tui,web}` 实际使用的 chord、pi-ai、pi-durable、pi-tui、pi-env 精确升至 1.3.0，更新 `bun.lock`；验证 `bun install --frozen-lockfile` 成功、依赖图中只有一份 chord 1.3.0、typebox 仍为 1.3.27。

## 2. Chord 契约与网关迁移

- [x] 2.1 Spike：确认网关身份校验（`identifiedLink`）不依赖 host 名，决定固定 host 名或动态契约（design D2）；用测试证明身份不匹配仍被拒绝且不读取会话内容。结论：host 名固定为 `neko`，身份改由应用信息 `serverId` 校验，`identifiedLink` 删除；`client-session.test.ts` 覆盖不一致时拒绝且未绑定业务服务。
- [x] 2.2 迁移 `gateway/contract.ts`：`Handle`→`Ref`，所有 `remote` 声明 `host`（经保留的 `contract()`/`rpc()` 元组封装，Chord 未导出 `MethodSpec`，声明输出需要它；不采用无参简写以保持 wire 描述不变）；验证契约测试、网关 `tsc` 构建与 Web 类型检查通过，且浏览器导出不引入 Node 依赖。
- [x] 2.3 迁移服务端工厂（`server-services.ts`、`session-host.ts`、`subagent-host.ts`、`mobile/*`）：`kind`→`variant`，`BehaviorOf`/`ResourceSpec` 改名，`self.state`/`self.resource` 按名声明并设置 `version`，`eager` 改为 `lifetime: "host"`；验证 gateway 单测通过，业务 schema 中的 `kind` 字段未被误改。
- [x] 2.4 迁移客户端（`client-session.ts`、`subagent-client.ts`、`mobile-admin.ts`、TUI/Web 技能市场）：删除 `{ at }`，同步入口用 `hold`、其余用 await 状态的 `get`，删除 `waitForValue` 与 `undefined` 防御（现有引用均携带状态，无需 `state: false`）；验证"首个订阅状态迟到""超时/断连明确错误"场景和两端首屏加载。
- [x] 2.5 迁移 `gateway.ts` 与链路层（`link.ts`、`unix-link.ts`、`ws-listener.ts`）：采用 `createHost<P>` 类型 principal，核对 `accept`/`invalidatePrincipal`；验证 POSIX 双传输与 Windows 仅 WebSocket 的链路测试、无效帧/超限缓冲有界。
- [x] 2.6 状态 listener 幂等性：审查目录、凭据、任务、压缩等对状态的 listener 在重订阅/重载时重复收到当前值的情况，补重连与扩展热替换用例；验证无重复通知或重复提交。 审计结果：网关无 Chord 重载（直接 `host.serve`），所有 `self.on` 监听器要么订阅事件源（commit、投影、更新检查，无当前值回放），要么幂等对账；`state-redelivery.test.ts` 验证重连客户端取得当前值且服务端不递增 revision。

## 3. Core 与上游行为变化

- [x] 3.1 核对 core/gateway 的 `Context`、`withAbortSignal`、`BACKGROUND_CONTEXT` 使用：避免跨 host ctx 触发 `invalid/foreign_ctx`，评估 `FacetApi.signal` 能否替换 `session-host.ts` 的取消包装；验证取消、关闭、归档与 fork 测试。 结论：core 只把 Chord `Ctx.signal` 经 `withAbortSignal` 桥到 durable Context，`FacetApi.signal` 仅属于 facet 重载，不能替代，故保留；网关/客户端 ctx 均来自各自 host，取消/关闭/归档/fork 测试通过，无 `invalid/foreign_ctx`。
- [x] 3.2 评估以 `@earendil-works/chord/output` 替换 `core/jobs.ts` 的 `OutputBuffer`，仅在 `fromTail`、`read(since)`、UTF-8 边界与 `JOB_LIMITS` 语义等价时替换并同步 spec；否则记录保留理由。验证 job 测试。 结论：不替换。`chord/output` 的 `OutputBuffer` 为头/尾窗口快照（丢弃计数），没有累积字节偏移 `read(since)`、`fromTail` 恢复和任务重启后的续读语义，与 `JOB_LIMITS` 及 job 规格不等价；core 实现保留，job 测试通过。
- [x] 3.3 补 pi-ai 行为测试：切换模型后旧思考块不作为文本发送（含持久历史不变）；畸形工具参数以 `argumentsError` 失败且 TUI/Web 展示可读；重试判定扩大不重复用量与压缩。验证 DeepSeek 能力目录与既有强度映射场景仍成立。 实现：`core/test/pi-1-3.test.ts`（真实 DeepSeek Flash→Pro 的历史转换不含旧思考、历史不变；畸形工具参数不执行且向模型展示原文），`providers.test.ts` 能力基线改为 1.3；重试判定与用量/压缩由既有全套测试覆盖。
- [x] 3.4 补 pi-durable 行为测试：压缩后基线系统消息位于上下文最前，不更改标题/最近消息时间；确认无需自建补丁。 实现：`compaction.test.ts` 新增压缩后请求上下文以单一 system 基线开头且最近消息时间不变。

## 4. 协议版本与恢复

- [x] 4.1 将 Chord `onProtocolMismatch` 接入网关/客户端错误通道：协议版本不匹配时返回可识别原因，前端提示重启或升级而不无限重连，其他连接不受影响；验证 session-gateway 新增场景。 实现：客户端 `ready()` 对 `protocol…` 关闭抛 `ApplicationProtocolError` 并在链路关闭时立即失败，网关 `accept` 报告被拒对端；`protocol-version.test.ts` 覆盖新旧两个方向（含 Pi 1.2 的 `epoch` 握手）及其他连接不受影响。
- [x] 4.2 核对 `neko tui`/`web` 自动拉起与复用已运行网关的逻辑：旧版网关被视为需替换/提示而非健康实例；验证与旧网关并存的路径，移动入口场景保持不变。 结论：既有 `ApplicationProtocolError` 路径已让复用/拉起均视其为致命且不 spawn；`gateway-startup.test.ts` 新增运行中旧协议网关的用例。
- [x] 4.3 升级验证通过后，解析并记录当前实例实际 storagePath，停止持有该存储的网关，定向清理旧 SQLite/WAL/SHM 及遗留 socket/port；验证新启动创建 1.3 会话并可重启恢复，凭据、配置、serverId、技能、移动配对与工作区文件均未删除，不加入启动自动删库逻辑。 结果：存储为默认 `~/.neko/neko.sqlite`（`runtime.ts` 的 `DEFAULT_STORAGE_PATH`），无进程持有、无遗留 socket/port；仅删除 `neko.sqlite`、`-wal`、`-shm`，`credentials.json`、`gateway-server-id`、`mobile/`、`update-check.json` 保留。新启动的 `neko serve` 创建 1.3 存储与根会话，Unix/WS 连接、错误 serverId 拒绝、停止后重启恢复均通过；`neko web` 经 Playwright 浏览器连接显示"已连接"且控制台无错误。

## 5. 文档与验收

- [x] 5.1 更新 README 与 AGENTS.md 的 SDK 版本与 Chord 1.3 使用要点（`Ref`/`variant`、host 声明、await 状态、协议版本 4）；验证不再把 1.2 API 描述为当前行为，`reference/` 与历史归档无修改。 结果：AGENTS.md 版本与 Chord 1.3/网关约定已更新，README 无版本描述；`reference/` 未修改（已恢复到 main）。
- [x] 5.2 全量验证：`bun run check`、`bun run test`、`bun run build` 通过；手测 `bun run neko tui|web|serve` 与移动管理流程；在变更目录记录验证结果，不提交 git commit。 结果见 verification.md。
