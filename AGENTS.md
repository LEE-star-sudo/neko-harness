# AGENTS.md

## 项目

neko-harness：基于 Pi 生态（pi-durable / pi-ai / chord / pi-env / pi-tui 1.3.0，全部精确锁版本）的 agent harness monorepo。Bun 1.4.2。设计决策见 `openspec/changes/archive/2026-10-11-bootstrap-neko-harness/design.md`。

## 常用命令

```bash
bun install --frozen-lockfile # 安装（按 bun.lock 安装）
bun run build              # tsc 构建全部 workspace 包（web 含 vite build）
bun run test               # Bun test（源码条件 + 文件隔离）
bun run check              # biome check + 根/Web 客户端类型检查
bun run check:write        # biome 修复 + 根/Web 客户端类型检查

bun run neko tui        # 启动终端 UI（自动拉起 gateway；需 DEEPSEEK_API_KEY）
bun run neko web        # 启动 Web UI（静态 8322，自动拉起 gateway WS 8321）
bun run neko serve      # 仅启动 gateway（Unix socket + WebSocket）
# 或构建后：bun packages/cli/dist/main.js tui|web|serve（bin 名 neko）
```

单个示例（需要 `DEEPSEEK_API_KEY`）：`bun --conditions=neko-source packages/core/examples/chat.ts`

## 约定

- TypeScript strict + `noUncheckedIndexedAccess` + `erasableSyntaxOnly` + `verbatimModuleSyntax`（`tsconfig.base.json`，风格参照 `reference/pi`）。
- 相对导入带 `.ts` 扩展名（`rewriteRelativeImportExtensions` 在构建时改写成 `.js`）；TS 运行用 Bun，构建用 tsc。
- Biome：tab 缩进、双引号、lineWidth 120（`biome.json`）。
- 上游 pi 依赖为实验性包：只升版本不裹代码，升级走显式 OpenSpec 变更；core/gateway 做薄封装隔离上游类型。
- 不要修改 `openspec/`（除非该变更本身要求）与 `reference/`（只读参考，已 gitignore）。
- 不要提交 lockfile 之外的意外文件；不主动 git commit。
- 真实 API key 只从环境变量读取，不打印、不落盘。

## 提示词与技能

- 系统提示词由 core 的 `neko-prompt` 扩展按五节组装：`preamble` / `rules` / `project_context` / `skills` / `cwd`（`packages/core/src/prompt/`）。
- 项目指令注入两级 AGENTS.md：`~/.agents/AGENTS.md` 与 `<workspace>/AGENTS.md`；不向上遍历、不识别其他文件名。
- Skills 目录：`~/.agents/skills/<name>/SKILL.md` 与 `<workspace>/.agents/skills/<name>/SKILL.md`（YAML frontmatter，同名项目级优先）；提示词只注入元数据，正文由模型用 read 工具自取。新用户输入提交时准备资源快照，只有该输入进入 transcript 后才激活；无新输入 placement 的工具轮复用活动快照。排队、被拒绝或撤回的输入不提前影响当前 run；快照按会话隔离，各节共享一次构建。进程重启后按当前磁盘资源重建。
- 显式调用：`/skill:<name> [args]` 在 core 准入层展开为 `<skill>` 用户消息（未知技能透传）；被调用技能的元数据与正文同次读取，不常驻保存全部技能正文。同批多输入的系统资源以最后一个输入快照为准，已展开正文保持原样。前端经 `chat.skills(null)` 实时取列表做补全，查询不改变活动快照，不本地展开。

## 后台任务

- core 的 `job` 工具（`packages/core/src/jobs.ts`、`job-engine.ts`）基于 `env.exec` 运行后台命令（不用 pty）；任务状态存 `app.neko.jobs` 文档，运行中输出只在内存。任务结束/崩溃经 `jobReport` 输入回报并触发新一轮，投影为带 `jobId` 的 `system` 项，不进入输入历史。
- 前端入口：Web 顶栏「任务」面板、TUI `/jobs`；经网关 `jobOutput`/`jobStop`（`jobsClient`）和 `ChatView.jobs` 读取，`ChatView.jobs` 缺省表示旧网关。数值上限集中在 `JOB_LIMITS`，改动需同步 spec。

## Pi 1.3 使用要点（以已安装发布包的类型与行为为准）

- durable 异步调用使用 `Context`（core 默认 `BACKGROUND_CONTEXT`）；远程 Chord 引用（`Ref`）方法使用可选 `Ctx`，普通调用自动 root，需要取消/组合时使用 host.root；ctx 只能给创建它的 host 的引用用（否则 `invalid/foreign_ctx`）。
- Chord 1.3：契约 `remote(..., { host: hostNamed(...) })` 声明放置，调用方不再传 `{ at }`；工厂返回 `variant`（非 `kind`）；`self.state(name, schema, initial)`、`self.resource(name, { version, ... })`、`self.on(name, source, handler)` 按名声明；`lifetime: "host"` 取代 `eager`。`host.get` 异步并等首个状态快照，`host.hold` 同步可能仍 loading（状态在水合前读取会抛 `not_ready`，已结束的引用读取会抛其结束错误）；状态类型是 `T` 不含 `undefined`。对状态的监听器会在重订阅时再收到当前值，必须幂等对账。Chord 未导出 `MethodSpec`，`gateway/contract.ts` 用 `contract()`/`rpc()` 元组封装以保持声明可移植。
- 网关：host 名固定为 `GATEWAY_HOST`（`neko`），`serverId` 由应用信息校验（`GatewayIdentityError` / `assertGatewayIdentity`），客户端 host 一律用 `createClientHost(link)`；主体类型是 `GatewayPrincipal`。链路协议版本 6：协议版本不同或握手无法解析（如 Pi 1.2 网关）会被客户端报告为 `ApplicationProtocolError`（不可重试）。服务端 WebSocket 不接受压缩帧；`ws` 在 Bun 下经 `addEventListener` 把文本帧交成 Buffer，因此有界链路用 `on("message", (data, isBinary))`。
- 存储：`openNodeSqliteStorage(path)`（自动建父目录）或 `MemoryStorage`；一个存储同时只被一个 Harness 打开。
- 上下文设置：`context.compaction`/`context.pruning`（配置文件）与 UI 保存值（`app.neko.context-settings` 文档）按保存值 > 配置 > 默认解析（`packages/core/src/context-settings.ts`）；压缩通过 `Harness.open` 的 `settings.compaction` getter 即时生效，未设置的字段不传，保持原生策略。
- 工具结果裁剪（`packages/core/src/context-pruning.ts`，默认关闭）：`ContextPruner` 监听提交，成功回答的占用 ≥ 阈值时写入 `app.neko.context-prune` 条目（`requestId = prune:<助手条目 id>`），其 `edits` 把旧大工具结果替换为占位；只改模型上下文，原条目、投影与统计不变（投影对该种类无分支）。
- 会话：`harness.root(context, { agent })` → `conversation.submit({ type: "input", content }, context)` → `submission.wait(context)`；同 `requestId` 重复提交幂等（含重开后）。
- 前端渲染数据源：`conversation.viewState(context)` / `conversation.watch(context)` / `watchEvents(harness, id, context)`。
- 用量：`harness.snapshot(UsageDoc, conversationId, context)` 或 `harness.usage(context)`（Session 总量）。
- 会话目录：宿主侧无 `scanConversations`，用 `harness.commit(tx => tx.scanConversations({}, n, undefined), context)`；无删除 API（core 用 `app.neko.conversation` 文档做软删除）。
- 会话级配置：`conversation.configure({ model, thinkingLevel }, context)` 单次提交生效，从下一次请求起使用；`conversation.agent(context)` 返回解析后的生效值（thinkingLevel 一定有值）。
- 扩展热替换：`registry.install(同名扩展)` 原地替换；已开始执行的工具调用沿原实现跑完，下一个 task phase/请求/调用才解析新代码（会话只存扩展名，重启后装回同名扩展即恢复）。
- 工具结果使用 `output`（模型）、`structuredOutput`（程序）与 `details`（UI，随工具消息持久化）；消息自身仍用 `content`。输入的 `entry: { kind, data }` 与内容原子持久化，排队期间位于 InboxDoc。
- 存储致命错误终止 Harness，`closed`/watch `session_failed` 通知结束；独立无效读取 StorageRequestError 只失败该请求，在 commit 中仍终止运行时。不重试 StorageRejected。
- 原生 read 统一文字/图片，上游 Photon 处理器负责工具读图；附件仍严格校验。listFiles 来自 pi-env LocalExecutionEnv，共享按需 Connection，关闭时释放；@ 补全不依赖 fd，缓存与刷新边界见升级 design D11。
- 以已安装的 1.3.0 类型为准，reference main 可含未发布修复（升级设计见 `openspec/changes/upgrade-pi-sdk-1-3/design.md`）。ConversationId 是数字 brand（ROOT = 1），未知 id 的 harness.conversation() 返回 undefined。
