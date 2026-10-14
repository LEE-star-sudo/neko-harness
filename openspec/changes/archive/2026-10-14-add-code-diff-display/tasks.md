# Tasks

## 1. core 投影层 diff 数据

- [x] 1.1 在 ChatItem tool 类型(`packages/core/src/projection.ts:92-112`)增加 nullable `diff` 字段与增删计数字段,验证 `bun run build` 通过
- [x] 1.2 投影工具结果时对 `edit` 防御性提取 `message.details.diff` 并透传,对 `write` 将参数 `content` 逐行加 `+` 前缀合成全新增 diff(设上限),从 diff 统计增删行数填入摘要计数,验证投影单元测试覆盖 edit 透传、write 合成、details 缺失回退三种路径

## 2. gateway 契约

- [x] 2.1 在 `packages/gateway/src/contract.ts` 的 ChatView 工具条目(`:172-187`)与流式 call schema(`:63-70`)增加对应 nullable 字段,验证契约测试与 `bun run build` 通过

## 3. TUI 渲染

- [x] 3.1 实现 diff 高亮映射纯函数:解析 diff 行、重组新/旧文件、hljs 按路径语言整体高亮、按行切分 token(跨行开标签延续)并映射回 diff 行,验证单元测试覆盖跨行字符串/块注释、未知语言回退为仅增删着色
- [x] 3.2 `ToolExecutionComponent`(`packages/tui/src/components/tool-execution.ts`)折叠摘要行显示增删计数,展开区用 3.1 的映射渲染两层高亮(语法色 + 增删着色)并截断提示剩余行数,验证组件测试覆盖折叠计数、展开两层高亮、超长截断与无 diff 回退

## 4. Web 渲染

- [x] 4.1 实现与 3.1 同规格的 diff 高亮映射纯函数(复用 `packages/web/src/client/lib/highlight.ts` 的 hljs 注册),验证单元测试覆盖跨行 token 切分与未知语言回退
- [x] 4.2 `ToolCard`(`packages/web/src/client/components/tool-card.tsx`)折叠摘要行显示增删计数,展开区渲染两层高亮 diff 并限高滚动,验证 Web 类型检查与组件行为(展开/收起、无 diff 回退)

## 5. 集成验证

- [x] 5.1 运行 `bun run test` 与 `bun run check` 全绿
- [x] 5.2 手动验证:启动 TUI 与 Web,让 agent 对文件做 edit 与 write,确认两端摘要计数、默认折叠、展开两层高亮一致(含跨行字符串场景与明暗主题对比度);打开含历史 edit 调用的旧会话确认 diff 补显

## Workflow follow-up

- 实现完成并通过评审后归档该变更,并验证归档结果。

## Review 与验证记录

- 已修复 write 解析误吞缩进/前导数字、合成 diff 缺少字节上限、截断时隐藏全文、折叠态执行高亮四项评审意见。
- 针对性回归验证：69 项通过；`bun run build` 与 `bun run check` 通过。
- 在沙箱外执行 `bun run test`：493 项通过、0 失败（106 个测试文件）；沙箱内 socket 监听与凭据权限造成的失败经重跑排除。
