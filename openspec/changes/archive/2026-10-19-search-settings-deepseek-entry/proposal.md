## Why

联网搜索可选 Tavily 或 DeepSeek，但只有 Tavily 的 Key 能在搜索设置里直接配置。DeepSeek 的 Key 只在「模型服务」页与 `/login` 的模型分组里，且只有在「已选 DeepSeek 又缺 Key」时才出现一行小链接，选 Tavily 的用户根本找不到入口，容易误以为 DeepSeek 搜索无法配置。

## What Changes

- Web 联网搜索页：在 Tavily 卡片旁始终显示 DeepSeek 凭据卡（复用现有凭据卡），说明与「模型服务」共用同一个 DeepSeek Key；缺 Key 提示改为指向本页的 DeepSeek 卡片，不再跳转到模型服务页。页面说明文案同步去掉「DeepSeek 的 Key 在模型服务中配置」。
- TUI `/login` 面板：「Web search」分组在 Tavily 之外加入 DeepSeek 行，与 Web 一致；该行与「Model providers」分组里的 DeepSeek 指向同一份凭据，进入后是同一个密钥输入。
- TUI `/search` 面板：每项始终显示 Key 状态；新增 `k` 快捷键，对高亮 provider 直接打开 `/login` 的密钥输入。`/search` 本身仍不收集密钥。DeepSeek 缺 Key 的提示改为指向 `k`。
- 不改网关契约与应用协议：DeepSeek 的凭据状态本来就在 `credentials.statuses.deepseek`。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `web-ui`：「Web 搜索服务设置」与「Web 联网搜索设置页」两条要求——联网搜索页开始承载并管理 DeepSeek Key，缺 Key 提示改为页内指引。
- `terminal-ui`：「TUI 搜索 provider 面板」新增 `k` 直达密钥输入；「登录配置」的 Web search 分组加入 DeepSeek。

## Impact

- `packages/web/src/client/pages/settings-search-page.tsx`、`components/search-service-card.tsx`、`lib/search-settings.ts`（及其测试）。
- `packages/tui/src/components/login.ts`（分组条目、选中定位、可选初始 provider）、`search-ui.ts`、`tui.ts`（`k` 键与打开 `/login` 的衔接）、`help-ui.ts`（及 `login.test.ts`、`search.test.ts`）。
- 无新依赖，无契约或存储变化。
