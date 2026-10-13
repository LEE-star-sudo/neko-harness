# Proposal

## Why

macOS/Linux 上先启动 TUI 再启动 Web 时，TUI 拉起的 gateway 禁用了 WebSocket，而 Web 仅探活 Unix socket 就向浏览器返回 WS 地址，导致页面无法连接。启动顺序不应影响两个前端共享同一 gateway。

## What Changes

- POSIX 上 TUI 自动启动 gateway 时保留默认 WebSocket 监听，同时继续使用 Unix socket 连接。
- Web 在声明 gateway 可用前验证浏览器将使用的 WS 地址及 serverId；已有 Unix gateway 但 WS 不可用时明确报错，不启动竞争实例或中断已有会话。
- 覆盖 TUI→Web、Web→TUI 两种启动顺序，以及 WS 缺失、地址/身份不匹配和子进程清理。
- 保持 Windows 的随机 WS 端口、端口文件发现与清理机制。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `session-gateway`: 增加前端自动启动与复用的明确要求，保证默认配置下启动顺序无关，并验证所需传输实际可用。

## Impact

- `packages/tui/src/gateway.ts` 的 POSIX gateway 启动参数。
- `packages/web/src/gateway-spawn.ts` 的复用、就绪检查与错误处理。
- `packages/cli/test/startup.test.ts` 及必要的 gateway/Web 启动测试。
- 无上游依赖升级、会话存储格式或业务 RPC 变更；不引入 POSIX 端口文件或监听器热添加机制。
