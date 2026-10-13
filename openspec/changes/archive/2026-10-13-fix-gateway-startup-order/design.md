# Design

## Context

动机见 proposal.md。`packages/tui/src/gateway.ts` 在 POSIX 的 gatewayArgs 固定传 `--port 0`，CLI 将其解析为 `port: null`（API 的 `port: 0` 则是随机端口）。Web 的 POSIX 分支只验证 Unix 握手，拼接 host/port 后返回；新启动分支也只验证 Unix。Windows 已通过端口文件发现实际 WS 地址并验证身份。

现有启动测试分别验证 TUI→TUI、Web→Web，没有跨前端组合。session-gateway 已要求 POSIX 双传输和身份校验，但缺少自动启动与复用的明确场景。本变更增加这些场景；不处理 web-ui 中静态托管规格与独立 HTTP 进程实现的既有差异。

## Goals / Non-Goals

**Goals:** 在现有子进程与传输模型下让默认启动顺序无关；Web 的成功结果必须对应真实可连接、身份匹配的 WS 地址；保留 gateway 所有权与失败清理语义。

**Non-Goals:** 不升级 Pi、不改会话/RPC、不新增 POSIX 地址文件或自动端口发现服务、不为运行中的仅 Unix gateway 动态添加监听器、不强制重启活跃 gateway、不修改前端断线重连策略。

## Decisions

### 1. TUI 不再强制关闭 POSIX WebSocket

移除 POSIX 启动参数中的强制 `--port 0`，由 gateway 按既有配置解析与默认 8321 监听。TUI 本身仍走 Unix socket，Windows 分支保持原样。尊重用户显式配置（包括禁用 WS）；显式禁用不属于默认启动顺序成功保证。

相比 Web 启动时替换 gateway，此方案避免破坏 TUI 与正在运行的会话；相比添加动态监听 RPC，不增加服务契约或生命周期复杂度。

### 2. Web 以将发布的 WS 地址验证可用性

复用现有 connectNekoGateway 的 WS 握手与服务绑定能力验证 serverId，并在 finally 释放探测客户端。POSIX 沿用 options.host/port 与默认地址，不推测已有实例的其他端口；非默认监听地址由 Web 的现有参数明确指定。配置地址不一致时失败，错误包含 WS 地址与可操作指引。

Unix 探测成功意味着有活跃实例：随后 WS 验证失败不能进入 spawn 分支。Unix 未发现实例时沿用现有 spawn；子进程就绪等待必须确认 WS 可用，受同一启动期限与子进程退出检测约束。探测必须有界，不能让单次握手无限阻塞轮询；检查现有连接取消/超时能力并用于探测，必要时在启动层封装截止时间。每次失败与成功均释放探测连接。

只检查 TCP 端口不足以验证 gateway 身份；直接启动第二个实例会违反已有 Unix 单实例约束，且不能安全共享 SQLite。

### 3. 用跨前端启动集成测试锁定行为

扩展 packages/cli/test/startup.test.ts，使用临时数据目录、隔离凭据与不发模型请求的测试 key。POSIX TUI 启动测试可通过临时配置选择空闲端口，避免依赖固定 8321；Windows 使用现有随机端口文件。两种顺序均实际执行 WS 连接、目录查询与同一会话 attach，断言 serverId、复用而非 spawn，以及关闭复用方后原连接仍可操作。

额外验证仅 Unix 活跃 gateway、错误 WS 地址与不同 serverId；失败后原连接仍可查询。新子进程的 WS 未就绪/超时应验证清理，避免仅断言构造出的 URL。

## Risks / Trade-offs

- [TUI 默认新增 8321 监听，端口可能被其他服务占用] → 保留 gateway 的 EADDRINUSE 提示与失败清理，使用已有配置更换端口，不静默退回仅 Unix。
- [旧 TUI 启动的 gateway 或用户显式禁用 WS] → Web 明确报错；用户在方便时退出网关并重启，无自动中断会话。
- [已有实例使用自定义地址，Web 默认地址不匹配] → 提示检查 host/port；本变更不新增自动发现协议。
- [握手停滞或探测泄漏] → 有界截止时间、finally 清理，并覆盖异常测试。
- [macOS 无法实测 Windows] → 保留平台分支与跨平台测试，在 Windows 环境执行验证；报告本机验证范围。

## Migration Plan

无需数据迁移。更新后新启动的默认 POSIX TUI gateway 提供双传输；现有仅 Unix 进程需用户正常退出后重启。回滚仅还原启动与探测代码，存储兼容，但旧启动顺序 bug 会恢复。
