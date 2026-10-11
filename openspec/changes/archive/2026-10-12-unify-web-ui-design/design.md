# Design

## Context

现状约束（详见 proposal.md 的 Why）：

- `packages/web/src/client/styles.css`（约 740 行）内含两套体系：`@theme` 的 sakura/tianyi/ink tokens（聊天区，styles.css:12-89）与 `.nav-theme` 中性灰变量块（侧栏/顶栏/全部弹层，styles.css:628-740）。组件侧约 110 行 `.nav-*` BEM 类只作用于导航与弹层。
- Tailwind CSS v4（`@tailwindcss/vite`），tokens 经 `@theme` 声明为 utilities；React 19 + `@tanstack/react-router`。
- 字号无阶梯：聊天正文 `text-[15px]`、工具卡 `text-[13px]`、nav 强制 13px 各自硬编码；`max-w-3xl` 三处、`767px` 断点三处（nav-primitives.tsx:40、chat-page.tsx:14、styles.css:724）、气泡宽度类重复 5 次。
- ink 色阶缺 300/800 档（styles.css:42-49）。

## Goals / Non-Goals

**Goals:**

- 一套 token 体系覆盖全站：导航、弹层、聊天区、设置页统一使用 sakura/tianyi/ink/base/surface；`.nav-theme` 变量块与双轨样式移除。
- 建立字号/间距/圆角阶梯并全组件套用，聊天区正文基准收敛到 14px。
- 布局常量（消息列宽、移动断点、气泡宽度）单一来源，并有测试守护 JS/CSS 一致性。
- composer 区域层级整理 + a11y 补漏；inline code、工具卡状态按 spec 修订落地。
- 移除 `@tanstack/react-query` 与 `lib/api.ts` 死代码。

**Non-Goals:**

- 不引入暗色模式（`color-scheme: light` 保留；暗色需独立变更设计 token 映射）。
- 不改 store 订阅模型与流式渲染路径（性能重构另起变更）。
- 不改 gateway 协议、view 数据结构或任何服务端行为。
- 不重设计信息架构（页面结构、路由、面板划分保持不变，只做视觉与局部结构治理）。

## Decisions

### D1: 主题统一采用"聊天 token 吞噬 nav"，而非反向或新建第三套

保留现有 `@theme` sakura/tianyi/ink 体系为唯一来源（色相、对比度已经过实测并文档化），把 `.nav-*` 组件类逐一改写为引用这些 token：侧栏底色 `base`/白、选中态 sakura-100/粉色文字、hover sakura-50、边框 ink-200、文本 ink-900/500。弹层（Modal/Popover/目录面板）同样迁移，边框与阴影改用 `--shadow-soft` 系列。

备选：① 反向收敛到中性灰——丢弃已验证的粉蓝品牌感，违背需求方向；② 新建第三套融合 token——增加一次全量换色成本且无收益。两者均排除。

迁移手法（实现后修正）：原计划两步走（先变量映射换色、再清类），实现时合并为一次迁移——`.nav-theme` 变量块整体删除，`.nav-*` 类重命名为语义化的 `chrome` 域组件类（`sidebar`/`chrome-row`/`icon-btn`/`dialog`/`popover` 等），集中放在 `@layer components` 中直接引用 `@theme` tokens；真正简单的模式（截断、弱化文字、字重）才内联为 Tailwind utilities。选择组件类而非全量 JSX utilities，是因为 tooltip、dialog、drawer 等块的声明超过十条，内联会让 JSX 不可读且重复；组件类同样满足"单一 token 来源、无第二套主题"的目标。整个区块置于 `@layer components` 还解决了原 `.nav-theme` 无层样式压制 utilities 的问题（弹层内的 rounded-full 等现在能生效），`.nav-search` 的 `!important` 也随之消除（同优先级靠声明顺序覆盖）。

### D2: 字号/圆角/间距阶梯落在 `@theme`，组件只引用档位

- 字号阶梯（`:root` 语义变量 + Tailwind utilities）：`xs=12`（徽章/辅助）、`sm=13`（导航行/状态栏/工具卡）、`base=14`（聊天正文/输入框/设置页）、`lg=16`（区块标题）、`xl=20`（页面标题）。现有 `text-[15px]`/`text-[13px]` 等硬编码全部归档。
- 圆角阶梯：保留气泡特色但收敛——`--radius-card: 1rem`、`--radius-bubble: 1.25rem`（原 1.75rem 过膨）、控件统一 `0.625rem`（替换 nav 的 5px）。
- 补齐 ink 300/800 两档，使色阶连续。
- 行内代码：`ink-100` 底 + `ink-800` 字 + 等宽字体，无边框无药丸圆角（代码块 highlight.js 主题不动）。

### D3: 断点与布局常量单一来源：CSS `@theme` 定义 + TS 常量 + 测试对拍

Tailwind v4 支持在 `@theme` 声明 `--breakpoint-*`。在 styles.css 定义 `--breakpoint-mobile: 48rem`（768px，替代 767px 的擦边值），TS 侧新建 `lib/layout.ts` 导出 `MOBILE_BREAKPOINT = 768`、`MESSAGE_COLUMN = "48rem"` 等常量；`useMobile()` 与 chat-page 初始侧栏状态改为读取该模块。新增一个守护测试：读取 styles.css 文本与 `layout.ts` 常量比对，漂移即失败。消息列宽 `max-w-3xl` 与气泡宽度类提取为共享常量/utility 类（如 `.chat-column`），三处引用归一。

备选：CSS custom property 运行时读取（`getComputedStyle`）——免对拍但引入运行时依赖与 SSR/首帧复杂度，对一个静态值不值得。

### D4: Composer 治理 = 结构分区 + 语义补全，不改交互逻辑

保持现有行为（附件、@ 引用、/ 命令、IME 保护、execCommand 插入）不变，只做：

- 区域分层：通知/错误行（role=alert 已存在）→ 附件缩略图行 → 输入行（[+] textarea [⋯] [发送/停止]）三区固定顺序与间距；按钮组视觉重量排序：发送为主按钮，+ 与 ⋯ 为幽灵图标按钮（统一接入 nav-primitives 的 SVG `Icon`，淘汰文本字符 ＋/⋯/⚡/✦ 的混用）。
- 主输入框加 `aria-label="消息输入"`（placeholder 不再是唯一名称）。
- 技能/命令条目：名称一行 + 描述单行 `line-clamp-1` 截断（现有截断发生在整段拼接文本上，改为结构化两行）。
- 「回到底部」浮钮改为贴消息列右缘的固定槽位，或为列表底部预留其高度的 padding，不再压在内容上。

### D5: 工具卡状态 = 图标 + 语义色双重编码

`STATUS` 映射扩展为 `{ icon, classes }`：进行中（spinner/转动图标 + tianyi）、成功（✓ + 低饱和 ink 或淡绿中性底）、失败（✗ + sakura-500 底 + 加粗边框），失败态不再只靠 sakura-300/400 色差。图标进 `Icon` 组件库，状态名保留文本徽章（完成/出错），满足"非色彩线索可辨"。

### D6: 死代码与零散修复随本变更一并清理

- 删除 `lib/api.ts`，从 `main.tsx` 移除 QueryClientProvider，卸载 `@tanstack/react-query` 依赖（bootstrap.ts 的 plain fetch 保留）。
- WelcomeCat 的 4 个硬编码 hex 改为 `currentColor` + CSS 变量引用。
- status-bar 的 `useState+setTimeout` 刷新 hack 替换为显式 `expired` 布尔状态（渲染时派生是否展示，定时器只负责到期翻转布尔值；保留这一个既有定时器，因为纯渲染期派生无法在没有其他更新的空闲会话里到时隐藏徽章——完全消除定时器会改变"瞬态相位自动消失"的行为）。
- `lib/layout.ts` 保持 DOM-free（根 tsc 不含 DOM lib，而根程序会经测试文件编译到它）：只导出常量与媒体查询字符串，`matchMedia` 调用留在 client 侧使用方。
- 聊天页加 `<main>` landmark 与 skip-link（视觉隐藏、聚焦可见）；会话 tooltip 加 `aria-describedby` 接线。

## Risks / Trade-offs

- [全站换色面广，回归只能靠肉眼] → 按 D1 两步走，每步对 1440/768/375 三档宽度截图对比；`packages/web/test` 中断言 nav 类名/色值的用例同步更新。
- [`--breakpoint-mobile: 48rem` 从 767px 变为 768px，边界宽度行为变化] → 767 与 768 之间无实际设备档位，风险可忽略；变更在 tasks 中显式标注。
- [字号 15→14 使信息密度上升，长 markdown 阅读节奏变化] → 同步微调行高（1.7 → 1.75）保持可读性；以真实会话截图验收。
- [对拍测试读 CSS 文本较脆弱] → 只比对具名常量行（正则锚定 `--breakpoint-mobile:` 等），不因无关样式改动误报。
- [移除 react-query 后若未来需要服务端状态库需重新引入] → 当前无消费者，YAGNI；重新引入成本仅为装包。

## Migration Plan

纯前端表现层变更，无数据与协议迁移。按 D1 分两步提交（先变量映射换色、后类清理），每步 `bun run check && bun run test` + 三档宽度截图；发现问题 `git revert` 单步即可。
