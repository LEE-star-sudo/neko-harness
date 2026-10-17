# Design

## Context

见 proposal 的 Why。现状（已核对代码与 1.3.0 已装类型）：

- `createNekoRuntime` 调用 `Harness.open` 时不传 `settings`，压缩、重试、进度全部取 pi-durable 默认值（`DEFAULT_COMPACTION_POLICY`：`reserveTokens 16384`、`keepRecentTokens 20000`、`backgroundTokens 32768`）。阻塞阈值为 `contextWindow - reserveTokens`，且设置是全局的：已装的 1.3.0 没有 `compaction.modelOverrides`，也不支持以函数提供 `settings`（二者只在 reference 主干的 Unreleased）。
- 当前模型窗口：`deepseek-flash` 与 `deepseek-v4-pro` 均为 1,000,000。`providers` 选项允许嵌入方加入其他窗口的模型，但 CLI/网关没有暴露。
- 配置文件 `neko.config.json` 由 `core/config.ts` 解析、校验、合并，网关 `startGateway` 读取后把需要的字段传给 `createNekoRuntime`（`webSearch.provider` 即此路径）。
- 前端上下文占用来自 `projection.contextTokens`：最近一次成功助手消息的 usage，压缩之后重新计起；展示逻辑按 entry 种类分派，工具结果 entry（`pi.tool-result`）合入工具卡片。
- pi-durable 的 write submission 可带 `EntryDraft.edits`（`omit`/`replace` 某个可见条目对模型上下文的贡献），不改写条目；带 `edits` 的写入不是纯展示写入，忙碌时等到下一个边界（同 steer）才放置。`HookApi` 不能提交，hook 只能观察或改单次请求。

## Goals / Non-Goals

**Goals:**

- 压缩触发条件与工具结果裁剪可由 `neko.config.json` 的 `context` 与 UI 保存的设置配置，两者都未设置时行为与现状一致；UI 修改无需重启即生效。
- 裁剪只作用于模型上下文，前端展示、导出、标题、用量不变，重启后一致，重复触发幂等。

**Non-Goals:**

- 不做 per-model 阈值（等升级到含 `modelOverrides` 的 pi-durable 后另开变更）、不做移动端设置、不改默认值。
- 不裁剪 assistant 文本、用户输入或图片；不做摘要式替换（占位只含省略说明与原体积）。
- 不热更新配置文件（不监听文件）；只有 UI 保存的设置即时生效。

## Decisions

### D1. 配置形态与位置

`neko.config.json` 增加 `context: { compaction?, pruning? }`，在 `core/config.ts` 校验并随 `mergeNekoConfig` 合并（字段级合并，沿用 `skills`/`webSearch` 写法）。`createNekoRuntime` 新增 `context` 选项承接，网关从 `fileConfig.context` 透传。未知字段与越界值抛带文件名与字段的错误（与现有 `validate` 一致）。备选：环境变量——否，与现有配置惯例不符且难以表达嵌套结构。

### D2. 压缩：百分比换算为 `reserveTokens`，以 getter 提供

`triggerPercent` 对用户更直观（窗口不同也有意义），换算为 `reserveTokens = window − floor(window × p / 100)`，窗口取运行时已注册模型的**最小** `contextWindow`（目前两者同为 1M，等价于单窗口）。理由：1.3.0 的 `settings` 全局且同步，没有按模型选择入口；取最小值保证较小窗口的模型不会晚于阈值触发，代价是大窗口模型会略早压缩。`keepRecentTokens`/`enabled` 直接映射到 `settings.compaction`。`settings` 在 1.3.0 里“每次使用时读取、不复制，getter 即时生效”，因此传入 `compaction` getter，每次读取当前生效设置（内存缓存，同步）：对应字段未设置（无保存值也无配置值）时不返回该字段，pi-durable 回落自身默认，保证与默认一致。备选：直接暴露 `reserveTokens`——更接近上游但对用户不友好；已记为升级 `modelOverrides` 后可平滑对应到按模型覆盖。

### D3. 生效设置：保存值 > 配置文件 > 内置默认

新增文档 `app.neko.context-settings`（`scope: "conversation"`，挂在 root 会话，`history: "latest"`），形状为各字段可空的 `{ compaction: {...}, pruning: {...} }`，`null` 表示未保存，沿用搜索设置 `app.neko.search-settings` 的做法：runtime 启动时读取并缓存，写入成功后更新缓存，压缩 getter 与裁剪触发器都读缓存。生效值与来源（default/config/saved）由一个纯函数从“保存值、配置值、内置默认”解析，校验规则与配置文件共用一份，保证两条路径一致。恢复默认 = 把对应字段置回 `null`。备选：写回 `neko.config.json`——会覆盖用户手写内容与注释，且多端同步困难，否决。

### D4. 裁剪：宿主侧决策，以持久 edits 落地

在 core 新增裁剪模块，经 `harness.subscribeCommits` 监听会话提交；当出现新的成功 `pi.assistant` 条目且其 usage 占用 ≥ 该会话当前模型窗口的 `triggerPercent`，选出候选后向该会话提交 `{ type: "write", entry: { kind: "app.neko.context-prune", data, edits }, requestId }`。理由：`HookApi` 不能提交，而 write 在忙碌时会等到当前工具轮之后、下一次请求之前放置，正好在大上下文请求之前生效。`requestId` 取 `prune:<触发的助手条目 id>`，同一触发在重启或重复回调下由 pi-durable 的重复提交幂等去重。

候选选择（纯函数，便于单测）：从该会话当前上下文可见的 `pi.tool-result` 条目中，排除最近 `keepRecent` 个、已被先前 prune 条目覆盖者（按 `data.targets` 判定，无需额外状态文档）、以及文本体积 < `minChars` 者，其余整批 `replace`。批量一次性变更前缀，减少对提供方前缀缓存的破坏次数；这也是只在超过阈值后才触发的原因。

缓存口径（核对自 Anthropic context editing 的 `trigger` 默认 100k input tokens、`keep` 默认 3 个工具调用、`clear_at_least` 用于保证每次清理值得一次缓存重写；DeepSeek 前缀缓存只在从第 0 个 token 起完全一致处命中）：edit 会使其后全部内容未命中缓存，而最早的候选必然靠近上下文前部，所以单次裁剪的代价约等于重读整个上下文。因此新增 `minSavePercent`（默认 5，等价于 `clear_at_least`）：计划预计释放的 token 数 ÷ 窗口 token 数 ≥ 该比例才写入；token 数按 DeepSeek「Token 用量计算」文档的换算估算（英文字符约 0.3、中文字符约 0.6），单个工具结果拿不到精确值，只用于判断批量大小，否则等待更多结果滑出保留范围后合并为一批。裁剪的主要收益是推迟压缩与保护窗口余量，而不是省钱，所以宁可少裁、大批裁。未实现 `exclude_tools`。替换消息保留原 `toolCallId`/`toolName`/`isError`，内容为一行占位（说明已省略、原字符数、可重新执行工具），丢弃 `details` 中的大体积字段，以保持调用/结果配对合法。`edit`、`write` 等小结果天然被 `minChars` 排除。

备选一：`beforeRequest` hook 每次请求临时替换消息——实现更简单、无写入竞态，但不持久、不可见于压缩源、依赖每次重算的确定性，且与用户确认的 edits 方案不符，否决。备选二：直接删除历史——违背不改写历史的约束。

### D5. 展示与统计隔离

`app.neko.context-prune` 条目作为非 `pi.*` 的应用条目：投影对未知种类跳过（实现时核对 `projection`、导出、移动端投影、会话元数据中的“最后消息时间”、`touchConversation`、输入历史均不受影响），不进入聊天项；不计入标题生成。`contextTokens` 仍取最近成功回答的 usage，裁剪后在下一次回答才下降，属预期。

### D6. 作用范围

对 runtime 内所有会话（含子 agent 会话）按各自当前模型窗口应用同一份配置；子 agent 会话短小，通常达不到阈值。设置为服务器级，不分工作区或会话。

### D7. 网关服务与协议版本

仿 `NekoSearchSettings`：新增合约 `neko.context-settings`，状态 `{ revision, effective, sources }`（`revision` 单调，客户端据此去重），方法 `set(patch)`（字段 `null` 清除已保存值）与 `reset()`；服务端经 `serialize` 串行化，先校验后持久化，成功才更新状态并广播，失败不发布。因为新增了服务，`APPLICATION_PROTOCOL` 从 5 递增为 6，并同步测试与 `AGENTS.md` 里的数字。备选：把设置塞进已有服务——会混淆职责并让旧客户端静默忽略字段，否决。

### D8. UI 形态

Web：设置区新增独立栏目「上下文」（`/settings/context`，侧栏菜单项），不再与密钥页混排。页面由触发位置预览条与压缩、工具结果裁剪两张卡片组成：开关用 `role="switch"`，数值项全部用一键选择的预设芯片（`fieldset`+`aria-pressed`，含“默认”清除已保存值；配置文件里的非预设值显示为“自定义”档位），因此没有任何文本输入、也不需要前端校验。选择即保存；保存不互斥（计数而非锁），每次点击按顺序发送，网关侧 `serialize` 保证顺序，避免快速连点被丢弃。状态订阅沿用 revision 单调保护。预设档位：压缩触发 30–80%、保留近期 10k/20k/40k/80k、裁剪触发 20/30/35/45/55%、保留最近结果 5/10/20/40、最小结果长度 2k/4k/8k/16k。

TUI：`/context` 面板沿用统一选择面板；因其没有文本输入控件，数值项用预设档位（压缩触发 Default/30/40/50/60/70/80，裁剪触发 20/30/35/45/55，保留近期结果 5/10/20/40，最小结果字符 2000/4000/8000/16000，保留近期 token 10k/20k/40k/80k）加 Default，开关为 On/Off；预设之外的值（来自配置文件或 Web）原样显示并标为 Custom。移动端协议不含设置类服务，本次不做。

## Risks / Trade-offs

- [裁剪使前缀缓存失效，反而增加成本] → 仅超阈值批量一次裁剪、默认关闭、`triggerPercent` 默认 35 低于常见压缩阈值；文档说明取舍。
- [模型因占位丢失信息而重复执行工具] → 占位明确说明可重跑；`keepRecent` 保护近期；用户可调小 `minChars` 范围外的结果。
- [write 与运行竞态，edits 目标条目已被压缩切掉] → 目标取自当前上下文可见条目；过期目标由 pi-durable 在放置时判定，失败按报告通道记录并在下次触发重试（spec 已约束）。
- [最小窗口口径使大窗口模型早压缩] → 当前两模型相同；文档注明，待 `modelOverrides` 后改为按模型。
- [未知条目种类影响某前端投影] → 任务中逐一核对并加用例（TUI、Web、移动、导出、会话元数据）。
- [协议版本递增使旧进程/旧客户端被拒] → 与搜索设置同样的既有策略：明确提示更新后重启，测试覆盖。
- [TUI 预设档位无法表达任意值] → 显示 Custom 并允许在 Web 或配置文件设置任意值。

## Migration Plan

无数据迁移：新增条目仅在开启裁剪后出现，旧会话照常。回滚：移除配置项并在 UI 恢复默认即可停止新裁剪；回退到旧版本网关时未知的 `app.neko.context-settings` 文档应被忽略（任务中验证）；已写入的 prune 条目对已裁剪结果继续有效，需恢复完整上下文时可 fork 到裁剪前条目。随版本发布前更新 README 与 `AGENTS.md`。

## Open Questions

- `triggerPercent` 默认值 35 与 `keepRecent`/`minChars` 默认值是否合适，需在实际长会话中度量后微调；不影响规格结构。
