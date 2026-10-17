# Proposal

## Why

Web 已能渲染 LaTeX 公式，但三端行为不一致：TUI 借助 pi-tui 内置渲染器实际已能显示公式，却没有 spec 与测试保护，升级 pi 时行为可能无声变化；Flutter 移动端完全没有公式渲染，模型输出的 `$..$`、`$$..$$` 以原文显示；Web 只认 `$`/`$$`，而 TUI 已支持、模型也常输出的 `\(..\)`、`\[..\]` 在 Web 上显示为带反斜杠的原文。

## What Changes

- **TUI**：把现有公式渲染固化为需求并加测试（不改渲染实现）：`$..$`、`$$..$$`、`\(..\)`、`\[..\]` 渲染为 Unicode 公式，代码块与货币写法不误判，未闭合（流式中）与不支持的公式降级为原文。
- **Mobile**：新增公式渲染，使用 `flutter_math_fork`（精确锁版本）。支持 `$..$`、`$$..$$`、`\(..\)`、`\[..\]`；独占段落的块级公式居中并可横向滚动，行内公式嵌入文字；非法公式降级为原文；公式内的 `<` 保持原义；流式更新不因公式重复解析而卡顿。
- **Web**：在已有 `$`/`$$` 基础上补 `\(..\)` 与 `\[..\]` 定界符，沿用现有 KaTeX、消毒、降级与缓存规则。此部分为独立任务组，可单独删除而不影响 TUI 与 Mobile。
- 三端对 `$` 的边界规则保持一致（货币 `$5 and $10`、`\$`、代码中的 `$` 不是公式）。

不在范围：导出的 Markdown/HTML 与 JSON、`\begin{..}` 裸环境定界、公式复制/编辑、移动端公式文字选择复制、替换 pi-tui 的 LaTeX 渲染器。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `terminal-ui`：新增公式渲染要求（定界符、误判边界、降级）。
- `mobile-ui`：新增移动端公式渲染要求（含块级居中滚动、降级、与 HTML 按原文显示规则共存）。
- `web-ui`：修改「数学公式渲染」要求，定界符扩展到 `\(..\)`、`\[..\]`。

## Impact

- 代码：
  - `apps/mobile/lib/ui/widgets/markdown_view.dart`，新增公式语法与 builder 模块（`apps/mobile/lib/ui/widgets/`），`pubspec.yaml`、`pubspec.lock`。
  - `packages/web/src/client/lib/math.ts`（新增两组定界符扩展）。
  - `packages/tui/test` 新增公式测试，无源码改动。
- 依赖：`apps/mobile` 新增 `flutter_math_fork` 0.7.4，同时引入 `flutter_svg`、`vector_graphics*`、`provider`、`tuple`、`xml`、`http`、`http_parser`、`nested`、`petitparser` 等传递依赖与 KaTeX 字体资源，APK 体积增加（已接受，需在实现时量测并记录）。Web、TUI 无新依赖。
- 测试：Flutter widget test、web `math.test.ts` 扩展、TUI 公式测试。
- Spec：`openspec/specs/terminal-ui`、`mobile-ui`、`web-ui`。
