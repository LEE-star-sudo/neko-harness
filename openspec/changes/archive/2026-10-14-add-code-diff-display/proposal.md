# Proposal

## Why

agent 通过 `edit`/`write` 工具修改代码时,TUI 和 Web 的工具卡只显示一行摘要(`path (N edits)`),用户无法直接看到改了什么。上游 pi-durable 的 `edit` 工具其实已在持久化结果里产出了展示型 diff(`details.diff`),但 core 投影层把 `details` 丢弃了;两端的高亮基建(hljs `diff` 语言、diff 增删配色)早已就绪却无数据可渲染。

## What Changes

- core 投影层为 `edit` 工具从持久化的 `message.details.diff` 提取展示型 diff,为 `write` 工具将写入内容合成为全新增(全 `+` 行)的 diff 字符串,统一放入 ChatItem 工具条目的新 `diff` 字段。
- gateway WS 契约的 ChatView 工具条目(含流式 call)增加对应 `diff` 字段,透传不裁剪。
- TUI 工具卡:折叠摘要行附带增删行数计数(如 `edit foo.ts (+18/-3)`、`write foo.ts (+142)`);展开区用现有 hljs `diff` 高亮渲染 diff,超长截断并提示剩余行数。
- Web 工具卡:同样的计数摘要与展开式 diff 渲染,使用现有 `renderCodeHtml` + diff 配色 CSS。
- 默认折叠,用户点击展开查看 diff;无 diff 数据的其他工具行为不变。
- 历史会话中已持久化的 `edit` diff 自动补显;历史 `write` 调用有 content 参数时同样合成预览,无可用内容时保持原有显示。

## Capabilities

### New Capabilities

(无)

### Modified Capabilities

- `terminal-ui`: 工具卡对 `edit`/`write` 工具展示增删计数摘要与可展开的 diff 高亮视图。
- `web-ui`: 同上,Web 工具卡对等呈现。

## Impact

- **代码**:`packages/core/src/projection.ts`(ChatItem 类型与投影)、`packages/gateway/src/contract.ts`(契约 schema)、`packages/tui/src/components/tool-execution.ts` 及卡片组装处、`packages/web/src/client/components/tool-card.tsx`。
- **依赖**:无新增;diff 字符串来自上游 `pi-durable` 已持久化的 details,高亮复用两端已有 highlight.js `diff` 注册与配色。
- **协议**:ChatView 工具条目新增可选字段,旧前端忽略未知字段,不破坏兼容。
- **不覆盖**:bash 等工具内的隐式文件修改(`sed -i` 等)不产生 diff;`write` 覆盖已有文件时显示全新增内容而非真实变更。
