# Design

## Context

动机与产品范围见 [proposal.md](proposal.md)。本设计基于已安装 Pi 1.2.0 与当前实现复核，不依据 reference 中尚未发布的 API。

### 现有实现事实

- `packages/gateway/src/gateway.ts` 创建唯一 NekoRuntime/Chord host（`dev: true` 只启用 schema 校验，不是授权）。Unix/WS listener 在 `bindGateway` 中一次性启动，`NekoGateway` 只有 `close()`，没有运行中增删 listener 的接口；accept 时的 principal 只有 `{ connectionId }`。`serverId` 是身份标识，不是认证秘密。
- 本地 WS（默认 `127.0.0.1:8321`）不检查 Origin、无认证；浏览器任意页面理论上都能连到本机 WS。这是既有边界，本变更不修复，但**新增的管理能力不能只靠"本地连接"授权**。
- `client-session.ts` 的 `createGatewayConnection` 在 `ready()` 中绑定目录、管理、模型、工作区、文件、凭据、技能市场等全部服务，手机不能沿用。
- `session-host.ts` 的共享 `Projection` 在 gateway 内存中持有会话**全量**历史条目，每次变更以 `view.replace` 整体替换 `ChatView`（`items` 为全量数组，条目带稳定 `key`）。直接序列化给手机是无界的。子 agent 视图（`subagent-host.ts`）已经通过 `chunk`/`history(before)` 分块分页。
- `NekoChat.submit` 的 `whenBusy` 只接受 `steer | followUp`，缺省时 Pi 将忙碌期输入持久排入 `pi.inbox`；Web 从不传 `whenBusy`，TUI 忙碌时 Enter 为 `steer`。现有契约**不支持 `reject`**，任何前端都不会因忙碌而被拒绝。
- 去重：`submit` 已用 `tx.submissionByRequest(sessionId, requestId)` 识别重复请求，但契约中没有受理状态查询方法。
- 命令审批只存在于子 agent Bash（`ToolApproval.delegationTaskId`），由 `NekoSubagent.decideApproval({id, version, decision})` 决定；主会话视图只携带每个委派的 `approvalCount`。
- Chord 1.2.0 已提供 `memoryLinkPair()`、`host.accept(link, { principal })`、`HostOptions.principalKey` 与 `host.invalidatePrincipal(match)`（强制释放匹配 principal 的全部记录并关闭链路），足以承载"每台手机一个 principal、撤销即失效"。
- `packages/web/src/server.ts` 是独立静态 HTTP 进程，`/api/info` 只发现 WS；`ensureNekoGateway` 可能复用已有 gateway，也可能 spawn 子进程——**由 `neko web` spawn 的 gateway 会随 Web 进程退出而停止**。
- Biome/tsc 只覆盖 `packages/*`、`scripts/`；CI 为 ubuntu/macos 的 Bun 流程。

### 本机环境（2026-10-15 复核）

Flutter 3.47.7 stable（Dart 3.13.5），Android SDK 36（Flutter 默认 compileSdk/targetSdk 36、minSdk 24）；Xcode 未完整安装，与"本次只交付 Android"一致。

### 已完成的可行性验证（spike，未入库）

在 Bun 1.4.2 + `ws@8.22.0` + Dart 3.13.5 VM 上验证：

| 场景 | 结果 |
| --- | --- |
| `node-forge@1.4.0` + `node:crypto` 生成 RSA-2048 自签名证书 | 约 70 ms；DER SHA-256 与 `openssl x509 -fingerprint -sha256` 一致 |
| Bun `node:https.createServer` + `ws` `noServer` upgrade | HTTPS 与 WSS 均可用 |
| Dart `SecurityContext(withTrustedRoots:false)` + 指纹回调，HTTPS POST 与 `WebSocket.connect(customClient:)` 共用 | 正确证书连接成功，`response.certificate` 即 pin 的叶证书 |
| 错误自签名证书 / 被 pin 但已过期 / 伪造签发者为 pin 证书的攻击链 | 均在握手阶段拒绝，服务器未收到任何 HTTP 请求或头部（回调拿到的是攻击者叶证书） |
| 302 重定向 | `followRedirects=false` 下作为错误处理 |
| `selfsigned@5.5.0` / `@peculiar/x509@2.1.0` | 均依赖 `reflect-metadata` 全局 polyfill（`@peculiar/x509@2` 不自带时直接抛错），传递依赖约 20 个，弃用 |
| Flutter 3.47.7 新工程 + D1 全部依赖，`flutter build apk --release` | 移除 `permission_handler` 后在 compileSdk/targetSdk 36 上成功（首次自动安装 CMake 3.22.1）；未拆分 ABI 的 APK 约 61 MB，发布使用 `--split-per-abi` |

Android 真机 release 构建上的同一套验证仍是 M0 关口（Dart 在 Android 上同样使用内置 BoringSSL，不经过 Android Network Security Config，但必须实测）。

## Goals / Non-Goals

**Goals:**

- Flutter 通过少量稳定 JSON 接口控制既有会话，保持 Pi 的持久输入、观察和审批模型。
- 把信任、设备认证、方法授权与 attachment 生命周期分开验证，任何网络中断都不隐式停止电脑任务。
- 首版 Android 内部 APK 可独立安装；所有移动页面为原生 Flutter 界面，跨平台结构不绑定 Android 控件。
- 以里程碑关口推进：M0 真机链路 → M1 可用的主会话控制 → M2 子 agent/图片/完整体验。

**Non-Goals:**

- 不在 Dart 重写 Chord/Pi、不增加移动端 Agent 引擎、不引入第二个 Harness 或转录同步数据库。
- 不处理公网远程访问、云服务、后台常驻/推送和自动发现（mDNS）。首版需要可互通的局域网、电脑保持开机；iOS 交付另做变更。
- 不修复本地 WS 无 Origin 校验等既有本地边界；不改动任何既有 Chord 契约（含 `NekoChat`）。
- 手机 API 是受限控制入口，不是通用宿主管理接口或每个工作区的文件访问权限系统。
- 不提供 TUI/CLI 配对入口（只在 Web 设置）；仅使用 TUI 的用户可运行 `neko web` 复用同一 gateway 完成配对。

## Decisions

### D1. Flutter 原生客户端，Android 先交付

新增 `apps/mobile/`（Flutter 包名 `neko_mobile`，Android applicationId `dev.neko.harness.mobile`），独立 `pubspec.yaml`/`pubspec.lock`，不加入 Bun workspace、Biome、tsc 或 npm 包。保留 iOS 工程目录与平台适配接口，本次不承诺 iOS 签名、安装或真机证书兼容。

依赖精确锁版本（`pubspec.yaml` 写确切版本，不用 `^`）；以下为 2026-10-15 的候选，M0 真机验证通过后锁定，变更需在移动开发文档记录理由：

| 用途 | 包 | 版本 | 备注 |
| --- | --- | --- | --- |
| SDK | Flutter / Dart | 3.47.7 / 3.13.5 | `environment` 固定 |
| 路由 | `go_router` | 18.0.2 | 官方维护 |
| 状态 | `flutter_riverpod` | 3.4.3 | 连接、会话、草稿 provider；generation 由 provider 生命周期承载 |
| JSON-RPC | `json_rpc_2` | 4.1.0 | 仅消息封装 |
| WebSocket 适配 | `web_socket_channel` | 3.0.3 | `IOWebSocketChannel` 包装 `dart:io` WebSocket |
| 扫码 | `mobile_scanner` | 7.4.2 | 使用 bundled ML Kit 模型，不依赖 Google Play 服务 |
| 安全存储 | `flutter_secure_storage` | 11.2.0 | 设备凭据、未完成配对记录 |
| 普通持久 | `shared_preferences` | 2.5.6 | 草稿、待确认请求、最近选择（非秘密） |
| 系统设置跳转 | 自有 MethodChannel | — | 约 15 行 Kotlin 发 `ACTION_APPLICATION_DETAILS_SETTINGS`；不用 `permission_handler`（13.0.2 依赖的 `permission_handler_android` 14.1.0 要求 compileSdk 37，而 Flutter 3.47.7 默认与本机均为 36）。相机权限由 `mobile_scanner` 申请并报告拒绝 |
| Markdown | `flutter_markdown_plus` | 1.0.12 | `flutter_markdown` 已停止维护；禁用 HTML 与图片网络加载 |
| 哈希/随机 | `crypto` / `uuid` | 3.0.7 / 4.6.0 | 指纹、requestId |

UI 原生重建：相比 Capacitor 需要重新实现组件，但无需管理局域网页面、WebView 与系统浏览器的证书差异；相比 Dart Chord，薄 API 不把契约哈希、远程引用与复制协议带到移动端。

### D2. 一个 gateway，动态 HTTPS/WSS 移动入口

在 gateway 内新增 `MobileGateway` 控制器（`packages/gateway/src/mobile/`），由 `bindGateway` 创建并纳入 `NekoGateway.close()`；它拥有一个可在运行中启停的 `node:https` server：

- `POST /mobile/v1/pair`：配对（D4）。
- `GET /mobile/v1/ws`：在 `upgrade` 事件中先完成设备认证再 `handleUpgrade`；认证失败直接回 401 并销毁 socket，未认证连接永远进入不了 JSON-RPC。
- 其他路径一律 404；不托管 Web、不转发本地 Chord、不代理任意请求。

监听只绑定用户选择的**单个 IPv4 局域网地址**（不绑定 `0.0.0.0`，避免在其他网卡暴露配对端点），默认端口 8323，可修改；冲突或地址不存在时只让移动入口进入 `error` 状态并给出原因，不改端口、不影响本地传输。候选地址由 `os.networkInterfaces()` 过滤：IPv4、非 internal、排除 `169.254/16` 链路本地；二维码使用实际绑定的地址与端口。

入口状态机：`disabled → starting → listening | error`；`listening → stopping → disabled`。启用配置（enabled、address、port）持久化；gateway 启动时若 enabled 则尝试恢复，失败为 `error`，不阻断 gateway 启动。

关闭顺序：作废未兑换配对码 → 关闭全部移动 WS（每个连接 detach 并释放其 Chord 链路） → 关闭 HTTPS server。不关闭共享 runtime；证书与设备授权保留。`NekoGateway.close()` 先关移动入口，再执行原有关闭顺序。

生命周期边界：入口归属当前 gateway 进程。若 gateway 由 `neko web` spawn，则退出 Web 会连同 gateway 与移动入口一起停止，下次任一前端拉起 gateway 时按持久配置恢复；需要电脑长时间供手机使用时，文档建议使用 `neko serve` 或保持 TUI 运行。

### D3. 自签名证书与严格指纹绑定

**生成（gateway）**：首次启用时用 `node:crypto.generateKeyPairSync("rsa", { modulusLength: 2048 })` 生成密钥，用 `node-forge@1.4.0`（零依赖、纯 JS）构造并签名 X.509：SHA-256 签名、128-bit 正序列号、`basicConstraints cA=false`、`keyUsage digitalSignature+keyEncipherment`、`extKeyUsage serverAuth`、SAN 仅 `DNS:neko-<serverId 前 8 位>.invalid`（**不写 IP**，地址变化不需要换证书）、有效期 825 天。证书与私钥写入 `<数据目录>/mobile/tls/`，私钥 0600、目录 0700，原子写入；重启不重生成。Windows 使用当前用户数据目录的默认 ACL。

**校验（App）**：每台已配对电脑一个专用 `HttpClient`：

```dart
final client = HttpClient(context: SecurityContext(withTrustedRoots: false))
  ..findProxy = (_) => 'DIRECT'
  ..badCertificateCallback = (cert, host, port) =>
      host == pinnedHost && port == pinnedPort &&
      sha256.convert(cert.der).toString() == pinnedSha256 &&
      !now.isBefore(cert.startValidity) && !now.isAfter(cert.endValidity);
```

配对 POST 与 `WebSocket.connect(url, headers:{authorization}, customClient: client)` 共用该客户端，所有请求 `followRedirects = false`，只允许 `https`/`wss`，凭据仅放在请求头/请求体。关闭系统根信任后，任何证书都会进入回调，而回调只放行精确匹配的 DER；TLS 握手本身证明对端持有对应私钥。不能在保留系统根证书的客户端上加回调（系统信任的另一张证书会绕过回调）。spike 已证明攻击者链会让回调拿到攻击者叶证书而被拒绝；Android 真机必须复测同一组用例。

**变更**：局域网地址变化通过重新扫码更新地址（serverId 与指纹一致时沿用原授权）；指纹不同必须重新配对，不以相同 IP 或名称替换信任。证书到期前 30 天在 Web 配对页提示；「重新生成证书」是本机管理动作，会断开全部手机并撤销全部设备授权（电脑任务继续），之后需重新扫码。

### D4. 配对：手机生成凭据，兑换幂等

**二维码文本**（亦可在 Web 上复制为文本，App 支持粘贴作为相机不可用时的备用入口）：

```
nekopair:1:<base64url(UTF-8 JSON)>
JSON = { "v":1, "sid":"<serverId>", "name":"<电脑显示名≤64>", "ep":"https://192.168.1.20:8323",
         "fp":"<证书 DER SHA-256 小写 hex>", "code":"<32 字节随机 base64url>", "exp":<unix ms> }
```

不包含长期 token、URL 查询参数或模型密钥。App 校验前缀、版本、`ep` 必须是 `https` + IPv4 字面量 + 端口、`exp` 未过期，否则区分「非法」「过期」「不支持的版本」。

**配对码**：默认 120 秒，刷新即作废旧码，同一时刻只有一个有效码；只在 gateway 内存保存（码的 SHA-256、到期时间、消费状态），gateway 重启作废未兑换码。

**流程**：

1. 用户在电脑 Web 生成二维码；App 扫码、展示电脑名称，用户确认连接。
2. App 生成 `deviceId`（UUIDv4，App 安装期间稳定）、`pairRequestId`（UUIDv4）和 32 字节安全随机 `credential`，**先**写入安全存储作为未完成配对记录。
3. D3 校验通过后 `POST /mobile/v1/pair`（请求体 ≤ 4 KiB）：`{ v, sid, code, pairRequestId, deviceId, deviceName, credential }`。
4. 服务端串行处理：校验 `sid`、码哈希、到期；原子消费码，写入设备记录 `{ deviceId, name, credentialHash = SHA-256(credential), grantRevision, pairedAt, lastSeenAt }` 与配对回执 `{ pairRequestId, deviceId, credentialHash, grantRevision, expiresAt = now + 10 min }`，持久化成功后才返回 `200 { serverId, serverName, deviceId, grantRevision, apiVersions: [1] }`。凭据明文不落盘、不进日志。
5. 响应丢失时，App 以相同 `pairRequestId`/`deviceId`/`credential` 重试：回执命中且哈希一致 → 返回原结果（含 gateway 重启后，回执已持久化）；其他请求兑换已消费码 → `409 code_used`；过期 → `410 code_expired`；10 分钟恢复窗口外 → 提示重新扫码。同一 `deviceId` 重新配对替换旧凭据并递增 `grantRevision`，旧连接被 `invalidatePrincipal` 关闭，不产生重复设备。
6. 状态码：`400 invalid`、`403 wrong_server`、`409 code_used`、`410 code_expired`、`413`、`429 rate_limited`（配对端点每来源 IP 每分钟 10 次、全局在途 ≤ 4）。错误体只含稳定 `code` 与简短 `message`，不回显请求字段。

**认证**：WSS upgrade 头 `Authorization: Neko-Device <deviceId>.<base64url credential>`；服务端按 `deviceId` 查记录，`timingSafeEqual(SHA-256(credential), credentialHash)`；失败计数每来源 IP 每分钟 20 次后 429。凭据为 256-bit 随机值，单次 SHA-256 即可，无需慢哈希。

选择手机生成凭据，是为了避免"电脑消费一次性码并只存 token 哈希，兑换响应丢失后手机永远取不到 token"的问题。App「忘记电脑」只删本地凭据并关闭连接；电脑侧授权须在电脑撤销。

### D5. 本机管理单独授权，不向浏览器发布秘密

**gateway 侧**：新增 `NekoMobileAdmin` Chord 契约（`neko.mobile-admin` v1），**不加入** `createGatewayConnection`。契约 input 为 `{ token: string }`；factory 中：

- `principal.kind === "mobile"` 一律 `forbidden`（双保险；手机 JSON-RPC 白名单本身也无法命名该契约）；
- `timingSafeEqual(SHA-256(token), SHA-256(adminToken))`，失败 `forbidden` 且不回显 input；
- `adminToken` 为 32 字节随机值，存 `<数据目录>/mobile/admin-token`（0600），gateway 首次需要时生成。

方法：`state`（入口状态、候选地址、端口、证书指纹与到期、设备列表含在线状态/最后连接时间）、`enable({address, port})`、`disable()`、`createPairing()`→二维码文本与到期时间、`cancelPairing()`、`revoke({deviceId})`、`regenerateCertificate()`。所有写方法经同一串行队列。

**Web 侧**：Web Node 进程读取 `admin-token`，经 Unix socket（POSIX）或本机 WS（Windows）以服务端专用客户端连接 gateway；浏览器永远拿不到该 token。`server.ts` 新增 `/api/mobile/*` 同源代理：

| 路由 | 说明 |
| --- | --- |
| `GET /api/mobile/session` | 返回本页 CSRF token（随机，绑定 Web 进程生命周期）与 `supported` |
| `GET /api/mobile/state` | 代理 `state` |
| `POST /api/mobile/{enable,disable,pairing,pairing/cancel,revoke,certificate/regenerate}` | 写操作 |

每个请求检查：`request.socket.remoteAddress` 为回环；`Host` 等于 Web 实际监听的 `127.0.0.1:<port>`/`localhost:<port>`/`[::1]:<port>`（防 DNS rebinding）；有 `Origin` 时必须同源，`Sec-Fetch-Site` 存在时必须为 `same-origin`；写请求必须带 `X-Neko-CSRF` 且常量时间相等、`Content-Type: application/json`、体 ≤ 4 KiB。不发送 CORS 头，不读 `X-Forwarded-*`。`neko web --host 0.0.0.0` 时远端访问管理路由一律 403，页面显示「请在电脑本机打开」。

旧 gateway（无 `neko.mobile-admin`）时代理返回 `501 { code: "gateway_unsupported" }`，页面提示更新/重启电脑端，聊天不受影响。持有用户数据目录读权限的本机进程属于既有电脑用户信任边界，本变更不重做本地接口身份系统。

### D6. 薄移动 API：JSON-RPC 适配复用既有服务

**连接内结构**：每个手机 WSS 连接在 gateway 内建立：

1. `memoryLinkPair()`；`chord.accept(serverEnd, { principal: { connectionId, kind: "mobile", deviceId, grantRevision } })`。
2. 客户端侧 `createHost({ kind: "client", upstream: clientEnd })`，**只** `get` `NekoSessionDirectory`、`NekoWorkspaces`、`NekoSessionManagement`（仅用 create/attach/detach）、`NekoChat`、`NekoSubagent`。不 get 凭据、模型配置、技能市场、文件、管理契约。
3. 一个 JSON-RPC 2.0 分发器把白名单方法映射到上述 handle；参数先经 TypeBox 校验。

这样主/子观察、owner/attachment 检查、提交与停止全部沿用现有 host 实现。撤销时 `chord.invalidatePrincipal({ deviceId })` 释放该设备全部记录并关闭链路，再关闭 WS。只读且现有契约未暴露的查询（受理状态、审批列表）由适配层在校验 attachment 归属后直接读 runtime：`conversation.commit(tx => tx.submissionByRequest(...))`、`runtime.approvals.list(sessionId)`；**不修改任何既有契约**。

**握手**：连接后第一个请求必须是 `server.hello { apiVersions:[1], app:{ version, platform, build } }`，结果：

```json
{ "apiVersion":1, "serverId":"…", "serverName":"…", "gatewayVersion":"0.3.x",
  "capabilities":["sessions","chat","subagents","approvals","media"],
  "limits":{ "maxFrameBytes":262144, "maxPayloadBytes":131072, "pageItems":50,
             "chunkBytes":65536, "maxConcurrentRequests":8, "maxSendBufferBytes":2097152 } }
```

无交集版本返回错误 `incompatible { needs: "app" | "computer" }` 并关闭；hello 前调用其他方法即关闭。产品版本差异本身不拒绝。

**v1 方法白名单**（结果与通知 schema 在协议文档与 fixtures 固定）：

| 组 | 方法 / 通知 | 复用 |
| --- | --- | --- |
| server | `server.hello` | — |
| workspaces | `workspaces.list`；通知 `workspaces.changed` | `NekoWorkspaces.state` |
| sessions | `sessions.list {workspace, query?, cursor?}`、`sessions.create {workspace}`；通知 `sessions.changed {revision}` | `NekoSessionDirectory` / `NekoSessionManagement.create`（`cwd` 必须是已登记工作区） |
| chat | `chat.attach {sessionId}`→`{subscriptionId, snapshot}`、`chat.detach`、`chat.history {before, limit}`、`chat.content {ref, offset}`、`chat.submit {requestId, text, mode?}`、`chat.submissionStatus {requestId}`、`chat.abort`；通知 `chat.patch`、`chat.reset` | `NekoChat` |
| subagents | `subagents.open {taskId}`→快照、`subagents.history`、`subagents.close`、`subagents.stop {taskId}`；通知 `subagents.patch` | `NekoSubagent` chunk/history/stop |
| approvals | `approvals.list`、`approvals.get {id}`、`approvals.decide {taskId, id, version, decision}`；通知 `approvals.changed` | `runtime.approvals.list` + `NekoSubagent.decideApproval` |
| media | `media.read {owner:{sessionId, taskId?}, entryId, contentIndex, offset}` | `NekoChat.getImage` / `NekoSubagent.getImage`，按 64 KiB 重切 |

不提供：通用方法转发、任意路径、宿主目录浏览、新增/删除工作区、归档/分叉、模型与思考强度修改、凭据、技能、job、压缩、上传、升级、配对管理。会话列表保持全局目录语义，由服务端按工作区过滤与分页；这不是每设备工作区 ACL。新会话使用电脑默认模型。

**提交语义（修正）**：`chat.submit` 透传 `requestId` 与文字到 `NekoChat.submit`；`mode` 只允许缺省（与 Web 相同：忙碌时由 Pi 持久排队）或 `steer`。忙碌**不是拒绝**；结果为 `{ accepted: true, queued: boolean }`，`queued` 由提交时视图 `busy` 推断。真正的拒绝只来自参数校验、会话失效、凭据缺失等电脑端错误，并原样返回原因。JSON-RPC `id` 只对应连接内响应，业务幂等完全依赖持久 `requestId`。`chat.submissionStatus` 返回 `accepted | unknown`（Pi 无记录即 `unknown`，不推断为失败）。

**错误**：JSON-RPC `error.data.code` 为稳定枚举：`unauthorized`、`revoked`、`incompatible`、`invalid_params`、`not_found`、`gone`（attachment/会话/轮次失效）、`stale_ref`、`content_changed`、`busy_limit`（并发超限）、`internal`。内部异常只返回 `internal` 与关联 id，详情只进 gateway 日志并脱敏。

### D7. 授权撤销与已受理操作分界

认证时与每次业务方法分发前检查设备记录存在且 `grantRevision` 未变；对 `chat.submit`、`approvals.decide`、`subagents.stop`、`chat.abort`，在调用底层服务前再次检查。撤销流程：持久删除设备记录 → `invalidatePrincipal({ deviceId })` → 关闭 WS（close code 4401 `revoked`）。已进入 `NekoChat.submit`/`decideApproval` 的请求按 Pi 语义结算，撤销不是取消或回滚；之后到达的请求失败。断线只释放该连接的观察与查询，已受理回答、子任务、待决审批继续存在，由电脑或其他设备处理。显式 abort/stop 仍走原生 API 并校验 attachment/活动轮；socket 关闭从不映射为 abort。

### D8. 有界快照、历史与内容

**主会话映射**：适配层订阅共享 `ChatView`（gateway 内存中的同一对象，不复制全量历史），对每个连接维护：

- `window`：手机已加载区间的条目 `key → digest`（digest 为条目 JSON 的 SHA-256 前 16 hex，仅用于变更检测），仅限已加载条目；
- `seq`：每个订阅单调递增序号；`subscriptionId` 与 attach 绑定。

`chat.attach` 返回快照：状态字段（busy、status、usage、taskUsage、contextUsage、agent、subagents 摘要含 approvalCount、compaction 摘要）+ 尾部最多 50 个 `ChatItem`（受 128 KiB payload 约束，不足 50 则更少）+ `historyBefore` 游标（第一个返回条目的 `key`）。`chat.history {before:key}` 在当前 items 中定位该 key，返回之前最多 50 个；key 不存在返回 `stale_ref`，App 重新 attach。

视图变化时计算增量：窗口内 digest 变化或新增的条目以 `upsert` 发送；窗口内 key 消失或顺序改变则发送 `chat.reset`（App 丢弃并重新 attach）。`streaming` 对每连接记录已发送文本，新值以旧值为前缀时只发 `append`，否则整段替换。状态与流式更新按连接合并，最短间隔 100 ms；请求响应永不丢弃。

**大字段**：条目内单个字符串字段（user/assistant 的 text、thinking，tool 的 detail/output/result/diff）UTF-8 超过 8 KiB 时替换为 `{ preview: 前 2 KiB, ref: { sessionId, key, field, digest, bytes } }`；`chat.content {ref, offset}` 返回该字段 UTF-8 字节的 base64 分块（≤ 64 KiB 原始字节）；digest 不符返回 `content_changed`，App 重新取条目。工具原有截断标记、`diffTruncated`、`note` 原样保留，contentRef 不是截断。子 agent 内容采用同一 DTO 与规则，数据来自 `NekoSubagent` 的 chunk 组装与 `history(before)`。

**传输边界**：单帧 ≤ 256 KiB（`ws` `maxPayload` 同值），业务 payload ≤ 128 KiB（含 base64/JSON 实测），每连接在途请求 ≤ 8（超出返回 `busy_limit`），发送缓冲（`bufferedAmount` + 待发队列）> 2 MiB 时关闭连接（close 4408），App 重连后取最新快照。限制随握手公布。图片仅在条目中携带描述（name、mimeType、尺寸、entryId、contentIndex），数据经 `media.read` 按需读取，读取前校验所属主/子会话。设备撤销同时使在途分块读取失败。

### D9. 手机连接、草稿与提交恢复

App 连接状态：`scanning / pairing / connecting / restoring / ready / offline / revoked / trustChanged / incompatible / permissionNeeded`。可恢复网络错误采用 1 s 起、×2、上限 30 s、±20% 抖动的退避；回到前台立即重试并重新 attach。`revoked`（401/4401）、`trustChanged`（握手证书不匹配）、`incompatible` 停止自动重试并给出操作。不承诺后台长驻或推送。

草稿按 `serverId/sessionId` 隔离存于 `shared_preferences`；不缓存会话内容。发送：生成 `requestId` → 持久写入待确认记录 `{requestId, sessionId, text, createdAt}` → `chat.submit` → 收到 `accepted` 后删除记录并仅清除与该次发送原文相同的草稿内容（用户期间继续编辑的内容保留）。重启或重连后对每条待确认记录先调用 `chat.submissionStatus`：`accepted` 即结算；`unknown` 保留为「待确认」，只允许用户以原 `requestId`/原文重试或放弃。不自动执行离线发送、停止或审批。

App 同一时刻只维护一个活动电脑连接；切换电脑显式进行，状态与草稿按电脑隔离。所有异步回调携带 `(connectionGeneration, subscriptionId)`，不匹配即丢弃。

### D10. 原生 UI 延续风格，审批不依赖子详情

从 Web `styles.css` 提取浅色/深色语义 tokens（背景、表面、主色蓝/粉、文字层级、边框、成功/警告/错误、代码背景、圆角、间距）映射为 Flutter `ThemeExtension<NekoTokens>`，支持自动/浅色/深色。单列主内容；工作区/会话为导航抽屉 + 独立列表页；子 agent 为可返回的全屏详情。

主/子内容共用组件：Markdown（`flutter_markdown_plus`，禁用 HTML，代码块独立横向滚动）、思考折叠、工具卡（参数/结果/diff/错误/截断标记）、图片缩略与全屏预览、错误/系统条目。列表用 `CustomScrollView` + 反向锚点实现 prepend 不跳动与「回到底部」。主总用量用电脑的去重结果，子详情显示累计与已确认轮次用量，不自行加总。

审批：顶部/输入区上方显示当前主会话 pending 审批数量条，点开为底部面板，列出所有子 agent 的待决请求，可完整滚动查看命令、目录、显式超时，选择「允许本次」「拒绝」。子详情底部复用同一面板。已结算项立即移除；收到新请求不切页、不夺焦点。

### D11. 平台权限与交付

- `android/app/src/main/AndroidManifest.xml`（main，不只是 debug/profile）声明 `INTERNET`、`CAMERA`；声明 `ACCESS_LOCAL_NETWORK` 为后续 target 37 预留但**本次 targetSdk 固定为 36**，不在运行时请求（API 36 及以下对局域网为隐式访问）。提升到 37 需要单独变更并加入运行时请求与超时提示。
- `android:allowBackup="false"` 并配置 `dataExtractionRules` 排除全部数据：Keystore 密钥不随备份迁移，恢复到新设备的凭据不可用，与其产生解密失败不如不备份。
- `mobile_scanner` 使用 bundled 模型，无 Google Play 服务的设备也能扫码；相机被拒时提供跳转系统设置与「粘贴配对文本」备用入口。
- Release 签名：`android/key.properties` 与 keystore 由本机/CI secret 提供并加入 `.gitignore`；CI 无签名资料时只构建 debug 签名的 release 变体用于编译验证，不发布产物。内部分发使用 `flutter build apk --release --split-per-abi` 的 `arm64-v8a` 产物。
- 依赖引入前检查其 Android 插件要求的 compileSdk；需要高于 36 的依赖须替换或单独评估，不随手抬高 SDK 要求。
- iOS：保留 `NSCameraUsageDescription`、`NSLocalNetworkUsageDescription` 文案与目录，不承诺构建。
- CI：新增 `.github/workflows/mobile.yml`（ubuntu-latest，路径过滤 `apps/mobile/**` 与协议 fixtures），Flutter 3.47.7 固定，执行 `dart format --set-exit-if-changed`、`flutter analyze`、`flutter test`、`flutter build apk --release`；不改动既有 Bun CI，不新增 Windows runner。
- 文档：README 只加最终用户安装、同网扫码、常见恢复；`apps/mobile/README.md` 写开发构建、依赖理由与复现命令；`docs/mobile-api-v1.md`（新增）写协议。

### D12. 代码组织

```
packages/gateway/src/mobile/
  store.ts          # <数据目录>/mobile/state.json（版本化）+ tls/ + admin-token；串行原子写
  certificate.ts    # node-forge 证书生成、指纹、到期
  listener.ts       # node:https + ws noServer，动态启停、地址枚举
  pairing.ts        # 配对码、兑换/回执、限速
  auth.ts           # Authorization 解析、哈希比较、principal
  protocol.ts       # TypeBox schemas、错误码、限制常量（MOBILE_LIMITS）
  adapter.ts        # 每连接 Chord 客户端 + JSON-RPC 分发
  projection.ts     # ChatView → 移动 DTO：窗口、digest、contentRef、streaming append
  admin.ts          # NekoMobileAdmin 契约与服务
packages/gateway/test/mobile/*.test.ts
packages/gateway/test/fixtures/mobile-api-v1/*.json   # TS 与 Dart 共用
packages/web/src/mobile-admin.ts                       # 同源代理与 CSRF
packages/web/src/client/pages/settings-page.tsx        # 新增「手机配对」分区（+ components/mobile-pairing.tsx）
apps/mobile/lib/{core/{net,rpc,pairing,storage},features/{connect,workspaces,sessions,chat,subagents,approvals},ui/theme}
docs/mobile-api-v1.md
```

新增 npm 依赖：gateway `node-forge@1.4.0`（+ dev `@types/node-forge@1.3.14`）；web 客户端 `qrcode-generator@2.0.4`（零依赖，浏览器端渲染二维码 SVG）。不升级 Pi。

## Risks / Trade-offs

- [自签名回调误用导致绕过 pin] → 禁用系统根信任、专用 HttpClient、DER+有效期+host/port 检查；M0 在 Android release 真机复测 spike 的全部负面用例，并在 Dart 单测中固化。
- [二维码暴露即允许首次授权] → 仅本机主动展示，120 秒一次性随机码、刷新作废、原子消费、限速；Web 显示设备并可撤销；二维码不进入持久聊天/日志。
- [手机可借主 Agent 调用电脑工具] → 开关文案明确为「允许手机控制电脑上的 Agent」，沿用现有工具与审批权限；不把移动 RPC 白名单声称为文件系统沙箱。
- [本地 WS 无 Origin 校验] → 既有问题不在本变更修复；管理能力依赖 admin token 而非"本地连接"，浏览器拿不到 token。
- [共享投影全量历史 + 每次整体替换] → 适配层只对已加载窗口做 digest 比较，O(窗口) 而非 O(全量)；长会话性能纳入 M1 测试（≥ 2000 条目）。
- [Android 设备差异：无 GMS、厂商省电杀后台、访客隔离 Wi-Fi、macOS 防火墙弹窗拦截 Bun] → bundled 扫码模型；前台恢复；错误页区分「网络不可达」与「授权/信任」，并提示检查防火墙/同网。
- [Web spawn 的 gateway 随 Web 退出] → 文档与配对页说明；配置持久恢复。
- [Flutter 与 Web 组件无法共享] → 共享协议 fixtures 和视觉 tokens 语义。
- [Android 与 iOS 证书/权限差异] → 本次只交付 Android，iOS 单独验收。

## Migration Plan

里程碑与关口（每个关口不过不进入下一阶段）：

1. **M0 链路关口**：gateway 证书/入口/配对/认证最小实现 + App 最小扫码/配对/WSS hello；Android 真机 release 通过 D3 全部正/负用例、相机拒绝、后台返回、App 与 gateway 重启后重连。记录设备型号、Android 版本、Flutter/Bun 版本。
2. **M1 主会话控制**：Web 配对管理、移动 API（workspaces/sessions/chat/approvals）、App 工作区/会话/聊天/草稿/审批；可日常使用。
3. **M2 完整体验**：子 agent 详情、图片、contentRef 长内容、无障碍与主题打磨、CI 与签名、最终验收文档。

数据：新增 `<数据目录>/mobile/`（`state.json` 含 `formatVersion: 1`），不迁移会话 SQLite。既有契约不变；新 Web 连旧 gateway 显示不支持提示。回退：电脑关闭手机入口即可；旧版本不读取 `mobile/` 目录，残留文件不会开启监听。任何回退或断线都不隐式停止任务。

## References

- [Dart SecurityContext](https://api.dart.dev/dart-io/SecurityContext/SecurityContext.html)、[badCertificateCallback](https://api.dart.dev/dart-io/HttpClient/badCertificateCallback.html)、[WebSocket.connect customClient](https://api.dart.dev/dart-io/WebSocket/connect.html)
- [JSON-RPC 2.0](https://www.jsonrpc.org/specification)、[json_rpc_2](https://pub.dev/packages/json_rpc_2)
- [node-forge](https://github.com/digitalbazaar/forge)、[qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator)
- [mobile_scanner](https://pub.dev/packages/mobile_scanner)、[flutter_secure_storage](https://pub.dev/packages/flutter_secure_storage)、[flutter_markdown_plus](https://pub.dev/packages/flutter_markdown_plus)
- [Android 局域网权限](https://developer.android.com/privacy-and-security/local-network-permission)、[Apple 局域网隐私 TN3179](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy)
