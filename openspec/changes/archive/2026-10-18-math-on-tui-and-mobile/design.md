# Design

## Context

- Web：`marked` 扩展 + KaTeX，已有 `$..$`/`$$..$$`、独立消毒、降级原文与 LRU 缓存（见已归档的 `web-math-and-composer-reset`）。marked 的 escape 规则会先吃掉 `\(`，扩展 `start()` 须指向 `\`。
- TUI：所有 Markdown 经 `@earendil-works/pi-tui` 的 `Markdown`，其内置 `renderLatex`（Unicode 排版）默认开启，支持四种定界符，未闭合/不支持降级为原文。neko 不需要改渲染，只缺 spec 与测试。
- Mobile：`NekoMarkdown`（`apps/mobile/lib/ui/widgets/markdown_view.dart`）用 `flutter_markdown_plus` 渲染；先经 `escapeHtml` 把代码区之外的 `<` 转义为 `\<`，使 HTML 按原文显示。主会话流式与历史、子 agent 详情都走该组件。
- 已验证（临时项目，锁定的 Flutter 3.47.7 + `flutter_markdown_plus` 1.0.12 + `flutter_math_fork` 0.7.4）：自定义 `InlineSyntax`/`BlockSyntax` 加 `MarkdownElementBuilder` 可渲染 `$`、`$$`、`\(..\)`、含空行的 `\[..\]`；`$5 and $10`、代码中的 `$`/`\(` 不误判；未闭合的 `\(` 保持原文。

## Goals / Non-Goals

**Goals:**
- 三端对四种定界符与误判边界的外部行为一致。
- Mobile 公式不放宽「不执行 HTML、不加载远程资源」的保证。

**Non-Goals:**
- 不改 TUI 渲染实现、不替换 pi-tui 的渲染器；不做 TUI 开关设置。
- 不做移动端公式的选择复制；行内公式不折行（宽公式用块级滚动）。
- 不改导出；不支持 `\begin{..}` 裸环境定界。

## Decisions

**D1：TUI 只加测试与 spec，通过薄测试锁定上游行为。** 在 `packages/tui/test` 用真实 `AssistantMessageComponent` 渲染并去除 ANSI 后断言（`E = mc²`、分式分数线、`\(..\)`、表格单元格、货币/代码保持原文、未闭合与不支持降级）。pi 升级改变输出时测试会暴露。替代方案是 neko 自带 LaTeX 渲染器：成本高且与上游重复，拒绝。

**D2：Mobile 使用 `flutter_math_fork` 0.7.4，自写语法而不用 `flutter_markdown_plus_latex`。** 后者 1.0.5 自 2025-08 无更新且只是对同一库的薄封装；自写约百行，规则可与 web `math.ts` 对齐，依赖少一个。版本按仓库约定写显式范围（`">=0.7.4 <0.7.5"`），`pubspec.lock` 固定官方源。

**D3：行内规则与 web 一致，并集定界符。** `InlineSyntax` 同时匹配 `\(..\)` 与 `$..$`/`$$..$$`；`$` 起始后非空白、结尾前非空白、结尾后非数字、`\$` 为字面量。语法先于默认规则触发，`\(` 因此不被 escape 吞掉；已验证。

**D3 补充（实现中发现）：** ① `$..$` 内容不含反引号，否则 `价格 $10 … \`$x$\`` 会把货币符号与后面行内代码里的 `$` 配成公式（Web 同规则一并修正，见任务 4.1）。② 默认转义规则会吞掉未成对 `\(`、`\[` 的反斜杠，Mobile 增加字面量语法保持原文（排在公式语法之后）。③ `markdown` 包原为传递依赖，Mobile 直接导入需声明为直接依赖（版本与现有锁定一致，不引入新包）。

**D4：块级用 `BlockSyntax`，且必须有闭合才成块。** 行首（至多 3 空格缩进）的 `$$` 或 `\[` 开始，扫描到对应结束定界符才产出块（允许内部空行，与 web 的块规则一致）；找不到结束定界符时不识别为块，保持段落原文，避免流式中未闭合的 `$$`/`\[` 吞掉后续全部内容。块级公式用 `MathStyle.display`，外包居中的横向 `SingleChildScrollView`。段落中间的 `$$..$$` 走行内规则，display 样式行内显示。

**D5：`escapeHtml` 的 `\<` 在公式 builder 里还原。** 保留 `escapeHtml` 不变（其测试与 HTML 按原文显示保证不动），公式 builder 与 `onErrorFallback` 取到文本后把 `\<` 还原为 `<`。`\<` 在 TeX 中本无合法含义，还原不会改变合法公式的语义。块级捕获发生在 Markdown 之前的文本上，同样还原。

**D6：降级与性能（实测后不加缓存）。** `Math.tex(onErrorFallback: ...)` 失败时显示原文（含定界符）。流式场景每个 delta 整段重新解析并重建公式。实测（`flutter test`，debug JIT，40 次逐 delta 更新、末态约 80 个公式）：无公式基线约 29ms/次，含公式约 55–90ms/次，约 2ms/公式/次，典型回答（数个公式）可接受，release 更快。尝试过的缓存均被否决：复用同一 `Math` 实例会因内部 `GlobalKey` 在同一公式重复出现时报错；缓存解析后的语法树在重复公式重建时触发语义断言。因此不缓存，用 `test/ui/markdown_math_perf_test.dart` 守护上限（< 250ms/次）。若后续真机出现卡顿，再按"每次出现独立解析结果"的思路优化（如节流流式刷新）。

**D7：安全。** `flutter_math_fork` 是纯 Dart 绘制，无 HTML、WebView、链接或网络请求；公式 builder 只返回 `Math` 与 `Text`，不处理 `\href`/`\url`（库未实现为链接）。远程图片占位等现有保证保持。

**D8：Web 补括号定界符为独立任务组。** 在 `mathExtensions` 增加 `\(..\)` 行内与 `\[..\]` 块（`start()` 指向 `\`）；`\\(` 视为转义反斜杠，不是定界符。渲染、消毒、缓存复用现有 `renderMath`。另加 `mathLiteral` 兜底扩展让未成对的 `\(`、`\[` 保持原文；marked 对后注册的扩展优先尝试，因此兜底扩展必须排在数组最前。该组不被其他组依赖，可整体删除。

## Risks / Trade-offs

- [`flutter_math_fork` 带来 11 个传递依赖与 KaTeX 字体，APK 体积增加] → 实现时量测 release split-abi 体积并记录；依赖已被用户接受。
- [`flutter_math_fork` 最后发布于 2025-05，维护较慢] → 精确锁版本；公式仅限 builder 一处使用，将来可替换。
- [行内公式不折行，窄屏过宽可能溢出] → 接受；宽公式建议用块级，块级可横向滚动。
- [流式整段重解析的帧耗时] → D6：已实测，公式约 2ms/个/次（debug JIT），不加缓存，性能测试守护上限。
- [`\<` 还原对 TeX 的 `\<`（如 `\<` 在个别包里作 ⟨）有语义差] → KaTeX/`flutter_math_fork` 均不识别该命令，实际无损。
- [Web 补 `\(` 与已有文本冲突，如正文里写 `\(` 字面量] → 误判时公式非法会降级为原文；代码中保持原文。
- [TUI 窄终端多行公式折行错位] → 上游行为，已知限制，不在本变更处理。
- [TUI 上游边界：行首 `$$..$$` 后同行紧跟文字时整段保持原文，行内 `$$` 不能跨行] → 属上游行为，降级为原文不丢内容；块级公式应独占一段，测试以此为准。
