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

## DeepSeek 凭据与思考配置

未配置 Key 也可启动、浏览会话；发送前通过 TUI `/login` 或 Web 设置页配置。保存值位于宿主用户的 `~/.neko/credentials.json`（权限 `0600`），所有工作区共用，重启后保留；优先于网关进程的 `DEEPSEEK_API_KEY`，移除后回退环境变量。两端只显示配置状态和生效来源，不回显已有 Key；“已配置”不代表已通过远端认证。获取 Key：https://platform.deepseek.com/api_keys 。

默认新会话使用 DeepSeek V4.1 Flash + high，显式配置和已有会话保留自身设置。TUI `/model`、`/think` 与 Web 聊天区模型面板共用 Pi 1.1.0 能力：Flash 为 off/low/high/max，Pro 为 off/high/max。Flash low 切换到 Pro 时遵循 Pi 调整为 high。变更仅作用于当前会话后续请求，标题总结仍使用非思考模式。

`neko.credentials` 是无需 attach 的服务器级服务，提供脱敏状态订阅和 save/remove；持久化成功后发布 revision。Unix 与 WebSocket 使用同一服务。

宿主集成和隔离测试可通过 `credentialsPath` 或 `neko serve --credentials <path>` 指定凭据文件；默认仍为用户级共享路径。
