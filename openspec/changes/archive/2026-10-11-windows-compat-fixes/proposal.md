# Proposal

## Why

Windows 支持（2026-10-11-windows-support）落地后的实测暴露若干高频小坑：Web 工作区面板的面包屑导航在 Windows 盘符路径下造出 `/D:\code` 非法路径导致选择工作区直接报错；TUI 手输 `D:\code\img.png` 这类路径被反斜杠转义吞掉；Windows 强杀网关后端口文件残留。均为小改动可修的兼容性欠账。

## What Changes

- Web 工作区面板面包屑平台感知：Windows 盘符路径按 `[\\/]` 双分隔符切分、拼回不强加 `/` 前缀；gateway browse 入口归一化 `/X:...` 形态（兜底手输与旧客户端）。
- Windows 盘符枚举：browse 根请求（`/`）在 win32 返回可用盘符列表（`A:\`–`Z:\` 探测），面板根按钮直达该层，支持跨盘选择；同时消除根按钮与盘符 crumb 的重复。
- TUI 图片路径解析在 Windows 不把 `\` 当转义符；图片显示名与 @ 补全的 `.git` 兜底过滤改用 `[\\/]` 双分隔符。
- Windows 强杀网关（SIGTERM=TerminateProcess，close 不执行）后，由调用方在 `stopGatewayProcess` 后补删端口文件，缩小残留窗口。
- POSIX 行为不变：所有修改对 macOS/Linux 执行路径无语义影响。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `web-ui`: 「通过宿主目录面板添加工作区」——面包屑导航须正确处理 Windows 盘符路径，服务端须归一化带前导斜杠的盘符路径。
- `terminal-ui`: 「Pi 风格图片输入」——Windows 反斜杠路径（`D:\...`）须被正确识别为图片路径而非被转义破坏。
- `session-gateway`: 「Windows 网关地址发现」——端口文件清理须覆盖网关被强杀（非正常关闭）的场景。

## Impact

- **代码**：`packages/web/src/client/components/workspace-picker.tsx`（面包屑）、`packages/gateway/src/workspaces.ts`（入口归一化）、`packages/tui/src/image-input.ts`（转义分支平台条件）、`packages/tui/src/tui.ts` 与 `packages/tui/src/file-completion.ts`（双分隔符）、`packages/gateway/src/process.ts` 及其调用方（端口文件补删）。
- **测试**：各处新增/调整平台分支用例；POSIX 现有测试不变。
- **依赖**：无新增；CI 不变。
