## 1. Web 联网搜索页

- [x] 1.1 `ProviderCredentialCard` 增加可选 `note` 属性，`settings-search-page.tsx` 在 Tavily 后始终渲染 DeepSeek 卡片（不传启用开关，note 说明与模型服务共用 Key）；页面说明文案去掉「DeepSeek 的 Key 在模型服务中配置」。验证：`packages/web/test` 中搜索页测试断言 tavily 与 deepseek 两张卡同时存在，且 deepseek 卡无启用开关。
- [x] 1.2 `searchWarning` 与 `SearchServiceCard`：缺 Key 提示改为页内指引，移除跳转 `/settings#credential-deepseek` 的链接。验证：`search-settings.test.tsx` 更新后通过，文案不再含「模型服务」跳转。
- [x] 1.3 保存/移除 DeepSeek Key 的状态同步：验证测试中在搜索页保存 DeepSeek Key 后，当前选择（tavily）不变。

## 2. TUI /login 搜索分组

- [x] 2.1 `LoginPanel` 列表项改为按「行」（spec + 分组）定位：DeepSeek 在 Model providers 与 Web search 两组各一行，选中、过滤、Enter、`#backToList` 恢复所在行都以行为准。验证：`login.test.ts` 新增用例——两组各一行、过滤 deepseek 得两行、Enter 进入后保存，两行状态同步。
- [x] 2.2 Web search 组的 DeepSeek 行：无 `[x]` 标记，Space 不切换并提示共用 DeepSeek 凭据；模型组 DeepSeek 行行为不变（锁定提示）。验证：`login.test.ts` 覆盖两种 Space 行为。
- [x] 2.3 `LoginPanel.show(state, subscribe, provider?)` 支持直接进入密钥输入级。验证：`login.test.ts` 覆盖带 provider 打开、Esc 回列表、保存后自动关闭。

## 3. TUI /search

- [x] 3.1 `search-ui.ts`：描述始终含 Key 状态，DeepSeek 缺 Key 时提示按 `k`；通过 `listKey` 实现 `k`（过滤框为空且有高亮项时），关闭搜索面板并经 `tui.ts` 打开 `/login` 对应 provider 密钥输入，草稿与附件不变。验证：`search.test.ts` 覆盖 `k` 触发回调、过滤框非空时不触发、文案更新。
- [x] 3.2 `help-ui.ts` 与 `labels.ts`（`/search` 描述）提及 `k`。验证：现有 help/labels 测试更新后通过。

## 4. 验证

- [x] 4.1 `bun run check`、`bun run test`、`bun run build` 通过；Web 搜索页在窄屏（375px）下两张凭据卡布局正常。
