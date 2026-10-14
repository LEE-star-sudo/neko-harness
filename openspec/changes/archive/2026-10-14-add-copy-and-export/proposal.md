# Proposal

## Why

用户目前无法从 neko 取走对话内容：Web 气泡里的文本只能手工框选，TUI 没有"复制上一条回答"的命令，也无法把整段会话保存为文件用于分享、归档或贴进 issue。pi 已提供 `/copy` 与 `/export`，neko 缺少对等能力。

## What Changes

- **Web 气泡复制**：已提交的用户气泡与 assistant 气泡提供复制按钮；assistant 只复制回答正文（`text`），**不含 thinking**；流式中的气泡不提供。复制失败（非安全上下文等）时降级到 `execCommand`，仍失败则给出可见提示。
- **技能调用复制**：用户气泡为 `/skill:` 调用时，复制还原后的 `/skill:<name> <args>`，不暴露展开后的技能正文。
- **TUI `/copy`**：把最后一个正文非空的 assistant 条目（不含 thinking）写入系统剪贴板；无可复制内容时给出提示。TUI 新增剪贴板写入能力（macOS / Windows / Linux 原生命令，OSC 52 兜底）。
- **会话导出**：支持 Markdown、HTML、JSON 三种格式。
  - 格式化器为 `core` 中的浏览器安全纯函数，输入为已有的 `ChatItem[]` 投影，Web 与 TUI 共用，不新增 gateway 协议。
  - 默认不含 thinking；工具调用包含摘要与结果（Markdown/HTML 中折叠）；图片 HTML 内嵌、Markdown/JSON 仅写占位描述；技能调用还原为 `/skill:` 形式。
  - TUI：`/export [path]`，按扩展名（`.md` / `.html` / `.json`）选择格式，缺省为 `.md`；写入本机文件并提示最终路径。
  - Web：顶栏提供导出入口，选择格式后以浏览器下载保存。
- 不包含：子 agent 记录导出、可重新导入的原始会话（JSONL / `/import`）、分享链接。

## Capabilities

### New Capabilities

- `conversation-export`: 会话内容的复制文本规则（含"最后一条回答"）与导出规则（Markdown / HTML / JSON、默认内容取舍、技能与图片处理、文件命名与安全），与前端无关。

### Modified Capabilities

- `terminal-ui`: 新增 `/copy`（复制最后一条回答、剪贴板写入与兜底）与 `/export`（按扩展名选格式、路径与提示）的需求，并补充命令列表/帮助条目。
- `web-ui`: 新增气泡复制按钮（用户与 assistant、不含 thinking、仅已提交条目、降级策略）与顶栏会话导出入口的需求。

## Impact

- `packages/core/`：新增导出格式化模块与 `package.json` 子路径导出，新增 `marked`（精确锁 18.1.0，与 Web 一致）作为 HTML 导出的依赖并更新 `bun.lock`；复用 `image-transfer` 的图片下载。
- `packages/tui/src/`：`tui.ts`（命令分发）、`labels.ts`、`help-ui.ts`、新增剪贴板写入与导出文件写入模块；`packages/tui/test/` 补充对应测试。
- `packages/web/src/client/`：`message-list.tsx`（气泡复制）、`top-bar.tsx`（导出入口）、样式与可访问性标注。
- 不涉及 gateway 协议、存储或上游 pi 依赖变更；`README.md` 补充复制与导出说明。
