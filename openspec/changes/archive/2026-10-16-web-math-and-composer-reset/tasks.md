# Tasks

## 1. 公式渲染

- [x] 1.1 在 `packages/web` 添加精确版本 `katex@0.19.0` 及类型（如需要），更新 `bun.lock`；验证 `bun install --frozen-lockfile` 成功
- [x] 1.2 新增公式渲染模块（`packages/web/src/client/lib/math.ts`）：KaTeX 配置（`trust:false`、`throwOnError`、尺寸/展开上限）、失败降级为转义原文、`(displayMode, tex)` 缓存；单元测试覆盖合法、非法、`\href` 被拒与缓存命中
- [x] 1.3 在 `markdown.tsx` 注册 marked 块级 `$$` 与行内 `$` 扩展（含货币/`\$` 边界规则）；测试覆盖 `\{ \, \!`、跨行块公式、代码块与行内代码中的 `$`、未闭合公式
- [x] 1.4 调整消毒：保留现有 `html` profile，仅追加公式所需 MathML 标签与属性白名单；测试验证 `<script>`、事件属性、`\href` 均不产生可执行或可点击内容，且 `Markdown` 渲染示例图中的传统注意力公式不含原始 `$`
- [x] 1.5 引入 KaTeX CSS 与字体，补充 `.md` 中块公式溢出（横向滚动）样式；`bun run build` 成功，并在浏览器中检查示例内容的行内与块级公式显示正常

## 2. 输入框高度同步

- [x] 2.1 在 `composer.tsx` 用依赖 `draft.text` 与会话 id 的 `useLayoutEffect` 统一计算高度，删除 `onChange` 与历史回填 effect 中的重复高度代码，并在宽度变化时用 `ResizeObserver` 重算；抽出纯函数（如 `fitHeight`）并为其写单元测试
- [x] 2.2 手动验证：发送长消息后输入框立即回到单行；切换会话、↑ 回填历史、`@` 插入引用后高度与内容匹配

## 3. 规范与整体验证

- [x] 3.1 运行 `bun run check`、`bun run test` 与 `bun run build`，全部通过；`openspec validate web-math-and-composer-reset --strict` 通过
