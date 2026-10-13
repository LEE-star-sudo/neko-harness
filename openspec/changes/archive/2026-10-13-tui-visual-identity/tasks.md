# Tasks

## 1. 依赖与主题基础设施

- [x] 1.1 `packages/tui` 新增 `highlight.js` 精确版本依赖,`bun install --frozen-lockfile` 更新 lockfile 后安装成功
- [x] 1.2 新建 `packages/tui/src/theme/palette.ts`:sakura/tianyi/ink 色阶常量与 design D1 明暗两套主题表;`bun run check` 通过
- [x] 1.3 新建 `theme/slots.ts`:33 槽位 SLOT_NAMES、createTheme、明暗主题、`theme` 委托与 `style` SGR 助手(从现 theme.ts 迁入并扩展);新增槽位单测(每槽可调用、主题切换后委托指向新表)通过
- [x] 1.4 新建 `theme/markdown.ts` 与 `theme/index.ts`(re-export),删除原 `theme.ts`,全部组件 import 机械替换为 `../theme/index.ts`;`bun run build` 与 `bun run test` 全绿

## 2. 语法高亮

- [x] 2.1 新建 `theme/syntax.ts`:hljs core + 21 个 eager 语言注册、scope 前缀→9 个 syntax 槽位映射、首帧后懒加载全量语言(失败容忍);单测覆盖常见语言高亮、未知语言回退平涂、映射前缀命中,全部通过
- [x] 2.2 `theme/markdown.ts` 的 `getMarkdownTheme()` 挂接 `highlightCode`,在明暗主题下各渲染一个带语言标识的代码块,人工确认颜色随主题切换
- [x] 2.3 代码块底色矩形化(验收修正):高亮与平涂两路径各行底色补齐到块内最宽行,空行同样铺底,缩进格连入底色;fence 改 dim 槽位提升可辨度;单测覆盖等宽补齐与空行铺底,通过

## 3. 排版节奏与状态字形

- [x] 3.1 `tui.ts` `#appendItem` 统一顶层条目 `Spacer(1)` 规则(首条除外);布局测试更新并通过
- [x] 3.2 工具卡 `Box(0,0)` → `Box(1,0)`,与助手正文左缘对齐;渲染断言更新并通过
- [x] 3.3 工具卡状态字形表落地(`…`/braille/`✓`/`✗`,失败替换 ASCII `x`)与应用级 120ms ticker(仅运行中工具存在时启用);单测覆盖四相位字形与 ticker 启停,通过
- [x] 3.4 流式块让位间距修正(验收修正):`ImageTranscript.removeItem` 连同前导 Spacer 一并移除,消除用户消息与正式条目间的双倍空行;单测覆盖移除与后续追加间距,通过

## 4. 组件视觉

- [x] 4.1 用户气泡加 `▍ ` accent 左缘(整行 userBg 贯通、宽度 -2);skill 折叠标记行同步;渲染测试通过
- [x] 4.2 thinking 折叠/展开新样式(`✧` 前缀、展开态 thinking 槽位色+斜体、缩进一致);组件测试通过
- [x] 4.3 Footer 两行分层(design D8:身份行/度量行、`·` 分隔、Ctx 阈值 warning/error 配色),保留窄屏候选退化;footer 测试更新并通过
- [x] 4.4 Picker 标题行 accent 加粗 + 条目计数、搜索提示符 `❯`、选中行 `❯` 前缀;picker 测试更新并通过
- [x] 4.5 `addNotice` 改三级(info/warning/error,带 `i`/`!`/`✗` 前缀),调用点按语义迁移;通知渲染断言通过
- [x] 4.6 `/theme` 命令:浮层选择 auto/light/dark(标注当前项),进程内偏好即选即生效;auto 恢复终端跟随(重复订阅有守卫),明确明暗取消订阅;构建与全量测试通过
- [x] 4.7 `/new` 命令:复用 `createSession` 快捷新建会话,纳入斜杠补全表;构建与全量测试通过
- [x] 4.8 工具卡单行折叠(验收迭代,design D12):所有工具默认单行 + `+N lines` 提示,点击展开参数详情与输出原文全文(经 8 行预览/特例/回退迭代后确认);单测覆盖多工具单行折叠、展开原文、运行中展开可见,通过

## 5. 忙碌行与欢迎屏

- [x] 5.1 布局新增仅忙碌时可见的 Loader 行(accent spinner + muted 状态文案,复用现有 busy/compaction 文本),编辑器边框改 borderMuted/accent;layout 测试通过,80x24 与 60x16 下输入区与状态栏不被挤出
- [x] 5.2 空会话欢迎屏组件(design D10:猫脸 accent、模型行实时联动、首条消息到达即移除、不占条目 key);组件测试覆盖显示/移除/配置联动,通过

## 6. 集成验收

- [x] 6.1 `bun run build && bun run test && bun run check` 全部通过;cli bundle 体积检查,highlight.js 引入后无异常膨胀(异常则裁剪 eager 语言表)
- [x] 6.2 明暗两种终端背景人工验收:关键组合对比度(accent/终端底、userText/userBg、selection 内文字),必要时按 design D1 微调 hex 并记录最终值
- [x] 6.3 真实会话冒烟(`bun run neko tui`):流式回答语法高亮、工具卡四相位、忙碌行动画、欢迎屏让位、三级通知各触发一次,行为符合 specs/terminal-ui 新增场景

## Workflow follow-up

- 人工验收通过后归档变更,并复核归档后主 spec `terminal-ui` 的合并结果。
