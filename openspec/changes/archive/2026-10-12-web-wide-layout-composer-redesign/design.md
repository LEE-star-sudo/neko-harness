# Design

## Context

动机见 proposal.md。当前形态（探索阶段实测）：

- `.chat-column` 固定 `max-width: 48rem`，消息列 / StatusBar / Composer 三处共用；`.chat-bubble` 在 ≥40rem 时再限 75%，即气泡恒 ≤576px。2560px 视口下主区 2304px、聊天列仅占 33%。
- `lib/layout.ts` 与 `styles.css` 的 token 对拍由 `test/layout-tokens.test.ts` 守护（CSS 无法引用脚本常量，只能靠测试防漂移）——新增宽度档位必须进同一机制。
- `StatusBar` 是独立横带（模型选择器 + Ctx pill + 压缩 pill + busy 三点 + 用量），`Composer` 是另一条 `border-t` 全宽横带；`ModelPicker` 本身是自包含的按钮 + Modal，迁移只改挂载位置。
- 输入区三个按钮均为 40px（`h-10 w-10`），chrome 域的 `@media (hover: none)` 44px 规则不覆盖它们。
- 动效已有逐项 `prefers-reduced-motion` 降级模式（styles.css 末尾），新特效应沿用同一写法。

## Goals / Non-Goals

**Goals:**

- 宽屏下聊天区按内容类型分配宽度：散文可读性不劣化，代码/工具输出拿到空间。
- 输入区收敛为单一浮动卡片：一个视觉容器承载编辑 + 配置 + 状态，减少 chrome 横带与注意力跳转。
- 稳态遥测默认收起、按需展开；瞬态状态不依赖悬停。
- 全部改动留在既有 token 体系、对比度约束与降级模式内。

**Non-Goals:**

- 不做双栏工作台（IDE 式右侧面板）——产品形态变更，不在本次范围。
- 不引入暗色主题，不调整 sakura/tianyi/ink 色板与字号阶梯本身。
- 不改 gateway / core / TUI 与任何协议、存储格式。
- 不改变模型面板的交互流程（仅改入口位置）。

## Decisions

### D1：宽度分档用"单列三档"而不是无级缩放

三档视口、一个宽度维度（消息列即全部内容的宽度）：

```
档位（视口）        消息列(chat-column)
< 80rem(1280px)     48rem
80–105rem           56rem
≥ 105rem(1680px)    64rem
```

- **消息列**：承载散文气泡、工具卡与输入卡片。48→56→64rem 逐档抬升；64rem 对 14px 正文已超理想行宽，不再往上走。
- **宽度分配**：用户气泡维持 `max-width: 75%`（短文本不需要宽）；助手气泡放宽到列宽 100%（助手散文是主要阅读载荷）；工具卡/代码块与消息列同宽，左右缘与气泡对齐——曾设计为宽屏档突破到 80rem 的"工作列"，实机评审中因工具卡突出于气泡两侧、视觉不整齐而否决（对称负 margin 还会被 `content-visibility` 绘制裁剪，见风险节）。

备选：单一上限整体抬高（简单但散文劣化）、CSS `clamp()` 无级缩放（宽度连续变化导致排版不稳定，且档位不可命名、无法对拍）。分档方案的每档都是命名 token，天然契合现有单一来源 + 对拍测试机制。

### D2：布局 token 扩展进现有对拍机制

`lib/layout.ts` 增加 `COLUMN_TIERS`（档位断点与列宽字面量表），`styles.css` 的自定义属性写同名值，`layout-tokens.test.ts` 扩展对拍断言。CSS 侧用媒体查询切换 `.chat-column` 的 `max-width`；JS 侧目前只有 `MOBILE_BREAKPOINT` 有消费方（`useMobile`），新增档位若暂无 JS 消费方，仍在 layout.ts 中声明以保持单一来源语义，测试保证双向不漂移。

### D3：输入卡片 = 视觉容器合并，不是组件大重写

```
.---------------------------------------------------------------.
| [错误/提示行]            (沿用现有条件渲染)                     |
| [附件缩略图列表]                                               |
| textarea (无边框，卡片本身承载边框与焦点环)                     |
|---------------------------------------------------------------|
| (+) (⋯) | [模型▾] [Ctx 12%] | [压缩/busy pill] | [⏏遥测] [发送] |
'---------------------------------------------------------------'
rounded-card + border + shadow-soft；:focus-within 阴影抬升
```

- `Composer` 的 `section` 从"全宽 border-t 横带 + 内套 chat-column"改为"页面底部留白 + 浮动卡片"（卡片本身即 chat-column 宽度）。textarea 去边框改透明底，边框/焦点环上移到卡片（`:focus-within`），textarea 保留 `aria-label` 与全部 IME/候选/快捷键逻辑——行为代码零改动，只改类名与 DOM 嵌套。
- `StatusBar` 组件拆解消亡：`ModelPicker` 原样迁入工具行；压缩相位逻辑（transient/expiry 定时器）迁入 composer 内的状态 pill；busy 三点 + 状态文字迁入工具行右侧。
- 建议弹层（`ComposerSuggestions`/mentions）锚点从 textarea 改为卡片容器，宽度对齐卡片。
- 顶栏连接状态不动。

备选：保留状态栏仅美化（否决：两条横带的注意力跳转问题不解决）；把模型面板改成卡片内 popover（否决：Modal 流程成熟且规范已覆盖，入口迁移即可）。

### D4：遥测 hover-expand 用 CSS 可达方案，不用 JS 定时器

工具行右侧放一个紧凑指示（如 `↑1.2k ↓340`），`hover`/`focus-within` 时展开完整详情（含成本与缓存读）。用纯 CSS 过渡（opacity/max-width）+ `tabIndex=0` 保证键盘可达；详情本身保持 `title` 兜底。Ctx pill 保留在工具行（它是"要不要手动压缩"的决策依据，属于准瞬态信息），>90% 强调色逻辑不变。

### D5：busy 环境特效 = 卡片顶边流动渐变

卡片 `::before` 一条 2px 高的 sakura→tianyi 渐变条，`background-position` 循环流动（仅 busy 时显示）。选中该方案因为：只动 `background-position`（不触发 layout）、语义上是"卡片在工作"的环境提示、降级简单。`prefers-reduced-motion` 媒体查询中该动画替换为静态渐变条（状态不丢失，符合既有逐项降级模式）。停止按钮保持现有描边样式与可见性逻辑。

### D6：触屏 44px 用既有媒体查询模式补齐

`@media (hover: none)` 块中给输入卡片按钮补 `min-width/min-height: 44px`（与 chrome 域同模式），桌面端维持 40px 紧凑密度。

## Risks / Trade-offs

- [负 margin 突破列宽曾被用于"工作列"方案，实机验证发现：视觉上工具卡突出于气泡两侧不整齐（评审否决该方案）；且负 margin 子元素会被 `.chat-row` 的 `content-visibility: auto` 绘制裁剪裁掉（row 边框盒即裁剪边界），工具卡只剩残影] → 最终方案取消工作列突破，工具卡与消息列同宽，两个问题是同一处改动同时消除。
- [助手气泡放宽到 100% 后，长短文本混排时视觉节奏变化] → 气泡仍保留左侧对齐与圆角形态，仅宽度上限变化；实机截图回归。
- [遥测 hover-expand 在触屏无悬停] → 触屏下指示仍可聚焦（点击），且 `title` 兜底；遥测属低优先级信息，触屏收起是可接受的取舍。
- [StatusBar 拆解涉及压缩相位定时器逻辑搬迁，可能引入回归] → 逻辑原样剪切到新挂载点，不动判定函数；现有 composer/status 行为测试保持绿色。
- [浮动卡片 + 阴影在消息贴底时与最后一条消息的视觉间距变小] → 卡片上方保留 padding，必要时给消息列底部加安全间距。

## Migration Plan

纯前端样式/结构变更，无数据迁移。按 tasks.md 顺序：先加 token 与对拍（可独立验证），再改宽度类名，最后做卡片重构。任一阶段出问题可单独回滚该阶段 commit。

## Open Questions

- 宽屏档（≥1680px）下侧栏是否也值得加宽或双列展示会话——留待实机看效果后决定，不影响本变更的 spec 与任务。
