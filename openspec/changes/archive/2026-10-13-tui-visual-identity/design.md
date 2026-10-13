# Design

## Context

TUI 主题现状(`packages/tui/src/theme.ts`):16 个语义槽位、明暗双主题、`theme` 委托对象支持运行时切换、SGR 无色属性分离,骨架可用。暗色主题为通用 Tokyo Night,浅色主题松散引用 Web 品牌色。Web 端(`packages/web/src/client/styles.css`)已有完整的 sakura/tianyi/ink OKLCH 色阶(50–900),是本设计的唯一色板来源。

已核实的 pi-tui 1.2.0(已安装版)能力:`Loader`(frames/intervalMs,spinner 与 message 双色彩槽)、`MarkdownTheme.highlightCode` 钩子与 `codeBlockIndent`、`oklabToOkhslLightness` 对比度工具。reference 中 pi coding-agent 的语法高亮方案为 highlight.js(core + 21 个常用语言 eagerly,其余后台懒加载,hljs scope 前缀映射到主题色)。

约束(AGENTS.md):上游 pi 依赖只升版本不裹代码;新增依赖走显式变更(即本变更);相对导入带 `.ts` 扩展;终端显示语言为英语,用户内容保留原文。

## Goals / Non-Goals

**Goals:**

- 明暗双主题统一从 sakura/tianyi/ink 色阶派生,TUI 与 Web 共享品牌基因,终端中可辨识。
- 语义槽位 16 → 33,覆盖边框、三级通知、diff、工具输出与语法高亮,组件只依赖槽位。
- Markdown 代码块语法高亮(highlight.js),未知语言回退平涂。
- 统一排版节奏(间距/内边距/缩进)与状态字形表。
- 忙碌 Loader 动画行、三级通知、空会话品牌欢迎屏。

**Non-Goals:**

- 用户自定义主题文件/主题市场(pi 的 JSON theme schema 不引入);`--theme light|dark|auto` 与自动检测机制不变。
- Web UI、gateway、core 的任何改动;对外协议不变。
- footer 信息架构(展示哪些数据)不变,只重排层级与配色。
- 不引入 pi 的 scrollbar/search/bash-mode/thinking-level 边框等 neko 无对应功能的 token。

## Decisions

### D1 色板:一套色阶,两个切片

暗色 "sakura-night" 与浅色 "sakura-day" 均从 Web 的 sakura/tianyi/ink 色阶取值,不再使用 Tokyo Night。语义色向品牌色相靠拢:error 取樱花家族的红粉而非纯红,warning 取蜜桃琥珀,ok 取低饱和抹茶绿。替代方案(保留 Tokyo Night 底仅换 accent)被否决:品牌优先是本次既定方向,半截方案辨识度不足。

**暗色 sakura-night**(假定深底终端;表面色需在常见深底上可辨):

| 槽位 | hex | 来源 |
|---|---|---|
| accent | `#FFB7C5` | sakura-300 |
| model | `#66CCFF` | tianyi-300 |
| muted | `#9E95A0` | ink-400 |
| dim | `#7A717C` | ink-500 |
| thinking | `#93A1B5` | ink 系冷灰(斜体) |
| error | `#FF8FA3` | sakura 家族红粉 |
| warning | `#FFC79B` | 蜜桃琥珀 |
| ok | `#9DCB9A` | 抹茶绿 |
| userText | `#F7F4F8` | ink-50 |
| userBg | `#004778` | tianyi-900 |
| selection | bg `#523349` + fg `#FFFFFF` bold | sakura-900 向 ink-900 调和 |
| panel | `#38313C` | ink-900 微调提亮 |
| border | `#6A5F6C` | ink-600 |
| borderMuted | `#554857` | ink-700 |
| toolTitle | `#FFD1DA` | sakura-200 |
| toolOutput | `#9E95A0` | = muted |
| toolPendingBg | `#2C2733` | ink-900 微降 |
| toolSuccessBg | `#223128` | 绿调暗底 |
| toolErrorBg | `#382631` | 樱红调暗底 |
| codeFg | `#FFD1DA` | sakura-200 |
| codeBg | `#222A38` | tianyi 调暗底 |
| diffAdded / diffRemoved / diffContext | `#9DCB9A` / `#FF8FA3` / `#7A717C` | = ok / error / dim |

**浅色 sakura-day**(白底):

| 槽位 | hex | 来源 |
|---|---|---|
| accent | `#A74660` | sakura-700 |
| model | `#006EA7` | tianyi-700 |
| muted | `#6A5F6C` | ink-600 |
| dim | `#9E95A0` | ink-400 |
| thinking | `#7E8AA0` | 冷灰(斜体) |
| error | `#8B314A` | sakura-800 |
| warning | `#B45309` | 琥珀深档 |
| ok | `#1A7F37` | 绿深档 |
| userText | `#004778` | tianyi-900 |
| userBg | `#DCF3FF` | tianyi-100 |
| selection | bg `#FFE5EA` + fg `#6E1D36` bold | sakura-100/900 |
| panel | `#F7F4F8` | ink-50 |
| border | `#C9BFCB` | ink-300 |
| borderMuted | `#E2DBE4` | ink-200 |
| toolTitle | `#C26279` | sakura-600 |
| toolOutput | `#554857` | ink-700 |
| toolPendingBg | `#F0EBF1` | ink-100 |
| toolSuccessBg | `#E4F3E8` | 绿调浅底 |
| toolErrorBg | `#FBE7EC` | 樱红调浅底 |
| codeFg | `#8B314A` | sakura-800 |
| codeBg | `#EFF8FE` | tianyi-50(与 Web 代码块底色一致) |
| diffAdded / diffRemoved / diffContext | `#1A7F37` / `#8B314A` / `#9E95A0` | = ok / error / dim |

上表为 v1 值;实现时用 `oklabToOkhslLightness` 校验关键组合(accent on 终端底、userText on userBg、selection 内文字)并在明暗终端各做一次人工验收,允许在小数档内微调(hex 替换,不动槽位结构)。

### D2 槽位体系:33 槽,四组

既有 16 槽全部保留(组件 API `theme.<slot>(text)` 不变),新增 17 槽:

- **层级**:`muted`(dim 之上的一级次文本)
- **语义**:`warning`
- **组件**:`border`、`borderMuted`(编辑器边框从直接引用 accent/dim 改为引用边框槽)、`toolOutput`
- **diff**:`diffAdded`、`diffRemoved`、`diffContext`
- **syntax ×9**:`syntaxComment`(暗/浅均带斜体)、`syntaxKeyword`、`syntaxFunction`、`syntaxVariable`、`syntaxString`、`syntaxNumber`、`syntaxType`、`syntaxOperator`、`syntaxPunctuation`

**syntax 配色**(暗色 "樱花夜景" / 浅色同色相加深档;实现时与 Web 端 styles.css 的 hljs class→色映射对齐——同一 scope 在两端同色相:keyword/title=sakura、string/number/type=tianyi、comment/variable=ink,Web 浅色映射已实测 WCAG AA):

| 槽位 | 暗 | 浅 |
|---|---|---|
| syntaxComment | `#7A717C` italic | `#6A5F6C` italic |
| syntaxKeyword | `#FFB7C5` (sakura-300) bold | `#8B314A` (sakura-800) |
| syntaxFunction | `#FFD1DA` (sakura-200) | `#A74660` (sakura-700) |
| syntaxVariable | `#F0EBF1` (ink-100) | `#322B34` (ink-900) |
| syntaxString | `#B4E6FF` (tianyi-200) | `#00598F` (tianyi-800) |
| syntaxNumber | `#66CCFF` (tianyi-300) | `#006EA7` (tianyi-700) |
| syntaxType | `#66CCFF` (tianyi-300) | `#006EA7` (tianyi-700) |
| syntaxOperator | `#C9BFCB` (ink-300) | `#554857` (ink-700) |
| syntaxPunctuation | `#9E95A0` (ink-400) | `#7A717C` (ink-500) |

不采用 pi 全量 ~50 token:scrollbar/search/bashMode/thinking* 等 neko 无对应功能,引入即死槽。

### D3 theme.ts 拆分为 theme/ 目录

```
packages/tui/src/theme/
  palette.ts    sakura/tianyi/ink 色阶常量 + D1/D2 两套主题表
  slots.ts      SLOT_NAMES、createTheme、明暗主题、theme 委托、style SGR 助手
  markdown.ts   getMarkdownTheme/getEditorTheme/getSelectListTheme + highlightCode 接线
  syntax.ts     hljs 注册、scope→槽位映射、全语言懒加载
  index.ts      re-export 上述公共面
```

原 `theme.ts` 删除,各组件 import 由 `"../theme.ts"` 改为 `"../theme/index.ts"`(一次性机械替换)。不留 facade:仓库约定显式相对导入,facade 只会留下第二个真相入口。

### D4 语法高亮:highlight.js + scope 前缀映射

新增 `highlight.js` 精确锁版本依赖。`theme/syntax.ts`:

- `highlight.js/lib/core` + 24 个 eager 语言:pi 的 21 个(python/java/go/javascript/json/cpp/typescript/php/ruby/c/csharp/nix/bash/rust/scala/kotlin/swift/dart/groovy/perl/lua)外加 diff/markdown/yaml(diff 直接利用 diffAdded/diffRemoved 槽位,与 Web 注册表对齐);
- 首帧后 `setImmediate` 动态导入 `highlight.js/lib/index.js` 注册其余语言,失败容忍(回退 eager 子集);
- hljs 输出为 `<span class="hljs-*">` HTML,解析 scope 并按 Web styles.css 的 class 分组映射到 9 个 syntax 槽位(`comment`/`quote`→comment;`keyword`/`selector-tag`/`literal`/`tag`/`name`→keyword;`title`/`section`/`attr`→function;`string`/`doctag`/`regexp`→string;`number`/`symbol`/`bullet`/`link`→number;`built_in`/`type`/`attribute`/`selector-class`/`selector-id`/`meta`→type;`variable`/`template-variable`/`params`/`subst`→variable;`operator`→operator;`punctuation`→punctuation;`addition`/`deletion`→diffAdded/diffRemoved;未映射→variable 档);
- 版本固定为 11.12.0(与 `@neko-harness/web` 既有依赖一致,不引入版本分叉;pi 用 10.7.3 仅作方案参考);
- 无语言标识或 hljs 不识别 → codeFg 平涂,不报错;
- 经 `getMarkdownTheme().highlightCode` 挂载,assistant/user/skill 详情全部 Markdown 渲染一次接入;`getMarkdownTheme(highlightWidth?)` 接受宽度闭包,`AssistantMessageComponent` 在 render 时记录宽度,使代码块底色铺满 Markdown 内容宽度(与工具卡/用户气泡的整幅底色一致),缺省退化为块内最宽行矩形。

替代方案:cli-highlight(pi 早期注释提及,实际已迁 highlight.js)API 与主题自由度更差;自写正则高亮维护成本不可控。

### D5 排版节奏

- 转录中每个顶层条目(user/assistant/tool/system)前统一 `Spacer(1)`,首条除外(现状只有 user/system 加,assistant 紧跟工具卡);
- 工具卡色块内边距单一来源化:原 `Box(0,0)` + 内部 `Text(paddingX=1)` 的双重表达改为 `Box(1,0)` + `Text(paddingX=0)`(实现时发现左缘 1 格原本由 Text padding 提供,视觉不变,语义归位),与 assistant 正文(paddingX=1)左缘保持对齐;
- thinking 展开态与折叠态同缩进,以颜色+斜体区分层级,不再额外位移;
- 上述规则集中在 `tui.ts` 的 `#appendItem`,不散落到组件。

### D6 状态字形表(统一符号语言)

| 含义 | 字形 | 色槽 |
|---|---|---|
| 工具 pending | `…` | dim |
| 工具 running | braille `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` | accent |
| 工具成功 | `✓` | ok |
| 工具失败 | `✗` | error(替掉与 `✓` 不配对的 ASCII `x`) |
| 工具图标 | `⚡` | toolTitle |
| 技能调用 | `✦` | toolTitle |
| thinking 折叠 | `✧ Thinking… (click to expand)` | thinking |
| picker 选中 | `❯` 前缀 + selection 底 | selection(明暗下均不依赖纯颜色,符合既有语言一致性需求) |
| 用户气泡左缘 | `▍` | accent |
| 通知 信息/警告/错误 | `i` / `!` / `✗` | muted / warning / error |

running spinner 由应用级 120ms ticker 驱动:仅当存在运行中工具卡时启用,推进帧计数并触发对应卡片 rebuild;无运行工具时无定时器。忙碌行 Loader 自带 interval,不经过该 ticker。

### D7 忙碌行:独立 Loader 行,不进 footer

在 transcript 与编辑器之间新增一行布局(maxSize 1,仅忙碌时可见):pi-tui `Loader`(accent spinner + muted 状态文字,状态文案沿用现有 busy/compaction 文本)。替代方案(footer 内嵌 spinner)被否决:`StatusFooter` 无 TUI 句柄,且 footer 已有信息密度问题,动画放独立行层级更干净。编辑器边框语义随之改为:空闲 `borderMuted`,忙碌 `accent`(不再用 dim 这种文本色充当边框)。

### D8 Footer 两行分层

信息不变,层级重排,分隔符 `|` → `·`:

- **主行(身份)**:左 `workspace · model · Think <level>`(model 用 model 槽),右对齐状态词(Ready=ok / busy=accent / compaction 系=warning / failure=error);
- **副行(度量+键位)**:Ctx 百分比(>90% error、>75% warning、否则 dim)+ In/Out/Cache/成本 + 键位提示,整体 dim、键名 muted。

保留现有候选列表逐级退化的窄屏策略,只重排各候选项内部结构。

### D9 用户气泡左缘条

整行色带保留(TUI 惯例),行首加单格 `▍` accent 左缘(底色 userBg 整行贯通,与内容间距由 Markdown/Text 自身的 paddingX=1 提供)。实现:`UserMessageComponent` 覆写 render,内容按宽度 -1 渲染后逐行加前缀。替代方案(右侧对齐气泡)不符合终端全宽滚动惯例,否决。

### D10 空会话欢迎屏

转录为空(无条目且不忙碌)时显示品牌欢迎块,首条消息到达即移除:

```

    |\___/|
    )     (        neko harness
   =\^_^ /=        <model> · Think <level>
     )---(

  Type a message · / commands · @ files · Ctrl+S sessions

```

猫脸用 accent 色,文案 muted,整体左缩进 4 格;模型行随会话配置实时更新。该组件作为 transcript 的首个 child 管理,不占条目 key 空间。


### D12 工具卡单行折叠

所有工具卡默认折叠为单行:图标 + 工具名 + 参数摘要 + 状态字形,有输出时追加弱化 `+N lines` 行数提示;点击展开参数详情与输出原文全文,运行中的流式输出同样在展开后可见。迭代记录:初始为 8 行预览;因 web_search 整页抓取输出噪音大改为单行折叠;中途曾回退 8 行预览,验收确认单行折叠才是目标形态后恢复。展开态的内容呈现为输出原文(结构化渲染如 diff/按类型高亮需要 core 投影提供结构化字段,属后续变更,TUI 不猜行、不按工具名搞特例)。展开状态保留在组件内,sync 更新不重置。

### D11 Picker 与通知

- Picker:标题行 accent 加粗 + ` (N)` 条目计数(muted);搜索提示符 `❯`;组头 dim;选中行 `❯` 前缀 + selection 底(原 `>` 换 `❯`,保持非颜色线索)。
- 通知:`addNotice(text, level)` 由布尔 isError 改为三级(info 默认 / warning / error),调用点按语义迁移(如 "Text-only model…" → warning,网关断开 → error);5s 自动消失行为不变。

## Risks / Trade-offs

- [终端底色不可控,暗色表面色(卡片/气泡底)与终端底对比无保证] → 表面色取 ink-900 系与常见深底(#1a1b26–#282a36)拉开;工具卡同时携带状态色文字,底色仅作强化;在 2–3 种主流终端主题下人工验收。
- [256 色终端下 hex 被量化,粉蓝可能偏移] → `styleText` 已按 `getTerminalColorMode()` 降级;关键组合在 256 色模式人工验收,必要时为 256 模式提供微调表(后续变更,本次不预留机制)。
- [highlight.js 增加包体与启动开销] → 仅 core+21 语言进首包,其余首帧后懒加载;`bun run build` 后检查 cli bundle 体积,异常膨胀则裁剪 eager 语言表。
- [running spinner 的 120ms ticker 增加重绘频率] → 仅运行中工具存在时启用,且只 rebuild 运行中卡片;忙碌行 Loader 自管理,两者不叠加。
- [欢迎屏在极矮窗口(高<10 已走 too-small 分支)与图片转录并存时的布局] → 欢迎块是普通 transcript child,由既有 ScrollView 处理;usableSize 以下不渲染,无需特判。
- [视觉全量变更,既有测试若含 ANSI 快照将大面积失败] → tasks 中先更新测试基线策略(结构断言优先于快照),再改组件。

## Migration Plan

纯前端渲染变更,无数据/协议迁移:主题文件拆分与 import 路径机械替换先行,槽位新增保持旧名不变,组件逐个迁移;任何一步回退均为代码级 revert。`--theme` 与自动检测行为不变,用户无感知迁移成本。

## Open Questions

- 各 hex 的最终微调档(验收后定,不影响槽位结构与任务拆分)。
- eager 语言表是否按 neko 用户画像裁剪(默认沿用 pi 的 21 个,体积验收时再定)。
