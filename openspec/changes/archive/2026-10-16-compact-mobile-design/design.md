# Design

## Context

移动端是 `apps/mobile` 下的 Flutter 应用（Flutter 3.47.7，Riverpod + go_router）。现状（见 proposal.md - Why）：`ui/theme.dart` 仅配置颜色/Card/输入框；页面硬编码约 130 处 `EdgeInsets`/`SizedBox` 与 12 处 `fontSize: 12`；导航由 `ChatPage` 的 `NekoDrawer`、AppBar 会话图标、`SessionListPage`（含悬浮新建按钮）、`ComputersPage` 构成。色板取自 Web 的 sakura/tianyi 语义，需保持。`mobile-ui` 规范要求触屏/屏幕阅读器/字体放大可访问，软键盘与安全区下输入和审批可达。已有测试多数以 `Key` 定位，直接依赖导航结构的仅 `sessions-new`（`chat_page_test.dart`）、`SessionListPage` 直接挂载，以及连接指示/横幅 Key。

## Goals / Non-Goals

**Goals:**
- 图标风格与 Web 一致且为自有风格，替换所有 Material 默认图标和启动图标。
- 会话列表顺序与 Web 一致（最近消息时间），仅打开不改变顺序。
- 一套集中管理的紧凑 tokens（字阶、间距、圆角、密度），页面只引用 tokens。
- 会话/工作区切换收敛到一个入口；顶栏、状态条、输入区纵向占用明显减少。
- 热区 ≥44dp、大字体不溢出、系统返回层级正确。

**Non-Goals:**
- 不改色板、主题模式、配对/存储与 Web/TUI；移动 API 仅做 D11 的新增字段与排序调整，不动其他方法。
- 不引入底部导航栏或字体包；唯一新增依赖是 `path_drawing`（D10）。
- 不重画 Web 端图标；Web 图标集只作为 Flutter 图标的形状来源。
- 不改变消息内容、展开、滚动、排队/引导/待确认、审批的功能语义。

## Decisions

### D1：tokens 集中在 `ui/theme.dart`，用 `TextTheme` + 间距常量，而不是在各页面改数值

在 `NekoTokens` 旁新增 `NekoSpace`（4/8/12/16 阶梯）与调整后的圆角常量（控件 8 / 卡片 12 / 气泡 14），并在 `buildNekoTheme` 里设置 `visualDensity: VisualDensity.compact`、完整 `textTheme`（正文 14、次要 12.5、元信息 11、标题 15 w600，行高约 1.35–1.4，`fontFamilyFallback` 覆盖中文）以及 `AppBarTheme`（`toolbarHeight: 48`）、`ListTileTheme`（紧凑 `minVerticalPadding`、`dense`）、`ChipTheme`、`InputDecorationTheme`（紧凑内边距）、`CardTheme`、`DividerTheme`。页面中的 `fontSize: 12` 等替换为 `textTheme` 样式。
- 替代方案：逐页改数值——易再次漂移，被否决。
- 单位用逻辑像素，随 `textScaler` 缩放，满足字体放大。

### D2：热区靠扩展命中区而非保持视觉尺寸

保留 `materialTapTargetSize.padded`，自定义的小控件（一行式工具项、连接圆点、切换器会话行）用 `InkWell`/`ConstrainedBox(minHeight: 44)` 或带内边距的命中层；视觉高度可更小。对 `IconButton` 使用紧凑 `visualDensity` 但保持默认 `minimumSize` 的 44。
- 替代方案：全局关闭 padded——会违反热区要求，被否决。

### D3：会话切换器为 `showModalBottomSheet` + `DraggableScrollableSheet`，复用 `SessionsController`

标题点击打开切换器：顶部工作区横向芯片，下方搜索 + 紧凑会话列表（沿用 `SessionsController.search/loadMore/refresh`）和"电脑与设置/配对"二级入口不放这里（留在抽屉）。选中会话后 `pop` 切换器再 `chat.attach`，选中工作区调用 `selectWorkspace`。`SessionListPage` 的列表主体抽成可复用组件 `SessionPicker`，页面本身删除（不再有独立路由）。
- 系统返回：Sheet 是路由，`maybePop` 自然先关 Sheet，再回上一级；不使用自定义 `PopScope` 拦截。
- 竞态：沿用 controller 内已有的请求序号/当前选择校验；切换器本身只调用 controller，不缓存选择结果，因此迟到响应由 controller 丢弃。需用测试固定该行为。
- 替代方案 A（仅收敛入口、保留列表页）：改动最小，但"切换"仍是整页跳转；替代方案 C（底部导航）：增加常驻 chrome，与紧凑目标冲突。

### D4：新建会话仅顶栏 `[+]`；空态按钮复用同一 controller 动作

移除 `FloatingActionButton` 和抽屉内"新建会话"；`ChatPage` 无会话时的 `_EmptySession` 保留引导按钮（同一 `SessionsController.create`，仍显式绑定当前工作区）。AppBar 去掉会话图标，标题成为切换器入口（带下拉箭头提示可点）。

### D5：顶栏与连接状态

标题两行改为"标题 + 副标题"紧凑排版（`toolbarHeight: 48`）。`ConnectionIndicator` 在 Ready 态仅显示 8dp 绿点（带语义标签"在线"），其他状态显示点/图标+文字，保留 `connection-indicator` Key 及点击行为；热区按 D2 扩展。

### D6：状态条合并

新增 `StatusStrip`，把 `ConnectionBanner`、`ErrorBanner`、`PendingTray` 以统一的 32–40dp 细条样式纵向堆叠（各自保留原 Key 与操作，不合并为单一状态机，避免语义耦合）。`ApprovalBar` 保持独立（规范要求可发现的审批入口）。

### D7：Composer 内置引导开关

把 `FilterChip` 移入输入框 `InputDecoration.suffixIcon`/输入行内的小开关（忙碌且可控时出现），保留 `composer-steer` Key；发送/停止按钮使用紧凑尺寸但保持 44dp 热区。

### D8：消息与工具项样式

助手消息保持满宽、不加气泡（现状已接近）；用户气泡改 14 圆角、`12x8` 内边距。`ToolCard` 由带边框 `Card` 改为一行式行：左侧 2dp 状态色条 + 状态图标（运行/成功/失败三种不同图形）+ 名称 + 单行摘要；展开区保留现有 `ExpansionTile` 内容与全文/图片/横向滚动逻辑，仅调整内边距。Markdown 样式表同步字阶（正文 14、代码 12、代码块圆角/内边距收紧）。

### D9：其余页面统一

子 agent 页轮次条由 `Chip` 横条改为紧凑 `Chip`（`visualDensity` 紧凑、高度约 28）并缩小条高；审批 Sheet、设置页、首页空状态与扫码页改用 tokens 的间距/字阶，不改交互。

### D10：风格化图标——复用 Web 的 24 栅格线性路径，经 `path_drawing` 绘制为 `NekoIcon`

Web 的 `Icon`（`packages/web/src/client/components/primitives.tsx`）是自绘 SVG 路径：24x24 栅格、线宽 1.6、`round` 端点与拐角、`currentColor`。Flutter 端新增 `ui/neko_icons.dart`：`NekoIcons` 常量表（名称 → 路径数据，Web 已有的 folder/plus/chevron/search/more/chat/close/settings/up/check/clock/info/trash/eye/phone 等直接沿用，缺失的 stop/send/warning/cloud-off/block/shield/scan/list/expand/unfold/image-broken/external/sun-moon 等按同一栅格与线宽新补）与 `NekoIcon` 组件（`CustomPainter`，`parseSvgPathData` 生成 `Path`，按 `IconTheme` 取颜色与大小，`Semantics` 带标签，线宽随尺寸等比缩放）。
- 系统组件内置图标：用 `ThemeData.actionIconTheme`（`ActionIconThemeData`）替换返回/抽屉/关闭按钮图标；`ExpansionTile` 用自定义 `trailing`；`IconButton`/`ListTile` 统一传入 `NekoIcon`；`Icons.*` 在 `lib` 中零引用，用测试（扫描源码）守护。
- 状态图标以不同图形区分（运行=旋转弧、成功=对勾圈、失败=感叹圈），不依赖颜色。
- 启动图标：用同一线性风格绘制品牌标记（猫形轮廓），生成 Android 自适应图标（前景矢量 + 背景色 + 单色层）与旧版位图，并更新 iOS `AppIcon`；源图以 SVG 形式保存在 `apps/mobile/assets/brand/`，生成步骤写入 README。
- 替代方案：图标字体（需字体生成工具链与 codepoint 维护）、`flutter_svg`（体积与依赖更大，且需把每个图标做成 asset 文件）、第三方图标包（风格与 Web 不一致，只是换了一套别人的默认）——均被否决。`path_drawing` 是纯 Dart 小依赖；若依赖审查不通过，退路是仓库内自写 SVG 路径子集解析器（本图标集只用到 M/m/L/l/H/h/V/v/A/a/Z/z）。
- 品牌图标最终形状需设计确认；任务里先交付可替换的资源与生成流程。

### D11：会话排序——移动 API 对齐 `byMessage`，新增 `lastMessageAt`

现状：Web 目录用 `byMessage`（`lastMessageAt ?? createdAt`，同值按 ID 倒序，`packages/core/src/session-display.ts`），而 `mobile/adapter.ts` 的 `sessionsList` 按 `lastUsedAt` 排序。`lastUsedAt` 在打开/attach 会话（`touchConversation`）时更新，所以仅打开就会被置顶。
- 网关：`sessionsList` 改用 core 的 `byMessage` 排序（`MobileSessionSummarySchema` 同时新增 `lastMessageAt: Integer`，值为 `messageTime(session)`，即无消息时为创建时间，便于客户端直接显示）；`sessionsCreate` 返回同样字段。保留 `lastUsedAt`。分页游标仍是排序后列表的偏移，排序键稳定（含 ID 兜底）故分页无重复/遗漏。
- 兼容：纯新增字段，API 版本与 capabilities 不变；Dart `SessionSummary.fromJson` 在缺少 `lastMessageAt` 时回退 `lastUsedAt`，并不在客户端重排，保持"以服务端顺序为准"，避免双份排序语义。
- 客户端：会话行与切换器展示的相对时间取 `lastMessageAt`；`sessions.changed` 通知触发的刷新沿用现有逻辑，发送消息后目录更新时置顶，打开会话时顺序保持（因排序键未变）。
- 替代方案：客户端按本地缓存自行排序——与 Web 逻辑重复且旧网关下不一致；直接改 `lastUsedAt` 语义——会破坏其"最近使用"含义并影响 Web 的 `byVisited`（用于工作区切换时选默认会话），被否决。

## Risks / Trade-offs

- [紧凑后大字体溢出] → 为 AppBar 标题、切换器行、状态条使用 `maxLines` + `ellipsis`，并新增 `textScaler` 1.5 与 360×640 窗口的 widget 测试。
- [热区被误缩小] → 统一 `minHeight/minWidth` 44 的命中层，并加测量测试（`tester.getSize`）。
- [导航变化破坏已有测试与肌肉记忆] → `sessions-new` 等 Key 迁移到顶栏/切换器并更新测试；切换器内保留搜索/列表 Key（`sessions-search`、`session-<id>`）以减少改动。
- [Sheet 与软键盘冲突（搜索框）] → `isScrollControlled` + `viewInsets` 内边距，`DraggableScrollableSheet` 随键盘调整，并测试。
- [一行式工具项信息密度过高] → 摘要仅显示关键参数的首行截断，完整内容展开可见；失败项额外显示红色文字摘要。
- [path_drawing 解析与 Web 渲染有细微差异（弧线、线宽缩放）] → 为每个图标加渲染冒烟测试（不抛错、边界在 24 栅格内），并在人工检查清单中逐一与 Web 对照。
- [旧 App/旧网关组合] → 新增字段向后兼容；用夹具测试固定"缺字段回退"与"多余字段忽略"。
- [视觉改动无法全靠单测验证] → 提供小屏/大字体的 widget 测试与人工 `flutter run` 检查清单（任务中列出）。

## Migration Plan

无数据迁移。分阶段落地并各自可验证：先网关排序与 API 新增字段（可独立发布，旧 App 无感），再图标与 tokens，最后导航与状态条/输入区。回滚为还原相应代码；网关新增字段无需回滚，排序回滚即恢复 `lastUsedAt`。
