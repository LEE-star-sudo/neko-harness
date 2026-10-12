# Proposal

## Why

`/skill:<name>` 展开后的用户消息是完整 `<skill>` XML 块加技能正文，在 Web 聊天气泡与 TUI 消息流中都整段铺开（动辄几十行），淹没真正的用户意图（参数）。两端都应把技能调用渲染为可辨识的紧凑卡片，正文默认折叠、按需展开。

## What Changes

- core 新增共享解析器：把展开后的技能调用文本解析为 `{ name, location, body, args }`（解析失败返回 null，调用方回退原样渲染）。Web 与 TUI 共用，避免两端各自实现正则漂移。
- Web：用户消息中的技能调用块渲染为工具卡风格的折叠卡片——图标 + `skill:<name>` + 截断的 location，点击展开查看正文；参数部分仍以普通用户文本显示。Icon 组件新增技能图标。
- TUI：用户消息中的技能调用块折叠为单行标记（图标 + `skill:<name>` + 参数预览 + 来源路径提示），不再铺开正文。
- 非技能调用形态的用户消息（含 `/skill:` 未命中透传的原文）渲染不变。

## Capabilities

### Modified Capabilities

- `web-ui`: 新增 Web 技能调用消息展示 requirement（识别、折叠卡片、展开正文、参数展示、回退）。
- `terminal-ui`: 新增 TUI 技能调用消息展示 requirement（单行折叠标记、参数预览、回退）。

## Impact

- **代码**：`packages/core/src/prompt/invoke.ts`（解析器导出）、`packages/web`（message-list UserRow、新 SkillCard、Icon）、`packages/tui`（user-message 组件）。
- **协议**：无；纯展示层，展开格式契约沿用 core `expandSkillCommand` 的输出形态。
- **依赖**：无新增依赖。
