# Tasks

## 1. 布局 token 与对拍测试

- [x] 1.1 在 `packages/web/src/client/lib/layout.ts` 新增分档常量表 `COLUMN_TIERS`（三档视口断点 80rem/105rem、消息列宽 48/56/64rem、工作列宽 前两档随消息列/宽屏档 80rem），保持 DOM-free；验证：`bun run check` 通过
- [x] 1.2 在 `styles.css` 定义对应自定义属性与 `.chat-column` / `.work-column` 的媒体查询分档规则；验证：浏览器 1280/1680/2560 宽度下审查元素确认列宽按档切换
- [x] 1.3 扩展 `test/layout-tokens.test.ts` 对拍新档位常量（JS 与 CSS 字面量双向比对，漂移即失败）；验证：`bun run test` 通过，且故意改一处值能看到测试变红

## 2. 聊天区分层宽度

- [x] 2.1 `message-list.tsx`：助手气泡放宽至列宽 100%（`.chat-bubble` 拆分用户/助手变体或新增类），用户气泡维持 75% 上限；验证：2560px 视口下助手气泡明显宽于用户气泡，散文段落行宽不超 64rem
- [x] 2.2 工具卡行（ToolRow/StreamingRow 的工具调用）脱离气泡宽度限制，改用 `.work-column`（负 margin 或行级容器，以 `min()` 钳制不超出可用宽度）；验证：1920/2560 下工具卡宽于气泡且无横向滚动条
- [x] 2.3 代码块（`.md pre`）随工作列受益，确认长行代码在宽屏下不再过早横向滚动；验证：粘贴含 120 字符长行的代码块回答，2560 下无内滚动，768 下仍有内滚动且不撑破布局

## 3. 输入卡片重构

- [x] 3.1 `composer.tsx` 的 `section` 改为浮动卡片结构：附件列表、错误/提示行、textarea、工具行同处一个 `rounded-card` 容器；textarea 去边框透明底，边框与焦点环上移到卡片（`:focus-within` + 现有 focus 环样式）；验证：IME 组字、@ 候选、/ 菜单、Enter 发送、Shift+Enter 换行、拖放/粘贴附件全部行为不变
- [x] 3.2 建议弹层（`composer-suggestions.tsx` / mentions 面板）锚点改为卡片容器，宽度对齐卡片；验证：/ 与 @ 弹层左右边缘与卡片对齐，小屏不越出视口
- [x] 3.3 `ModelPicker` 从 `status-bar.tsx` 迁入输入卡片工具行（组件逻辑不动，仅挂载位置与按钮样式适配工具行）；验证：面板打开/取消/应用流程不变，卡片工具行显示服务端确认值
- [x] 3.4 拆解 `status-bar.tsx`：压缩相位 pill（含 transient/expiry 定时器逻辑原样搬迁）与 busy 三点 + 状态文字迁入工具行；从 `chat-page.tsx` 移除独立 StatusBar 行并删除组件文件；验证：压缩各相位（进行中/成功/失败 10s 后消失）显示与时效行为与重构前一致
- [x] 3.5 触屏目标：在 `@media (hover: none)` 中给输入卡片按钮补 44px 最小尺寸；验证：设备模拟触屏下按钮计算尺寸 ≥44px

## 4. 遥测与状态特效

- [x] 4.1 遥测指示：工具行右侧紧凑显示 `↑input ↓output`，`hover`/`focus-within` 纯 CSS 展开成本与缓存读详情（`tabIndex=0` 键盘可达，`title` 兜底）；验证：鼠标悬停与 Tab 聚焦均展开，移开收起
- [x] 4.2 Ctx pill 保留在工具行，>90% 强调色逻辑不变，token 详数移到悬停提示；验证：mock 高占比时 pill 变强调色
- [x] 4.3 busy 环境特效：卡片顶边 2px sakura→tianyi 渐变流动条（仅 busy 显示，只动 `background-position`）；`prefers-reduced-motion` 下降级为静态渐变条；验证：发送消息后可见流动条，开启系统减少动效后呈静态，busy 结束消失
- [x] 4.4 卡片 `:focus-within` 视觉提升（阴影抬升 + 边框色加深，沿用既有 shadow token）；验证：Tab 进入卡片范围时可见提升，移出恢复

## 5. 验证与回归

- [x] 5.1 `bun run check` 与 `bun run test` 全绿
- [x] 5.2 六档宽度（375/768/1024/1440/1920/2560）实机走查：无横向溢出、导航/弹层/输入卡片/回到底部可用；触屏模拟（375 + hover:none）走查触控目标
- [x] 5.3 宽屏视觉回归截图对比（2560 下 before/after），确认留白占比下降且无新视觉瑕疵

## 6. 评审调整

- [x] 6.1 工具卡宽度与消息列对齐（撤销工作列突破方案：移除 `.work-column`、`--work-w` token 与 `COLUMN_TIERS.workColumnRem`，对拍测试同步）；验证：2560/1920 下工具卡左右缘与助手气泡对齐，无横向溢出
- [x] 6.2 工具行模型按钮放宽截断（`max-w-48` → `max-w-64`），思考强度完整显示；验证：工具行显示"DeepSeek V4.1 Flash · high"无省略号
