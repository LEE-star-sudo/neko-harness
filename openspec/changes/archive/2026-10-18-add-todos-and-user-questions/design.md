# Design

## Context

动机见 proposal.md；行为契约见本变更四份 delta specs。当前相关实现：

- 已安装 pi-durable 1.3.0 的 `dist/harness/tool.js` 在 `execute` 前保存 intent；恢复时只有原策略及当前定义均为 `replay: "safe"` 才重新执行。`beforeTool` 等待与 `execute` 等待的恢复边界不同。
- `packages/core/src/tool-approvals.ts` 已有持久文档、原子首次决定和文档订阅等待，但服务的是子 agent Bash 审批，不是通用问答。
- `packages/core/src/prompt/prompt.ts` 固定五节，通过 `TOOL_GUIDELINES` 注入按实际工具集筛选的规则。上游 todo 示例增加动态 section 的做法不适合直接照搬。
- `packages/gateway/src/session-host.ts` 共享每个会话的投影资源，并显式监听业务文档提交；仅增加文档而不接通刷新会导致 UI 停留旧状态。
- `client-session.ts` 的 jobs/queue helpers 用可选视图字段探测能力；mobile adapter 使用独立认证 JSON-RPC、订阅代次和有界 snapshot/notification。
- Web 的 `ApprovalInbox`、TUI 的 `ApprovalDock`、Flutter 的 `ApprovalBar` 是可借鉴的入口，不复用其“允许/拒绝”的业务含义。
- 子 agent 创建时从主 agent 过滤工具，coder 默认继承面较宽；接续及恢复也需要排除新工具，不能只在提示词中禁止。
- pi-durable 的 `executionMode: "sequential"` 会使其所在整轮工具调用串行；排队输入的 steer 在 `postTools` 边界（整个工具轮结束后）才放入，因此等待中的 `ask_user` 也会挡住 steer，而不仅是 followUp。
- 会话目录的 `status` 由 `session-metadata.ts` 观察者依据 `pi.live` 等文档提交推导；等待用户回答时 native run 仍存在，目录会显示“运行中”，用户无法在其他会话或旧标签页中发现阻塞。
- TUI 中忙时 Esc 会中止运行（`tui.ts` 输入监听）；问题面板的关闭键若不隔离，会把“关闭面板”误变成“停止并取消问题”。

## Goals / Non-Goals

**Goals:**

- 用 pi-durable 文档和原子提交保存唯一真相，所有前端只做呈现和显式控制。
- 使重启、回执丢失、取消及跨端竞争有可测试的确定结果，不依赖 UI 持续连接。
- 兼容当前协议中的新增可选能力模式，保持审批、聊天排队和资源快照互相独立。

**Non-Goals:**

- 不引入 pi-coding-agent 或另一套 scheduler/checkpointer，不修改 reference 或上游实现。
- 不做任意 JSON Schema 表单、一次调用内的多题问卷、Todo 依赖图、子 agent 独立 Todo 或提问。
- 不让用户直接修改 Todo，不把任务完成状态作为代码已正确执行或验证通过的证明。
- 不允许结算后修改或撤销回答；用户需要更正时通过后续普通消息告知模型。
- 不把聊天输入框的内容自动转成问题答案；不渲染问题中的 Markdown、HTML、链接或图片。
- 不实现离线答案自动重发、提醒推送或无人值守自动选择。

## Decisions

### D1. 两个独立薄扩展，首版仅主 agent

新增 `packages/core/src/todos.ts` 与 `user-questions.ts`，分别安装命名扩展。两者使用 TypeBox 参数校验、`executionMode: "sequential"` 及明确的模型输出。工具结果的 `output` 面向模型，`details` 保存 UI 历史，声明的 `structuredOutputSchema` 与程序返回值一致。

sequential 会使包含这两个工具的整轮调用串行：`ask_user` 必须如此（后续调用不应在用户回答前启动），`todo` 则用以保证同轮多次 `replace` 按模型给出的顺序提交。代价是同轮的只读并行调用失去并行；Todo 通常与其他调用同轮出现，该成本记入风险并在实施时用测试固定行为。

在新建、接续及启动修复子 agent 配置时排除 `todo` / `ask_user`，工具执行端再校验角色，防止嵌套调用绕过。已有子 agent “不能直接询问用户”的职责保持不变。不强行覆盖宿主对主会话工具的显式禁用。

替代方案：直接移植 coding-agent 扩展会绑定不同的 ExtensionAPI、UI 及持久化模型；让所有子 agent 使用会扩大角色边界和父子交互聚合范围。均不采用。

### D2. Todo 使用整体替换和调用级事务回执

工具契约：

```text
todo { action: "list" }
todo { action: "replace", items: [{ id, text, status }] }
  --> { revision, items }
```

按动作严格校验字段；`list` 不接受 items，`replace` 必须提供 items。状态为 `pending | in_progress | completed`，不限制同一列表只能有一个进行中条目；有并行工作时不伪造串行进度。ID 由模型生成，更新同一任务时保持不变。

`app.neko.todos` 为 conversation 文档：`{ revision, items }`，`history: "rewindable"`、`fork: "asOf"`；无文档按空列表读取。整体替换明确表达当前计划，不增加增删改动作或 scheduler。

工具声明 `replay: "safe"`。仅 `replace` 创建 task-scope 回执文档，保存规范化参数及 `{ revision, items }`。同一 `api.commit` 内：

1. 已有回执时校验参数一致并返回原回执，不写当前 Todo。
2. 无回执时读取/更新会话列表，递增 revision，同次写入回执。

`list` 是纯读取，不写回执：工具结果提交前被重放时读取当前列表即可，模型尚未看到过旧结果；sequential 又保证同轮后续 `replace` 不会先于它启动。回执不随会话分叉继承；不同 replace 调用按实际提交顺序生效。完成工具结果的持久化仍交给原生 ToolTask，不另造 transcript 条目。

为何需要回执：仅把 replace 标为 safe 虽然重复写相同值看似幂等，但在其他调用已更新列表后重放旧值会回滚进度。列表与回执必须同次提交，不能先写列表、再用独立 `api.memo` 保存标记。

### D3. 问题记录与未决索引分开，避免全历史广播

工具契约：

```text
ask_user {
  question: string,
  multiple?: boolean,                         // 默认 false：单选；true：可选多个
  options?: [{ id, label, description?, recommended? }]
}
```

选项 ID 与标签在同一问题内各自唯一（标签按 trim 后比较，避免用户无法区分）。`multiple: true` 至少需要 2 个选项；`recommended` 在单选问题中至多一个，多选可有多个。`recommended` 只是给用户的提示：UI 显示“推荐”标记并让焦点/光标起点落在推荐项上，但 MUST NOT 预选、预填或自动提交，保持“无自动答案”。零选项退化为纯文字问题（此时 `multiple`、`recommended` 非法）。用户始终可以填写文字，也始终可以明确跳过；不设置可迫使用户只能接受预设选项的开关。

回答（response）为判别联合：

```text
{ kind: "answer", optionIds?: string[], text?: string }   // optionIds 非空或 text 非空白，至少其一
{ kind: "skip" }
```

选项与文字同时提交即“选项 + 补充说明”（如选 A 但附加限制），只有文字即自定义答案，只有选项即普通选择；因此不再区分互斥的 `option` / `text` 两种回答，结果同时保存 `optionIds` 与 `text`，模型能分别读到。`optionIds` 按问题选项顺序规范化并去重，省略与空数组等价；单选最多 1 个，多选可 1 至全部；无选项问题的 `optionIds` 必须为空。文字保存原值，trim 仅用于判断是否全空白。

`app.neko.question` 为 conversation-scope 文档 family，key 为稳定 tool task ID；每个成员保存：

- `id`（tool task ID）、`callId`、首建时生成且不可变的 `version`、问题（含 `multiple`）及选项（含 `recommended`）；
- 创建时间、结算时间、所属调用/运行身份；
- `pending | answered | skipped | cancelled`；
- `answered` 时的 `{ optionIds: string[], text?: string }`。

`app.neko.questions` 为轻量会话文档，仅保存 revision 和未决记录 ID。family 与索引均为 `history: "latest"`、`fork: "initial"`，分叉不复制可操作问题。已结算记录留在 family 中，用于回执重试；不把所有历史答案塞进实时视图。对应最终工具结果在 transcript 中留存完整题目与决定。

首次建立在工具事务内完成，必须校验调用仍存活且未请求中止。已有同 key 记录时只验证原参数，不重新生成 version 或新问题。索引与记录的创建、结算及移除保持原子性。

### D4. ask_user 安全重放，等待只观察已提交文档

`ask_user` 声明 `replay: "safe"`。execute 确保问题记录后，通过该记录的 `documentState` 或 `watchDoc` 等待非 pending 状态：

```text
execute --> ensure question + index (one commit)
   |
   +--> already settled --> return original outcome
   |
   +--> pending --> subscribe + initial check
                        |
                        v
                respond transaction
                        |
                        v
                tool result --> normal generation
```

必须订阅后检查当前值，避免“读到 pending 后，回答先提交、监听后建立”的丢唤醒；等待结束、取消和关闭均释放订阅。订阅结束/存储失败必须显式拒绝等待，不能永久 pending 或吞掉错误。

进程关闭只结束本次内存等待，不持久取消问题；重开后 native ToolTask 重放 execute，重新订阅原记录。已回答则直接返回原答案。不能捕获所有 abort 并写 cancelled，否则正常关闭会破坏恢复。

工具回传明确区分 answered、skipped、cancelled，`structuredOutput` 为 `{ status, optionIds?, labels?, text? }`，`output`（英文，面向模型）至少包含：

- answered：`The user answered.`，随后列出每个选中选项的标签与 ID，以及用户的补充/自定义文字（原样，标明来自用户）。模型看到标签而非只看到 ID，避免凭 ID 猜含义。
- skipped：说明用户跳过且未提供答案；这不是同意、拒绝或任何偏好，模型应基于自身判断继续并明示所作假设，或在无该信息时继续，不得把它当成选择；同一问题除非情况变化不再重复询问。
- cancelled：说明问题因运行停止或会话归档被取消。

`details` 保存问题、选项标签、`multiple` 与最终结算（含用户选择的 ID/文字），供三端在历史中渲染“问题 → 答案/已跳过/已取消”，不依赖解析 `output` 文案。用户停止运行时仍服从原生 abort，不通过返回结果启动新运行。

`ask_user` 的 sequential 使其所在整轮串行：排在它之前的调用已先完成，之后的调用在回答（或跳过）结算后才启动；后台 job 与其他会话不受影响。同一轮内相互独立的多个 `ask_user` 因此按序逐个呈现、无需模型往返，这是不引入“多题批量”参数的原因；它们互相依赖时应分轮提问。排队的 steer 与 followUp 一样要等该问题结算后才进入上下文（steer 在 `postTools` 边界放入），前端不得承诺其立即生效。

替代方案：纯内存 Promise 丢失重启等待；用普通 submit 回答会落入正被该问题阻塞的输入队列；把所有问答放进 beforeTool 混淆权限拦截和用户业务输入；单次调用批量多题会引入部分回答、逐题跳过和更大的原子结算范围，且连续单题已能得到同样的用户体验。均不采用。

### D5. 回答、跳过和取消共用首次结算规则

core/session 提供读取和 `respondQuestion({ id, version, response })`，response 为 answer 或 skip 判别联合。单一事务读取目标会话问题，并校验版本、参数和当前工具/所属运行的 task 归属链：

- pending 且调用及所有者未中止时保存答案或跳过，同时递增索引版本并移除未决 ID。
- 已结算且身份有效时返回原最终记录，不覆盖答案，即使请求携带另一合法答案。
- 不同会话、错误版本、不存在或重复的选项、单选多于 1 个选项、无选项问题带 optionIds、空白文字且无选项、超限内容在副作用前明确拒绝；已结算记录也不绕过参数校验。
- 任务中止标记、所属运行结束或会话归档使 pending 记录结算 cancelled，迟到提交只能得到真实终态或明确失效错误。

运行中监听相关 task 提交以协调取消，启动时在调度前对账遗留未决索引。取消判断也放在 respond 事务内，不能仅依赖异步监听速度；检查任务 owner 链，不能只看尚未收到中止传播的 tool task。正常 Harness close 不等于任务中止。

回答先于停止保存时保留回答事实，随后仍停止原运行。断线、关闭面板和 detach 不结算问题。存储故障走现有 Harness 致命错误通道，不写伪造成功结果。

不共享 `ToolApprovals` 的文档或决定接口；复用的是“文档 + 事务 + 订阅”的现有模式。问答不是权限授权。

### D6. 有界契约与三端一致校验

core 集中定义并导出数值限制，schema 和 wire adapters 使用同一来源；Dart 契约/fixtures 对拍同一边界：

| 内容 | 上限 |
|---|---|
| Todo 项数 / ID / 内容 | 100 / 64 / 256 |
| Todo items JSON UTF-8 字节 | 65,536 |
| 问题正文 / 选项数 | 2,000 / 12 |
| 选项 ID / 标签 / 说明 | 64 / 200 / 500 |
| 回答 optionIds 数 / 自由答案 | 12（不超过选项数） / 4,000 |
| 问题参数 / 回答参数 JSON UTF-8 字节 | 各 16,384 |
| 单会话未决问题数 | 8 |

长度均按 UTF-16 码元，Dart 不以 rune 数替代；字节预算在规范化后的参数 JSON 上计算，工具与直接 API 采用相同校验。问题参数的规范化使省略 options 与空数组等价、省略 `multiple` 与 `false` 等价、省略 `recommended` 与 `false` 等价（回放比较以规范化结果为准）；保存原始非空内容，不用 trim 静默改写正文，trim 仅判断是否全空白。选项 ID、选项标签（trim 后）和 Todo ID 必须唯一且非空白。

问题正文、标签与说明一律按纯文本展示：保留换行与空白，不解析 Markdown/HTML，不生成链接、不加载图片。这样三端渲染一致，也避免模型借提问界面放入可点击的外链或伪造系统/审批样式的内容；问题界面固定标注“助手提问”，视觉上与 Bash 审批区分。回答文字与聊天输入一样明文持久保存并发送给模型提供方，因此规则禁止用 `ask_user` 索取密钥或口令。

响应只含必要字段；单题完整记录的序列化 UTF-8 预算为 65,536 字节，留足 JSON-RPC envelope 后仍低于现有 mobile payload 131,072 和 frame 262,144 限制。边界测试覆盖转义字符造成的 JSON 膨胀与多字节文本，不能仅测 string.length。未知字段/判别联合无效组合明确拒绝。

桌面视图只携带有界当前 Todo 和未决问题摘要（正文预览最多 256 码元，含 `multiple`、选项数），不广播完整问卷历史；完整题目通过 get 按需读取，预览标明可展开。8 个上限也覆盖嵌套工具可能绕过顺序执行的并发创建；超限明确返回工具错误，不等待一个不可见的第 9 题。

### D7. 网关能力为增量字段与专用方法

`ChatView` / `ChatViewSchema` 新增可选 `todos: { revision, items }` 和 `questions: { revision, pending: QuestionSummary[] }`。字段缺省表示不支持，存在且为空表示支持但无内容。问题摘要包含身份、版本、预览及创建时间；pending 实际数据通过独立方法读取。

`NekoChat` 增量提供 `questionGet({ id })`、`questionRespond({ id, version, response })`，返回有 schema 的完整记录。绑定 attachment 的 session 决定权限目标，不接受任意 conversationId。新增共享 helper 复用 jobs/queue 的探测模式；不提高 `APPLICATION_PROTOCOL` 或破坏已有契约成员。

`session-host.ts` 将 Todo 和问题索引提交加入刷新触发条件，并读取最新持久状态。沿现有共享资源机制先建立观察再取得首快照，初始化期间有新提交则补一次最新投影，避免首查与订阅间的空窗；释放资源时清理监听。回复成功只表示决定已持久保存，不表示模型已完成回答。投影可显示等待回答状态，但 `busy` 仍以 native run 为准。

会话目录：`SessionSummarySchema` 增加可选 `awaitingAnswer: boolean`（缺省 = 旧网关，不显示）。`session-metadata.ts` 观察者在已有的 `pi.live` 触发路径之外也监听问题索引文档提交，并在 reconcile 时读取未决数，把“有未决问题”并入摘要，沿用 `#notify` 推送目录变化；既有 `status` 枚举不变（不新增枚举成员，避免严格校验的旧客户端拒绝），会话仍为 `running`，新客户端在 `awaitingAnswer` 为真时改显示“等待回答”。分叉与归档会话按各自索引计算，旧会话缺省视为 false。

Mobile 新增：

```text
server.hello capabilities += ["todos", "questions"]
todos.get          { subscriptionId } --> { revision, items }
questions.list     { subscriptionId } --> { revision, pending }
questions.get      { subscriptionId, id } --> Question
questions.respond  { subscriptionId, id, version, response } --> Question
todos.changed      { subscriptionId, revision }
questions.changed  { subscriptionId, revision }
```

mobile chat status 的可选摘要提供 Todo revision/count/completed 及 questions revision/pendingCount，不把完整列表混入历史每次广播；独立 get/list 返回完整当前数据。移动会话列表条目增加可选 `awaitingAnswer`（仅在声明 `questions` 能力时出现）。adapter 通过同一会话服务调用，不新增独立业务状态。通知是失效提示，客户端读取快照后只接受不低于当前版本的结果；查询期间收到更高 revision 时再读，避免漏变化。重连重新 attach 并查询，不依赖通知完整重放。

所有方法复用授权和 `requireChat` 订阅归属检查，失效引用、参数错误、取消与内部故障沿现有错误类别返回。新增 docs/mobile-api-v1.md 与 fixtures，API 版本保持 1；缺少能力隐藏入口。先拿 hello 能力再绑定 App 功能。

### D8. 三端布局、提交与焦点不复用聊天

三端共享的问题交互规则（各端只是呈现不同）：

- 问题面板内含：问题正文（纯文本，可滚动）、选项（单选或多选控件，推荐项带“推荐”标记并作为焦点起点）、一个始终可见的文字输入（单选时为“补充说明（可选）”，无选项时为答案本身）、“提交回答”和独立且次要的“跳过”。提交在“已选选项”或“文字非空白”至少其一时可用。
- 选择只改变草稿，必须显式提交：回答首次结算后不可更改，且手机易误触，因此不做“点选即提交”；TUI 以 Enter 提交，也不例外。跳过需单独操作，不与关闭或返回共用同一控件。
- 关闭面板只是关闭：保留答案草稿，不跳过、不停止运行。聊天草稿与答案草稿互不影响。
- 呈现为独立于 Bash 审批的“助手提问”，不复用“允许/拒绝”语义；多个未决问题（含与审批并存）按序切换，同一时刻只展开一个完整编辑面板。
- transcript 中的 `ask_user` 工具行只显示状态（等待回答/已回答/已跳过/已取消）、问题与最终答案摘要，并提供“定位到问题”；回答控件只存在于面板，避免同一问题出现两处可编辑入口。
- 聊天输入在存在未决问题时提示“助手正在等待你的回答”，说明此处发送的消息仍按既有语义排队（排队/引导都在回答结算后才进入上下文），并提供打开问题的入口；不把聊天文字自动当作答案，被误发的消息可用既有撤回取回。

各端布局：

- Web：聊天顶栏增加待办进度入口和只读可滚动面板；输入区上方提供独立问题卡片（非模态，限高可滚动，可折叠为提示条，折叠状态只在内存中按 session/question/version 保留）。选项使用语义化的 radio/checkbox 分组与标签，键盘可达，屏幕阅读器可读出推荐与选中状态。普通聊天 composer 及 ApprovalInbox 保持原有提交路径。
- TUI：新增 `/todos` 面板，问题提示条/`/question` 打开专用面板（快捷键实施时对照现有键位表选择，不得与 Alt+↑ 排队选择等冲突并登记到 help）。面板内：↑/↓ 移动，数字键直达前 9 项，Space 切换（多选）或选定（单选），Tab 在选项与文字输入间切换，Enter 提交，列表末尾提供“跳过此问题”行，PgUp/PgDn 滚动长题，`[`/`]` 切换多个问题（沿用 ApprovalDock 惯例）。沿现有布局预算限高。
- TUI 焦点：面板内 Esc 只关闭面板并被面板消费，不得同次传给“忙时 Esc 停止运行”的全局逻辑；面板关闭后的 Esc/Ctrl+C 仍按现有行为停止运行，因此“停止”始终可达且是显式动作。审批 dock 与问题面板必须有唯一焦点拥有者，同一次 Enter/Esc 不得交给两套控件。
- Mobile：聊天页提供待办进度及底部只读列表；问题采用数量条和可滚动 bottom sheet，选项、文字、提交、跳过明确分开，复用现有 theme tokens、自有图标与至少 44dp 热区，适配键盘、安全区和大字体；选项与按钮提供语义标签。关闭 sheet 仅关闭，不发送答案。

答案草稿按 server/session/question/version 隔离，在界面暂时关闭后保留；首版不要求 App 进程退出后持久保存答案草稿。聊天草稿不变。提交期间禁用当前问题重复操作，失败保留草稿并明确显示错误；没有确认回执时不做已回答的乐观最终状态，重连查询实际状态，用户明确重试才重发。其他端结算时更新/禁用旧控件，展示实际获胜答案（含其选项标签与文字）。

Todo 不占常驻大块空间；问题、审批与队列可同时发现，但不重复堆叠多个完整编辑面板。问题历史利用工具 summary/details 展示，不靠解析文案还原状态。模型规则仅在当前启用相应工具时注入既有 rules 节。

### D9. 可发现性：自动展开不抢焦点，目录与标签页可见

等待用户是阻塞性状态，只有面板可见还不够，需要在用户不看该面板时也能被发现，但不能抢走正在进行的输入：

- 自动展开规则（三端统一）：问题首次出现于当前活动会话，且聊天输入为空、未处于输入编辑中、无其他模态/审批焦点时才自动展开一次；否则仅显示带“等待回答”的提示条（TUI 附打开方式）。用户关闭后，同一问题 version 不再自动展开。Web 的问题卡片本身是内联非模态的，不需要弹出，仅遵循折叠状态规则；Mobile 在进入已有未决问题的会话、输入未聚焦且无草稿时同样展开一次。
- 跨会话：会话列表（Web 侧栏、TUI 会话选择器、移动会话列表）在 `awaitingAnswer` 为真时显示“等待回答”以取代“运行中”，并可在当前会话之外被一眼发现；不提供推送通知（仍属 Non-Goals）。
- Web 标签页隐藏且当前会话有未决问题时，页面标题加前缀提示，问题结算或标签页可见后还原；TUI 页脚状态区显示等待回答的数量。这些只是被动提示，不发声、不申请浏览器通知权限。
- 状态文案区分“模型生成中”“等待你的回答”“已停止”，等待时可停止运行；显示问题已等待时长不属首版。

## Risks / Trade-offs

- [主 agent 可能长时间等待] → 无自动答案是有意的授权边界；持续显示等待（含目录与标签页提示）、提供明确跳过与停止，普通聊天仍遵循原排队语义。
- [用户习惯性在聊天框打字回答] → 排队消息不会被当作答案，输入区在有未决问题时给出提示和打开入口；误发消息可撤回取回。不做自动转换，避免把聊天内容悄悄当作授权性答案。
- [sequential 使同轮调用整体串行] → `ask_user` 必需；`todo` 用于同轮多次 replace 的顺序保证，代价是同轮只读调用不再并行。以测试固定“同轮其余调用在回答后才启动”，并在实施中评估是否可放宽 `todo`。
- [steer 也被问题挡住] → 属 pi-durable 的 postTools 边界语义，前端提示而非绕过；用户若要立刻改变方向应回答/跳过或停止运行。
- [模型借提问界面诱导用户（钓鱼、索取密钥）] → 纯文本渲染、固定“助手提问”标识、与审批视觉分离，规则禁止索取密钥，回答不构成命令授权。
- [safe 只是重放许可，不是 exactly-once 保证] → 原子回执/问题记录确保应用写入幂等，native task 管理工具结果提交；测试每个保存前后断点。不承诺外部 provider 请求 exactly-once，模型请求中断仍按原生恢复/重试策略处理。
- [多端快照和回答竞争] → 版本及首次事务结算；客户端展示服务端最终决定，不把本地提交值当成胜者。
- [题目文档逐次积累] → 每次问答的历史持久记录与 transcript 同属会话生命周期，实时索引只保留最多 8 项，不在单个大文档累计全部历史；首版不额外实现 GC。
- [三端入口挤占输入空间] → 面板按需打开、提示条限高；窄终端和键盘/大字体 widget 测试作为验收项。
- [Todo 不常驻系统提示词，压缩后模型可能忘记] → 有 list 工具及条件规则，避免破坏五节结构和每工具轮 prompt 稳定性。
- [规划默认尚未逐项确认] → 仅主 agent、用户只读 Todo、单题（单选/多选 + 补充文字）、推荐仅提示是本提案明确可评审的边界；实施以评审后的文档为准。

## Migration Plan

1. 先补 core 持久化/恢复及测试，再增量接通 gateway 和 mobile 契约，最后落地三端；不升级 Pi 依赖。
2. 旧会话无新文档时读取为空，仅首次写入才创建；启动时清理子 agent 新工具暴露并对账未决问题，不改现有 transcript。
3. 新客户端按可选字段/hello capabilities 探测；旧客户端不需升级即可使用原功能，不强制重连或改变协议版本。
4. 回退前应先显式停止/结算未完成问答；旧实现缺少新工具定义时不能承诺继续该调用。保留存储，不删除新文档以伪装兼容；恢复新实现后按原记录继续。Todo 不影响旧工具执行。
