# Proposal

## Why

当前 TUI 深色主题沿用蓝粉品牌色，辅助文字对比不足、卡片底色色相分散、代码颜色层级不清。浅色主题已适配良好，需要独立优化现有深色主题，让长时间阅读、工具输出与代码更清晰。

## What Changes

- 重做现有 dark 的冷灰蓝配色，参考 Tokyo Night 与 One Dark；统一背景层级、提高辅助文字对比，强化语法分类和状态辨识。
- 深色自绘表面明确默认前景与背景；主画布继续使用终端背景，不修改终端全局配色。
- 主题切换后完整更新已显示内容，防止旧着色残留及迟到的 auto 检测覆盖手动选择，保留草稿和展开状态。
- 保留 auto/light/dark、参数、环境变量和配置含义；auto 浅色仍使用当前蓝粉白，深色使用优化后的 dark。浅色配色保持原样，不新增主题。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `terminal-ui`: 修改品牌终端主题要求，解除深色与浅色同源品牌色约束，明确深色可读性、配色层级、切换一致性与降级表现。

## Impact

主要涉及 `packages/tui/src/theme/`、`tui.ts`、保存已着色内容的组件及 TUI 测试。更新现有主题选择说明，使 dark 不再标为 sakura-night。不修改 Web、gateway 协议、核心配置格式、Pi 版本、依赖或 CI/CD 平台。与进行中的 `unify-cli-help-output` 独立，沿用其 CLI 文案结构，避免覆盖其改动。
