# Design

## Context

纯前端改动（`packages/web/src/client`），动机见 proposal.md。现状：

- `ModelPicker` / `ModelForm`（`components/model-picker.tsx`）用 `groupModels(models, query)` 生成分组，手风琴展开，模型为三行卡片。
- `SettingsPage`（`pages/settings-page.tsx`）把已启用 provider 的 `ProviderCredentialCard` 全部堆叠，未启用的放进 `<details>` 并带搜索。
- 深链 `/settings#credential-<id>` 来自 model-picker、composer 与 `search-service-card`（含测试断言 `a[href="/settings#credential-deepseek"]`），页面靠 `document.getElementById(hash)` 滚动。
- `useNekoState().models` 只含已启用 provider 的模型；设置页的凭据状态来自 `credentials.statuses`，含 `enabled`、`source`。
- 现有 `primitives.tsx` 无通用 combobox；`composer-suggestions.tsx` 有一个 listbox，但耦合输入补全。

## Goals / Non-Goals

**Goals:**
- 两处都以「provider 下拉（可搜索）」为主入口，一次只显示一个 provider 的内容。
- 一个可复用、无障碍的 provider 下拉组件，两处共用。
- 保留所有现有行为：跨 provider 搜索、设为默认、思考强度、provider 不可用提示、深链、敏感输入清除。

**Non-Goals:**
- 不改 core、网关、应用协议、凭据/启用语义，不新增网关接口。
- 设置页不展示模型列表（未启用 provider 的模型不经网关提供）。
- 不改 TUI、移动端 Web 之外的前端。

## Decisions

1. **自研轻量 `ProviderCombobox`，不引入依赖。** 采用 ARIA combobox 模式：`input role="combobox"` + `aria-expanded/controls/activedescendant` + `role="listbox"` 弹出层，支持键入过滤、↑/↓/Home/End、Enter 选定、Escape 关闭。项目依赖精确锁版本且偏少依赖；备选的原生 `<select>` 不能键入过滤、32 项且需展示徽标，不满足；第三方库（Radix/Headless UI）增加依赖与样式适配成本。弹出层随内容流定位（不用 portal），在 Modal 内避免层叠与焦点陷阱问题，宽度不超过容器。
2. **选择器状态：`providerId` + `query`。** `query` 为空时显示 `providerId` 的模型；非空时用现有 `groupModels(models, query)` 的结果平铺（每行带 provider 名徽标），不再有 `open` 展开状态。`providerId` 初始为当前会话模型的 provider，不在可选集合内则取首个可选 provider；`groupModels` 的顺序与 `MODEL_PROVIDERS` 目录一致，继续复用。
3. **模型行单行化。** 名称 + 小徽标（上下文窗口、图、思）+ ★；`modelId` 用 `title` 与次要灰字（窄屏隐藏），保持 `describeModel` 文案可作 `aria-label`/`title`。缺 Key 的 provider 保持整列表置灰不可选，列表头显示「未配置 Key · 去配置」。
4. **设置页：`selected` provider 状态 + 单卡。** 下拉覆盖全部 `MODEL_PROVIDERS`，每项显示名称、启用/未启用与 Key 来源简述；默认选 DeepSeek。`selected` 以 `key={selected}` 渲染 `ProviderCredentialCard`，使切换时卡片内部的密码输入状态随卸载清除。
5. **深链同步。** 页面读取 `location.hash`（`credential-<id>`）初始化/更新 `selected`，监听 `hashchange`；`ProviderCredentialCard` 保留 `id="credential-<id>"`，选中后 `scrollIntoView`。下拉切换时不强写 hash，避免污染历史。
6. **启用后的下拉状态指示。** 已启用项前置实心点，未启用空心点；不重排顺序，保持目录顺序便于记忆，已启用项不强制置顶（备选：置顶分组——会让列表在启用/取消时跳动）。

## Risks / Trade-offs

- [自研 combobox 的无障碍细节遗漏] → 对照 ARIA APG combobox（list autocomplete）实现，测试覆盖键盘、`aria-activedescendant`、Escape 恢复焦点。
- [跨 provider 搜索时的 provider 标签使行变长] → 徽标用短名并截断，小屏换行不溢出；375px 宽度手动/测试验证无横向溢出。
- [下拉弹出层在 Modal 内被裁剪] → 弹出层在 Modal 内容内绝对定位且限制最大高度并可滚动；必要时向上展开。
- [设置页一次只显示一个 provider，失去一屏总览] → 下拉项内显示启用/Key 状态摘要来补偿。
- [现有测试依赖旧结构（手风琴、`更多模型服务`、`搜索模型服务`）] → 同步更新 `provider-pages.test.tsx`。
