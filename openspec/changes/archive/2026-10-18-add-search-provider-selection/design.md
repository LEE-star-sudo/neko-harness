# Design

## Context

- `web_search` / `web_extract` 由 `packages/core/src/web-search.ts` 提供，Tavily 的 URL、请求头、响应解析与工具逻辑耦合在同一文件；`runtime.ts` 以 `createWebSearchTools(resolveKey)` 安装，key 在调用时解析（运行时覆盖 > 保存值 > `TAVILY_API_KEY` > keyless）。
- 凭据为封闭集合 `CredentialProviderId = "deepseek" | "tavily"`，状态经 `NekoCredentials` 合约同步；网关与前端没有任何存放"非密钥偏好"的服务。`neko.config.json` 只在启动时读取。
- 持久化应用状态的既有模式是 pi-durable 文档（如 `app.neko.workspaces`，挂在 root 会话上，全局共用），变更通过网关 `ServerState` 的 revision 状态推送到 TUI/Web。
- 链路协议版本严格匹配（`APPLICATION_PROTOCOL = 4`），不匹配被客户端报告为不可重试的 `ApplicationProtocolError`。
- DeepSeek 官方接口（已用真实 key 验证）：`POST https://api.deepseek.com/v1/tools/search`（`query` 1-128 字符、`count` 1-50、`need_content`；返回 `results[]`，含 `title/url/snippet/summary/content/date/authority/rerank_score`）与 `/v1/tools/fetch`（仅 `url`；返回 `{title, content}`）。错误体为 OpenAI 兼容格式；Search 与 Fetch 各自 5 QPS（账号级），Fetch 另有目标域名 QPS；成功请求按次计费，2026-11-01 起收费。

动机与范围见 proposal.md，行为要求见 specs。

## Goals / Non-Goals

**Goals:**
- provider 抽象小而稳：只有 `search` 与 `extract` 两个能力，新增 provider 只需新增一个文件。
- 工具对模型的接口、subagents 只读工具集、提示词与前端工具渲染零改动。
- 选择在两端实时一致；默认 tavily，DeepSeek 仅在用户主动选择后使用。

**Non-Goals:**
- 不做按会话/工作区的选择，不做 provider 间自动故障切换。
- 不新增凭据项或凭据存储，不改 `FileCredentialStore`。
- 不抽象 provider 的参数差异（如 Tavily 的 `search_depth`）为用户可配置项。

## Decisions

### D1：provider 接口与目录

`packages/core/src/web-search/` 拆为：`index.ts`（工具与扩展，对外仍导出 `createWebSearchTools`）、`provider.ts`（类型）、`http.ts`（`readBounded`、`redact`、超时/取消、`WebToolError`）、`tavily.ts`、`deepseek.ts`。

```
interface WebSearchProvider {
  id: "tavily" | "deepseek"
  search(q: { query; limit }, ctx): Promise<Hit[]>        // Hit = { title, url, text, date? }
  extract(urls: string[], ctx): Promise<Page[]>            // Page = { url, text } | { url, error }
}
```

工具层负责参数校验（通用部分）、有界截断与输出格式化；provider 负责请求、响应解析、错误映射。`createWebSearchTools` 接收一个按调用解析 provider 的函数 `resolve(): Promise<WebSearchProvider | ToolError>`，而不是 key resolver。

备选：每个 provider 各自定义一对工具（`tavily_search` 等）。否决：模型要面对多套工具，且违背"工具对模型透明"的目标。

### D2：query 长度校验放在 provider

工具 schema 保持 `maxLength: 4096`（Tavily 的现有上限，避免 schema 层拒绝 Tavily 合法请求）；DeepSeek provider 在发请求前校验 128 字符并返回指引模型缩短的错误。工具描述中统一提示"query 尽量简短"。备选：schema 直接限 128——会不必要地约束 Tavily。

### D3：选择的持久化——存储文档

新增 `app.neko.search-settings` 文档（`scope: "conversation"`，挂在 root 会话，`history: "latest"`），形状 `{ provider: "tavily" | "deepseek" | null }`，`null` 表示"未保存"（回落配置文件，再回落 tavily）。runtime 在启动时读取并缓存于内存，`setSearchProvider` 在提交成功后更新缓存；工具调用读取缓存，不做每次存储读取。一个存储同时只被一个 Harness 打开，缓存无跨进程一致性问题。

备选：(a) 仅 `neko.config.json`——无法在 UI 中切换；(b) 写入 `credentials.json`——混入非密钥数据，破坏其"仅凭据、0600"的含义；(c) 独立 `~/.neko/settings.json`——多一个落盘点与锁。文档方案与 `app.neko.workspaces` 一致，且天然支持 commit 订阅同步。

配置文件新增 `webSearch: { provider }`（`parseNekoConfig` 校验取值、`mergeNekoConfig` 合并），经 runtime 选项 `searchProvider` 传入，仅作为"未保存"时的初始值。

### D4：不提供 auto，默认 tavily，选择即所用

曾设计 `auto`（有 DeepSeek key 则用 DeepSeek，否则 Tavily），但实测 DeepSeek Fetch 效果不如 Tavily，让它在用户未表态时自动接管会降低默认体验，因此取消：取值仅 `tavily`（默认）与 `deepseek`，由用户主动选择。取消后不再需要"生效 provider"这一派生状态，也不需要在凭据变化时重算；runtime 的工具解析函数只读取内存中的选择。已存在的非法保存值（如开发期写入的 `auto`）被忽略并回落到配置值或默认值。

### D5：显式选择不回退

`deepseek` 无 key 时 provider 直接返回带指引的 `WebToolError`，不发请求；`tavily` 无 key 仍走 keyless（既有行为）。不做静默回退——否则用户无法判断请求发往哪家，也会让计费/隐私出人意料。

### D6：DeepSeek 抓取并发与重试

`web_extract` 最多 20 个 URL，Fetch 为 5 QPS（账号级）。使用并发上限 3 的工作池逐 URL 调用；对 429、408、5xx 做最多 2 次退避重试（250ms、750ms 起，含抖动），受整体取消信号与 30 秒单请求超时约束；其余 4xx 不重试。结果按输入顺序输出，每个 URL 一个有界条目；预算分配沿用现有"每个 URL 预留名额"的做法。错误映射：401 检查 Key；402 充值；403 被安全策略拒绝；404 无法获取该页面；429 限流；5xx/超时可重试。`error.message` 经 `redact` 后截断再使用。

备选：整批并发。否决：20 个并发必然撞 5 QPS 与域名限流。

### D7：DeepSeek 搜索结果映射

`count = limit`（1-10，沿用工具范围）、`need_content = false`；`text = summary || snippet`（长摘要面向模型，600-800 字符，落在既有每条 2000 字符预算内），`date` 取 `results[].date`（RFC 3339，输出时截为日期）。`authority` 与 `rerank_score` 不输出，避免增加模型噪声。空数组输出 `No results.`。

### D8：网关契约与协议版本

新增 `neko.search`（`NekoSearchSettings`）合约，`ready` 变体包含 `state: { revision, selected }` 与方法 `set({ provider })`；服务器侧在 `ServerState` 增加同名状态，仅 `set` 成功后发布（选择与凭据互不影响）。`serialize` 串行化修改，持久化失败不发布成功状态。`set` 输入严格枚举校验。`client-session` 绑定并等待新合约 ready。该合约属于契约增加，按既有政策递增 `APPLICATION_PROTOCOL` 至 5，不提供回退；因此不需要"旧网关"兼容分支。

备选：把选择塞进 `CredentialStateSchema`。否决：凭据状态是"每 provider 的密钥状态"，混入非密钥偏好会污染语义，且同样需要改 schema。

### D9：TUI 与 Web 入口

- TUI：新 `SearchPanel`，沿用 `/login` 的挂载模式（面板互斥、保留草稿与焦点）与统一选择面板的列表/高亮样式；`/search` 加入补全与 `/help`。状态来自 `NekoSearchSettings.state` 与 `NekoCredentials.state`（用于"缺 Key"提示），订阅更新实时刷新。
- Web：`settings-page.tsx` 增加「搜索服务」卡片（单选），store 增加 `searchSettings` 并沿用 `credentials` 的 revision 单调保护；选择 DeepSeek 而缺 Key 时提示并链接到页面内对应凭据条目。

## Risks / Trade-offs

- [DeepSeek 开始收费（2026-11-01）] → 仅在用户主动选择 DeepSeek 后产生；README 与 `/search`、设置页文案说明计费方式。
- [用户选择 DeepSeek 后移除其 Key，搜索不可用] → 不静默回退；工具错误与两端面板均提示配置 Key 或切回 Tavily。
- [两家结果内容与长度分布不同，模型体验有差异] → 统一格式化与预算；用真实调用补一次手工对比（任务中列出）。
- [DeepSeek Fetch 的域名 QPS 与 429] → 有限重试后逐项报错，不拖垮整个调用。
- [协议版本递增使残留旧网关进程被拒] → 属既有政策下的预期行为，错误可识别；重启网关即可。
- [Fetch 由 DeepSeek 服务端发出，目标页内容可能含提示注入] → 与 Tavily 路径同等对待，输出有界；不改变现有工具审批与只读定位。

## Migration Plan

1. 先行重构：提取共享 http 与 Tavily provider，现有测试保持通过（行为不变）。
2. 加入 DeepSeek provider 与选择，默认 tavily：升级后所有用户行为不变，DeepSeek 仅在主动选择后使用。
3. 协议版本递增随版本发布；用户重启网关即可。
4. 回滚：将选择设为 tavily（或发布回退版本）即可恢复旧行为；选择文档对旧版本是未知 `app.neko.*` 文档，应被忽略（实现时需用旧版本读取验证）。
