# AGENTS.md

## 项目

neko-harness：基于 Pi 生态（pi-durable / pi-ai / chord 1.1.0，全部精确锁版本）的 agent harness monorepo。Node.js ≥ 22.19。设计决策见 `openspec/changes/bootstrap-neko-harness/design.md`。

## 常用命令

```bash
npm install                # 安装（建议加 --ignore-scripts）
npm run build              # tsc 构建全部 workspace 包
npm test                   # vitest run（根 vitest.config.ts，别名指向各包 src）
npm run check              # biome check . + tsc --noEmit
npm run check:write        # biome check --write . + tsc --noEmit
```

单个示例（需要 `DEEPSEEK_API_KEY`）：`npx tsx packages/core/examples/chat.ts`

## 约定

- TypeScript strict + `noUncheckedIndexedAccess` + `erasableSyntaxOnly` + `verbatimModuleSyntax`（`tsconfig.base.json`，风格参照 `reference/pi`）。
- 相对导入带 `.ts` 扩展名（`rewriteRelativeImportExtensions` 在构建时改写成 `.js`）；TS 运行用 tsx，构建用 tsc。
- Biome：tab 缩进、双引号、lineWidth 120（`biome.json`）。
- 上游 pi 依赖为实验性包：只升版本不裹代码，升级走显式 OpenSpec 变更；core/gateway 做薄封装隔离上游类型。
- 不要修改 `openspec/`（除非该变更本身要求）与 `reference/`（只读参考，已 gitignore）。
- 不要提交 lockfile 之外的意外文件；不主动 git commit。
- 真实 API key 只从环境变量读取，不打印、不落盘。

## pi-durable 使用要点（与 README 出入时以 `reference/pi/packages/durable/src` 为准）

- 每个异步调用都要 Chord `Context`；core 里默认 `BACKGROUND_CONTEXT`。
- 存储：`openNodeSqliteStorage(path)`（自动建父目录）或 `MemoryStorage`。
- 会话：`harness.root(context, { agent })` → `conversation.submit({ type: "input", content }, context)` → `submission.wait(context)`。
- 前端渲染数据源：`conversation.viewState(context)` / `conversation.watch(context)` / `watchEvents(harness, id, context)`。
- 用量：`harness.snapshot(UsageDoc, conversationId, context)` 或 `harness.usage(context)`（Session 总量）。
