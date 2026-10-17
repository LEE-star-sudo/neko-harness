# Tasks

## 1. Provider 抽象与 Tavily 迁移（行为不变）

- [x] 1.1 将 `packages/core/src/web-search.ts` 拆为 `web-search/{index,provider,http,tavily}.ts`：提取 `readBounded`、`redact`、超时/取消与 `WebToolError`，定义 `WebSearchProvider`（`search`/`extract`），把 Tavily 请求与解析移入 `tavily.ts`；更新 `runtime.ts` 与测试的导入路径，验证 `bun run test` 中既有 `web-search.test.ts` 不改断言即通过
- [x] 1.2 让 `createWebSearchTools` 接收"按调用解析 provider"的函数（暂以固定 Tavily 实现），工具名、schema、输出格式不变；验证 `runtime.test.ts` 中 `neko-web-search` 扩展断言与 subagents 只读工具集测试仍通过

## 2. DeepSeek provider

- [x] 2.1 新增 `web-search/deepseek.ts` 的 search：`POST /v1/tools/search`、`count=limit`、`need_content=false`，用 `summary || snippet` 与日期映射为统一 `Hit`；128 字符/空白 query 在发请求前拒绝；空结果输出 `No results.`。在 `core/test/web-search.test.ts`（或同目录新文件）用注入的 fetch 覆盖：请求头/体、结果映射、超长 query 不发请求、空结果、错误体遮蔽 Key
- [x] 2.2 实现 DeepSeek extract：并发上限 3 的逐 URL `POST /v1/tools/fetch`，对 429/408/5xx 最多 2 次退避重试（受取消与超时约束），401/402/403/404 等映射为可操作的逐项或整体错误；结果按输入顺序、每个 URL 保留有界名额。测试覆盖：部分失败不影响其余、429 重试后成功与耗尽、402/401 不重试且指引正确、取消信号中止、并发不超过上限
- [x] 2.3 用 `DEEPSEEK_API_KEY` 对真实接口做一次手工冒烟（search 与 fetch 各一次，含无效域名），记录与 Tavily 输出长度/格式的对比结论到 PR 说明（不打印密钥）

## 3. 选择状态与 provider 解析（core）

- [x] 3.1 在 `config.ts` 增加可选 `webSearch.provider`（类型、`validate`、`mergeNekoConfig`）并在 `gateway.ts` 传入 runtime 选项 `searchProvider`；在 `core/test` 的配置测试中覆盖合法值、非法值报错、合并优先级
- [x] 3.2 在 `runtime.ts` 新增 `app.neko.search-settings` 文档（root 会话、`history: "latest"`），启动时读取并缓存；提供 `searchSettings()`（返回 `selected`）与 `setSearchProvider(provider)`（校验取值、持久化后更新缓存）；优先级：保存值 > 配置值 > `tavily`。验证：重启后保留、非法值（含 `auto`）被拒、存储失败时缓存不变
- [x] 3.3 将所选 provider 接入 `createWebSearchTools`（每次调用按当前选择取 provider）：deepseek 无 key 时返回带"配置 Key 或切换 provider"指引的工具错误且不发请求；tavily 无 key 仍 keyless。补 runtime 级测试：默认 tavily、选择不回退、保存选择后下一次调用生效
- [x] 3.4 在 `core` 对外导出新增类型（选择值、`SearchSettings`），在 `credential-providers.ts` 中更新 DeepSeek 条目的 `envVar` 注释为"模型与搜索共用"；验证 `bun run check` 类型通过

## 4. 网关合约与同步

- [x] 4.1 在 `gateway/src/contract.ts` 新增 `NekoSearchSettings`（`ready` 变体：`state: { revision, selected }`，`set({ provider })`，严格枚举）并导出类型；在 `server-services.ts` 的 `ServerState` 增加状态与 `serve` 处理，`set` 成功后发布，经 `serialize` 串行化、失败不发布成功状态；在 `client-session.ts` 绑定并等待 ready。网关测试覆盖：双客户端同步、保存/移除 DeepSeek Key 不改变选择、非法取值（含 `auto`）被拒、持久化失败不发布、重连恢复最新状态
- [x] 4.2 将 `APPLICATION_PROTOCOL` 递增为 5，更新 `application-version`/gateway-startup 相关测试与 `AGENTS.md` 中"链路协议版本"数字；验证旧版本握手被拒的测试通过（`bun run test`）

## 5. TUI `/search` 面板

- [x] 5.1 新增 `packages/tui/src/components/search.ts` 的 `SearchPanel`（沿用 `LoginPanel` 的互斥挂载、保留草稿/焦点与统一选择面板样式）：英语列出 tavily/deepseek，标出当前选择，显示各 provider 的凭据状态与 DeepSeek 缺 Key 时指向 `/login` 的提示，Enter 确认、Esc 取消、失败显示不含密钥的错误并可重试，订阅 `NekoSearchSettings`/`NekoCredentials` 实时刷新；在 `tui.ts` 注册 `/search`（含 `gateway.ts` 绑定）、补全与 `/help`。新增 `tui/test/search.test.ts` 覆盖：切换并保存、默认 tavily、缺 Key 提示、保存失败、多端更新、草稿不变
- [x] 5.2 更新 `tui` 帮助文案提及 `/search`，并验证 `/help` 与斜杠补全测试包含该命令

## 6. Web 搜索服务卡片

- [x] 6.1 在 `packages/web/src/client/lib/{gateway,store,bootstrap}.ts` 增加 `searchSettings` 状态（沿用 revision 单调保护）与 `setSearchProvider` 动作；在 `settings-page.tsx` 新增「搜索服务」卡片：单选 tavily/deepseek（无 auto）、说明各项含义、显示当前选择及其凭据状态、选择 DeepSeek 缺 Key 时提示并链接到对应凭据条目，保存期间禁用防重复，失败显示可重试反馈。补 Web 客户端测试覆盖：切换、保存 Key 不改变选择、缺 Key 提示、保存失败、重复提交被阻止；验证 `bun run check` 与 Web 构建通过

## 7. 帮助、文档与整体验证

- [x] 7.1 更新 `packages/cli/src/main.ts`、`packages/gateway/src/cli-args.ts`、`packages/tui/src/main.ts` 的帮助文案，说明 `/search`、Web 设置页与 `webSearch.provider`；更新 README 联网说明（默认 Tavily、可选 DeepSeek、DeepSeek 计费时间点）；验证对应帮助输出测试与 `scripts/test-package.ts` 通过
- [x] 7.2 整体验证：`bun run check`、`bun run test`、`bun run build` 全部通过；手工用 `bun run neko tui` 与 `bun run neko web` 验证 `/search` 与设置页切换在两端同步，并在 deepseek/tavily 两种选择下各触发一次 `web_search` 与 `web_extract`，确认所选 provider 与实际请求一致
- [x] 7.3 验证回滚路径：保存选择后用上一版本网关打开同一存储，确认未知 `app.neko.search-settings` 文档被忽略且不影响启动；若不成立，在设计中补充处理方式

## 8. 取消 auto 模式（评审后调整）

- [x] 8.1 因 DeepSeek Fetch 效果不佳，取消 `auto`：选择仅 tavily（默认）/ deepseek，移除 `resolveSearchProvider`、`select.ts`、`effective` 状态及凭据变化触发的重算；core、gateway、TUI、Web、CLI 帮助、README 与对应测试同步调整，并验证 `bun run check` 与相关测试通过

## Workflow follow-up

- 实现完成并通过评审后，归档该变更并同步 `openspec/specs/web-search`、`session-gateway`、`terminal-ui`、`web-ui`、`cli-interface`。
