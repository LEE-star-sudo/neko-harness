# Design

## Context

现有凭据链路：pi-ai `CredentialStore`（`FileCredentialStore` 落 `~/.neko/credentials.json`，存储格式已是 `Record<providerId, Credential>`，多 provider 零改动）→ core `runtime.ts` 写死 `"deepseek"` 的 `credentialStatus/saveCredential/removeCredential` → 网关单例服务 `neko.credentials`（`NekoCredentialState = CredentialStatus & { revision }`，`save({key})/remove()`）→ TUI `LoginPanel` 与 Web 设置页各自写死 DeepSeek。Tavily 侧事实（调研已验证）：keyless 模式仅需 `X-Tavily-Access-Mode: keyless` 头即可用 `/search`、`/extract`；同时带 Bearer key 时 key 优先；限流时返回自然语言指引；`/crawl`、`/map`、`/research` 需要 key，本 change 不用。pi-durable 工具用 `defineExtension` + `defineTool`（`Type.Object` 参数，`execute(params, api, context)`），参照 `packages/core/src/read-image.ts`。

## Goals / Non-Goals

**Goals:**

- agent 默认拥有 `web_search`/`web_extract` 工具，零配置（keyless）可用。
- 凭据表面（core API → 网关契约 → TUI/Web）按 provider 参数化，已知集合写死为 `"deepseek" | "tavily"`。
- Web 设置页重构为紧凑统一的多 provider 布局。

**Non-Goals:**

- Tavily Crawl/Map/Research、x402 支付、`auto_parameters` 等高级参数。
- 通用/开放注册的 credential 槽位系统（任意 provider id 由前端传入）。
- 会话级凭据（凭据始终是宿主用户级，所有工作区共用）。
- DeepSeek 的 submit 前 `checkAuth` 硬校验行为不变；Tavily 不加硬校验（keyless 兜底）。

## Decisions

### D1: Tavily 调用用裸 `fetch`，不引入 `@tavily/core`

只需 `/search`、`/extract` 两个端点，请求体薄；keyless 头 SDK 未文档化支持，裸 fetch 对 header 与限流错误透传有完全控制；符合"上游依赖精确锁版本、薄封装"的约定，且本项目响应类型自定义（只取 title/url/content/score）。备选 SDK 提供完整类型，但为两个端点引入锁版依赖不值。

### D2: 工具形态——core 新增 `web-search.ts`，工厂式 Extension

`createWebSearchTools(resolveKey: () => Promise<{ key?: string }>)` 返回 `defineExtension({ name: "neko-web-search", tools: [web_search, web_extract] })`。工厂闭包持有凭据解析函数（core 拥有 `CredentialStore`，`ToolExecutionApi` 不暴露凭据读取），`runtime.ts` 启动时 `registry.install(...)`。这样凭据在**每次调用时**现读，保存/移除后下一次调用即生效，无需热替换扩展。

- `web_search(query, maxResults?)`：`maxResults` 默认 5、上限 10；固定 `search_depth: "basic"`（keyless 也支持全参数，但 advanced 更慢更贵，agent 默认值求稳）。返回按 score 排序的 title/url/content 列表。
- `web_extract(urls)`：上限 20 个 URL，`format: "markdown"`；`results` + `failed_results` 都返回给模型。
- 输出有界截断：单来源 content 截断到约 2000 字符，总输出截断到约 12000 字符（与 `read_image` 等现有工具"有界输出"一致；具体常量在实现时定，不进 spec）。

### D3: 凭据描述表 + per-provider 解析（写死已知集合，不做开放注册）

core 新增静态描述（仅 deepseek/tavily 两行）：`{ id, envVar, signupUrl, keyless }`。解析优先级：runtime 覆盖 > 保存值 > 环境变量 > `keyless`（仅 tavily）/ `none`（deepseek）。`CredentialStatus.source` 联合类型加 `"keyless"`。DeepSeek 的 env 探测仍由 pi-ai 负责运行时使用、core 负责状态展示；Tavily 的 env（`TAVILY_API_KEY`）与 keyless 头完全由 core 自己处理。备选"开放注册任意 provider"被否：每把 key 的展示语义（硬依赖 vs keyless 兜底、申请链接）必须有个静态归属处，开放注册只是把这些元数据挪到别处。

`NekoRuntimeOptions` 增加 `tavilyApiKey?: string`（仅内存、不落盘、不写 env），与现有 `apiKey` 对齐——通过包一层 `CredentialStore` 实现，同 deepseek 的 `runtimeKey` 手法。

### D4: core API 与网关契约参数化（breaking）

- core：`credentialStatus(provider)`、`saveCredential(provider, key)`、`removeCredential(provider)`，provider 校验在已知集合内。
- 网关：`NekoCredentialState` 变为 `{ revision, statuses: Record<"deepseek" | "tavily", CredentialStatus> }`；`save({ provider, key })`、`remove({ provider })`。单一 revision 继续覆盖整个状态对象（变更低频，无需 per-provider revision）。
- 前端同步适配：TUI 的 `source === "none"` 发送拦截改读 `statuses.deepseek`；Web store 的 `credentials` 消费点同步改。

### D5: TUI `/login`——provider 切换在面板内完成

`LoginPanel` 加 provider 选择（左右方向键或 Tab 在 DeepSeek/Tavily 间切换，面板加一行显示当前 provider），save/remove 带 provider 调网关；切换 provider 时清空未保存输入。不新增 `/login <provider>` 命令参数（密钥 MUST 走独立输入，命令参数同理不收 key）。

### D6: Web 设置页——提取共享条目组件，紧凑列表

提取 `ProviderCredentialCard`（图标/名称 + 来源徽章 + env 状态行 + 密码输入 + 保存/移除 + 申请链接），DeepSeek/Tavily 两行卡片纵向紧凑排列；沿用现有分区 design tokens（sakura/tianyi/ink），页面收窄为紧凑单列。Tavily 无 key 时来源徽章显示"keyless（受限）"语义而非"尚未配置"。

## Risks / Trade-offs

- [keyless 限流额度官方未公布，可能很快撞墙] → 工具错误结果透传 Tavily 的自然语言指引（含配置 key 引导），模型可向用户转述；前端来源徽章让用户一眼看到受限状态。
- [网关契约 breaking，旧客户端连新网关会拿错状态形状] → TUI/Web 与网关同仓库同版本发布，无跨版本兼容承诺；revision 机制保证重连取最新状态。
- [`web_search` 默认安装会增加 system prompt 与误调用 token] → 工具描述写清"仅在需要实时/未知信息时使用"；输出截断有界；后续如需可按扩展机制卸载。
- [裸 fetch 需自维护超时/错误处理] → 固定 30s 超时，错误统一收敛为工具错误结果（`isError: true`），不抛出中断 run。
- [keyless 与 key 同时发送时 key 优先（官方语义）] → core 解析出 key 时不再附带 keyless 头，避免语义混淆。

## Migration Plan

契约 breaking 仅限本仓库内部（网关 + 两个前端同仓发布），无外部消费者；`~/.neko/credentials.json` 格式不变（已是 per-provider map），旧保存的 DeepSeek key 原样生效。无需数据迁移；回滚即 revert 本 change，存储格式无变化。

## Open Questions

- keyless 的具体限流数值文档未给，实现时以实测错误响应为准调错误文案；不影响 spec 与任务拆解。
