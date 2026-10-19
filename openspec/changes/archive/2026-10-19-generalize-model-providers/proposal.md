# Proposal

## Why

模型接入目前硬绑定 DeepSeek：凭据集合写死为 `deepseek | tavily`，缺 key 拦截、网关契约和两端 UI 都只认 DeepSeek。用户需要使用 OpenRouter、OpenCode Go 等渠道，而已锁定的 Pi 1.3.0 已内置这些 provider。与其逐个手写接入，不如把 provider 做成数据驱动的目录：一次性泛化，再以显式启用机制控制哪些渠道对用户可见。

## What Changes

- 新增内置 provider 目录：Pi 1.3.0 中使用纯 API Key 鉴权的 32 个 provider（含 OpenRouter、OpenCode Go、OpenCode Zen、OpenAI、Google、Groq、Mistral 等，完整清单见设计）。排除需要额外配置或非 Key 鉴权的 Azure、Anthropic、Cloudflare、Bedrock、Vertex、GitHub Copilot、OpenAI Codex、Radius、TypeSafe。
- 新增用户级「provider 启用」设置：默认只启用 DeepSeek（锁定，不可取消）；其余 provider 由用户在 Web / TUI 配置页勾选。启用只决定可见与可选，是否可用仍取决于是否有 Key。
- 凭据按 provider 通用化：保存 / 移除 / 状态对目录内任一 provider 生效，缺 Key 拦截与错误提示对所有 provider 一致，不再是 DeepSeek 专属。
- 被禁用 provider 的既有会话：历史可浏览，新输入（含压缩）被拒绝并提示启用或切换模型。`--model` 与配置文件 `defaultModel` 指向未启用 provider 时不阻止启动，提交时按同样规则拦截。
- 模型列表只包含已启用 provider 的模型，并标明是否已具备 Key；不再平铺全部模型。
- **BREAKING**：gateway 凭据服务状态由固定的 `{deepseek, tavily}` 改为按 provider 的映射并新增启用方法，错误码由 `DEEPSEEK_KEY_REQUIRED` 泛化为 `PROVIDER_KEY_REQUIRED` / `PROVIDER_DISABLED`，应用链路协议版本 6 → 7，不提供回退。
- Web：重构设置页「密钥」为「模型服务」（provider 目录、勾选启用、Key 管理）；**联网搜索设置拆为独立页面 `/settings/search`**（搜索服务选择与 Tavily Key），不再与 provider 列表混排；重构聊天区模型选择器（按 provider 分组、可搜索、显示能力标签、无 Key 项引导配置）。
- TUI：重构 `/login` 为 provider 两级面板（provider 列表含启用勾选与状态，选定后输入 Key），重构 `/model` 选择列表（分组与过滤）；Tavily 作为联网搜索凭据单独分组放在列表末尾；页脚模型名显示修正为保留厂商前缀以区分同名模型。
- 更新 CLI / TUI 帮助与 README 中的凭据与 provider 说明。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `model-providers`：从 DeepSeek 为中心扩展为 provider 目录；新增启用设置、被禁用 provider 的拦截、通用缺 Key 拦截、模型目录范围；用户级凭据与保密要求覆盖目录内所有 provider。
- `session-gateway`：凭据服务改为按 provider 的状态映射并新增启用同步；协议版本递增。
- `web-ui`：「模型服务」设置页、独立「联网搜索」设置页、模型选择器重构。
- `terminal-ui`：`/login` provider 面板与 `/model` 选择列表重构，页脚模型名显示。
- `cli-interface`：帮助输出覆盖多 provider 的凭据环境变量。
- `agent-runtime`：自动压缩触发百分比的基准窗口改为“可选模型”（已启用 provider）而非全部已注册模型。

## Impact

- 代码：`packages/core`（新增 provider 目录模块与启用设置文档、`credential-providers.ts`、`runtime.ts` 的 provider 注册 / 缺 Key 与禁用拦截 / `listModels`）；`packages/gateway`（`contract.ts` 凭据契约、`session-host.ts` 错误映射、`client-session.ts`、`APPLICATION_PROTOCOL`）；`packages/tui`（`login.ts`、`/model` 选择、页脚、帮助）；`packages/web`（设置页、新增搜索设置页与路由、设置侧栏、`model-picker.tsx`、`composer.tsx` 缺 Key 判断）；`packages/cli` 与 README 文案。
- 测试：core provider 目录与 Pi 环境变量对账测试、启用 / 拦截测试；gateway 契约与协议版本测试；TUI 面板与选择测试；Web 设置页、搜索页、模型选择器测试。
- 依赖与兼容：无新增依赖，沿用已锁定 Pi 1.3.0 内置 provider，不裹 Pi 代码；旧版客户端与新网关（反之亦然）按协议版本被明确拒绝。已有会话与配置的模型引用不变，DeepSeek 默认行为不变。
- 不在范围内：Azure、Anthropic、Cloudflare、Bedrock、Vertex 及 OAuth / 订阅类 provider；OpenRouter OAuth 与按 Key 个性化模型目录；动态模型目录（Radius）；自定义 OpenAI 兼容 provider；移动端（Flutter）入口；按工作区或会话单独启用 provider。
