# @neko-harness/gateway

本地会话网关：以 `@earendil-works/pi-server` 的宿主模型（`RoutedServerServiceHost` + `ServerHost` + `SessionRouter`）托管 core runtime 的全部持久会话，向多个前端提供统一的连接、attach 与服务路由（openspec/changes/bootstrap-neko-harness design D3）。

- **传输**：Unix socket（`@earendil-works/pi-server/unix`，TUI 等本地客户端）+ WebSocket（`ws` 适配为 pi 协议字节连接，浏览器/脚本）。两种传输跑完全相同的 pi 协议帧，上传同一份 neko 服务契约。
- **服务契约**（Chord 服务，见 `src/contract.ts`）：
  - 服务器级 `neko.session-directory`（目录复制状态订阅，创建/归档实时推送）+ `neko.session-management`（create/archive/attach/detach）；
  - 会话级 `neko.chat`（submit/abort/usage + `ChatView` 快照订阅，投影函数在 `@neko-harness/core`，与 web 共用）。
- **attach 语义**继承 pi-server：幂等 attach、服务端分配 attachmentId、断连在已受理调用结算后释放 attachment、重连 = 重新 attach + 取最新快照（不重放历史）。
- **单实例约束**：socket/端口被活跃实例占用时拒绝启动并提示如何连接；stale socket 自动识别接管（pi-server Unix listener 内建）。

## 用法

```ts
import { startGateway } from "@neko-harness/gateway";

const gateway = await startGateway({ port: 8321 }); // CLI > neko.config.json > 默认
// gateway.socketPath / gateway.wsUrl / gateway.serverId
```

独立启动：`bun --conditions=neko-source packages/gateway/src/main.ts [--port <n>] [--socket-path <path>] ...`（供 cli 的 `neko serve` 接入）。

Bun 宿主客户端（tui/脚本/测试复用）：`connectNekoGateway({ transport: "unix" | "ws", ... })`，见 `src/client.ts`。

## 上游耦合面

pi-server/pi-client/pi-protocol 均锁 1.1.0。升级时只需改动：宿主接线（`src/gateway.ts`）、provider/endpoint 模式（`src/server-services.ts`、`src/session-host.ts`）、客户端门面（`src/client.ts`）与 WS 字节适配（`src/ws-listener.ts`）。
