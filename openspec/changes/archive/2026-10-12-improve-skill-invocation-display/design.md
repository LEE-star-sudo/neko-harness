# Design

## Context

core 的 `expandSkillCommand`（`packages/core/src/prompt/invoke.ts`）把 `/skill:name [args]` 展开为固定形态：`<skill name="X" location="Y">\nReferences are relative to <dir>.\n\n<body>\n</skill>`，有参数时追加 `\n\n<args>`；name/location 经 `escapeXml` 转义。未命中或非 `/skill:` 输入原样透传。Web 用户消息渲染在 `message-list.tsx` 的 `UserRow`（纯文本气泡 `whitespace-pre-wrap`）；TUI 在 `components/user-message.ts`（Markdown 气泡）。工具卡风格先例是 `tool-card.tsx`（圆角卡 + 图标 + 等宽名称 + 截断摘要 + 折叠箭头）。

## Goals / Non-Goals

**Goals:** 两端共享同一个解析器；识别失败一律回退原样渲染；视觉与 ToolCard 同族。

**Non-Goals:** 不改 core 展开格式本身；不做 assistant 消息中的 skill 提及识别；TUI 不做交互式展开（transcript 行是静态的）。

## Decisions

### D1: 解析器放 core 导出，两端共用

`parseSkillInvocation(text)` 置于 `invoke.ts` 旁（与展开器同模块，格式契约单一来源）：匹配以 `<skill name="..." location="...">` 开头、以最后一个 `</skill>` 收尾的文本（取最后一次出现以容忍正文里罕见的字面 `</skill>`），name/location 做 XML 反转义，body 为块内全文，args 为块后剩余（空则无）。任何一步不匹配返回 `null`——调用方回退原样渲染，满足 spec 的"不得丢失内容"。

### D2: Web 卡片复用 ToolCard 视觉语言，但不复用组件

ToolCard 的 props 语义（phase/输出/结果/耗时）与技能调用无关，硬复用会塞空字段。新 `SkillInvocationCard` 取其视觉骨架：`rounded-card border bg-surface shadow-soft`、左侧图标（Icon 新增 `sparkles` 路径，sakura 着色以区别于工具的 tianyi）、`font-mono` 名称、截断 location、右端 ▸/▾；展开区为限高等宽正文。参数文本在卡片下方仍以用户气泡样式渲染（`UserRow` 内组合：卡片 + args 文本）。用户行右侧对齐布局保持不变。

### D3: TUI 单行静态折叠

`UserMessageComponent` 构造时先过解析器：命中则渲染为一行 `⚡ skill:<name> <args 截断>` 加一行 dim 的 `skill body from <location> (collapsed)`，用主题色而非 Markdown 气泡整铺。不命中走原有 Markdown 路径。TUI transcript 行无交互传统，不做展开键位——正文本就存在于本地文件，用户可直接读。

## Risks / Trade-offs

- [用户手工键入酷似展开格式的文本被误识别] → 解析要求整块严格匹配（开头标签 + 收尾标签 + 结构完整），且该文本本就是用户自己写的技能块语义，误识别代价仅显示形态变化，内容不丢。
- [core 展开格式未来变化导致解析失效] → 解析器与展开器同文件同测试，格式变更会先打红 core 单测。

## Migration Plan

纯展示层新增，无迁移。
