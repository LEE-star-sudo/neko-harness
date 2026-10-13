# Design

## Context

见 proposal.md 的动机。pi-tui 1.2.0 提供着色和组件接口，没有可直接导入的 Tokyo Night 成套主题。neko 的 palette.ts 定义 33 个槽位，slots.ts 动态委托当前主题；现有 light/dark 类型已足够，无需拆分主题名称与明暗模式。

当前深色 dim 在面板/用户气泡上的计算对比度约 2.68:1/2.06:1，代码注释约 3.08:1。panel 等只设置背景，未着色文本继承终端前景。部分 Text 的输入在构造时已带 ANSI，invalidate 只清渲染缓存，无法重新生成颜色。tui.ts 的自动查询回调未在应用结果时校验当前偏好与查询代次。

现有 terminal-ui 规格要求明暗两套均来自品牌色，与本次已确认方向冲突；delta 明确替换该约束。为满足 MODIFIED 场景保留校验，沿用原“明暗主题同源”场景标题，其正文改为浅色保留品牌、深色独立配色的新契约。另有 unify-cli-help-output 正在实施，需保留其改动。

## Goals / Non-Goals

**Goals:** 用现有槽位完成独立深色配色；覆盖实际前景/背景组合；让主题刷新同时保持内容、布局和交互状态。

**Non-Goals:** 新增命名主题、主题注册系统、自定义主题文件、修改浅色配色或 Web、替换终端背景、升级 Pi、增加依赖或 Windows CI。

## Decisions

### D1. 以 Tokyo Night 为参考，按 TUI 对比需求调整

采用冷灰蓝表面和中性浅色文字，参考 One Dark 的语法分类，不照搬偏暗注释。保留现有 DARK_PALETTE 和所有槽位调用结构；浅色表及品牌色阶保持原值。选择器 dark 显示简洁的 Dark，不再宣称 sakura-night。

候选值作为实施起点，允许在对比度和实际终端验收中微调：

| 用途 | 起始颜色 |
| --- | --- |
| panel | 背景 #24283B，默认前景 #C0CAF5 |
| userBg | 背景 #292E42，默认前景 #C0CAF5 |
| codeBg / codeFg | #1A1B26 / #C0CAF5 |
| muted / dim / thinking | #A9B1D6 / #9AA5CE / #9AA5CE |
| accent / model | #7AA2F7 / #7DCFFF |
| syntaxComment | #8993B3 |
| 关键字 / 函数 / 字符串 / 数字 / 类型 | #BB9AF7 / #7AA2F7 / #9ECE6A / #FF9E64 / #7DCFFF |
| 成功 / 警告 / 失败 | #9ECE6A / #E0AF68 / #F7768E |

选择背景、边框及工具卡表面按同一冷灰蓝明度序列定值，成功/失败仅少量染色并保留图标；实际组合全部参与验收。示例辅助字 #9AA5CE 在 panel/userBg 上为约 6.00:1/5.53:1。避免用 ANSI faint 再降低重要提示亮度。

参考来源（调研于 2026-10-13）：
- https://github.com/folke/tokyonight.nvim/blob/main/lua/tokyonight/colors/storm.lua
- https://github.com/folke/tokyonight.nvim/blob/main/lua/tokyonight/colors/night.lua
- https://github.com/atom/one-dark-syntax/blob/master/styles/colors.less

移植上游配色内容时记录具体来源版本并遵循来源许可证、保留所需署名；不引入上游主题运行时。

### D2. 表面前景配对，主画布继承终端

深色自绘表面槽位同时定义 fg/bg，确保内部普通文本有可读默认值；显式的语法或状态颜色仍优先。验证嵌套 ANSI reset 后的默认前景恢复，避免背景包装覆盖内部颜色。普通助手正文与编辑输入继续继承终端默认前景/背景，尊重终端和透明设置，不发送全局颜色修改序列。

对比度矩阵由实际调用组合驱动，包含 panel 的说明/帮助/详情、用户卡来源提示、三态工具卡的标题/参数/输出、代码与 diff。truecolor 自绘表面上的可读文字最低 4.5:1；装饰分隔线单独检查可见性。主画布继承色和 256 色量化通过代表性终端检查，不宣称任意用户自定义背景均满足数值门槛。

### D3. 完整刷新，不重置交互

沿现有 setActiveTheme 切换槽位；审计预着色 Text、工具卡、Thinking 折叠标题及通知。优先渲染时调用槽位或给原组件提供局部 restyle，避免销毁整个会话视图导致展开状态/滚动丢失。Markdown 重新失效并渲染；静态 ANSI 字符串必须重新生成，单纯全局 invalidate 不足。切换时保持草稿、光标、展开状态、面板详情与滚动锚点。

### D4. 保持 auto 行为，过滤过期结果

保留现有 OSC 查询、环境回退和浅色默认。每次开始/停止自动检测推进代次；查询完成、迟到回复和通知都须校验未退出、当前偏好为 auto、属于当前代次。手动 light/dark 不被旧异步结果覆盖。无需改配置格式或引入主题注册表。

## Risks / Trade-offs

- [终端背景和默认文字由用户控制] → 保留其所有权，在 #000000、#282C34、#1A1B26 三类背景检查；数值门槛限定在应用管理的表面。
- [256 色会量化并合并相近颜色] → 验证真实降级输出，保留选中符号、成功/失败图标及 diff 标记。
- [重建组件造成展开、焦点或滚动丢失] → 优先局部刷新并加入包含历史内容的切换回归；实际 PTY 检查草稿、滚动和面板。
- [浅色共享路径意外变化] → 浅色色值不改；对共同包装和刷新路径验证浅色最终输出与原有行为。
- [CLI 文案并行改动] → apply 时重读当前文件，仅修改必要主题说明，不覆盖 unify-cli-help-output。

## Migration Plan

无配置或数据迁移。升级后 dark 和 auto 的深色分支直接使用新配色；light 和 auto 的浅色分支保持原样。失败可回退本次主题改动，不涉及会话数据或依赖回滚。实施验证通过后再由用户决定归档、提交与发版。
