# @neko-harness/web

浏览器前端（React 19 + Vite + Tailwind CSS v4 + TanStack Query/Router，design.md D7）与单进程 Web 服务器。

## 结构

- `src/server.ts` — `startWebServer(options)`：Node 内置 http 托管 Vite 产物（`dist/client`）+ `/api/info`，`ws` 包提供 `/ws` 端点桥接 core runtime（v1 单会话：root conversation）。每次 commit 把 `viewState` 投影成 `ChatView` 快照广播（design D4，无事件重放，重连即取最新快照）。
- `src/main.ts` — CLI 入口：`npx tsx packages/web/src/main.ts [--port 8321] [--host 127.0.0.1] [--cwd <dir>] [--model provider/modelId] [--storage <sqlite路径>]`（cli 包后续接 `neko web`）。
- `src/protocol.ts` — WebSocket 协议类型（client→server：`submit` / `abort`；server→client：`hello` / `snapshot` / `notice`）与 `ChatView` 投影类型。
- `src/project.ts` — `ConversationView`（pi.user / pi.assistant / pi.tool-result / pi.compaction / pi.reset + `pi.live` / `pi.usage`）→ `ChatView` 投影。
- `src/format.ts` — 工具参数摘要、用量汇总等纯函数（与 tui 同源）。
- `src/client/` — React 应用：聊天页（消息气泡、Markdown 渲染 marked + DOMPurify 消毒、工具卡片、thinking 折叠、Enter 发送 / Shift+Enter 换行、忙碌中止、断线自动重连、回到底部）+ 设置页 stub。
- `src/client/styles.css` — 浅色二次元主题 tokens（sakura/tianyi/ink OKLCH scale、柔和投影、大圆角、`color-scheme: light`）。

## 构建

```bash
npm run build --workspace @neko-harness/web   # tsc 服务端产物 → dist/ + vite 客户端 → dist/client/
```

## 服务器

需要 `DEEPSEEK_API_KEY`。启动后浏览器访问打印的地址（默认 http://127.0.0.1:8321）。
