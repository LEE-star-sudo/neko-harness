## Context

- Web：`/settings/search` 渲染「搜索服务」卡片，再为 `SEARCH_CREDENTIAL_PROVIDERS`（只有 Tavily）各渲一张 `ProviderCredentialCard`。DeepSeek 的 spec 在 `MODEL_PROVIDERS` 中，Key 只有一份（`credentials.statuses.deepseek`），保存/移除经同一 `appActions`，天然多端同步。
- TUI：`/login` 的 `LoginPanel` 用 `CREDENTIAL_PROVIDERS`（模型在前、Tavily 在后）按 `spec.kind` 分「Model providers」/「Web search」两组渲染，选中、过滤、Enter、`#backToList` 都按 provider id 定位。`/search` 是通用 `PickerPanel`，已有 `listKey` 钩子（`/jobs` 用它处理 `s`，`/model` 用它处理 `d`）。
- 网关契约与应用协议不涉及；`credentials` 状态已包含 deepseek。

## Goals / Non-Goals

**Goals:**
- 搜索设置（Web 页、TUI `/login` 的搜索分组、TUI `/search`）都能直接触达 DeepSeek Key，且不依赖当前选了哪个搜索服务。
- DeepSeek 仍只有一份凭据，两处入口状态一致。

**Non-Goals:**
- 不新增「搜索专用 DeepSeek Key」，不改解析顺序、不改契约、不提升协议。
- 不在 Web 搜索页或 `/search` 面板提供 provider 启用开关。
- 不改变模型服务页（`/settings`）与 `/login` 的模型分组行为。

## Decisions

1. **Web 复用凭据卡而不是新组件**：搜索页在 Tavily 之后追加 `MODEL_PROVIDERS` 中的 deepseek spec 渲染 `ProviderCredentialCard`，不传 `enable`（卡片本来就是可选启用开关），并加一行「与模型服务共用同一个 Key」说明（卡片增加可选 `note` 属性，缺省不显示）。备选：做一个跳转链接——用户已经找不到链接，直接放卡片更可靠。
2. **缺 Key 提示改为页内指引**：`searchWarning` 文案改为「请在下方 DeepSeek 卡片配置密钥，或改选 Tavily」，去掉跳到 `/settings#credential-deepseek` 的链接（卡片 id 仍是 `credential-deepseek`，可以用页内锚点 `#credential-deepseek`，但同页无需跳转，保持纯文字）。
3. **TUI 登录列表以「行」而非 provider id 为单位**：列表项改为 `{ spec, group }`，DeepSeek 在 `model` 与 `search` 两组各出一行；选中以行索引为准，`#provider` 仍存 provider id。`#backToList` 返回时优先恢复进入前所在的那一行。
   - 备选：把 DeepSeek 的 `kind` 改成 `search` 之类——会破坏 `MODEL_PROVIDERS`/启用门禁，且目录与 Pi 对账测试依赖它，否决。
   - Web search 组的 DeepSeek 行：Space 不切换启用，沿用现有 `#toggleEnabled` 对非模型分组的提示，文案改为说明共用 DeepSeek 凭据；该行标记不显示 `[x]`。过滤时按 `名称 id 环境变量` 匹配，DeepSeek 在两组各匹配一次。
4. **`LoginPanel.show` 增加可选初始 provider**：`show(state, subscribe, provider?)`；给定时直接进入 `key` 级并设置 `#provider`，选中行落在 Web search 组（来自搜索面板）或其 provider 所在组。`#backToList`/Esc 行为不变。
5. **`/search` 的 `k` 键用 `listKey`**：过滤框为空且有高亮项时，关闭搜索面板（含停止订阅）、再调用 `#login.show(..., value)` 并聚焦登录面板；其他情况返回 false 让原有逻辑处理。提示文案和 `/help` 同步。备选：在 `/search` 内联收集密钥——违反「面板不收集密钥」的现有约束，否决。
6. **`/search` 状态描述改为始终带 Key 状态**：Tavily 已有，DeepSeek 描述始终含来源（缺 Key 时追加 `Press k to set a key`），不再只在缺 Key 时替换成提示。

## Risks / Trade-offs

- [DeepSeek 在列表中出现两行，index 与过滤逻辑易出错] → 选中与渲染都按行对象比较，补充 login 测试：两组各一行、过滤、Enter 进入后保存两处同步。
- [Web 搜索页的 DeepSeek 卡片与模型服务页的是同一份凭据，用户可能以为是两份] → 卡片说明明确「共用」，spec 场景覆盖同步。
- [`k` 与过滤输入冲突] → 仅在过滤框为空时触发，同 `/model` 的 `d` 约定。
