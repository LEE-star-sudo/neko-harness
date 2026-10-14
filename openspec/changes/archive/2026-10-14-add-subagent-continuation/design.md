# Design

## Context

动机和范围见 proposal.md。现有 core 的 subagent 工具按当前 api.taskId 查找/创建 task-owned 子 conversation，使用 subagent:<taskId> 幂等提交，返回本轮报告；工具结果 details 的 childId 不进入主模型可发现的接口。DelegationsDoc 按工具调用保存记录，SubagentDoc 仅保存 role/parentId。gateway 主视图按委派逐项加入子会话 UsageDoc；审批 Hook 按 childId 找第一条委派。以上均依赖“一轮一个子会话”。

核实的发布包为 Pi Durable 1.2.0：ConversationHandle 支持 submit/abort/waitForIdle，调用结束后句柄失效；新的调用可以重新获取同一 conversation。ConversationOwnership 只有 ownerless 或 task，ConversationRecord owner 不可变；terminal owner 的旧取消不阻止子会话新工作。TaskOwnership 约束父子任务属于同一 conversation，因此不能把既有子 conversation 的生成任务直接改挂当前主 conversation 的工具任务。

官方 test/examples/23-subagent-background.ts 展示持久映射、send 和每次消息的原生 Reporter task；本变更只借用身份映射、反复 submit 和持久驱动任务，不引入示例的 background anchor 或异步回报。最终实现以 node_modules 发布包类型和行为为准，reference main 的示例接口可能更新。

## Goals / Non-Goals

**Goals:** 原生子会话连续模型上下文；每轮的可发现、幂等、取消、审批与用量正确；跨重启保持身份和归属；两端一致的浏览状态。

**Non-Goals:** 并发写入同一子会话、steer/followUp 队列、后台 Reporter、用户向子 agent 发消息、子 agent 递归委派、重挂 ownership、绕过模型预算或承诺无限完整上下文。

## Decisions

### D1. 分开持久身份和轮次

新增 conversation-scoped/latest 的身份文档，fork initial。agentId 使用由 childId 确定的稳定字符串（例如 agent-42），不是 role 或易变 title。记录 parentId、childId、固定 role/cwd、显示名称、createdAt、当前 activeRoundId。身份的归属必须经文档和 SubagentDoc 核对，不能仅解析字符串或信任模型传入 ID。

DelegationsDoc 继续保存每轮（工具 taskId/callId）的持久执行记录，并加入 agentId、原生 runnerId、轮次序号、提交/回答定位、用量基线与结束快照。旧轮次报告和终态不可被下一轮覆盖。稳定 agent 的状态派生为 queued/running/idle，失败/停止属于某一轮；没有活动轮次即可再次接续。持久身份不会长期占用并发槽。

沿用已存在子 conversation 的 creator ownership，不重新创建或 fork 来模拟接续。新建子 conversation 仍归属首次创建调用；其历史 creator edge 只用于结构归属，后续当前任务生命周期由 D3 的原生 driver 管理。由永久活跃 anchor 保持身份会占住前台 idle，不采用；background anchor 会改变 Esc 语义，也不采用。

### D2. 一个工具支持创建、接续和发现

subagent 参数采用可验证的分支：create 接收 type/title/task，continue 接收 agentId/title/task，list 接收可选有界分页参数。缺省 action 仍表示 create，兼容原调用。continue 不接受角色、cwd 或权限覆盖；每轮只提供新任务和约束，原模型、thinkingLevel、角色、cwd 沿创建时子 agent 配置保持。AGENTS/skills 则按新输入的既有资源快照规则刷新，不因复用一直冻结磁盘资源。

发送到模型服务的参数 schema 使用显式 type: object、properties 和 additionalProperties: false，避免顶层 union/anyOf 被服务端拒绝而令全部普通消息失败。各动作字段以说明标明适用范围；执行入口使用内部 TypeBox 分支 schema 严格校验必填项和字段组合，错误在任何子会话创建、接续或准入事务之前返回，保留角色/cwd/权限不可覆盖的限制。请求格式回归使用已安装 Pi DeepSeek 适配器与离线 HTTP 响应，验证普通输入携带的实际工具声明兼容，同时覆盖非法字段组合不产生身份/轮次。

create/continue 的模型可见 output 明确含 agentId、本轮状态和最终报告，structuredOutput/details 给程序与 UI 同样的身份信息。list 返回当前主会话可控制的身份、角色、idle/queued/running 状态、当前/最近任务摘要及有限报告摘要，可分页；不暴露子会话完整上下文。分叉历史引用不成为可接续身份。

首版同一 agent 从受理（包括等待配额）到本轮工具任务与原生 driver 均终态、子会话 idle 期间只允许一轮。事务原子占有 activeRoundId，第二次调用返回 busy，不提交额外输入，不默认为排队或 steer。不同 agent 沿既有配额排队。重放同一工具 taskId 复用已受理轮次，不被自身的 busy 判定拒绝。

### D3. 使用每轮 Pi 原生前台 driver，明确桥接取消

创建一个稳定命名/版本的 RoundTask，注册在 neko-subagents 扩展中，归属当前 subagent 工具任务，属于主 conversation，非 background。工具 replay safe，在 commit 中幂等创建/定位轮次与 driver，再等待 native waitForTask 返回本轮结果。RoundTask 的 input 保存 parentId/agentId/childId/工具 taskId/正文，阶段保存配额、usage baseline、提交标识及结算定位，不持久化 Promise 或旧 ConversationHandle。

阶段依次为 admission、deliver、settle：取得既有三任务/工作区单 coder 配额；记录开始基线并准备资源；通过当前 runtime.conversation(childId) 提交新的 input；requestId 使用本轮稳定身份；等待该 submission 及子会话 idle；按其 settled.answer 提取本轮报告，记录结束用量和终态；本轮工具任务终态后由宿主协调释放 activeRoundId/配额。重启接回相同 driver、submission 与子会话，不能重复创建或提交。每轮资源 prepare/discard 沿现有回调，重复 input 不再次激活另一份资源。

旧 creator 不是本轮 driver 的 ownership 后代。单独停止因此定位当前轮的工具任务，取消沿原生树到 RoundTask；RoundTask 的持久 abort handler 通过当前 handle 调用 child.abort 并等待 idle，再保存取消状态及部分用量。主会话 abort/归档也走同一可恢复取消链。仅当 activeRoundId 仍指向本轮时才能停止该 child；取消流程结束前、工具与 driver 未同时终态时不能释放身份锁，否则迟到 abort 或仍存活的首次 creator 会误停下一轮。未提交的 queued 轮次不启动子输入。锁释放通过原生 commit 观察和准入前幂等协调完成，重启后以持久任务终态与 child idle 再判定，不依赖进程内回调已执行。不可仅使用 JS finally 或绑定 Context 的 wait 被取消来替代持久清理。

沿 Pi 原生工具恢复策略报告 unsafe Bash 的中断，不自行重跑 shell。意外 driver 终态需宿主协调残余子执行/审批与锁，核实子 idle 后再开放接续；存储 fatal 错误沿已有 harness 终止，不虚构完成。

### D4. 审批归属于当前轮

Hook 不再取首个 childId 匹配的历史委派；根据身份 activeRoundId 找当前委派，并验证其 child、主会话及 driver/工具有效性。ApprovalsDoc 保持每次原生 Bash taskId 身份和操作版本，delegationTaskId 指向当前轮工具 taskId。新轮的相同命令仍是新请求；旧批准、拒绝或停止不影响新轮操作。

gateway 决定/停止以确切 round/task 身份校验；身份列表 pending 数只统计活动轮。输入区 ApprovalQueue 按稳定 agent 建立有界 reader，决定仍绑定原请求 id/version 和 round，而非“当前看起来选中的 agent”。继续保留 TUI 自动 SelectList、Web 临时 pending 卡与工具旁结果标记。

### D5. 稳定身份列表、连续详情和轮次定位

ChatView 增加身份摘要和每轮引用，gateway 子详情定位使用 agentId 并可提供 roundId 的定位信息；当前按 taskId 的契约递增 APPLICATION_PROTOCOL，版本差异沿既有更新提示。两端列表按 agentId 去重。TUI 保留稳定名称、当前任务摘要和英文 Idle/Queued/Running；Web 列表单行展示角色、稳定名称和轮数，详情使用空闲/排队中/运行中，不在列表重复展示当前任务或状态行。末轮失败或停止可作为辅助摘要，但不把该 agent 永久标为不可用。

主 transcript 每次调用仍各有卡片（轮次标题、状态、耗时），点击定位同一子 agent 的目标输入/轮次；目标较早时按有界历史页加载定位，不因只在当前页而跳到错误轮次。子详情为同一连续 transcript，在每轮输入边界显示简短任务分隔，保留全部可见工具记录、报告和截断标记。历史任务卡保持该轮终态，即使其 agent 当前已执行下一轮。

停止按钮只对 activeRoundId 有效，控件携带显示时的 roundId；旧页面、旧历史卡或迟到点击不得停止新的轮次。侧栏开关、所选 agent、详情滚动、草稿/附件沿现有会话级保存和 ready/operating 防护；接续任务不会强制重开关闭的侧栏或拉回回看位置。首版不在 UI 新增派发/输入子消息入口，仍由主 agent 工具接续。

### D6. 去重累计和每轮增量

主会话 taskUsage = 主 conversation UsageDoc + 每个唯一 childId 的累计 UsageDoc，不能按轮次相加累计值。主视图原有模型上下文窗口指示仍描述主模型上下文，不被子 agent 累计 token 替换。子详情显示累计用量，各轮摘要提供本轮用量与成本（运行中为增量，结束后为固定快照）。

基线在持有身份锁、子会话 idle 且提交前原子读取；结束快照在 child idle 后、释放锁前记录。使用原生 UsageState 按模型和工具计数计算差值，保留 input/output/cacheRead/cacheWrite 和成本，不通过渲染文本估算。配额等待或未提交即取消的轮次增量为零；失败/取消包含已记录的消耗；重启不得重新取得较晚 baseline。缺失/未知字段沿原用量语义显示未知，不能把估算或缺失当作精确零。

再次发送旧上下文产生的新 input/cache token 是本轮真实费用，正常计入；去重针对 child 累计重复相加，不扣除实际重复模型请求消耗。默认界面简洁，累计/本轮详细值放在详情和摘要展开处，沿既有遥测风格。

### D7. 分叉与已有数据

主会话分叉不复制可控制的身份文档。按 fork 时点保存只读 identity/round 引用，每个唯一 child 冻结一次 historyThrough 与 historyUsage；历史轮次保持已保存报告与用量，UI 标识原会话记录。分叉只读 reader 不能观察原 child 的后续活动，不能 list 成可接续、停止、审批或把原后续费用归入新主会话；新分叉可以创建自己的新子 agent。

恢复初始化在 resume 前按现有 SubagentDoc/DelegationsDoc 归属，为既有 child 创建稳定身份并去重索引。旧活跃任务沿原实现/协调路径结算后才开放接续；不改旧 creator、不重复提交。旧记录若只有一轮且完整累计快照可确定，可据此给出该轮值；没有可证明的基线不补造精确轮次值，显示未记录，之后的新轮使用新快照。迁移幂等，升级不是删除历史数据。

## Risks / Trade-offs

- [旧 ownership 不会自动把新调用的停止传播到子会话] → 原生 driver 的持久 abort handler、活动轮锁和 idle 确认；覆盖在清理各阶段重启。
- [相同子 agent 多次并行接续导致回答合并] → 受理事务互斥，busy 拒绝；本次不开放运行中消息队列。
- [两条委派都引用同一 child，审批/用量关联到旧轮] → 身份和轮次分离，审批查活动轮，总量按 child 去重。
- [上下文持续增长] → 沿 Pi 上下文与压缩语义，不承诺保留全部原文在模型窗口内；UI 持久历史不等于当前模型上下文。
- [旧停止控件或新请求竞争] → roundId 校验，终态/失效操作不能指向最新轮。
- [分叉看到原子会话未来内容和成本] → 固定 watermark、唯一 child 冻结用量、没有可控制身份。

## Migration Plan

1. 新增身份/轮次协调和稳定 RoundTask 注册，初始化在恢复调度前完成；所有旧工具调用形状继续表示创建。
2. 更新工具返回、提示词、审批活动轮关联和去重用量，保持原生输入资源准备边界。
3. 同步 gateway 与 UI 契约并递增应用协议；以现有版本提示要求所有本地界面/网关重新启动。
4. 使用 faux provider、Memory/SQLite 验证多轮上下文、重启、停止竞争、权限与费用；再做浏览器/PTY 验收，不使用真实 key，不扩 Windows CI。
5. 回退前停止所有活跃轮次并确认 child idle；旧程序不能恢复新 RoundTask。保留身份/轮次历史，不删除数据或把原始创建 ownership 改写为回退措施。
