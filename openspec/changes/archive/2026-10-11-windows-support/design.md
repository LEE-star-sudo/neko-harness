# Design

## Context

网关当前以 Unix socket 为唯一本机传输（`packages/gateway/src/gateway.ts:81-84` 默认 socketPath，`:132-134` 无条件 `createUnixListener`）。上游 pi-server 1.1.0 的 Unix listener 是纯 POSIX 实现（`lstat`/`link`/dev-ino 身份比对，仅 chmod 跳过 win32），Windows 上必崩；pi-client 1.1.0 在 win32 显式拒绝 Unix 传输。上游 main 分支无修复迹象，按 AGENTS.md 约定适配落在 neko 自身。

已有有利接缝：`Server` 的 `ServerListener` 接口（`start(accept)`/`close()`）与传输无关；`packages/gateway/src/ws-listener.ts` 已是平台无关的手写 WS listener，全部 gateway 测试以 unix+ws 双传输跑过；`packages/gateway/src/client.ts:22-24` 的 `NekoGatewayAddress` 已是 `unix | ws` 联合类型。动机见 proposal.md。

## Goals / Non-Goals

**Goals:**

- Windows 上 `neko tui` / `neko web` / `neko serve` 可用，功能与 POSIX 对等。
- macOS/Linux 的 TUI 与 Web 执行路径零行为变化：所有 Windows 行为收拢在 `process.platform === "win32"` 分支内，POSIX 分支字面不变。
- 本机测试可在 Windows 跑通 gateway 级测试（helpers 按平台切 ws-only）。

**Non-Goals:**

- 不实现 Windows 命名管道传输（见 Decisions D1）。
- CI 不新增 Windows runner；Windows 验证靠本机 `bun run test`。
- 不改上游依赖版本、不给 pi-server 打补丁。
- 不处理次要兼容项（工作区文件查询反斜杠、SIGTERM 语义、help 文案之外的 POSIX 假设）——另开变更。

## Decisions

### D1: Windows 走 WS-only，不做命名管道

`ServerListener` 接口使"少挂一个 listener"成为合法配置（`socketPath: null` 分支在 `bindGateway` 已存在）。命名管道方案需在 client/server 两端新写 transport，并自行重做单实例/stale 检测（pi-server 的 rename+dev/ino 是 POSIX 专用），收益仅是"本机免端口"。WS 传输已被现有测试双跑验证，选 WS-only。

替代方案：① 命名管道 listener（改动量中等，两端新代码）；② 等上游修复（main 分支无迹象）。

### D2: POSIX 零改动原则

每个分叉点同一形状：`win32` 分支承载全部新行为，darwin/linux 分支保持现有代码字面不变。review 标准：diff 中 POSIX 执行路径不出现行为变化。具体分叉点：

- `gateway.ts` 默认 socketPath：win32 → `null`；POSIX → 现状。
- 端口文件写入：仅 win32（见 D3）。
- TUI `connectToGateway` / web `ensureNekoGateway` 探活：win32 走 ws 分支；POSIX 原 unix 分支不动。
- 测试 helpers：win32 以 ws-only 起网关；POSIX 原样。

### D3: 端口文件做 Windows 地址发现

Windows 下网关以随机 WS 端口启动（避免固定端口冲突），启动后把 `ws://127.0.0.1:<port>` 写入 `<数据目录>/<serverId>.port`，关闭时删除。TUI/web 发现流程与现状同构：现在是"等 serverId 文件 → 算 `.sock` 路径 → 轮询 socket 存在"，Windows 换成"等 serverId 文件 → 读 `<serverId>.port` → 轮询 ws 可连"。过期端口文件连接失败即视为无活跃网关，走正常 spawn 流程。

替代方案：固定默认端口 8321——简单但端口被占即失败，且 TUI spawn 场景无法协商；端口文件与 serverId 文件机制同构，学习成本为零。

### D4: 显式禁用 Unix socket 的配置入口

- `neko.config.json` 的 `gateway.socketPath` 允许 `null`（`packages/core/src/config.ts:180-182` 校验放宽），语义为禁用 Unix 传输。
- gateway CLI 增加 `--no-socket`（`packages/gateway/src/main.ts`），与现有 `--port 0/null` 禁用 WS 对称。
- Windows 默认值即等价于内置 `--no-socket`；POSIX 用户显式禁用后行为与 Windows 一致（ws-only），这也给了 POSIX 一条验证 Windows 代码路径的手段。

### D5: 修正 `--port 0` 语义陷阱

TUI spawn gateway 时传 `--port 0`（`packages/tui/src/gateway.ts:161-172`，注释称"随机端口"），但 gateway CLI 把 `0` 解析为禁用 WS（`main.ts:50-52`）。POSIX 下 TUI 不需要 WS，继续显式禁用（修正注释与传参使其名实相符）；Windows 下 TUI 改为不传 socket、启用随机 WS 端口并等待端口文件。

### D6: 测试策略

- `packages/gateway/test/helpers.ts` 的 `makeGateway()` 按平台分叉：win32 → `socketPath: null` + 随机 WS 端口；POSIX → 现状。已有 `transport: "ws"` 变体的测试（attach/directory/credentials 等）在 Windows 天然可用。
- CI matrix 不变（ubuntu/macos 继续守护 POSIX 回归）；Windows 由开发者本机 `bun run test` 验证。
- 本变更顺带清理测试里硬编码的 `/tmp`（`packages/cli/test/startup.test.ts`、`packages/gateway/test/single-instance.test.ts`），改用 `os.tmpdir()`；symlink 依赖的测试保持 POSIX-only 标记。

## Risks / Trade-offs

- [Windows 随机端口下丢失单实例检测：两个前端可能各自 spawn 网关] → 端口文件 + serverId 文件作为事实锁：先查文件再 spawn，spawn 后按文件连接；极端竞态（两进程同时 spawn）下后到者写覆盖端口文件，前端连最后写入者，会话存储层单存储单开约束兜底（pi-durable 一个存储同时只被一个 Harness 打开，后到者打不开存储会退出，与 POSIX 双实例防护同源）。
- [端口文件残留（进程被杀）] → 连接失败即视为无活跃网关并重新 spawn，与 POSIX stale socket 处理语义对齐；正常关闭路径删除文件。
- [Bun on Windows 的 WS 服务/信号行为差异] → ws-listener 已在 POSIX 双跑；Windows 本机测试覆盖启动、attach、断连路径后再合并。
- [pi-client 在 win32 对 unix 地址抛错] → 属预期行为；Windows 代码路径不构造 unix 地址，错误信息本身清晰，无需包裹。
