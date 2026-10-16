# Design

## Context

`Markdown` 组件（`packages/web/src/client/components/markdown.tsx`）将文本经 `marked`（gfm、breaks）转 HTML，再用 DOMPurify `html` profile 消毒后注入，聊天消息与技能预览共用。输入框高度（`composer.tsx`）只在 `onChange` 与历史回填的 `useLayoutEffect` 中命令式写入 `el.style.height`，草稿由模块级 `drafts` store 经 `useSyncExternalStore` 提供，发送清空等路径只改 store，不触碰 DOM 高度。

## Goals / Non-Goals

**Goals:**
- `$..$` / `$$..$$` 渲染为公式，保持现有消毒保证。
- 输入框高度成为草稿内容的纯派生结果。

**Non-Goals:**
- 不支持 `\(..\)`、`\[..\]` 与 `\begin{..}` 裸环境定界；不改导出、TUI、移动端；不做公式复制/编辑功能。

## Decisions

**D1：使用 KaTeX（`htmlAndMathml`），精确锁版本 `katex@0.19.0`。** 版式与浏览器无关，字体随 bundle 由 vite 处理；替代方案 Temml（纯 MathML）体积更小但依赖浏览器 MathML 渲染质量。KaTeX 放入 `packages/web` 的 devDependencies，与现有 marked/dompurify 的客户端依赖一致（由 vite 打包）。

**D2：marked 扩展在转义前截取公式。** 注册 `block` 扩展（`$$ ... $$`，允许跨行）与 `inline` 扩展（`$ ... $`），tokenizer 取原始源码，renderer 调用 `katex.renderToString`。marked 的 inline 转义规则优先于文本，因此扩展 `start()` 必须指向 `$`，让公式先于 escape 被匹配。行内公式规则：开头 `$` 后不是空白与数字紧邻货币场景，结尾 `$` 前不是空白，且结尾后不是数字，减少 `$5 and $10` 误判；`\$` 保持为字面美元符。代码块/行内代码由 marked 先行 tokenize，天然不进入公式扩展。

**D3：KaTeX 输出单独消毒。** 公式 HTML 在 renderer 内用独立的 DOMPurify 配置（允许 KaTeX 输出所需的 `span`、`math` 系 MathML 标签与 `class`、`style`、`aria-hidden` 等属性）预先净化，再作为占位交给整体消毒。整体消毒保留现有 `html` profile，并仅追加 MathML profile 与必要属性白名单，不放开 `script`、事件属性、`a[href]` 新来源。KaTeX 配置：`throwOnError:false`、`trust:false`（禁用 `\href`、`\url`、`\includegraphics`）、`strict:"ignore"`、`maxExpand` 与 `maxSize` 设上限防止指数展开；`trust:false` 下 `\href`、`\url` 不抛错，而是以红色字面文本呈现且不生成链接；测试以 jsdom（devDependency，happy-dom 的 DOMParser 会丢失首个元素，不可用）运行真实 DOMPurify 验证。

**D4：非法公式降级为原文。** 使用 `throwOnError:true` 在 renderer 内 try/catch，失败返回转义后的原始文本（含定界符），而不是 KaTeX 默认的红色错误样式，使降级行为可测。流式未闭合时 tokenizer 不匹配，自然保持原文。

**D5：性能。** `Markdown` 已按 `text` 做 `useMemo`；对公式渲染结果按 `(displayMode, tex)` 做小型 LRU 缓存，避免流式输出时每次重新渲染全部历史公式。KaTeX 样式与字体在入口 CSS 中一次性引入，不做懒加载以避免首次渲染闪烁。

**D6：输入框高度由派生 effect 统一管理。** 以 `useLayoutEffect` 依赖 `draft.text`（及会话 id）：先 `height = "auto"`，再设 `min(scrollHeight, 160)px`。删除 `onChange` 与历史回填 effect 中重复的高度代码，历史回填 effect 只保留光标定位。替代方案是在每个清空路径手动重置高度，易遗漏且已造成此缺陷。窗口宽度变化导致折行变化的情形，用 `ResizeObserver` 监听宽度变化重算（仅当宽度变化时）。

## Risks / Trade-offs

- [KaTeX 体积与字体增大 bundle] → 只引入 woff2 字体；接受体积换取一致版式。
- [`$` 误判（货币、shell 变量）] → D2 的边界规则与 `\$` 转义；Scenario 覆盖代码中的 `$`。
- [白名单放宽带来 XSS 风险] → `trust:false`、独立白名单、测试覆盖脚本/事件属性/`\href`。
- [流式长公式重复渲染成本] → D5 缓存。
- [layout effect 每次按键触发] → 只读写一次 `scrollHeight`，与原 `onChange` 行为等价。
