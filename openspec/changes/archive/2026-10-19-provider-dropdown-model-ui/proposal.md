# Proposal

## Why

Web 的模型选择器按 provider 做手风琴折叠，每个模型是一张三行卡片；模型服务页把所有已启用 provider 的凭据整卡纵向堆叠。启用的 provider 越多（目录共 32 个，OpenRouter 单家即数百个模型），两处都越长、越需要反复展开和滚动，不够紧凑。

## What Changes

- **模型选择器**：用「provider 下拉（可键入搜索）+ 该 provider 的紧凑模型列表」取代手风琴分组。下拉默认选中当前会话模型所属 provider，每项显示模型数与「未配置 Key」标记。
- 模型行压缩为单行（名称、上下文窗口/图片/思考徽标），`modelId` 作为次要信息；保留「设为默认」★、思考强度、provider 不可用提示与「去配置」入口。
- 搜索框有查询词时跨 provider 平铺显示命中模型并带 provider 标签（保留现有跨 provider 搜索，如输入 `claude`）；清空后回到「下拉 + 列表」视图。
- **模型服务页**：用 provider 下拉（可搜索）选择一个 provider，页面只显示该 provider 的凭据卡；下拉覆盖全部 32 个目录 provider 并标注已启用/未启用与 Key 状态。取代「已启用整卡堆叠 + 折叠的更多模型服务」。
- 既有深链 `/settings#credential-<provider>`（来自选择器、输入卡片、联网搜索页）继续有效：定位到该 provider 并滚动到其卡片。
- 不改 core、网关、应用协议；设置页不新增模型列表（未启用 provider 的模型不经网关提供，保持范围小）。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `web-ui`：修改「凭据设置页」（provider 列表 → provider 下拉 + 单卡）与「Web 模型选择器」（折叠分组 → provider 下拉 + 紧凑列表，保留跨 provider 搜索）；「会话模型与思考强度设置」中“按 provider 分组”的描述随之调整。

## Impact

- 代码（仅 `packages/web/src/client`）：`components/model-picker.tsx`、`pages/settings-page.tsx`、`lib/providers.ts`（复用 `groupModels`）、新增可复用的 provider 下拉 combobox 组件；`primitives.tsx` 可能补图标。
- 测试：`packages/web/test/provider-pages.test.tsx` 需随 UI 更新，并补 combobox 键盘/搜索/深链用例。
- 规格：`openspec/specs/web-ui/spec.md`（归档时同步）。
- 无依赖、API、协议、持久化变化。
