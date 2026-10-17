# 实施与验证记录

日期：2026-10-17。仓库与生产 tarball 均使用 Pi/Chord 1.3.0（chord、pi-ai、pi-durable、pi-env、pi-tui 精确锁定）；Bun 1.4.2；typebox 1.3.27。未提交、未发版、未同步主规格或归档。

## 基线与结果

- 1.2.0 基线：`bun run check` 通过（5 个既有 info），`bun run test` 782 pass / 0 fail。
- 1.3.0：`bun run check` 退出 0，`bun run build` 通过，`bun run test` 790 pass / 0 fail（新增 8 个：身份不一致、状态重投递、协议版本 3 个、Pi 1.3 验收 2 个、压缩基线、TUI 旧协议网关）；`bun install --frozen-lockfile` 通过，依赖图只有一份 chord 1.3.0，无旧通信包。
- `bun run build:release` + `bun run test:package`：生产 tarball 安装后 SDK 冒烟通过，随包 pi-env helper 版本为 1.3.0。

## 迁移要点

- 契约：保留 `contract()`/`rpc()` 元组封装并补 `host: hostNamed("neko")`（Chord 未导出 `MethodSpec`，否则声明输出报 TS2883）；`Handle`→`Ref`，`kind`→`variant`，`self.state/resource/on` 按名声明，`eager`→`lifetime: "host"`，删除 `{ at }` 与 `waitForValue`。
- 身份：host 名固定，`serverId` 经 `NekoApplicationInfo` 校验（客户端 `ready()` 与管理客户端），`identifiedLink` 删除。
- 链路：服务端 WebSocket `acceptPacked: false`；Bun 下 `ws` 经 `addEventListener` 把文本帧交成 Buffer，Chord 1.3 会误判为压缩帧，有界链路改用 `on("message", (data, isBinary))`。
- 协议：Pi 1.2 对端因握手无法解析而 `protocol error` 关闭，客户端与协议版本不匹配一并报告为 `ApplicationProtocolError`，`ready()` 在链路关闭时立即失败。
- 类型：新增 `GatewayPrincipal`（`principal.ts`），`createClientHost` 统一创建客户端 host。

## 取舍

- 不采用 `maxCalls`、`linger`、`init` 状态、`SqliteStorage` 前缀、链路压缩；`core/jobs.ts` 的 `OutputBuffer` 与 `chord/output` 语义不等价，保留。
- 旧数据按测试数据丢弃：只删除 `~/.neko/neko.sqlite` 及 `-wal`/`-shm`（无进程持有、无遗留 socket/port），凭据、serverId、移动配对与更新检查文件保留；未加入启动自动删库逻辑。新启动的 1.3 存储创建根会话，停止后重启可恢复。

## 手动验证

- `bun run neko serve`：Unix socket 与 WebSocket 同时可用，错误 serverId 被拒绝，重启后会话保留。
- `bun run neko web`：Playwright 打开页面显示"已连接"、会话列表正常，浏览器控制台无错误。
- 未做：Windows 与真实手机端配对（无对应环境）；`neko tui` 交互界面仅有自动化测试覆盖。
