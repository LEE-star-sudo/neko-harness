# Tasks

## 1. Gateway：平台传输分叉与端口文件

- [x] 1.1 `packages/core/src/config.ts` 允许 `gateway.socketPath` 为 `null`（禁用 Unix 传输），`packages/gateway/src/gateway.ts` 默认值按平台分叉（win32 → `null`，POSIX 保持现状），验证 `bun run test` core/gateway 相关用例通过且 POSIX 默认值测试不变
- [x] 1.2 `packages/gateway/src/main.ts` 增加 `--no-socket` flag（与 `--port 0/null` 对称），修正 `--port 0` 的语义注释与 help 文案，验证 CLI 参数解析测试覆盖 `--no-socket`
- [x] 1.3 Windows ws-only 模式下网关在启动后把实际 wsUrl 写入 `<数据目录>/<serverId>.port`、`close()` 时删除；写入/清理逻辑抽为可独立测试的函数，验证新增测试覆盖写入、清理与过期文件（连接失败按无活跃网关处理）语义
- [x] 1.4 `toStartupError` 与各包 help 文案按平台更新（Windows 不再只提 Unix socket），验证 Windows 本机 `bun run neko serve` 能启动并输出 ws 地址

## 2. 测试基建平台分叉

- [x] 2.1 `packages/gateway/test/helpers.ts` 的 `makeGateway()` 按 `process.platform` 分叉（win32 → ws-only 随机端口，POSIX → 现状不变），验证 POSIX 下 `bun run test` 全绿且无行为变化
- [x] 2.2 清理测试硬编码 `/tmp`（`packages/cli/test/startup.test.ts`、`packages/gateway/test/single-instance.test.ts`）改用 `os.tmpdir()`，验证两测试在 POSIX 仍通过
- [x] 2.3 Windows 本机运行 `bun run test`，gateway/tui/web/cli 网关级测试全部通过

## 3. TUI Windows 接入

- [x] 3.1 `packages/tui/src/gateway.ts` `connectToGateway` 增加 win32 分支：等 serverId 文件 → 读端口文件 → 以 ws 地址连接；spawn 参数按平台分叉（win32 启用随机 WS 端口且不传 socket 路径，POSIX 原参数原样），修正原 `--port 0` 注释，验证 TUI 侧测试通过且 POSIX 连接路径 diff 为零
- [x] 3.2 Windows 本机验证 `bun run neko tui`：自动拉起网关、连接、提交一条输入得到流式回答

## 4. Web Windows 探活

- [x] 4.1 `packages/web/src/gateway-spawn.ts` `ensureNekoGateway` 增加 win32 分支：读端口文件做 ws 探活，失败/无文件时 spawn（spawn 参数按平台分叉），POSIX 探活逻辑原样，验证 web 测试通过
- [x] 4.2 Windows 本机验证 `bun run neko web`：浏览器可连接、创建会话、完成一轮对话；重复执行 `neko web` 复用同一网关而非反复 spawn

## 5. 集成验证

- [ ] 5.1 POSIX（macOS 或 Linux）执行 `bun run build && bun run test && bun run check` 全绿，确认 TUI/Web 在 POSIX 行为无回归
- [x] 5.2 Windows 本机验证：`bun run build` 通过；gateway/tui/web/cli 网关级套件 `bun test` 全绿（41 pass / 6 平台守卫 skip）；`neko serve` 冒烟通过（ws-only + 端口文件）。范围说明：core 等包既有测试的 Windows 失败为 HEAD 既有欠账（symlink 特权、bash /tmp 路径、文件锁），经确认收窄出本变更，另开变更适配
