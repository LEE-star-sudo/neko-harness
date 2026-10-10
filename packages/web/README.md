# @neko-harness/web

浏览器前端（React 19 + Vite + Tailwind CSS v4 + TanStack Query/Router，design.md D7）+ 静态托管与网关发现服务器。v1 后迁移为**浏览器直连 gateway WebSocket**（pi 协议帧，design D3），本包不再内置 runtime/自定义 JSON 协议。

## 结构

**服务器侧（Node，仅静态托管 + 网关发现）：**

- `src/server.ts` — `startWebServer(options)`：确保 gateway 运行 + 静态托管 `dist/client` + `GET /api/info`（返回 `{ gatewayWs, serverId, socketPath }`）。
- `src/gateway-spawn.ts` — `ensureNekoGateway(options)`：serverId/socket 确定后在 Unix socket 上探活（pi 握手 + 服务绑定，复用 gateway 的 `connectNekoGateway`）；不通则 spawn `tsx packages/gateway/src/main.ts` 子进程并轮询探活。socket 存在即复用既有网关（不 spawn 不代管）。
- `src/main.ts` — CLI：`npx tsx packages/web/src/main.ts [--port 8322] [--gateway-port 8321] [--storage <path>] [--socket-path <path>] [--cwd <dir>] [--model <ref>]`。

**客户端（`src/client/`，浏览器直连 pi 协议）：**

- `lib/contract.ts` — neko 服务契约的浏览器镜像（与 `packages/gateway/src/contract.ts` 同服务 id；网关包带 node 依赖不能进 bundle，类型全部 `import type` 擦除）。
- `lib/transport.ts` — `createBrowserWsTransportFactory(url)`：浏览器 WebSocket binary → pi-server 有序字节连接；帧封送（4 字节长度前缀 + CBOR）由 pi-client 内部完成，本层只搬运字节。
- `lib/gateway.ts` — `GatewayConnection`：`Client.connect`（serverId 校验）→ 目录订阅 + 会话管理 → attach → `NekoChat.view` 订阅；断线指数退避重连（800ms→8s），重连 = 重新 attach 取最新快照（D4，不重放历史）。
- `lib/store.ts` / `lib/bootstrap.ts` — useSyncExternalStore 外部 store + 事件接线；组件经 `appActions` 提交/中止/切换/新建/归档。
- `components/` — 聊天页（气泡、Markdown 消毒渲染 + 代码块高亮、工具卡片、thinking 折叠）、`session-list.tsx` 会话侧栏（目录实时、当前高亮、两步归档确认）、TopBar/StatusBar/Composer。
- `pages/` — 聊天页（`/`，含会话管理）与设置页（`/settings`，网关信息 stub）。

## 构建与运行

```bash
npm run build --workspace @neko-harness/web   # tsc 服务端 → dist/ + vite 客户端 → dist/client/
npx tsx packages/web/src/main.ts              # 起静态服务（自动 spawn gateway）
```

需要 `DEEPSEEK_API_KEY`。浏览器访问打印的地址（默认 http://127.0.0.1:8322）。
