# Proposal

## Why

Web 端 Markdown 渲染目前只支持 marked + 消毒，模型输出的 `$...$`、`$$...$$` 公式以原文显示，数学、机器学习类回答几乎不可读。另外，发送长消息后输入框高度只在下一次输入时才恢复，因为高度仅由 `onChange` 与历史回填命令式设置，清空草稿的各条路径都不会触发重算，发送后残留一块空白高度。

## What Changes

- Web 的 Markdown 渲染支持 LaTeX 公式：行内 `$...$`、块级 `$$...$$`，使用 KaTeX（`htmlAndMathml` 输出）。
- 公式在 marked 转义处理前截取，`\{`、`\,`、`\!` 等反斜杠不被吞；公式单独渲染并由 DOMPurify 精确放行，整体消毒策略不放宽。
- 非法公式降级为原文显示，不影响同条消息其余内容。
- 输入框高度改为由草稿内容派生：发送成功、切换会话、恢复草稿、回填历史等任何清空或替换草稿的路径后，高度立即回到与内容匹配的值。
- 公式支持自动覆盖所有复用 Markdown 组件的位置（聊天消息、技能预览）。

不在范围：导出的 Markdown/HTML、终端 TUI、Flutter 移动端的公式渲染。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `web-ui`：新增公式渲染要求（含消毒与非法公式降级）与输入框高度随草稿同步要求。

## Impact

- 代码：`packages/web/src/client/components/markdown.tsx`、新增公式渲染模块（`packages/web/src/client/lib/`）、`components/composer.tsx`、`styles.css`（KaTeX 样式与字体）。
- 依赖：`packages/web` 新增 `katex`（精确锁版本，按本仓库约定同步 `bun.lock`）；增加 Web bundle 体积（CSS + 字体）。
- 测试：`packages/web/test` 增加公式渲染/消毒与高度同步测试。
- Spec：`openspec/specs/web-ui`。
