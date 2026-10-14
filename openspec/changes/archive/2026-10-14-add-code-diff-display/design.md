# Design

## Context

上游 pi-durable 的 `edit` 工具在结果 `details` 中已产出展示型 diff(`details.diff` 带行号与上下文、`details.patch`、`details.firstChangedLine`),随工具消息原子持久化;`write` 工具无 details,仅参数含完整 `content`。core 投影层(`packages/core/src/projection.ts`)目前丢弃 `details`(仅图片元数据例外),ChatItem 工具条目与 gateway 契约均无 diff 槽位。两端高亮基建已就绪:TUI `theme/syntax.ts` 与 Web `lib/highlight.ts` 均已注册 hljs `diff` 语言并配好增删配色。动机见 proposal.md。

## Goals / Non-Goals

**Goals:**

- edit/write 工具卡默认折叠、摘要带增删计数,展开显示高亮 diff,TUI/Web 行为一致。
- diff 数据单一事实源在 core 投影层;历史会话的 edit diff 自动补显。
- 不新增依赖,不包装上游工具。

**Non-Goals:**

- 不捕获 `write` 覆盖前的旧内容(真实变更对比);write 一律全新增呈现。
- 不处理 bash 等工具内的隐式文件修改。
- 不做行内(字词级)diff、并排视图或 diff 交互操作(如逐 hunk 接受/拒绝)。

## Decisions

### D1: diff 在投影层统一生成,而非前端各自合成

`projection.ts` 收集工具结果时,对 `edit` 提取 `message.details.diff` 直接透传;对 `write` 将参数 `content` 逐行加 `+` 前缀合成全新增 diff。两端渲染器走同一条 hljs diff 路径,行为天然一致;edit 的历史会话因 diff 已持久化而自动补显。

替代方案:契约只透传原始 details、由两端各自解释 —— 否决,两份解释逻辑会漂移,且 write 合成逻辑要复制两遍。

### D2: ChatItem 工具条目与契约增加结构化 `diff` 字段

在 ChatItem tool 类型(`projection.ts:92-112`)与契约(`contract.ts:172-187`,含流式 call schema `:63-70`)加 nullable `diff` 字段,而非把 diff 拼进现有 `detail` 字符串。契约字段均为 nullable 无 maxLength,旧前端忽略未知字段,协议兼容。

### D3: write 不捕获旧内容

「write 一律全绿」使 `beforeTool` 捕获和包装上游 write 工具都不再必要,遵守「上游只升版本不裹代码」约定。语义为「写入后的完整内容」,覆盖场景不显示真实变更 —— 已作为 Non-Goal 显式排除。

### D4: 两层高亮 — 重组文件整体语法高亮,叠加增删行着色

diff 行内代码 SHALL 按目标文件语言做语法高亮,增删着色叠加其上。逐行跑 hljs 会丢失多行上下文(跨行字符串、块注释着色错误),故渲染层先从 diff 重组「新文件」(context 行 + 新增行)与「旧文件」(context 行 + 删除行),按路径推断语言对完整文档高亮,按行切分 token(跨行开标签延续到下一行),再映射回 diff 行:新增行取新文件 token、删除行取旧文件 token。write 是特例:content 即完整文件,直接整篇按语言高亮并叠全新增着色。

- 「解析 diff → 重组 → 高亮 → 映射」为无 IO 纯函数,两端各实现一份(若 web 客户端依赖约束允许,实现期可抽共享模块)。语言识别与 hljs 基建复用两端现有注册与懒加载;语言不可识别时回退为仅增删着色(沿用 hljs `diff` 路径)。
- 契约传递 diff、增删计数与截断状态,不传输预渲染语法 token。
- 配色:语法色与增删着色均来自现有语义槽位;TUI 叠加方式(前景语法色 + 行底色或着色融合)实现期按主题对比度要求校准。

替代方案:逐行 hljs(简单但跨行结构着色错乱)—— 否决;投影层预渲染(污染数据通路且两端输出格式不同)—— 否决。

### D5: 计数与截断策略

edit 增删计数在投影层从 diff 字符串统计 `+`/`-` 前缀行(排除 `+++`/`---` 头),write 计数按实际展示的完整行统计,随条目下发到折叠摘要。write 合成预览最多 2,000 行、64 KiB UTF-8 字节(含 `+ ` 前缀与行间换行),避免复制超长单行;超出预算时通过可选 `diffTruncated` 字段标明截断,完整参数 detail 保留。展开区超长处理两端各异:TUI 超 50 行截断并提示剩余行数,服务端已截断时另加提示并保留参数预览;Web 限高滚动,服务端截断时显示提示及完整写入内容。Web 的语法高亮与逐行消毒仅在展开后执行。

渲染器按工具名区分格式:edit 解析上游带 padding 的行号;write 只移除单个 `+ ` 前缀,保留代码缩进、前导数字和空行。

### D6: details 缺失时回退原显示

上游 details 结构变化或旧会话无 diff 时,`diff` 字段为空,两端保持现有摘要与展开行为,不报错。

## Risks / Trade-offs

- [上游 edit-diff 输出格式随版本变化] → pi 依赖精确锁版本,升级走显式 OpenSpec 变更;投影层对 details 做防御性读取,缺失即回退。
- [超大 write 内容撑大 ChatView 与 WS 帧] → 投影层对合成 diff 设上限;链路层已有 16MB 上限兜底。
- [write 覆盖文件显示全绿可能误导为「纯新增」] → 摘要与提案中明确语义为写入后完整内容;后续若需真实对比再单独立项捕获旧内容。
- [跨行 token 切分错误导致语法着色错乱] → 单元测试覆盖多行字符串/块注释场景;高亮失败回退为仅增删着色,不阻塞渲染。
- [语法前景色与增删着色叠加后对比度不足] → 遵循主题「正文在配对背景上对比度 ≥4.5:1」验收,明暗主题各验证一档。
