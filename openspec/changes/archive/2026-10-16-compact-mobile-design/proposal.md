# Proposal

## Why

Flutter 移动端目前基本沿用 Material 3 默认密度：16sp 正文、56dp 双行 AppBar、默认 ListTile 高度、20 圆角气泡与满边框工具卡，12sp 等字号散落硬编码，没有统一字阶。手机屏幕上单屏可见内容少，多次工具调用时被卡片占满。导航上，会话切换有三条重复路径（抽屉最近会话、抽屉"全部会话"、AppBar 图标），新建会话有两处入口（抽屉、列表页悬浮按钮），工作区只能在抽屉里切换却决定会话列表的内容；横幅、错误、待确认、审批与输入框全部堆在底部。此外，界面图标全部是 Flutter 默认 Material 图标，与 Web 端自绘的线性图标风格割裂，也缺少产品辨识度（启动图标同样是 Flutter 默认）；会话列表按 `lastUsedAt`（含"打开"）排序，只是点开会话就会跳到顶部，与 Web 按最近消息时间排序不一致。需要一套紧凑且有辨识度的视觉与导航，让手机上"看得多、切得快、单手够得着"，图标风格统一，列表顺序稳定可预期。

## What Changes

- 建立统一的紧凑设计 tokens：字阶（正文 14、次要 12.5、元信息 11、代码 12）、间距阶梯、收窄一档的圆角、`VisualDensity.compact`、AppBar 48dp，覆盖 `ThemeData` 各组件主题，替换页面中硬编码的字号与间距；色板（浅色蓝粉白/深色）与主题模式语义不变。
- 视觉节奏：助手消息无气泡满宽，用户消息保留粉色气泡；工具调用改为一行式摘要，用左侧细色条区分运行/成功/失败，展开才显示参数与结果；细描边替代厚重卡片。
- 点击热区保持 ≥44dp：视觉紧凑通过扩展命中区而非缩小可点击面积实现；字体放大到系统上限时不溢出、不遮挡主要操作。
- 导航重构：AppBar 标题单行加副标题，点击标题打开底部"会话切换器"（工作区芯片 + 搜索 + 紧凑会话列表 + 新建入口，可上拉到近全屏），取代独立的会话列表页；AppBar `[+]` 成为唯一新建会话入口并显式绑定当前工作区，去掉悬浮按钮与重复会话图标；抽屉瘦身为"电脑与设置/扫码配对"。
- 连接状态收敛为 AppBar 小圆点（异常时展示文字）；连接横幅、错误、待确认合并为一条可堆叠细条；"引导当前运行"开关并入输入区，不再独占一行。
- 子 agent 页、审批 Sheet、设置页、首页空状态与扫码页统一应用同一套 tokens 与布局（轮次条改为紧凑分段样式）。
- 系统返回：先关闭切换器/Sheet，再回上一级；切换器打开期间的迟到请求不切换工作区或会话。
- **风格化图标**：以 Web 端 `Icon` 的 24 栅格、1.6 线宽、圆头圆角线性风格为基准，建立应用自有图标集（复用 Web 已有图形，缺失图标按同一规则补绘），替换所有 Material 默认图标，包括系统返回/抽屉/关闭按钮与展开箭头；启动图标换成产品品牌图标，不再使用 Flutter 默认。
- **会话排序与 Web 一致**：移动 API `sessions.list` 改按最近消息时间排序（无消息时用创建时间，时间相同按会话 ID 倒序），并在会话摘要中新增 `lastMessageAt`；仅打开会话不改变顺序，列表展示的相对时间也取最近消息时间。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `mobile-api`:
  - ADDED "移动会话列表排序与时间语义"：`sessions.list` 按最近消息时间排序，摘要新增 `lastMessageAt`，打开会话不影响顺序（向后兼容的新增字段，API 版本仍为 1）。
- `mobile-ui`:
  - MODIFIED "移动工作区与会话导航"：会话/工作区切换改为标题触发的切换器，新建会话动作集中于顶栏，列表顺序与时间沿用最近消息时间，并补充系统返回与迟到请求场景。
  - ADDED "移动风格化图标"：统一的自有线性图标集与品牌启动图标。
  - ADDED "移动紧凑设计系统"：统一字阶/间距/形状/密度，≥44dp 热区与大字体不溢出（色板与主题语义不变，原"移动视觉与触屏访问"保持有效）。
  - ADDED "移动消息与工具调用呈现"：助手内容无气泡、工具调用一行式摘要（内容、展开、滚动语义不变）。
  - ADDED "移动顶栏与抽屉职责"：单行顶栏、连接状态圆点、抽屉只保留电脑与设置/配对。
  - ADDED "移动状态条与输入区布局"：横幅/错误/待确认合并细条，引导开关并入输入区（排队/引导/待确认语义不变）。

## Impact

- 代码（样式与导航，`apps/mobile/lib`）：`ui/theme.dart`（tokens 与组件主题）、`ui/widgets/transcript_view.dart`、`ui/widgets/markdown_view.dart`、`features/chat/chat_page.dart`（AppBar、抽屉、连接指示、横幅、composer）、`features/sessions/session_list_page.dart`（并入切换器）、`features/subagents/subagent_page.dart`、`features/approvals/approval_sheet.dart`、`features/computers/computers_page.dart`、`features/connect/home_page.dart`、`features/connect/scan_page.dart`。
- 测试：`apps/mobile/test` 中依赖抽屉/会话列表页导航 Key 与布局高度的 widget 测试需要同步调整，并新增大字体/小屏溢出与系统返回的测试。
- 代码（图标）：新增 `apps/mobile/lib/ui/neko_icons.dart`（图标路径数据与绘制组件）、`ThemeData` 的 `ActionIconTheme`，替换全部 `Icons.*`；Android 启动图标资源（`android/app/src/main/res`）与 iOS `AppIcon`。
- 代码（排序）：`packages/gateway/src/mobile/{adapter,protocol}.ts`（排序与摘要字段，复用 `@neko-harness/core/session-display` 的 `byMessage`）、`packages/gateway/test/fixtures/mobile-api-v1/sessions-*.json` 与相关测试、`docs/mobile-api-v1.md`；`apps/mobile/lib/core/api/models.dart` 及会话列表时间展示。
- 依赖：新增 `path_drawing`（纯 Dart，解析 SVG 路径数据以复用 Web 图标形状，版本按项目惯例用显式范围锁定）；不加字体包。
- 不涉及 Web/TUI、配对与存储格式。移动 API 仅新增字段，旧 App 忽略新字段、旧网关缺少该字段时新 App 回退到 `lastUsedAt`，无 **BREAKING**；用户可见变化为会话列表入口变为标题切换器、列表顺序不再随"打开"变化。
