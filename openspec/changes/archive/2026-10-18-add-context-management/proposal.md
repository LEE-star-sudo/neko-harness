# Proposal

## Why

内置 DeepSeek 模型窗口均为 1,000,000 token，而 pi-durable 的默认压缩策略（保留 16k、后台提前 32k）使自动压缩要到约 950k–984k token 才触发：长会话每轮都在预填充数十万 token，质量与延迟下降，阻塞压缩失败时还会直接 `model_error`。同时 pi-durable 1.x 提供的上下文 edits（只改模型所见、不改历史）neko 完全没用，旧的大体积工具结果长期占着上下文。两者都属于“如何管理模型上下文”，且都应由用户自行选择，不改变现有默认行为。

## What Changes

- 新增配置项 `context.compaction`（`neko.config.json`），可调整自动压缩的触发条件；**默认不设置，行为与现状完全一致**（沿用 pi-durable 默认策略）。
- 新增可选的“工具结果裁剪”能力，配置项 `context.pruning`：开启后，在上下文用量超过配置的阈值时，用 pi-durable 的 context edits 把较旧且体积大的工具结果在模型上下文中替换为简短占位，原始历史与前端展示保持不变；**默认关闭**。
- 裁剪与压缩共用同一套“占用比例”口径，裁剪应早于压缩触发，二者可独立开启。
- 两组设置除配置文件外，还可在 UI 中修改：Web 设置页新增「上下文管理」卡片，TUI 新增 `/context` 面板；保存为用户级持久设置并同步到所有前端，保存后下一次请求即生效（无需重启）。优先级为已保存值高于配置文件，后者高于内置默认；可逐项恢复默认。
- 网关新增服务器级上下文设置服务（状态订阅 + 修改 + 恢复默认），**BREAKING**：新增服务递增链路协议版本，沿用“版本不同即拒绝”的既有约束。
- 配置文件值在启动时读取并校验，非法值报错并拒绝启动；UI 提交的非法值被拒绝并给出错误，不落盘。移动端不在本次范围。
- 不引入 pi-durable 1.3.0 之后才有的 `modelOverrides`；按全局策略实现，并在设计中记录升级后的迁移方向。

## Capabilities

### New Capabilities
- `context-pruning`: 可选、可配置的工具结果上下文裁剪（基于 context edits，不改写历史、不影响展示、可恢复、幂等）。

### Modified Capabilities
- `agent-runtime`: “原生上下文压缩”要求由“保持默认阈值、不改写”改为“默认沿用原生策略，同时允许通过配置文件或 UI 保存的设置调整触发条件”。
- `session-gateway`: 新增服务器级上下文设置的状态订阅与修改（类似搜索设置同步），递增链路协议版本。
- `web-ui`: 设置页新增「上下文管理」卡片。
- `terminal-ui`: 新增 `/context` 面板。

## Impact

- 代码：`packages/core/src/config.ts`（配置类型、校验、合并）、`packages/core/src/runtime.ts`（持久设置文档、以 getter 形式向 `Harness.open` 提供 `settings.compaction`、安装裁剪扩展）、新增 core 裁剪模块；`packages/gateway`（配置透传、合约与服务端/客户端状态、协议版本）；`packages/tui`（`/context` 面板、帮助与补全）；`packages/web`（设置页卡片与状态）。
- 文档：README 配置与 UI 说明、`AGENTS.md`（含链路协议版本数字）。
- 依赖：无新增，pi-durable 保持 1.3.0。
- 兼容：未配置时无行为变化；已有会话数据无需迁移（edits 仅为新增条目）。
