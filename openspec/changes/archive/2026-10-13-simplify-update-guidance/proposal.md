# Proposal

## Why

Windows 用户通过 Bun 全局安装后执行 `neko update`，仍被 Unix 安装识别逻辑拒绝，提示没有给出具体操作。TUI 的版本页面还平铺多项内部版本及长篇说明，未同步 Web 的简洁展示方向。

## What Changes

- Windows 执行有效的 `neko update` 时直接提示先退出 neko，再运行 `bun add --global neko-harness@latest`；不进入安装识别、联网检查或安装流程。
- TUI `/version` 默认仅展示当前版本、准确状态和当前必要的下一步；新版本和重启建议按状态出现。
- 保留手动检查更新和独立版本详情入口，内部组件版本不在默认概览中平铺。
- TUI 在 Windows 显示 Bun 手动升级命令，macOS/Linux 继续显示 `neko update`；保持英语文案、原有重启优先级与编辑流程。
- 更新 CLI 帮助与用户升级说明。Web 本次不改，其现有 `neko update` 入口可通过 Windows CLI 得到手动指引。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `application-updates`: 明确 Windows CLI 手动升级指引及无副作用行为。
- `terminal-ui`: 版本概览按需展示，内部信息独立查看，升级命令随平台变化。

## Impact

涉及 `packages/cli/src/update.ts`、`main.ts`、`packages/tui/src/version-ui.ts`、相关测试与 README。无需新增依赖、修改协议或实现 Windows 自升级安装器；不扩大其他 Windows 功能的支持声明。
