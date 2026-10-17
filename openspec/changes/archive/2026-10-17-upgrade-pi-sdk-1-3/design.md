# Design

## Context

见 proposal 的 Why。当前锁定 1.2.0，网关、客户端与 core 直接使用 Chord 1.2 的 `remote`/`method`/`Handle`、`self.state({cell})`、`self.resources({resource})`、`eager`、`host.get(..., { at })`。已确认的 1.3.0 变化（来自 `reference/pi` 的 `v1.3.0` 标签与各包 CHANGELOG）：

```
pi-ai       仅修复/小改（切模型丢弃他模型思考块、畸形工具参数带 argumentsError、重试判定扩大）
pi-durable  增量与修复（SqliteStorage prefix、压缩基线顺序、toBase64 内存）；OutputBuffer 等输出工具移至 chord/output
pi-env/tui  仅版本号
chord       大量 BREAKING（命名、声明方式、host 声明、await 状态、协议版本 4）
```

约束：全部精确锁版本；core/gateway 只做薄封装，不为上游裹代码（AGENTS.md）；Flutter 使用独立 mobile 协议；`reference/` 与历史归档只读；旧 1.2 数据为可丢弃测试数据，直接清理，不做兼容。

## Goals / Non-Goals

**Goals**

- 全部包一致升到 1.3.0，类型检查、构建、测试与 TUI/Web/mobile 端到端行为与升级前一致。
- 迁移到 1.3 的原生写法，并删除 1.3 语义已经承担的本地代码（首快照等待、`undefined` 防御、`at` 路由）。

**Non-Goals**

- 不采用 `maxCalls`、`linger`、`init` 状态、`SqliteStorage` prefix、链路压缩等新增能力，除非能直接替换现有重复实现（见 D5）。
- 不引入 `v1.3.0` 之后 main 上的提交；不变更产品行为、mobile API 或 UI。

## Decisions

### D1. 依赖一致升级，先升后修

根与各 workspace 的 chord、pi-ai、pi-durable、pi-tui、pi-env 同时精确锁 1.3.0，`bun install --frozen-lockfile` 后以 1.3.0 已安装类型为准（AGENTS.md 约定），用 `tsc` 错误清单驱动 Chord 迁移。备选：分包渐进升级——否，pi-durable/pi-env 对 chord 为精确同版本依赖，分开升级会产生两份 Chord。

### D2. 契约：集中声明宿主，路由不再由调用方传入

`contract.ts` 的每个 `remote` 声明 `host`：服务器级服务（目录、管理、模型、工作区、凭据、技能市场、应用信息）用 `hostNamed(...)`；会话级 `NekoChat`/`NekoSubagent` 仍由同一网关 host 提供，同样用 `hostNamed`，不引入 `hostFamily`（本地单网关，没有每会话一个 host）。客户端删除 `{ at: serverId }`。

网关身份（spike 结论）：1.2 以 `serverId` 作为 host 名并由 `identifiedLink` 校验 hello 名。1.3 要求 host 名等于契约 `hostNamed(...)` 的静态名（`serve` 拒绝放置不符；hello 名即 host 名），因此 host 名固定为常量 `GATEWAY_HOST = "neko"`，`serverId` 改由应用信息（`NekoApplicationInfo.info.serverId`）承担：客户端 `ready()` 在绑定任何业务服务前读取并比对，不一致抛 `GatewayIdentityError`；管理客户端（Web 移动管理、配对脚本）在发送 admin token 前用 `assertGatewayIdentity` 校验。`identifiedLink` 删除。备选：每个网关动态生成契约——否，契约要被 Web 静态导入，且破坏类型推导；`hostFamily("", "serverId")`——否，会给所有输入加必填字段。

契约声明沿用 `contract()`/`rpc()` 元组封装并补上 `host`：Chord 未导出 `MethodSpec`，直接调用 `method()` 会让 `tsc` 声明输出报 TS2883；元组封装保持声明可移植，且 wire 描述（含 `nil` 参数）不变，不借此改变契约指纹。

链路：服务端 WebSocket 设置 `acceptPacked: false`，且不开 `compress`，沿用文本 JSON 与解压前的字节上限；Bun 下 `ws` 经 `addEventListener` 把文本帧交成 Buffer，Chord 1.3 会据此误判为压缩帧，因此有界链路对 `ws` 用 `on("message", (data, isBinary))` 区分文本与二进制。

主体类型：网关用 `GatewayPrincipal`（`host`/`local`/`mobile`）并以 `createHost<GatewayPrincipal>` 贯穿工厂；客户端 host 由 `createClientHost(link)` 统一创建（`self: { kind: "client" }`，上游请求视为 `server`）。

### D3. 声明与命名的机械迁移

- `kind` → `variant`（工厂、`ref.variant`、shape）；注意 `kind` 不再是保留字，但业务 schema 中的 `kind`（如 chunk 的 `view|history`、文件条目 `file|directory`）与 Chord 无关，不改。
- `Handle`→`Ref`、`BehaviorOf`→`ImplementationOf`、`ResourceSpec`→`ResourceDeclaration`、`epoch`→`codeVersion`（仅限实际来自 Chord 的符号；`subagent-client.ts` 的本地 `epoch` 计数器不属于此列）。
- `self.state({ a: cell(schema, init) })` → `self.state("a", schema, init)`；有需要异步首值的用 `{ init }`（仅当现有代码已在激活前同步预取时才采用）。`self.resources({ a: resource({rev}) })` → `self.resource("a", { version, deps, open, close })`。
- `eager: { input: {} }` → `serve(..., { lifetime: "host" })`；要求该类型 input 接受 `{}` 且无 `linger`，不满足则回退 `referenced` 并在首次 get 创建。
- 状态值升级后默认 `T`，反映 listener 在值替换后会重新收到当前值的新语义：对状态的监听必须幂等（见 Risks）。

### D4. 首快照等待交给 `get`，删除本地等待

`ctx.get`/`host.get` 现在在引用 live 且所有状态成员有首快照后才 resolve，超时为 `unavailable/ready_timeout`（`readyTimeout` 默认 60s）。`client-session.ts` 的 `waitForValue` 与"未到达状态不当成空"的判断改由此语义承担；保留的只有应用级超时错误文案，保证"首个订阅状态迟到→加载态、超时/断连明确错误"场景不变。需要方法-only 引用时（如 jobs/skills 的轻量调用）用 `GetOptions.state: false`。

### D5. 新能力采用边界

逐项审计后默认不采用：`maxCalls`（本地单用户，已有请求侧校验）、`linger`（可能降低 attach 抖动，但无需求，留待度量）、`self.state(..., { init })`、`SqliteStorage` 表前缀（单一存储）、链路压缩（本地链路无收益）。仅采用能删除现有代码者：D4 的 await 状态；core `jobs.ts` 自带的 `OutputBuffer` 若与 `@earendil-works/chord/output` 的头/尾窗口语义等价（`fromTail`、`read(since)`、UTF-8 边界、`JOB_LIMITS`），则改用上游实现，否则保留；`FacetApi.signal` 能取代 `session-host.ts` 中手写的 `withAbortSignal` 包装时则替换（实施时按类型确认，否则保留）。

### D6. 协议版本 4：不兼容即拒绝

Chord `PROTOCOL_VERSION` 升到 4，版本不同的对端互相以 `protocol-version <n>` 关闭。但 1.2 的 hello 用 `epoch` 而非 `codeVersion`，1.3 解析不了，实际表现为 `protocol error` 关闭，而不是版本不匹配。因此客户端把两者统一处理：`createClientHost` 接入 `onProtocolMismatch`，`ready()` 在链路因 `protocol…` 原因关闭时抛既有的 `ApplicationProtocolError`（两端已把它当作不可重试的"更新后重启"错误），且 `ready()` 在链路关闭时立即失败而不是等超时；网关 `accept` 接入 `onProtocolMismatch` 把被拒对端报告到 `onError`。因 TUI/Web 与网关同包发布，不提供旧协议回退。`neko tui`/`web` 复用已运行网关的路径本就把 `ApplicationProtocolError` 视为致命且不拉起竞争实例，无需改动，只补测试。Mobile API 与 Flutter 不受影响。

### D7. core 的 Context 与取消

core 只使用 `Context`、`chord/context` 的 `BACKGROUND_CONTEXT`/`withAbortSignal`。1.3 对 ctx 的变化是：跨 host/外来 ctx 被 `invalid/foreign_ctx` 拒绝、ctx 关闭时与长生命周期 signal 解绑。核对 core/gateway 是否把一个 host 的 ctx 传给另一个 host 的远程引用（gateway 嵌入 runtime，两个 host 可能同进程）；若有，在边界处从各自 host 的 root 重新派生。

### D8. pi-ai / pi-durable 行为变化只验证不补丁

对以下行为补测试断言，不自建补丁：切模型后旧思考块不再以文本发送（对应 model-providers 新场景）；畸形工具参数以 `argumentsError` 失败并让模型看到原文，核对 `tool-approvals`/`web-search` 对参数校验错误的展示；重试判定扩大不引起重复用量或重复压缩；压缩后基线系统消息位于上下文最前。不验证 1.2 存储在 1.3 下的恢复；用 1.3 新建会话验证重启恢复。

## Risks / Trade-offs

- [Chord 迁移面大，类型错误掩盖运行时语义变化] → 先全量 `tsc`，再用契约、links、recovery、model-switching、client-session 测试逐项对照；对状态 listener 重订阅与 `not_ready` 抛错补显式用例。
- [状态 listener 在重载/重订阅时会再次收到当前值] → 网关里订阅状态的 listener 必须幂等（目录/凭据/任务投影按 revision 去重）；测试中模拟热替换扩展与重连。
- [host 名固定后身份校验退化] → D2 的 spike 先行；不通过则保留动态 host 名并在 `contract.ts` 以工厂函数生成，再评估浏览器导出。
- [旧网关进程遗留，新客户端复用被拒] → D6：版本不匹配走替换/提示路径，并测试 `ensureGateway` 与 Web/TUI 提示。
- [误删用户数据] → 清理只针对已解析的当前实例 storagePath（SQLite/WAL/SHM）与遗留 socket/port，先停止持有存储的网关；凭据、配置、serverId、技能、移动配对与工作区文件不动，不加入启动自动删库逻辑。
- [后续 main 修复未纳入] → 与 1.2 相同策略，只升发布版。

## Migration Plan

1. 基线：在 1.2 上跑 `bun run check` 与 `bun run test` 记录结果。
2. 修改依赖清单并更新 `bun.lock`，再以 `bun install --frozen-lockfile` 验证，确认依赖图无两份 chord。
3. 按 D2–D4 迁移 gateway 契约、host、客户端与前端类型，再处理 core 的 Context。
4. 补 D6/D8 的测试，跑全量 check/test/build，并手测 `neko tui`、`neko web`、`neko serve` 与 mobile 管理流程。
5. 更新 README/AGENTS.md，记录验证。4a. 升级验证通过后，停止网关并定向清理旧会话存储，再以 1.3 新建会话验证。回滚：恢复依赖清单与 lock 到 1.2.0 并撤销代码迁移；清理后的旧会话不可恢复，按测试数据处理。

## Open Questions

- 是否在后续单独变更中评估 `linger`（降低 attach 切换开销）；不影响本次规格与任务。
