# Tasks

## 1. 会话排序与移动 API 新增字段（网关 + 文档）

- [x] 1.1 `packages/gateway/src/mobile/protocol.ts` 的 `MobileSessionSummarySchema` 新增 `lastMessageAt: Integer`；`adapter.ts` 的 `sessionsList` 改用 `@neko-harness/core/session-display` 的 `byMessage` 排序，`sessionsList`/`sessionsCreate` 输出 `lastMessageAt = messageTime(session)`（取整）；更新 `test/fixtures/mobile-api-v1/sessions-list-result.json` 与 `sessions-create-result.json` 并通过 `bun test --conditions=neko-source packages/gateway/test/mobile/protocol-fixtures.test.ts`
- [x] 1.2 更新 `packages/gateway/test/mobile/api-workspaces.test.ts`：把按 `lastUsedAt` 非递增的断言改为按 `lastMessageAt`（缺省取创建时间、同值按 ID 倒序）；新增"仅 attach 不改变顺序""提交消息后置顶""分页无重复无遗漏"用例，`bun test --conditions=neko-source packages/gateway/test/mobile` 通过
- [x] 1.3 更新 `docs/mobile-api-v1.md` 的 sessions 小节（排序规则、`lastMessageAt` 字段及向后兼容说明），并运行 `bun run check` 通过
- [x] 1.4 Dart 端 `core/api/models.dart` 的 `SessionSummary` 解析 `lastMessageAt`（缺省回退 `lastUsedAt`，不在客户端重排），会话行/切换器的相对时间取该字段；更新 `sessions_controller_test.dart` 增加"缺字段回退""顺序以服务端为准""仅打开不变序"用例，`flutter test test/features/sessions` 通过

## 2. 风格化图标

- [x] 2.1 在 `apps/mobile/pubspec.yaml` 新增 `path_drawing`（显式版本范围，与项目其他依赖一致），运行 `flutter pub get` 成功且 `pubspec.lock` 更新
- [x] 2.2 新增 `lib/ui/neko_icons.dart`：`NekoIcons` 路径表（沿用 Web `Icon` 已有形状，并按同一 24 栅格/1.6 线宽/圆头圆角补绘 stop、send、warning、cloud-off、block、shield、scan、list、expand、unfold、image-broken、external、sun/moon 等当前用到的全部图标）与 `NekoIcon` 组件（颜色/大小取 `IconTheme`、线宽等比缩放、`Semantics` 标签）；新增 `test/ui/neko_icon_test.dart` 覆盖每个图标渲染不抛错、路径边界在栅格内、颜色随主题、字体放大时尺寸合理，`flutter test test/ui/neko_icon_test.dart` 通过
- [x] 2.3 用 `NekoIcon` 替换 `lib` 下全部 `Icons.*`（chat_page、session 切换器、transcript_view、approval_sheet、computers_page、home_page、scan_page、subagent_page 等），在 `theme.dart` 配置 `ActionIconThemeData` 替换返回/抽屉/关闭按钮图标，`ExpansionTile` 使用自定义展开图标；状态图标用不同图形（运行/成功/失败/离线）区分；新增 `test/ui/no_material_icons_test.dart` 扫描 `lib` 无 `Icons.` 引用，`flutter test` 通过
- [x] 2.4 品牌启动图标：在 `apps/mobile/assets/brand/` 保存 SVG 源图，生成 Android 自适应图标（前景矢量、背景、单色层）与各密度旧版位图，更新 iOS `AppIcon`，并在 `apps/mobile/README.md` 记录生成步骤；`flutter build apk --debug` 成功，并在模拟器桌面确认显示品牌图标而非 Flutter 默认

## 3. 设计 tokens 与全局主题

- [x] 3.1 在 `ui/theme.dart` 增加 `NekoSpace` 间距阶梯、收窄后的圆角常量，并在 `buildNekoTheme` 配置 `visualDensity.compact`、完整 `textTheme`（含中文 fallback）、`AppBarTheme`(48dp)、`ListTileTheme`、`ChipTheme`、`InputDecorationTheme`、`DividerTheme`；新增 `test/ui/theme_test.dart` 断言字阶、AppBar 高度、明暗两套主题且色板值未变，并运行 `flutter test test/ui/theme_test.dart` 通过
- [x] 3.2 将各页面硬编码的 `fontSize: 12` 与零散间距替换为 tokens/`textTheme`（chat_page、transcript_view、session 列表/切换器、approval_sheet、computers_page、home_page、scan_page、subagent_page），运行 `flutter analyze` 无新增告警，并用 `grep -rn "fontSize:" lib` 确认仅 theme 中保留字号定义

## 4. 消息与工具调用呈现

- [x] 4.1 重做 `ToolCard` 为一行式摘要（状态色条+不同图形的状态图标+名称+单行摘要），展开区保留全文/图片/横向滚动逻辑；更新 `test/ui/tool_card_test.dart` 并新增状态可区分（非仅颜色）与展开保持阅读位置的测试，`flutter test test/ui` 通过
- [x] 4.2 调整用户气泡（14 圆角、12x8 内边距）、助手消息满宽排版与 `NekoMarkdown` 样式表字阶/代码块收紧，运行 `flutter test test/ui` 与 `test/features/chat/transcript_test.dart` 通过
- [x] 4.3 子 agent 页轮次条、审批 Sheet、设置页、首页空状态、扫码页应用 tokens 与紧凑布局，运行 `flutter test test/features` 通过

## 5. 顶栏、状态条与输入区

- [x] 5.1 `ChatPage` AppBar 改为单行标题+副标题，`ConnectionIndicator` 在 Ready 态仅显示带语义标签的小圆点，异常态显示文字并保留点击重连/重新配对；更新 `connection_ui_test.dart`，验证各连接状态及 44dp 热区，测试通过
- [x] 5.2 新增 `StatusStrip` 统一堆叠 `ConnectionBanner`/`ErrorBanner`/`PendingTray` 的细条样式，保持原 Key 与操作；新增多提示并存且不遮挡输入框的 widget 测试并通过
- [x] 5.3 将"引导当前运行"开关并入 `Composer`（保留 `composer-steer` Key），发送/停止紧凑但热区 ≥44dp；更新 `chat_page_test.dart` 中排队/引导用例，并新增软键盘弹出（`viewInsets`）下发送/停止可见的测试，全部通过

## 6. 导航重构

- [x] 6.1 将 `SessionListPage` 主体抽成 `SessionPicker`，实现标题触发的会话切换器（工作区芯片+搜索+紧凑列表+加载更多，顺序直接使用服务端返回），保留 `sessions-search`/`session-<id>` Key；新增 widget 测试覆盖选择工作区、切换会话、搜索、分页，以及"仅打开会话后再打开切换器顺序不变"，并通过
- [x] 6.2 新建会话仅保留顶栏 `[+]`（显式绑定当前工作区）与空态按钮，移除 FAB、抽屉内新建与 AppBar 会话图标；更新 `chat_page_test.dart` 中依赖 `sessions-new` 的用例，并验证空工作区不自动创建、不重复新建
- [x] 6.3 抽屉瘦身为"电脑与设置/扫码配对"，删除重复会话与工作区列表；新增测试断言抽屉不再出现会话列表且入口可用
- [x] 6.4 新增系统返回与迟到请求测试：打开切换器后返回只关闭切换器并保留草稿；快速切换工作区/会话时迟到响应不覆盖最新选择，输入发往最终会话；`flutter test` 全部通过

## 7. 小屏/大字体与整体验证

- [x] 7.1 新增小屏(360x640)与 `textScaler` 1.5 的 widget 测试，覆盖会话页、切换器、审批 Sheet 与设置页，断言无溢出异常、关键按钮可点；`flutter test` 通过
- [x] 7.2 运行 `flutter analyze` 与 `flutter test`（`apps/mobile`），以及根目录 `bun run check` 与 `bun test --conditions=neko-source --isolate packages/gateway`；并在模拟器/真机以浅色、深色、系统字体放大三种组合人工检查会话页、切换器、子 agent、审批与设置页（含图标与 Web 对照、列表顺序与 Web 一致），记录结果；如 `integration_test/mobile_e2e_test.dart` 受导航变更影响则同步更新并通过
- [x] 7.3 更新 `apps/mobile/README.md` 中与导航/界面/图标相关的描述，并验证其中命令按文档可运行

## 8. 真机反馈修正

- [x] 8.1 图标：`NekoIcon` 在父级强制放宽时仍画成正方形（修复搜索图标被拉伸），默认图标 18、`IconButton` 20、发送箭头 18、搜索前缀 16；新增 `neko_icon_test` 强制宽度用例并通过
- [x] 8.2 抽屉增加品牌头部与连接状态、已配对电脑切换、扫码配对、电脑管理与设置、外观快捷切换；更新 `chat_page_test` 抽屉用例并通过
- [x] 8.3 切换工作区后自动切到该工作区最近使用的会话（无会话回空态）；顶栏标题取自已知会话摘要，无标题显示"新会话"，不受搜索筛选影响；新增 3 个 widget 测试并通过
- [x] 8.4 配对成功后直接回首页进入会话，移除"已配对"中间页；更新 `scan_page_test` 与集成测试并通过
- [x] 8.5 行内代码/代码块底色在浅色主题改用更浅的 `codeInline` token；`theme_test` 与全量 `flutter test` 通过

## 9. 应用更名与 CI 发版

- [x] 9.1 应用更名为 NekoAI：Android `android:label`、iOS `CFBundleDisplayName`/`CFBundleName`、`MaterialApp.title`、顶栏/首页/抽屉的默认标题与配对设备名（`applicationId` 不变，不影响已配对数据）；`flutter test` 通过，`aapt dump badging` 显示 `application-label:'NekoAI'`
- [x] 9.2 `.github/workflows/release.yml` 新增 `android` 任务：发布 Release 时校验标签与根版本一致，执行格式/分析/测试后构建 `--release --split-per-abi`（`versionName` 取根版本，`versionCode`=major*10000+minor*100+patch），把 `NekoAI-vX.Y.Z-<abi>.apk` 附到该 Release；YAML 解析通过，本地以同样参数构建得到 `versionName='0.3.3'`
- [x] 9.3 `apps/mobile/README.md` 记录测试版 APK 与发版流程（暂为 debug 签名、不能覆盖升级、无应用内升级，后续在该任务中接入 keystore 与升级机制）
