# Tasks

以下仅为实施清单，不表示本次提案已开始实现。首版边界及数据契约见 proposal.md 与 design.md；每组随实现提交自己的测试和必要文档。测试使用 faux provider，不使用真实 API key。

## 1. Core Todo 工具与持久状态

- [x] 1.1 在 `packages/core/src/todos.ts` 定义类型、共享限制、rewindable/asOf 会话文档及 `todo` 的 list/replace 严格 schema；补充 `packages/core/test/todos.test.ts`，验证空态、三态、稳定 ID、排序、清空、重复 ID、未知字段及全部长度/数量/UTF-8 字节边界。
- [x] 1.2 实现 `replay: "safe"` 与 `replace` 的调用级原子回执，列表和回执同次 commit；`list` 为纯读取不写回执。以断点测试验证提交前失败不改列表、提交后结果前重开 SQLite 只返回原回执、较新列表不被旧调用覆盖，重放不递增 revision；同轮 `replace` 按模型给出的顺序提交，并固定 sequential 使同轮其余调用串行的行为。
- [x] 1.3 接入 runtime/session 及 core 导出，覆盖跨会话隔离、压缩后 list 与较早分叉点 asOf 继承及父子独立；运行 `bun run test packages/core/test/todos.test.ts` 验证，并在根 README 的工具说明记录模型维护、用户只读和资源上限。

## 2. Core 持久问答与运行生命周期

- [x] 2.1 在 `packages/core/src/user-questions.ts` 定义 ask_user 参数（`question`/`multiple`/`options[{id,label,description,recommended}]`）、回答联合 `{kind:"answer",optionIds?,text?} | {kind:"skip"}`、问题 family 和未决索引；补充 `packages/core/test/user-questions.test.ts`，验证无选项、单选、多选、选项+文字、纯文字，以及空白/重复 ID/重复标签（trim 后）/未知字段、`multiple` 少于 2 个选项、单选多个 `recommended`、无选项带 `multiple`/`recommended`，规范化等价（省略与空值）及精确长度、字节和第 9 个未决问题拒绝边界。
- [x] 2.2 实现安全重放的 ensure + 文档订阅等待，订阅后检查当前值并处理结束/存储失败；测试问题提交与订阅建立之间回答、无客户端等待、断线不取消、失败不吞错、等待结束清理订阅。
- [x] 2.3 实现 session 的读取和 respond 原子首次结算，验证所属会话、版本、答案及 task owner 链存活；并发测试选项/多选/文字/跳过竞争、重复请求返回原决定、错误版本及跨会话拒绝，覆盖单选多个选项、重复/不存在选项、无选项带 optionIds、既无选项又无文字的拒绝，确认 optionIds 按问题选项顺序规范化，且不产生用户输入或 inbox 项。
- [x] 2.4 接入 abort、archive、任务结束对账与启动恢复，区分正常 Harness close 和用户停止；测试停止先于回答、回答先于停止、取消传播前的 owner 中止标记、遗留 pending 对账及分叉不继承可操作问题。
- [x] 2.5 增加 SQLite 重开与进程中断回归，覆盖 intent 后问题创建前、pending、答案已提交但工具结果前、结果已提交四个断点；运行 `bun run test packages/core/test/user-questions.test.ts`，断言已有问题 ID/version 不变、无第二问题、答案不丢失且不因问答重放额外创建运行或重复工具结果；模型请求中断沿原生恢复策略处理。
- [x] 2.6 实现工具结果：`output` 含选中选项标签与 ID、用户文字（标明来源），跳过结果声明“无答案、非同意”并指引模型继续，取消结果说明原因；`structuredOutput` 与 `structuredOutputSchema` 一致，`details` 保存问题、选项标签、`multiple` 与最终结算。在 `projection.ts` 增加 todo/ask_user 参数摘要及 details 展示所需结构，补投影测试并更新根 README 的提问/多选/推荐/跳过/停止/重连说明；验证历史可读且不解析结果文案作为状态来源，并测试同轮多个 `ask_user` 按序呈现、后续工具在结算后才启动，以及排队的 steer/followUp 在问题结算前不进入上下文。

## 3. 工具权限与提示词

- [x] 3.1 在主会话注册两个扩展，并在 `subagents.ts` 的新建、接续及 runtime 启动修复路径中排除两工具，执行端校验角色；补角色测试验证 explore/plan/coder、嵌套调用与重开均不能使用，显式禁用的主会话配置不被覆盖。
- [x] 3.2 在 `prompt/prompt.ts` 的 TOOL_GUIDELINES 增加与实际 schema 一致的两工具规则（`ask_user` 含何时提问/不提问、`multiple`、`recommended`、跳过不等于同意、同轮独立问题连续提出、禁止索取密钥），补 `packages/core/test` 中相关 prompt 测试；验证启用条件、五节顺序、简单问题不强制 Todo、压缩后先 list、不替代审批。
- [x] 3.3 扩展资源快照回归：提问等待期间更改 AGENTS.md/skills，回答后保持原快照，普通新输入 placement 后才刷新；运行本组触及的 prompt、subagent、快照及现有 `tool-approvals.test.ts`，验证未扩大子 agent 权限或破坏审批。

## 4. 桌面网关与共享客户端

- [x] 4.1 在 `contract.ts` 与 core ChatView 增加可选 Todo/问题摘要 schema，并在 NekoChat 接入 questionGet/questionRespond；新增 `packages/gateway/test/user-interactions.test.ts`，验证响应 schema、attachment 归属、失效引用、版本错误与首次结算。
- [x] 4.2 在 `session-host.ts` 共享投影监听两类业务文档，接通首快照、持续更新、等待状态和资源释放；测试仅文档变更时仍刷新、两客户端同步、切换后迟到响应不串会话、detach 不取消问题。
- [x] 4.3 在 `client-session.ts` 增加可探测交互 helper 及导出，缺省字段为不支持；测试旧网关无字段不调用新方法、新网关空列表正常可用、控制错误明确返回，运行 `bun run test packages/gateway/test/user-interactions.test.ts`。
- [x] 4.4 在 `SessionSummarySchema` 增加可选 `awaitingAnswer`，让 `session-metadata.ts` 观察者在 `pi.live` 之外监听问题索引文档提交并在 reconcile 中并入未决数、沿用 `#notify` 推送；测试问题建立/回答/跳过/停止/归档时标记变化、旧会话缺省为空、分叉不继承、`status` 枚举不变及旧客户端忽略该字段。
- [x] 4.5 更新网关相关 API 文档或 README，记录可选字段（含 `awaitingAnswer`）、问题完整读取/回答、回执含义与旧端降级；核对新增成员不改变应用协议版本，文档示例与 schema 一致。

## 5. 移动 API 与协议对拍

- [x] 5.1 在 mobile/protocol.ts 声明 todos/questions capabilities、四个业务方法、两个 changed 通知、chat status 可选摘要及会话列表条目的可选 `awaitingAnswer`，answer 回答联合含 `optionIds`/`text`；同步 `docs/mobile-api-v1.md` 与 `packages/gateway/test/fixtures/mobile-api-v1/`，以现有 protocol/protocol-fixtures 测试验证 API 版本仍为 1。
- [x] 5.2 在 mobile adapter/projection 通过同一会话服务实现读取/回答与 revision 通知，并把会话目录的 `awaitingAnswer` 投影到移动会话列表（仅声明 `questions` 能力时）；补 `packages/gateway/test/mobile/user-interactions.test.ts`，验证授权、旧订阅、会话归属、能力缺失、多端竞争、多选回答及非法组合拒绝、回执丢失重试及 attach 查询期间的变化收敛。
- [x] 5.3 增加最坏多字节/JSON 转义 payload 测试，验证 Todo、单题完整读取和回答响应均满足现有 payload/frame 上限且无静默截断；运行 `bun run test packages/gateway/test/mobile/user-interactions.test.ts packages/gateway/test/mobile/protocol.test.ts packages/gateway/test/mobile/protocol-fixtures.test.ts`。

## 6. Web 待办与问题交互

- [x] 6.1 在聊天顶栏/页面接入只读 Todo 进度和滚动面板，使用共享 helper；新增 Web 组件测试，验证三态/顺序/完整内容、空列表、旧网关隐藏及离线提示。
- [x] 6.2 新增独立问题卡片（非模态、限高可滚动、可折叠为提示条）：单选 radio/多选 checkbox 语义分组、推荐标记仅提示不预选、始终可见的文字输入、显式“提交回答”与独立“跳过”，问题与选项按纯文本渲染并标注“助手提问”；完整题目按需读取，答案草稿按会话/问题/version 隔离；组件测试验证关闭不跳过、点选不提交、聊天草稿不变、提交期间防重、失败保留答案、离线禁用且重连不自动提交、键盘可达与无障碍名称。
- [x] 6.3 接入其他端结算与取消刷新，协调 ApprovalInbox、排队条和窄屏限高；composer 在有未决问题时提示排队语义并提供打开入口（发送仍走普通排队）；transcript 的 `ask_user` 工具行只展示状态/答案并可定位到卡片；会话列表显示“等待回答”，标签页隐藏时加标题前缀并在结算/可见后还原。新增竞态与布局测试并运行本组新测试及现有 composer-queue 回归，更新 Web 使用说明，确认回答不触发聊天 submit 或命令审批。

## 7. TUI 面板与焦点路由

- [x] 7.1 实现 `/todos` 只读面板和进度入口，更新命令补全/help 文档；增加 `packages/tui/test/todos-ui.test.ts`，验证顺序、状态、滚动、空态和不支持提示。
- [x] 7.2 实现问题入口、完整题目面板（↑/↓、数字直达、Space 切换/选定、Tab 切换文字输入、Enter 提交、“跳过此问题”行、PgUp/PgDn 滚动、`[`/`]` 切换），键位对照现有快捷键表避免冲突（含 Alt+↑ 排队选择）并登记到 help；统一输入焦点路由并接入 layout 高度预算，面板内 Esc 仅关闭面板且被消费、不触发忙时 Esc 停止；按“空输入且无其他焦点才自动展开一次”规则呈现，其余情况仅提示条；增加 `packages/tui/test/question-ui.test.ts`，验证开关面板不丢聊天/答案草稿、Enter/Esc 不误操作审批或队列、新问题不抢编辑焦点、推荐项不预选、无选择无文字时 Enter 不提交。
- [x] 7.3 实现页脚等待回答计数与会话选择器的“等待回答”标记；测试窄终端、长题、多个未决问题、审批及队列并存、提交失败、其他端结算和停止；运行 `bun run test packages/tui/test/todos-ui.test.ts packages/tui/test/question-ui.test.ts packages/tui/test/approval-dock.test.ts packages/tui/test/queue-ui.test.ts`，并补充 TUI 使用说明。

## 8. Flutter Mobile 界面与状态

- [x] 8.1 在 `lib/core/api/models.dart`、ChatController 与通知处理接入能力、revision、列表和回答结构；扩展 controller/fixture 测试，验证新旧 capabilities、attach 首查/变化通知竞态、切换/重连代次隔离及离线不自动重发答案。
- [x] 8.2 在聊天页实现 Todo 进度入口与只读列表，问题条与 bottom sheet 实现单选/多选、始终可见的文字输入、显式提交、独立跳过及最终状态，推荐项仅标记不预选，输入未聚焦且无草稿时按规则自动展开一次；会话列表显示“等待回答”；widget 测试验证聊天草稿和答案草稿隔离、点选不提交、关闭不结算、其他端获胜答案、失败提示及防重复点击。
- [x] 8.3 使用现有 theme tokens、自有图标和至少 44dp 热区，补窄屏/大字体/软键盘/安全区测试及审批、队列共存用例；在 `apps/mobile` 运行相关 `flutter test` 文件、`flutter analyze` 和 `dart format --set-exit-if-changed .`，更新 App README。

## 9. 跨端集成验收

- [x] 9.1 用 faux provider 扩展网关端到端场景：建立 Todo、发起单选/多选问题、桌面和移动连接竞争回答、gateway 重启后恢复、跳过继续、排队 steer 在问题结算前不生效及停止失效，并验证目录 `awaitingAnswer` 随之变化；运行相关 gateway e2e 测试，验证仅一个最终答案、无额外聊天输入且其他会话/审批/job 不受影响。
- [ ] 9.2 扩展移动集成测试脚本与 `integration_test/mobile_e2e_test.dart`，覆盖手机可见 Todo、回答后桌面同步及重连；验证 Android 模拟器或设备上完整流程，记录实际执行结果，不将未运行的设备测试记为通过。（进度：`scripts/mobile-e2e-gateway.ts` 已加入「待办」「提问」「多选」脚本，integration_test 已写并通过 analyze/format；**模拟器/真机整流程尚未执行**，故保持未勾选，需在设备上运行 `flutter test integration_test/mobile_e2e_test.dart -d <设备>` 后再勾选。）
- [x] 9.3 集成完成后运行 `bun run check`、`bun run build` 与受影响的 Bun 测试集，在 `apps/mobile` 运行 `flutter analyze`、`flutter test` 和 Android release 编译；核对依赖未引入 coding-agent、Pi 版本未变、协议版本未提升，以及所有 spec 场景均有对应证据。
