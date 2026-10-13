# Design

## Context

参见 proposal.md。`updateCommand` 目前先校验发布版本，再以 Unix 符号链接确认全局安装；所有识别失败统一报不支持。`version-ui.ts` 复用 `PickerPanel`，但概览直接列出五项版本并附带固定升级说明。Web 已精简主要版本展示，本次不更改 Web 或传输协议。

## Goals / Non-Goals

**Goals:** 给 Windows 用户可直接执行的命令，让 TUI 状态准确且容易操作，复用现有版本状态计算和面板交互。

**Non-Goals:** Windows 自动安装、shim 解析、辅助升级进程、自动停止服务、全平台支持认证、Web 改版。

## Decisions

### D1 Windows 提前返回手动指引

有效参数解析之后、版本/安装检测之前识别 win32。输出“请先退出 neko，然后运行：\nbun add --global neko-harness@latest\n完成后重新启动 neko。”，正常退出（退出码 0 表示指引成功，不代表安装完成）。源码或非全局执行也只返回指引，不自动改变任何安装。`--help` 描述 Windows 行为，无效参数维持现有错误退出。

保留 macOS/Linux 自升级流程。测试通过显式可注入平台参数覆盖 Windows 分支，验证 run/checker/lock 均未调用，而非在测试中修改全局 process.platform。无需适配启动器或引入新依赖。

### D2 复用状态判断，拆分概览与详情

保留 updateAction 的组件差异优先级。版本菜单提供 Version、Check for updates、Version details 三项；第一项及手动检查结果返回简洁概览，第三项才列出完整内部版本。沿用详情滚动与逐层 Esc 行为。

概览示例：`Current: v0.2.7` + `Up to date`；可安装时增加 `Latest: v0.2.8` 与相应命令；待重启时仅显示 `Restart neko` 或 `Restart neko tui` 及必要步骤。网关待重启时仍说明需先完成任务并退出共享该网关的 TUI/Web/serve，避免复用者只重启自身。

无组件差异时，仅在信息齐全且检查成功时显示 Up to date；unknown/checking/failed/development 独立呈现。检查抛错时保留显式失败反馈，不能被旧成功状态覆盖。发现运行版本更高但协议兼容时不引导降级。

### D3 平台命令与范围

TUI 使用本机平台决定命令，Windows 为 `bun add --global neko-harness@latest`，其他当前支持平台为 `neko update`。长命令在窄窗口换行/滚动，保证可完整查看。CLI 与 TUI 可以复用小型命令选择函数，但不为此增加远程字段。Web 现有入口继续提供 `neko update`，Windows CLI 负责给出最终手动命令；不根据浏览器平台猜测宿主系统。

### D4 验证

CLI 用可注入平台和失败即报错的副作用桩，证明 Windows 分支只输出指引；保留现有 Unix 安装回归。TUI 覆盖概览状态矩阵、详情保留、检查失败、两种平台命令及 80×24/60×16 实际 PTY 焦点/草稿恢复。平台注入测试不宣称 Windows 真实自升级已验证。

## Risks / Trade-offs

- [Windows 正常退出可能被误认为已安装] → 文案只描述待执行操作，不包含升级完成或最新断言。
- [精简隐藏排错信息] → 保留显式详情入口，默认界面减少信息量。
- [长 Windows 命令挤占小窗口] → 验证换行、滚动与状态栏，完整命令在版本面板可查看。
- [未知状态误判] → 不照搬 Web 的兜底徽章，使用明确信息完整性条件。

## Migration Plan

无数据迁移，随下一版本交付。已有 Windows 旧版本需先手动执行 Bun 安装命令一次，才能获得新提示。回退仅涉及 CLI/TUI 展示代码；README 补充 Windows 手动升级说明，不扩大应用整体支持范围。
