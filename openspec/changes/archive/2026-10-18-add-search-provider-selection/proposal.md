# Proposal

## Why

联网能力目前硬绑定 Tavily：无 key 只能走限流的 keyless，且与模型使用的 DeepSeek 凭据相互独立。DeepSeek 已提供官方 Search / Fetch 接口（`POST /v1/tools/search`、`/v1/tools/fetch`，复用 DeepSeek API Key），实测可用，质量与计费都落在用户已有账号上。与其替换 Tavily，不如把搜索后端做成可选 provider：默认仍为 Tavily（实测 DeepSeek Fetch 的抓取效果不如 Tavily），用户可主动改选 DeepSeek 复用已有的 DeepSeek key。

## What Changes

- 将 `web_search` / `web_extract` 的后端抽象为 provider（`search` + `extract`），工具名称、参数形状、输出格式保持不变；新增 `deepseek` provider，现有 Tavily 逻辑收敛为 `tavily` provider。
- 新增用户级「搜索 provider」选择，取值 `tavily`（默认）/ `deepseek`，不提供自动选择；选择 MUST NOT 静默回退到另一家，失败以工具错误告知并提示如何配置或切换。
- DeepSeek provider 适配：query 上限 128 字符；单 URL 的 fetch 通过受限并发和有限重试支持多 URL 的 `web_extract`，逐项成功/失败；错误码（401/402/403/404/429/5xx）映射为可操作的工具错误。
- 选择值持久化于存储文档（与工作区列表同一机制），经网关同步到 TUI 与 Web；两端新增选择入口（TUI `/search` 面板，Web 设置页「搜索服务」卡片），展示当前选择与各 provider 的凭据状态。
- 配置文件新增可选 `webSearch.provider`（`tavily` / `deepseek`），作为未保存选择时的初始值。
- 凭据体系保持不变（`deepseek`、`tavily` 两个凭据项），不新增密钥存储；DeepSeek key 现在同时服务模型与搜索。
- 更新 CLI 帮助与 README 的联网说明。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `web-search`：从"Tavily 后端"改为 provider 抽象；新增 provider 选择、DeepSeek provider 的行为与错误处理；保留 Tavily 凭据解析与 keyless；凭据保密要求扩展到 DeepSeek 搜索。
- `session-gateway`：新增服务器级搜索设置的状态订阅与修改（无需 attach 会话），变更后通知所有前端。
- `terminal-ui`：新增 `/search` 面板用于查看与切换搜索 provider。
- `web-ui`：设置页新增「搜索服务」选择卡片。
- `cli-interface`：帮助输出补充搜索 provider 的配置说明。

## Impact

- 代码：`packages/core/src/web-search.ts`（拆为 provider 目录）、`runtime.ts`（选择状态与解析）、`config.ts`（`webSearch.provider`）；`packages/gateway/src/contract.ts`、`server-services.ts`、`client-session.ts`；`packages/tui`（`/search` 面板与补全、帮助）；`packages/web` 设置页与 store；`packages/cli/src/main.ts` 帮助文案；README。
- 测试：core web-search 测试按 provider 重组并新增 DeepSeek 用例；runtime、gateway、TUI、Web 对应测试。
- 依赖与兼容：无新增依赖；`web_search` / `web_extract` 对模型的接口不变，subagents 的只读工具集、提示词与 TUI/Web 工具渲染无需改动；旧会话历史不受影响。
- 计费：DeepSeek Search / Fetch 按成功请求计费（5 元 / 千次），自北京时间 2026-11-01 起收取。
- 不在范围内：新增第三方 provider（仅预留抽象）、按会话或按工作区单独选择 provider、provider 间自动选择或故障切换（曾评估 `auto` 模式，因 DeepSeek Fetch 效果不佳而放弃）、移动端（Flutter）入口。
