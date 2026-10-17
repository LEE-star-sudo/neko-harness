# Tasks

## 1. Core：排队投影与撤回

- [x] 1.1 在 `projection.ts` 读取 `view.docs["pi.inbox"]` 并输出 `ChatView.queued`（只含 `steer/followUp` 的用户输入，排除 `write`、`jobReport`、`subagentRoundId`；预览按常量上限截断，含图片数与技能标记）；`packages/core/test` 增加投影测试：忙时两条排队可见且顺序正确、放入后消失且不与 transcript 重复、后台任务回报不出现、超长预览被截断、空闲提交不出现
- [x] 1.2 在 `runtime.ts` 增加 `NekoSession.withdraw(submissionId)`（`harness.abortSubmission` 映射为 `withdrawn/placed/settled/unknown`，校验属于本会话与用户输入，成功后释放资源快照暂存并 `metadata.reconcile`）；测试：撤回成功且当前运行继续、与放入竞争返回 `placed`、跨会话 id 返回 `unknown`、撤回输入不影响标题预览与最近消息时间、`abort()` 仍清空全部排队并中止、重启后排队列表恢复
- [x] 1.3 核对 Chord 契约新增方法与可选字段的版本要求（参照 `jobOutput`/`jobStop` 加入时的做法），把结论写入 design D4；`bun run test` 中相关 core 测试通过

## 2. Gateway：契约与会话宿主

- [x] 2.1 `contract.ts` 为 `ChatViewSchema` 增加可选 `queued`、为 `NekoChat` 增加 `withdraw`，`session-host.ts` 透传 `queued` 并实现 `withdraw`（不提升 `APPLICATION_PROTOCOL`）；`packages/gateway/test` 增加：多客户端同步、撤回竞争、越界拒绝、重连恢复
- [x] 2.2 增加兼容测试：新客户端连接缺少 `queued` 的网关视图时能力判断为不支持且不报错，旧客户端忽略新字段；`bun run test` 中 gateway 测试通过

## 3. Web

- [x] 3.1 `gateway.ts` 的 `submit` 增加 `whenBusy` 参数，`appActions` 增加 `withdraw(id)` 与 `queued` 的读取；单元测试覆盖忙时传 `steer`、缺省与空闲不传
- [x] 3.2 `composer.tsx` 放开忙时发送，增加「引导当前运行」开关（发送后复位、占位文案与按钮反映方式、空闲不显示），保持 `/compact`、附件、requestId 与失败保留语义；测试覆盖忙时排队发送、引导发送、失败保留草稿
- [x] 3.3 新增排队条组件（方式标识、预览、图片数、撤回按钮、键盘与可访问名称，无项不占位，旧网关不显示），撤回按返回值取回文字（空草稿覆盖、非空追加）或提示已发送；测试覆盖撤回、竞争、切换会话隔离；在 375/768/1440/1920 宽度手动核对无横向溢出
- [x] 3.4 `bun run check` 与 `bun run test` 中 web 部分通过

## 4. TUI

- [x] 4.1 新增排队行（Steer/Queued 标注、单行截断、过多折叠为数量），接入 `layout.ts` 槽位；`packages/tui/test` 覆盖显示、窄窗口截断、放入后消失、旧网关不显示
- [x] 4.2 新增 `/queue` 面板（列表、Enter 撤回、取回文字到编辑器，非空则追加新行，已放入提示），更新 `help-ui.ts`；测试覆盖面板撤回、竞争与旧网关提示
- [x] 4.3 补充 TUI 忙时 Enter=steer、Alt+Enter=followUp 的提交参数测试；`bun run check` 与 TUI 测试通过

## 5. Mobile API 与 App

- [x] 5.1 `mobile/protocol.ts` 增加可选 `queued` 与 `chat.withdraw`，`projection.ts`/`adapter.ts` 映射并校验授权与订阅会话；`packages/gateway/test/mobile` 覆盖状态含排队、撤回、竞争、未授权拒绝、旧视图缺字段不输出
- [x] 5.2 `apps/mobile` 解析 `queued`，`chat_controller.dart` 增加 `withdraw`，`chat_page.dart` 在状态条中渲染排队项与撤回（限高、离线禁用、取回草稿）；Flutter widget/controller 测试通过（`flutter test`）

## 7. 修订：先排队，再引导/撤回（取消提交前预选引导）

- [x] 7.1 core：`resourceSnapshots` 增加 `move(id, from, to)`；`NekoSession.steer(submissionId)`（撤回 + 以相同 content/entry 重新受理为 steer，新 requestId `steer:<原>`，迁移快照；已是 steer 为空操作；竞争映射 `placed/settled/unknown`；重新受理失败返回 `withdrawn` 与原文）；测试：steer 后列表模式变化且当前运行不中断、放入顺序与内容（含图片、技能快照）正确、重复引导幂等、与放入竞争、跨会话/系统输入为 `unknown`、重新受理失败不丢失
- [x] 7.2 gateway：`NekoChat.steer`、`queueClient.steer`、移动 `chat.steer`（协议、适配器、fixtures、`docs/mobile-api-v1.md`）；测试：多端同步引导、越界拒绝、旧网关降级、移动端 `chat.steer` 与桌面一致
- [x] 7.3 Web：移除引导开关与 `whenBusy` 透传，发送按钮/占位文案统一为排队；排队条为排队项增加「引导」按钮，处理 `steered/withdrawn/placed/settled/unknown`；更新 `composer-queue` 测试，并在 375/768/1440/1920 宽度浏览器核对无横向溢出
- [x] 7.4 TUI：忙时 Enter 只排队（移除 Alt+Enter、`whenBusyFor`、`/queue`）；排队区 Alt+↑ 选中、↑/↓ 移动、Enter=Steer、Esc=仅撤回选中项（不停止运行）；更新忙碌提示、帮助与测试（含按键映射 `queueKeyAction` 与布局）
- [x] 7.5 Mobile：移除输入区引导开关与发送 `steer` 参数；排队条为排队项增加「引导」；更新 `composer_test`、`chat_page_test`、`queue_tray_test`；`flutter analyze` 与 `flutter test` 通过
- [x] 7.6 更新 `AGENTS.md` 排队小节；运行 `bun run check`、`bun run build`、`bun run test` 与 `openspec validate message-queue-steer --strict`

## 6. 规格与集成核对

- [x] 6.1 端到端核对：用 faux provider 在同一会话经 Web、TUI、移动适配器各排队一条，确认三端看到同一列表，一端撤回后其余端同步消失；运行 `bun run check`、`bun run test`、`bun run build` 与 `openspec validate message-queue-steer`
- [x] 6.2 更新 `AGENTS.md` 中与排队相关的约定（`ChatView.queued` 缺省表示旧网关、`withdraw` 语义），并确认 `mobile-api` 现有「与 Web 相同由电脑持久排队」措辞与实现一致
