# Tasks

## 1. TUI：固化公式渲染

- [x] 1.1 在 `packages/tui/test` 新增公式测试：用 `AssistantMessageComponent` 渲染并去除 ANSI 后，断言 `$E=mc^2$`→`E = mc²`、块级分式含分数线、`\(..\)` 与 `\[..\]` 渲染、表格单元格与列表中的公式、货币/`$HOME`/行内代码/围栏代码中的 `$` 保持原文；`bun test --conditions=neko-source --isolate packages/tui/test` 通过
- [x] 1.2 同一测试文件覆盖降级：`$$\textcolor{red}{x}$$` 保持原文、未闭合 `$$\frac{a+b` 保持原文、闭合后转为公式，且其余内容正常；测试通过

## 2. Mobile：依赖与公式语法

- [x] 2.1 在 `apps/mobile/pubspec.yaml` 添加 `flutter_math_fork: ">=0.7.4 <0.7.5"`，运行 `flutter pub get` 生成 `pubspec.lock`（官方源 `https://pub.dev`，不带镜像地址），确认 `flutter pub get --enforce-lockfile` 成功
- [x] 2.2 新增公式模块（`apps/mobile/lib/ui/widgets/math_markdown.dart`）：行内 `InlineSyntax`（`$..$`、`$$..$$`、`\(..\)`，含货币/`\$` 边界规则）、`BlockSyntax`（行首 `$$`/`\[`，必须找到闭合才成块，允许内部空行）、`MarkdownElementBuilder`（行内 `MathStyle.text`、块级 display 居中并横向滚动，`\<` 还原为 `<`，`onErrorFallback` 显示原文）；`dart format` 与 `flutter analyze` 通过
- [x] 2.3 在 `NekoMarkdown` 接入语法与 builder，保持 `escapeHtml`、远程图片占位与 `selectable` 行为不变；新增 widget 测试（`apps/mobile/test/ui/markdown_math_test.dart`）覆盖：行内/块级、`\(..\)`/`\[..\]`、含空行的块公式、`a < b` 与 `\{a,b\}`、代码/货币/`\$` 保持原文、HTML 标签仍按原文显示，`flutter test` 通过
- [x] 2.4 widget 测试覆盖降级与布局：非法公式显示原文且其余内容正常、未闭合 `\(`/`$$`/`\[` 保持原文并且不吞掉后续段落、超宽块级公式在窄屏下可横向滚动且无溢出异常；`flutter test` 通过

## 3. Mobile：流式性能与文档

- [x] 3.1 构造长流式回答（数十个公式，逐 delta 更新）的 widget/集成测量，记录帧构建耗时；若明显卡顿则按 design D6 引入解析结果缓存并复测，结果写入变更说明（实测无需缓存，见 design D6，测试 `markdown_math_perf_test.dart`）
- [x] 3.2 更新 `apps/mobile/README.md` 的依赖取舍与 Markdown 说明（公式、`flutter_math_fork`、定界符），并记录 `flutter build apk --release --split-per-abi` 前后体积差；README 中的命令可照抄执行

## 4. Web：括号定界符（独立任务组，可整体删除）

- [x] 4.1 在 `packages/web/src/client/lib/math.ts` 增加 `\(..\)` 行内与 `\[..\]` 块级扩展（`start()` 指向 `\`，`\\(` 不是定界符），复用 `renderMath`；扩展 `packages/web/test/math.test.ts` 覆盖行内/块级、代码中保持原文、非法与未闭合降级、`\href` 与脚本消毒；`bun test --conditions=neko-source --isolate packages/web/test/math.test.ts` 通过

## 5. 整体验证

- [x] 5.1 运行 `bun run check`、`bun run test`、`bun run build` 全部通过
- [x] 5.2 在 `apps/mobile` 运行 `dart format --set-exit-if-changed . && flutter analyze && flutter test` 全部通过
- [x] 5.3 运行 `openspec validate math-on-tui-and-mobile --strict` 通过
