# Proposal

## Why

neko-harness 目前无法在 Windows 上启动：上游 pi-server 1.1.0 的 Unix socket listener 是纯 POSIX 实现（`lstat`/`link`/dev-ino 身份比对），在 Windows 上 `lstat` 直接 EACCES 崩溃；pi-client 也已显式拒绝 Windows 的 Unix 传输。而 WS 传输（`ws-listener.ts`）本身与平台无关且已被全部 gateway 测试覆盖，只需把 Windows 的默认传输切换到 WS 即可落地支持。

## What Changes

- 网关默认监听地址按平台分叉：Windows 默认禁用 Unix socket（`socketPath: null`），仅启用 WebSocket；macOS/Linux 行为完全不变（Unix + WS 双传输照旧）。
- Windows 下网关以随机 WS 端口启动，并把实际 wsUrl 写入 `<数据目录>/<serverId>.port` 端口文件，供本机前端发现；POSIX 平台不写端口文件。
- `neko.config.json` 与 gateway CLI 支持显式禁用 Unix socket（`socketPath: null` / `--no-socket`），Windows 默认即禁用。
- TUI 在 Windows 下改为经 WS 连接/拉起网关（读端口文件发现地址）；macOS/Linux 的 Unix socket 连接路径一行不改。
- Web 的网关保活探针在 Windows 下改为 WS 探活（读端口文件），POSIX 探活逻辑不变。
- 测试基建按平台分叉：Windows 下测试网关以 ws-only 启动；现有 macOS/Linux 测试与 CI matrix 不变（不新增 Windows runner，Windows 仅本机自测）。
- 顺带修正 gateway CLI `--port 0` 的语义陷阱（`0` 实为禁用 WS，TUI spawn 注释误写为"随机端口"）。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `session-gateway`: 「传输支持」需求从"同时提供 Unix socket 与 WebSocket"改为平台感知——POSIX 双传输、Windows 仅 WebSocket；新增端口文件发现机制的规格化描述。「有界图片传输与预览」中"在 Unix 和 WebSocket 上"的表述同步改为平台感知。

## Impact

- **代码**：`packages/gateway/src/gateway.ts`（默认地址分叉、端口文件写入）、`packages/gateway/src/main.ts`（`--no-socket` flag）、`packages/core/src/config.ts`（允许 `socketPath: null`）、`packages/tui/src/gateway.ts`（Windows ws 连接分支）、`packages/web/src/gateway-spawn.ts`（Windows ws 探活）、各包 help 文案。
- **测试**：`packages/gateway/test/helpers.ts` 及引用它的各包测试按平台切换传输。
- **依赖**：无新增依赖；上游 pi-server/pi-client 版本不变（Windows 不支持 Unix 传输是上游既定行为，适配落在 neko 自己的 gateway 层）。
- **CI**：不变（仍 ubuntu/macos；Windows 行为靠本机 `bun run test` 自测）。
- **约束**：macOS/Linux 的 TUI 与 Web 执行路径零行为变化，所有 Windows 行为收拢在 `process.platform === "win32"` 分支内。
