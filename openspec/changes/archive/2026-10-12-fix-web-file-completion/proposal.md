# Proposal

## Why

Windows 宿主的 Web `@` 补全会因 fd 输出反斜杠而过滤掉目录及嵌套文件，TUI 的 Pi 补全却正常。缺少 fd/fdfind 时，Web 又只收到通用内部服务错误，用户无法知道如何恢复补全。

## What Changes

- 统一 Web 文件搜索的 fd 输出分隔符，恢复 Windows 文件、目录和子目录定位，保留现有工作区边界校验。
- 将缺少搜索依赖作为可跨 RPC 传递的明确业务错误，在候选面板提供宿主平台对应的安装命令。
- Windows 提示 `winget install sharkdp.fd`，macOS 提示 `brew install fd`；Linux 提供明确标注 Debian/Ubuntu 的 `sudo apt install fd-find` 示例及其他发行版安装文档入口。
- 添加跨平台候选与缺少依赖的回归验证，确保普通消息和草稿不受影响。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `web-ui`: 明确 Windows 宿主文件与目录补全，以及缺少 fd 时基于宿主平台的安装引导和错误传递行为。

## Impact

- 涉及 core 的 `workspace-files.ts`、gateway 的 workspace-files 服务边界、Web 候选反馈及相关测试。
- 使用现有 Chord 错误传递机制；正常搜索返回结构保持兼容，不升级 Pi/Chord 或增加运行时依赖。
- 本变更聚焦 Web；TUI 原有 Pi 补全不改动。不自动安装工具，不扩展为通用系统依赖管理。
