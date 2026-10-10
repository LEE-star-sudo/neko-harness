# Proposal

## Why

harness 运行的 agent 目前没有任何联网能力：模型（DeepSeek）无法获取实时信息，用户只能手动粘贴网页内容。Tavily 提供面向 agent 的 Search/Extract API，且有免 key 的 keyless 模式（仅 Search/Extract、限流），可以零配置开箱即用，用户后续保存 `TAVILY_API_KEY` 即无缝升级。同时，现有凭据管理表面（core API、网关契约、TUI/Web 前端）整体写死 DeepSeek 单一 provider，接入第二把 key 必须先把凭据表面参数化。

## What Changes

- 新增 `web_search` 与 `web_extract` 两个内置工具（Tavily 后端），默认安装到所有会话。
- Tavily 凭据解析：无 key 时走 keyless（`X-Tavily-Access-Mode: keyless` 头，限流）；保存的 key 优先于 `TAVILY_API_KEY` 环境变量，与 DeepSeek 的优先级语义一致；keyless 视为独立的生效来源状态，而非"未配置"。
- keyless 撞限流时，将 Tavily 返回的说明以工具错误形式反馈给模型，并在结果中引导用户配置 key。
- core 凭据 API 参数化：`credentialStatus` / `saveCredential` / `removeCredential` 按 provider（`"deepseek"` | `"tavily"`）操作。
- **BREAKING** 网关 `neko.credentials` 契约：状态改为 per-provider 结构，`save`/`remove` 增加 provider 参数。TUI 与 Web 客户端同步适配。
- Web 设置页重构：多 provider 凭据条目，美观紧凑、风格统一（沿用分区 design tokens），保留 DeepSeek 现有全部行为。
- TUI `/login` 面板支持选择 provider（DeepSeek / Tavily），可分别保存/移除各自的 key。
- `NekoRuntimeOptions` 增加 Tavily key 的运行时覆盖（仅内存、不落盘），与 `apiKey` 对齐。

## Capabilities

### New Capabilities

- `web-search`: agent 的联网搜索与网页抽取工具（Tavily 后端）：工具行为与输出形态、keyless 默认后端与 key 升级、限流与错误反馈、Tavily 凭据的解析优先级与保密约束。

### Modified Capabilities

- `model-providers`: "用户级凭据管理"与"凭据保密与状态"从 DeepSeek 单一凭据泛化为按 provider 分别管理（存储机制、优先级语义、保密约束对所有 provider 一致）。
- `session-gateway`: "凭据配置与同步"从单一 DeepSeek 状态变为 per-provider 状态订阅与保存/移除（契约 breaking）。
- `web-ui`: "简洁的 DeepSeek 设置页"变为多 provider 设置页（紧凑统一风格、per-provider 卡片、keyless 状态展示）。
- `terminal-ui`: "DeepSeek 登录配置"变为支持多 provider 的 `/login` 面板。

## Impact

- `packages/core`：新增 web-search 扩展模块（`web_search`/`web_extract` 工具 + Tavily HTTP 调用，裸 fetch 不新增依赖）；`runtime.ts` 凭据 API 参数化并安装新扩展；`credentials.ts` 复用现有 `CredentialStore`（存储层零改动）。
- `packages/gateway`：`neko.credentials` 服务契约与实现参数化（breaking，两端同步改）。
- `packages/tui`：`/login` 面板支持 provider 选择。
- `packages/web`：设置页重构为多 provider 布局；凭据状态消费适配新契约。
- `packages/cli`：帮助文案补充 `TAVILY_API_KEY`。
- 无新增运行时依赖（Tavily 走 `fetch` 直连，便于控制 keyless 头与限流错误透传）。
- 测试：core（工具行为、凭据解析优先级、keyless 头）、gateway（契约）、cli/tui/web 适配。
