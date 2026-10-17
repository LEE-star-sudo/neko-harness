# Design

## Context

见 proposal 的 Why。现状（已核对代码与已装 1.3.0 类型）：

- pi-durable 的 `Conversation.submit` 忙时把输入放入 `pi.inbox`：`steer` 在当前工具轮后放置，`followUp`（缺省）在回答结束后放置；`InboxItem` 带提交 `id`、`mode`、`content` 与 `entry`（neko 的 `app.neko.input` 数据随它原子持久化）。`harness.abortSubmission(id, ctx, conversationId?)` 返回 `aborted | already_placed | settled | not_found`；`conversation.abort` 撤回全部排队输入。
- core 的 `NekoSubmitOptions.whenBusy` 已直通，gateway `NekoChat.submit` 已带 `whenBusy`（`contract.ts`、`session-host.ts`），移动适配器已把 `mode:"steer"` 映射过去。TUI 用 Enter→steer、Alt+Enter→followUp。
- Web `composer.tsx` 在 `props.busy` 时禁用发送；`gateway.ts` 的 `submit` 从不传 `whenBusy`。
- `projectChatView` 读取 `view.docs["pi.live"]` 等文档同步投影，`pi.inbox` 同在视图 docs 中，但没有被投影。`ChatViewSchema` 只有 `busy` 布尔。
- 系统输入也走同一 inbox：后台任务回报（`InputData.jobReport`，followUp）与子 agent 内部输入（`subagentRoundId`）；用户输入没有这两个标记。
- 提示词资源快照按 `requestId` 暂存（`resourceSnapshots.stage/discard`），输入只有被放入 transcript 后才激活；被撤回的输入已有释放路径（prompt-context 规格「排队或撤回不提前激活」）。
- 后台任务接口已有「可选扩展、不提升应用协议、旧网关降级」的先例（`ChatView.jobs` 缺省表示旧网关）。移动端已有 `steer` 开关与排队回执。

## Goals / Non-Goals

**Goals:**

- 排队状态以电脑端 `pi.inbox` 为唯一真相，所有前端读同一投影，不在客户端缓存或延后发送。
- 撤回结果以服务端裁决为准，竞争时（刚被放入）安全降级。
- 视图广播有界：预览截断，不含图片数据。

**Non-Goals:**

- 不改 pi-durable 设置（`steeringMode`/`followUpMode`）与排队顺序，不做编辑、重排、跨会话迁移。
- 不恢复被撤回消息的图片。
- 各端提交行为统一为忙时排队，不再有 TUI 的默认引导差异；各端「引导」只作用于已排队的消息。

## Decisions

### D1. 排队列表由 core 投影，不新增存储

`projectChatView` 读取 `view.docs["pi.inbox"]`，过滤 `mode !== "write"` 且 `entry.kind === NekoInput.kind` 且数据无 `jobReport`、无 `subagentRoundId` 的项，输出 `queued: { id, mode: "steer" | "followUp", preview, images, skill? }[]`（顺序即受理顺序）。预览取输入文字（`data.prompt`，技能输入用展示文字），按字符截断到固定上限（实现时放入常量，约 300），不含图片字节。`queued` 在 core 投影里始终输出（空数组表示支持且为空）。备选：另建 `app.neko` 文档同步排队——否，会与 `pi.inbox` 双写并产生不一致。

### D2. 放入时无空档：由同一视图快照保证

排队项消失与 transcript 出现同属一次 commit 的同一 `ConversationView`，投影同步读取 `docs` 与 `entries`，不会同时出现或同时缺失。前端不再对排队项做本地乐观插入，只渲染 `queued`；发送成功后到视图更新之间允许短暂空档，由发送按钮的「处理中」状态覆盖。

### D3. 撤回走 `NekoSession.withdraw`

`withdraw(submissionId): Promise<{ result: "withdrawn" | "placed" | "settled" | "unknown"; text?: string; images?: number }>`，内部先确认该提交若在 inbox 中则必须是本会话的用户输入，再调用 `harness.abortSubmission`，映射结果（`aborted→withdrawn`、`already_placed→placed`、`settled→settled`、`not_found→unknown`）。撤回成功时返回完整原文（技能输入还原为 `/skill:<name> <args>`，默认图片提示不计入）与图片数，供前端取回草稿——预览被截断，不能用来还原。成功后释放该提交 `requestId` 对应的资源快照暂存，并 `metadata.reconcile`（避免首条输入预览、最近消息时间被未进入 transcript 的输入影响）。不匹配本会话或系统输入的 id 一律返回 `unknown`，不泄露存在性。备选：复用 `abort()`——否，会中止运行。

### D3a. 引导走 `NekoSession.steer`：撤回再以 steer 重新受理

pi-durable 没有修改排队项模式的接口，因此 `steer(submissionId): Promise<{ result: "steered" | "withdrawn" | "placed" | "settled" | "unknown"; id?: number; text?: string; images?: number }>` 在 core 内完成「撤回 + 重新受理」：读取 inbox 项（必须是本会话用户输入；已是 steer 则直接返回 `steered`），`harness.abortSubmission` 成功后用同一 `content`（含图片与技能展开文字）与 `entry`（`app.neko.input` 数据）以 `whenBusy: "steer"` 重新 `submit`，新 `requestId` 为 `steer:<原 requestId>`（原值缺失时随机，保证重试幂等），并把资源快照暂存从旧 requestId 迁到新 requestId（`resourceSnapshots.move`），使技能快照只在放入后激活的语义不变。返回新的提交 `id`。竞争：`abortSubmission` 返回 `already_placed/settled/not_found` 时不重新受理并映射为 `placed/settled/unknown`；重新受理失败时消息不静默丢失——按撤回处理，返回 `withdrawn` 与原文供前端取回草稿。代价：被引导的项在同类中排到后面（steer 本来就先于 followUp 放置），提交 `id` 改变，前端以视图列表为准。备选：直接以 `whenBusy: "steer"` 提交并保持不可改——否，用户不再在提交前选择投递方式。

### D4. Gateway 契约：可选字段 + 新方法，不升协议

`ChatViewSchema` 增加可选 `queued`（缺省 = 旧网关）；`NekoChat` ready 变体增加 `steer({ id })` 与 `withdraw({ id })`。沿用后台任务先例：不提升 `APPLICATION_PROTOCOL`（保持 6）。新客户端用 `view.queued !== undefined` 判断能力，并在调用前做同一判断；旧网关上调用新方法的失败视为不支持。已核对后台任务加入时的做法（提交 50d56d7）：契约方法与可选视图字段直接加入，`NekoChat` 的 contract `version` 与应用协议均未提升，客户端用 `jobsClient` 做能力探测；排队沿用同一模式，在 `client-session.ts` 增加 `queueClient(chat)`（`supported`/`list`/`steer`/`withdraw`）。`submit` 的 `whenBusy` 保持可用（后台任务回报等仍用），前端不再从输入区传 `steer`。

### D4a. 移动 API

`MobileChatStatusSchema` 增加可选 `queued`，`chat.steer`、`chat.withdraw` 作为新方法；`chat.submit` 回执保持 `queued` 布尔，`mode` 参数保持以兼容旧 App。移动适配器在缺少 `view.queued` 时不输出字段。App 以字段是否存在决定显示排队条。

### D5. Web：状态来自视图，操作走既有 actions

`composer.tsx` 去掉 `props.busy` 对发送的拦截（`busy` 仍用于环境态与停止），不再有投递方式开关：忙时发送不传 `whenBusy`，沿用 pi-durable 默认 followUp。排队条为独立组件，从当前会话的 `ChatView.queued` 渲染；排队项上的「引导」调用 `appActions.steer(sessionId, id)`，「撤回」调用 `appActions.withdraw(...)`，按返回值处理：`withdrawn` 取回文字（草稿空则覆盖，否则追加新行），`placed/settled` 提示已发送，`unknown` 提示已不在队列。引导成功后只依赖视图更新标识，不做本地乐观修改。草稿存储沿用 `drafts`，取回通过同一 `update` 路径，保证 requestId 轮换。

### D6. TUI：编辑器上方的可选中排队区

忙时 Enter 只排队：`sendImages` 不再带 `whenBusy`，移除 `whenBusyFor`、`submitFollowUp` 与 Alt+Enter 绑定（**BREAKING**）；忙碌提示改为 `Enter Queue · Esc Stop`。排队区 `QueueRow` 放在编辑器上方的布局槽位（沿用 `layout.ts` 的 busy 行模式，窄窗口截断），最多 2 条（最新的靠近编辑器）加 1 行按键提示，更多项折叠成「N earlier / N newer」。选择不引入新焦点组件：`queueKeyAction`（纯函数，可单测）在 TUI 全局输入监听里、先于 Esc 停止逻辑判定按键——Alt+↑ 选中最新一项，↑/↓ 移动（↓ 越过最新一项离开），Enter 引导，Esc 只撤回选中项，其余按键清除选择后照常交给编辑器。因此选择期间的 Esc 不会触发 `abort()`；不在选择状态时 Esc 仍停止并撤回全部。操作期间忽略按键，视图更新后选择按下标收敛（队列清空即结束选择）。不再提供 `/queue` 面板；不占用 ↑ 键（输入历史）。旧网关（`queued` 缺省）下排队区不显示、Alt+↑ 无作用。

### D7. 移动端：状态条内的排队项

`models.dart` 解析 `queued`，`chat_controller.dart` 增加 `steer(item)` 与 `withdraw(item)`，移除输入区引导开关及发送时的 `steer` 参数（待确认记录里已存的 `steer` 字段保留解析以兼容旧记录，但不再产生）；`chat_page.dart` 在已有紧凑状态条中渲染排队项（「引导」仅对排队项显示）并限高（键盘弹出时限高）。离线/未授权时两个操作禁用，不排队积压请求。

### D8. 与输入历史的边界

排队项不进入输入历史（既有规格已要求）；被撤回的文字回到草稿，等同用户重新键入，之后发送才进入历史。无需改 `input-history`。

## Risks / Trade-offs

- [放入与撤回竞争] → 服务端裁决并返回 `placed`，前端只依据返回值更新草稿，不做乐观删除。
- [视图广播膨胀：大量排队项] → 预览长度上限；实现时再评估是否需要项数上限（例如超过上限折叠为数量），若加上限需同步到规格。
- [Chord 契约新增方法的兼容判定不确定] → 见 D4，实现首个任务先核对并写成测试（旧网关降级场景）。
- [撤回带图片消息时图片丢失] → 提示用户图片未恢复；规格已声明。
- [Web 忙时可发送放大误操作（重复提交）] → 沿用 requestId 与「处理中」锁；引导开关每次发送后复位。
- [各端提交行为曾不一致（TUI steer，其余排队）] → 已统一为忙时排队；TUI 的 Enter=Steer 取消属 **BREAKING**，在帮助与忙碌提示中体现。
- [撤回后 `metadata.reconcile` 对首条输入预览的影响] → 测试覆盖：撤回的首条排队输入不成为会话标题预览或更新最近消息时间。

## Migration Plan

无数据迁移：排队真相在既有 `pi.inbox`。发布顺序无强依赖：新网关 + 旧客户端忽略新字段；新客户端 + 旧网关隐藏排队条与撤回，但 Web 忙时仍可发送（`whenBusy` 早已在契约中）。回滚即移除新字段与入口，不影响已持久化的输入。
