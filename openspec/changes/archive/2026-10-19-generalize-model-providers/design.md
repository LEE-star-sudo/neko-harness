# Design

## Context

当前 DeepSeek 在多处硬编码（见 proposal.md - Why）：`runtime.ts` 只 `setProvider(deepseekProvider())`；`CredentialProviderId` 是 `deepseek | tavily` 闭集（`credential-providers.ts`，浏览器安全子路径）；缺 Key 拦截只认 `agent.model?.provider === "deepseek"`（`runtime.ts` 受理输入与 `compact`）；网关 `NekoCredentials` 状态为 `{deepseek, tavily}` 固定对象，错误码 `DEEPSEEK_KEY_REQUIRED` 在 `session-host.ts` 字符串匹配；Web 设置页 / composer 与 TUI `/login` / 发送前检查同样写死。

已确认的事实：

- 已锁定的 pi-ai 1.3.0 内置全部目标 provider（`providers/<id>.js`），各自 `createProvider({id, auth, models, api})`；`builtinProviders()` 在 `providers/all` 中可得。auth 的 `resolve` 先读保存凭据（以 provider id 为键存取），再读环境变量，`checkAuth(id)` 返回 `{source, type}`。
- 会话命名（`session-metadata.ts`）用会话自身模型并要求支持 `off`，不依赖具体 provider；`listModels()` 已遍历所有已注册 provider；模型引用解析（`--model`、web 与 tui 的 `main.ts`）按第一个 `/` 拆分，天然支持 OpenRouter 的 `anthropic/xxx` 模型 id。
- 用户级设置的既有模式：`SearchSettingsDoc`（`scope: "conversation"`，绑定根会话）与上下文设置文档，经 gateway 的服务器级契约同步到各端。
- Web 设置区有统一外壳 `settings-shell.tsx`（菜单项：密钥 / 上下文 / 手机配对），路由在 `main.tsx`，已有 `/settings/context` 可作为新增独立栏目的先例。

## Goals / Non-Goals

**Goals:**

- 以一份静态 provider 目录驱动凭据、启用、拦截、两端配置页与模型选择，使“新增一个纯 Key provider”只需在目录加一行。
- 默认行为与 DeepSeek 单 provider 时一致；新 provider 必须经用户显式启用才出现。
- 配置页与模型选择器可在 ~1500 个模型规模下使用。

**Non-Goals:**

- Azure / Anthropic / Cloudflare / Bedrock / Vertex / Copilot / Codex / Radius / TypeSafe（需要非 Key 鉴权、额外配置或动态目录）；OAuth 登录；自定义 OpenAI 兼容 provider；按工作区或会话启用；Pi 上游代码的封装或补丁（沿用“只升版本不裹代码”）。

## Decisions

### D1. 静态目录 + Pi provider 全量注册，用“启用集合”做门禁

`packages/core/src/credential-providers.ts` 保持浏览器安全，新增 `MODEL_PROVIDERS`：`{ id, name, envVar, signupUrl }`，共 32 项（清单：deepseek、openrouter、opencode-go、opencode、openai、google、groq、mistral、xai、together、fireworks、cerebras、nvidia、huggingface、vercel-ai-gateway、moonshotai、moonshotai-cn、minimax、minimax-cn、zai、zai-coding-cn、qwen-token-plan、qwen-token-plan-cn、qwen-token-plan-individual、xiaomi、xiaomi-token-plan-cn、xiaomi-token-plan-ams、xiaomi-token-plan-sgp、baseten、ant-ling、kimi-coding、meta）。Tavily 保留为独立的 `SEARCH_CREDENTIALS`，不属于模型 provider 目录，两者合并为统一的 `CredentialProviderId` 联合类型以复用凭据存取。

运行时在 `createModels` 后对目录内每个 id 从 Pi 取同名 provider 注册（仅取目录成员，忽略 Pi 其余 provider），**不因启用状态增删注册**。启用状态只在三处生效：`listModels()` 过滤、`configure` 的切换校验、受理 / 压缩前的拦截。

- 理由：历史会话、图片能力查询（`models.find(current)`）、命名都依赖按 id 查模型；取消启用后这些查询必须仍能解析，避免“当前模型消失”引发的连锁问题。
- 备选：启用才 `setProvider`、取消即 `deleteProvider`。拒绝：取消后历史会话查不到模型，需要处处兜底；且 `setProvider` 会触发刷新代际逻辑，增加竞态。
- 目录与 Pi 对账：环境变量名不由 Pi 公开 API 暴露，目录的 `envVar` 由测试校验——对每个 provider 设置 `process.env[envVar]` 后 `models.checkAuth(id)` 必须返回 `source === envVar`，Pi 升级使映射变化时测试失败。同时断言目录成员在 Pi 中都是 `envApiKeyAuth` 风格的 api-key provider。
- 备选：不维护静态目录，直接用 `models.getProviders()` 动态派生。拒绝：浏览器端无法导入 Node 的 provider 实现；且“目录封闭、升级可审”是本变更的核心约束。

- 副作用：自动压缩的 `triggerPercent` 取“已注册模型最小窗口”。全量注册后若仍取全部模型，阈值会被目录中最小窗口拖低，因此该计算改为只统计已启用 provider 的模型（及代码注册的额外 provider），`agent-runtime` 的对应场景随之修改。

### D2. 启用设置存储为用户级文档

新增 `ProviderSettingsDoc`（`kind: "app.neko.provider-settings"`，`scope: "conversation"`、`history: "latest"`、`fork: "initial"`，绑定根会话，同 `SearchSettingsDoc`），内容 `{ enabled: string[] }`，`initial` 为 `["deepseek"]`。读取时与目录求交并强制包含 deepseek；写入前校验 id 属于目录且 deepseek 不被移除，持久化后更新内存快照，下一次请求 / 列表生效。

- 备选：写进配置文件。拒绝：用户要在 UI 勾选，配置文件是只读输入；文档机制已有同步范式。

### D3. 拦截统一为 `guardProvider(modelRef)`

在受理输入与 `compact` 前调用同一函数：provider 不在启用集合 → `PROVIDER_DISABLED`；`models.checkAuth(provider)` 为空 → `PROVIDER_KEY_REQUIRED`。顺序先禁用再缺 Key。子 agent 的模型请求在启动 / 修复前复用该校验（主模型 provider 被禁用时子任务不启动）；会话命名在 provider 不可用时直接走 fallback。`checkAuth` 为只读不刷新 OAuth，符合“已配置不声称已认证”。错误消息保留 `CODE: 引导文案` 形式，`session-host.ts` 的映射由 DeepSeek 专属字符串改为按两个前缀映射为 `ChordError("invalid", ...)`。

`--model` / `defaultModel` 指向未启用 provider 时，`createNekoRuntime` 不校验启用（只校验模型存在于注册 provider 内；目录之外的 provider 视为未知模型，保持现有“未知模型”报错），拦截发生在提交时。

### D4. 契约：凭据状态改为映射，新增启用方法，协议 6 → 7

`NekoCredentials` 升到 `version: 2`：`statuses: Record<id, { savedConfigured, environmentConfigured, source, enabled? }>`（`enabled` 仅模型 provider 携带；`source` 仍为 `saved|environment|runtime|keyless|none`），新增方法 `setEnabled({ provider, enabled })`；`save` / `remove` 的 `provider` 取值改为目录 id 字符串，服务端校验（未知 id 拒绝）。`APPLICATION_PROTOCOL` 6 → 7，沿用“版本不同即拒绝”。`NekoModels.list` 的 `modelInfo` 增加 `available: boolean`（provider 有凭据）；列表过滤到已启用 provider。

- 备选：新增独立 `neko.providers` 契约。拒绝：启用状态与凭据状态总是一起被展示与修订，分两个订阅会产生中间态不一致；合并到同一 revision 的状态里更简单。
- 因 `NekoModels.list` 只返回已启用 provider，需处理“当前模型不在列表”：前端（composer / model-picker / tui）在找不到当前模型时回落到 `fallbackLabel` 并显示 provider 不可用提示，图片能力判断保守处理（拒绝新图片附件由服务端按受理时能力判断，保持现状）。`session-host` 视图中的模型标签（`agent.model`）不依赖列表。

### D5. Web：设置区拆分与模型选择器重构

- 设置侧栏：`密钥` 改名 `模型服务`（路径仍 `/settings`），新增 `联网搜索`（`/settings/search`，新页 `settings-search-page.tsx`，承载现有 `SearchServiceCard` 和 Tavily 凭据卡）；`settings-page.tsx` 仅渲染模型 provider。凭据卡抽成共用组件 `ProviderCredentialCard`，由两页复用，避免复制。
- 模型服务页：条目分“已启用”与“未启用（折叠，可搜索）”，勾选控件走 `setEnabled`；DeepSeek 的勾选禁用并带说明。
- 模型选择器：`model-picker.tsx` 的 `ModelForm` 重写为“搜索框 + provider 折叠分组 + 模型行（上下文窗口、图片、思考标签）”，保持“一次确认”提交与现有强度选择；分组默认折叠（当前模型所在组展开），搜索时自动展开命中组；缺 Key 的组显示未配置并链接 `/settings`。纯函数（分组、过滤、模型排序）放 `lib/`，便于测试。
- composer 缺 Key 判断由 `provider === "deepseek"` 泛化为读取 `statuses[provider]`；`providerNames` 表由目录名称取代。

### D6. TUI：两级 `/login` 与带过滤的 `/model`

- `LoginPanel` 改为状态机：`list`（provider 过滤列表，行内显示启用 / 来源，空格切换启用，Enter 进入输入）→ `key`（现有遮罩输入、保存、移除确认、字符计数、硬件光标逻辑原样保留）。Esc 在 `key` 返回 `list` 且保留输入，在 `list` 关闭面板。Tavily 作为列表末尾的独立分组“Web search”。
- `/model`：使用 pi-tui 的选择列表，数据按 provider 分组并支持输入过滤（`/model` 现有 `SelectList` 逻辑扩展分组头与过滤）；needs key 项不可确认。`tui.ts` 发送前 `provider === "deepseek"` 检查泛化为按当前 provider 状态给出 `/login` 引导。页脚 / 状态栏的 `modelShort` 改为保留 `provider/` 之后的完整 id（`openrouter/` 前缀去除但保留厂商段）。
- `/search` 面板保持不变，仅文案中 DeepSeek 缺 Key 的提示继续指向 `/login`。

### D7. 迁移与默认值

无存储迁移：`ProviderSettingsDoc` 缺省即 `["deepseek"]`，既有会话（均为 DeepSeek）行为不变；凭据文件格式不变（按 provider id 键存）。网关与客户端协议 7 同时发布，旧组合被明确拒绝。

## Risks / Trade-offs

- [模型规模大，序列化与渲染变慢] → 只下发已启用 provider 的模型；Web 分组折叠；先在 OpenRouter（396 个）下验证 `models.list` 帧大小与选择器渲染，若超限再拆分页（不预先设计）。
- [环境变量被共享：`OPENCODE_API_KEY`（opencode / opencode-go）、`MOONSHOT_API_KEY`、`QWEN_TOKEN_PLAN_API_KEY`] → 状态按 provider 分别计算，文案说明共用；保存凭据彼此独立（spec 已写）。
- [Pi 升级改变目录成员 / 环境变量名] → 对账测试在升级时失败，需显式更新目录（符合“升级走显式 OpenSpec 变更”）。
- [取消启用使当前会话“卡住”] → 明确拒绝并指引，历史可浏览，可切换模型继续。
- [协议版本升级让旧前端与新网关不兼容] → 已被接受；沿用现有拒绝与提示。
- [`ChatView` / mobile 不感知 provider 启用] → 移动端不暴露模型与凭据管理（移动 API 未涉及），不在范围内；服务端拦截对所有端生效，错误以通用文案呈现。
- [DeepSeek 锁定] → 默认模型与 DeepSeek 搜索备选依赖其 Key；若将来需要可取消，另起变更。

## Open Questions

- 是否在选择器提供“最近使用”置顶：不影响 spec 与任务拆分，可在实现后根据使用体验再定。
