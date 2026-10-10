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

## 工作区语义

`neko tui --cwd <directory>` 使用指定目录作为工作区；省略该参数时使用启动目录。路径会解析为实际目录的绝对路径，不会将子目录提升到 Git 根目录。会话持久化保存工作区，分叉会话继承该工作区；从其他目录重启网关不会改变已有会话的工作区。read、write、edit 和 bash 默认使用保存的工作区。工作区不是沙箱：在宿主权限允许的范围内，仍可通过显式路径访问其他目录。

TUI 只列出当前工作区的会话，并恢复最近激活或提交过输入的会话。共享网关和 Web 保留全局会话目录。工作区目录不存在时会明确报错，不会回退到网关目录。不支持未保存绝对工作区路径的旧会话存储，需要使用新的存储路径；应用不会自动删除或迁移旧数据。

## 工作区目录服务

`neko.workspaces` 提供独立工作区复制状态、`add({ path })` 与 `browse({ path, query?, showHidden?, cursor? })`；宿主客户端可通过 `client.workspaces` 使用。添加按真实路径去重，空工作区不会随会话归档而消失。目录浏览仅列宿主单层文件夹，默认隐藏点号目录，每页最多 100 项；返回真实路径、父目录、子目录及下一页 cursor，筛选条件变化后应重新分页。浏览不上传文件、不修改宿主目录，仍沿用本地可信网关边界。

## 标题与活动目录

`neko.session-directory` 每个会话包含 `title`、`firstPromptPreview`、`createdAt`、`lastMessageAt`（空会话为 null）、`model`、`status`（idle/running/error），保留 `workspaceRoot` 与用于恢复选择的 `lastUsedAt`。Unix socket 和 WebSocket 使用相同字段。输入受理、回答完成、模型及运行状态改变、后台命名完成都会串行刷新目录；即使没有客户端 attach 该会话也会广播，流式 token 不逐个刷新目录。重连获取完整最新快照。聊天用量投影同步包含独立命名费用。

本次契约要求前后端共同升级，不提供旧客户端兼容或历史元数据回填。
