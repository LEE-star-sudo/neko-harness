# Proposal

## Why

neko-harness 仍锁定 Pi 1.2.0，而 Pi 1.3.0 已发布（`reference/pi` 已同步到含 `v1.3.0` 标签的 main）。1.3.0 对 pi-ai、pi-durable 只有兼容性修复和增量能力，但 Chord 有大量破坏性 API 变更（`Handle`→`Ref`、`kind`→`variant`、`self.state/resource` 按名声明、远程契约必须声明 `host`、`ctx.get` 等待首个状态快照、协议版本升至 4）。继续停留在 1.2 会错过压缩基线顺序、模型切换思考块、工具参数畸形 JSON 等修复，并拖大后续升级的迁移成本。

## What Changes

- 将根包与 `packages/{core,gateway,tui,web}` 实际使用的 chord、pi-ai、pi-durable、pi-tui、pi-env 精确锁定到 npm 发布的 `1.3.0`，更新 `bun.lock`；`v1.3.0` 之后 `main` 的额外提交不纳入本次升级。
- **BREAKING** 按 Chord 1.3 迁移网关与客户端：
  - 远程契约用 `host: hostNamed(...)` 声明宿主，删除 `host.get(..., { at })` 调用；
  - 工厂返回值与引用上的 `kind` 改为 `variant`，类型 `Handle`/`BehaviorOf`/`ResourceSpec` 改为 `Ref`/`ImplementationOf`/`ResourceDeclaration`；
  - `self.state({ x: cell() })`、`self.resources({ x: resource({ rev }) })` 改为按名称调用的 `self.state(name, schema, initial, { version })`、`self.resource(name, { version, ... })`；
  - `eager` 改为 `lifetime: "host"`；
  - 采用带类型的 principal（`createHost<P>`）。
- 利用 `ctx.get`/`host.get` 在首个状态快照到达后才 resolve、状态类型不再含 `undefined` 的新语义，删除 `waitForValue` 等本地首快照等待与 `undefined` 防御；服务边界校验与"首个订阅状态迟到"行为保持不变。
- 适配 Chord 1.3 的 `FacetApi.signal`、上下文关闭与外来 ctx 拒绝（`invalid/foreign_ctx`）、重载任务停止期限；复核 core/gateway 对 `Context`、`withAbortSignal`、`BACKGROUND_CONTEXT` 的使用。
- 协议版本升至 4：新旧客户端与网关互相拒绝。因 TUI/Web 与网关同包发布，不提供旧协议回退；移动入口使用独立 mobile API，不受影响。
- 复核 pi-ai 的行为变化（切换模型时丢弃他模型的思考块、畸形工具参数现在携带 `argumentsError` 而校验失败、`\u` 转义解析修复、重试判定扩大）对 DeepSeek 与既有重试/压缩/用量路径的影响；pi-durable 的压缩基线顺序修复沿用上游，不自建补丁。
- 保持范围克制：不采用 Chord 新增的 `maxCalls`、`linger`、`init` 状态、链路压缩、pi-durable `SqliteStorage` 表前缀等新能力；除非它们能直接替换现有重复实现。
- **BREAKING** 旧会话均为可丢弃测试数据，本次不提供 1.2 及更早数据库、旧协议或旧未完成任务的兼容，以 Pi 1.3.0 新数据为唯一基线；实施时定向清理旧会话存储（`~/.neko/neko.sqlite` 及 WAL/SHM），保留凭据、配置、serverId、技能和用户工作区文件，不加入启动自动删库逻辑。
- 更新 README、AGENTS.md 的 SDK 版本与使用要点；不发版、不提交 git commit。

## Capabilities

### New Capabilities

无；沿用现有能力边界。

### Modified Capabilities

- `agent-runtime`：将持久化与恢复保证的 SDK 基线更新为 Pi 1.3.0；1.2 及更早会话数据可清理，不提供兼容。
- `model-providers`：模型能力与思考强度验收基线更新为 Pi 1.3.0，增加切换模型后不透传他模型思考块的要求。
- `session-gateway`：传输要求增加协议版本不匹配时连接被明确拒绝，且不影响其他连接，不提供旧协议回退。

## Impact

- 依赖清单：根 `package.json`、`packages/{core,gateway,tui,web}/package.json` 与 `bun.lock`。
- Gateway：`contract.ts`、`gateway.ts`、`client-session.ts`、`server-services.ts`、`session-host.ts`、`subagent-host.ts`、`subagent-client.ts`、`link.ts`、`unix-link.ts`、`ws-listener.ts`、`mobile/{adapter,admin,listener}.ts` 及对应测试。
- Core：`runtime.ts`、`compaction.ts`、`job-engine.ts`、`subagents.ts`、`session-metadata.ts`、`workspace-files.ts` 等对 Chord `Context`/`chord/context` 的使用，以及 core 测试对 pi-ai/pi-durable 行为的断言。
- 前端：TUI 的 `skill-market-ui.ts`、Web 的 `mobile-admin.ts` 与 `skills-page.tsx` 使用的契约类型。Flutter 应用使用独立 mobile 协议，不受影响。
- 文档：README、AGENTS.md。主规格在后续同步/归档流程更新，历史归档文档与 `reference/` 保持只读。
- 本阶段只产出规划工件，不修改代码或依赖，不删除数据。
