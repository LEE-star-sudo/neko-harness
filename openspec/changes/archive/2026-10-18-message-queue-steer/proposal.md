## Why

运行中继续发消息是高频操作，但各端能力不齐：底层 pi-durable 与 core/gateway 已支持 steer（插队）与 followUp（排队），TUI 与移动端可用，Web 却在忙碌时禁用发送；而且所有前端都看不到已排队但尚未进入 transcript 的消息，也不能撤回单条，只有「停止」一把清空并中止运行。用户发出的排队消息处于不可见、不可控的状态，容易重复发送或不敢发送。

## What Changes

- **Web**：忙碌时输入框与发送保持可用，发送一律排队（followUp），不在输入区预选投递方式；不改变 `/compact`、图片附件、草稿与 requestId 幂等语义。
- **排队可见**：core 从会话视图的 `pi.inbox` 投影出用户排队输入列表（提交 id、模式、文字预览、图片数、技能标记），经 gateway `ChatView.queued` 同步到所有前端；排队项进入 transcript 后自动消失，不进入输入历史。
- **排队项上的两个操作**：「引导」把一条排队消息改为插入当前工具轮之后（steer），「撤回」把它取回草稿。core 新增 `NekoSession.steer(submissionId)`（撤回原排队项并以相同内容、图片与技能快照改为 steer 重新受理）与 `NekoSession.withdraw(submissionId)`（基于 `harness.abortSubmission`）；gateway 新增 `chat.steer`、`chat.withdraw`；结果区分 `steered / withdrawn / placed / settled / unknown`，已放入上下文的项两者都不可用。「停止」语义不变（撤回全部排队项并中止当前运行）。
- **TUI**：与 Web / Mobile 统一，忙时 Enter 只排队（**BREAKING**：取消 Enter=Steer 与 Alt+Enter=Queue）；编辑器上方的排队区（最新的靠近编辑器）可直接选中：Alt+↑ 选中、↑/↓ 移动，Enter 把 Queued 项改为 Steer，Esc 只撤回该条并把文字取回编辑器（不停止运行）；不再提供 `/queue` 面板。
- **Mobile**：移除输入区的「引导」开关；移动 API 的会话状态新增 `queued` 列表与 `chat.steer`、`chat.withdraw` 方法；App 在输入区上方的排队条上提供引导与撤回。`chat.submit` 的 `mode` 参数保持可用以兼容，App 不再发送。
- **兼容**：均为可选扩展，不提升应用协议版本；新客户端连接缺少该能力的旧网关时隐藏排队列表、引导与撤回入口，仍可发送；旧客户端忽略新增字段。
- 补充 TUI、gateway、Web 的忙时排队、引导与撤回测试。

不在范围：修改 pi-durable 的 `steeringMode`/`followUpMode`（保持每轮取一条的默认）、撤回后恢复图片附件（只取回文字）、排队项编辑与重排、排队项跨会话迁移、把已引导的项改回排队。

## Capabilities

### New Capabilities

- `message-queue`：运行中提交默认排队、排队项改为引导与单条撤回、排队输入的可观察投影及其与停止的关系（core 与会话视图层的行为契约）。

### Modified Capabilities

- `session-gateway`：会话视图提供排队输入列表与撤回接口，含向后兼容要求。
- `web-ui`：忙碌时发送、排队条上的引导与撤回。
- `terminal-ui`：忙时 Enter 排队（修改「消息插话」与忙碌快捷键要求），排队区的直接选择、引导与撤回。
- `mobile-api`：会话状态中的排队列表与引导、撤回方法。
- `mobile-ui`：排队条上的引导与撤回，移除输入区引导开关。

## Impact

- 代码：
  - `packages/core/src/projection.ts`（读取 `pi.inbox` 投影 `queued`）、`runtime.ts`（`NekoSession.steer/withdraw`，并迁移/释放对应的资源快照暂存）。
  - `packages/gateway/src/contract.ts`（`ChatViewSchema.queued`、`NekoChat.steer/withdraw`）、`session-host.ts`、`mobile/protocol.ts`、`mobile/projection.ts`、`mobile/adapter.ts`。
  - `packages/web/src/client/components/composer.tsx`、`lib/gateway.ts`、排队条组件。
  - `packages/tui/src/tui.ts`、`queue-ui.ts`（可选中的排队区与 `queueKeyAction`）、`help-ui.ts`、`labels.ts`。
  - `apps/mobile/lib/core/api/models.dart`、`features/chat/chat_controller.dart`、`chat_page.dart`。
- 依赖：无新增。
- 测试：core 投影与撤回、gateway 契约与旧网关降级、Web 组件、TUI、移动端 adapter 与 Flutter widget test。
- Spec：新增 `message-queue`；更新 `session-gateway`、`web-ui`、`terminal-ui`、`mobile-api`、`mobile-ui`。
