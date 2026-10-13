# Proposal

## Why

TUI 侧功能已齐备(流式渲染、工具卡、会话管理、图片、技能市场),但视觉表现仍是"能用"水平:暗色主题直接借用通用 Tokyo Night,与 Web 端的樱花粉/天依蓝品牌毫无关联;主题只有 16 个槽位,缺 warning、边框、diff、语法高亮等表达原料;消息间距、工具卡内边距、状态字形各处以临时方式拼凑,无统一节奏。品牌与风格优先,本次进行完整的视觉系统设计,让终端界面与 Web 共享同一品牌基因并可一眼辨识。

## What Changes

- **品牌色板**:废弃暗色 Tokyo Night;明暗双主题统一从 Web 已有的 sakura(樱花粉)/tianyi(天依蓝)/ink OKLCH 色阶派生,语义色(error/warning/ok)向品牌色相靠拢。
- **主题 token 扩展**:16 → ~30 个语义槽位,新增 `muted`、`warning`、`border`/`borderMuted`、`toolOutput`、`diffAdded`/`diffRemoved`/`diffContext` 及 9 个 `syntax*` 槽位;`theme.ts` 拆分为 `theme/` 目录(palette / slots / markdown / syntax)。
- **语法高亮**:新增 `highlight.js` 依赖(精确锁版本),经 pi-tui 1.2.0 `MarkdownTheme.highlightCode` 钩子接入,覆盖全部 Markdown 渲染处;未知语言回退平涂。
- **排版节奏规范**:统一消息块间距、工具卡内边距、正文缩进与 thinking 层级;工具卡状态字形统一(`…`/`●`/`✓`/`✗`),running 态 braille spinner。
- **组件视觉改造**:用户气泡加樱花左缘条、thinking 折叠/展开重设计、忙碌行改用 pi-tui `Loader` 动画、footer 身份/度量两行分层、picker 标题与选中态强化、通知分三级(i/!/✗)、空会话品牌欢迎屏(ASCII logo + 快捷提示)。
- **主题与会话快捷命令**:`/theme` 浮层进程内选择主题(auto/light/dark,即选即生效,不落盘),`/new` 快捷新建会话。
- 无 BREAKING 变更:组件主题 API(`theme.<slot>(text)`)保持向后兼容,仅新增槽位。

## Capabilities

### New Capabilities

(无)

### Modified Capabilities

- `terminal-ui`: 新增视觉识别相关需求——品牌主题色板与语义槽位体系、语法高亮、排版节奏与字形规范、忙碌动画与通知分级、空会话欢迎屏;既有"一致的终端显示语言"等需求不改写,仅补充。

## Impact

- **代码**:`packages/tui/src/theme.ts` 拆分为 `packages/tui/src/theme/` 目录;`packages/tui/src/components/` 下全部组件轻量改造(assistant-message / tool-execution / user-message / footer / picker / editor / login / skill-market-ui 继承 picker);`tui.ts` 的间距规则、忙碌行与欢迎屏。
- **依赖**:`packages/tui` 新增 `highlight.js`(精确版本);bundle 体积随之增长,采用 core + 常用语言子集、其余后台懒加载控制启动开销。
- **API/行为**:无对外协议变更;渲染表现全量变化,既有快照类测试(如有)需更新。
- **约束遵循**:真实终端渲染效果需在明暗两种终端背景下人工验证(配色对比度);不改动 `reference/` 与 gateway/core。
