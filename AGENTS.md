# AGENTS.md

## 项目

neko-harness：基于 Pi 生态（pi-durable / pi-ai / chord 1.1.0，全部精确锁版本）的 agent harness monorepo。Bun 1.4.2。设计决策见 `openspec/changes/archive/2026-10-11-bootstrap-neko-harness/design.md`。

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

## pi-durable 使用要点（与 README 出入时以 `reference/pi/packages/durable/src` 为准）

- 每个异步调用都要 Chord `Context`；core 里默认 `BACKGROUND_CONTEXT`。
- 存储：`openNodeSqliteStorage(path)`（自动建父目录）或 `MemoryStorage`；一个存储同时只被一个 Harness 打开。
- 会话：`harness.root(context, { agent })` → `conversation.submit({ type: "input", content }, context)` → `submission.wait(context)`；同 `requestId` 重复提交幂等（含重开后）。
- 前端渲染数据源：`conversation.viewState(context)` / `conversation.watch(context)` / `watchEvents(harness, id, context)`。
- 用量：`harness.snapshot(UsageDoc, conversationId, context)` 或 `harness.usage(context)`（Session 总量）。
- 会话目录：宿主侧无 `scanConversations`，用 `harness.commit(tx => tx.scanConversations({}, n, undefined), context)`；无删除 API（core 用 `app.neko.conversation` 文档做软删除）。
- 会话级配置：`conversation.configure({ model, thinkingLevel }, context)` 单次提交生效，从下一次请求起使用；`conversation.agent(context)` 返回解析后的生效值（thinkingLevel 一定有值）。
- 扩展热替换：`registry.install(同名扩展)` 原地替换；已开始执行的工具调用沿原实现跑完，下一个 task phase/请求/调用才解析新代码（会话只存扩展名，重启后装回同名扩展即恢复）。
- 已安装 1.1.0 与 reference 源码（更新）有差异，以 node_modules 类型为准：`ToolExecutionResult` 字段是 `content`（源码已改名 `output`）；`SessionFailed`/`StorageRequestError` 在 1.1.0 运行时未导出（errors 模块只有 `ReadAfterWrite`/`StorageRejected`/`ConversationBusy`）；ConversationId 是数字 brand（ROOT = 1），未知 id 的 `harness.conversation()` 返回 undefined，但对未知 id 做 `snapshot` 会抛 TypeError。
