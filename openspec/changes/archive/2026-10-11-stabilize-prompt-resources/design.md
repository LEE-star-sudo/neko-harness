# Design

## Context

现状与动机见 proposal.md。与实现相关的事实如下：

- durable `GenerationTask.prepare` 在每个 generation 开头渲染全部 sections（`reference/pi/packages/durable/src/harness/generation.ts:125-151`）。工具轮结束后 `finishToolRound` 把 run 交给新的 generation，所以一个 run 里会多次 prepare。
- `planSystemEntries` 在节文本变化时追加 `pi.system` patch。文本稳定只是前缀复用的必要条件之一，工具声明、压缩和 provider 行为也会影响缓存。
- `deepseek-flash` 的 compat 没有 `supportsMidConvoSystemMessages`，detect 默认为 `false`（`pi-ai/dist/api/openai-completions.js:1294`）。`resolveTranscript` 会 collapse 所有 system 消息，一旦出现 patch，开头的 system 文本就会变化。
- `PromptInput` 携带 `conversationId`（`durable/src/harness/types.ts:323-333`），节渲染可以按会话取数据。
- 会话的 `cwd` 在创建（或 fork）时确定，`configureConversation` 不改 cwd（`runtime.ts:727-741`）。
- pi 的 durable 桥按目录加载一次、永不刷新（`coding-agent/src/experimental/durable/prompt.ts:27-39`）；pi 的交互模式在显式 reload 时刷新。neko 的选择介于两者之间。
- durable 的 edit 工具参数为 `edits: [{ oldText, newText }]`（`pi-durable/dist/tools/edit.js:8-16`）。pi 的 `editToolSystemPromptContribution.guidelines` 有四条，与这个 schema 对应（`coding-agent/src/core/tools/edit.ts:45-49`）。

## Goals / Non-Goals

**Goals:**

- 用户提交时准备资源，输入进入 transcript 时激活；没有新输入 placement 的工具轮保持资源快照稳定。
- 显式技能正文与元数据单次读取；保留每个排队输入自己的快照，失败或撤回不激活。
- 去掉渲染结果对 locale 的依赖；edit 规则与工具 schema 一致。

**Non-Goals:**

- 不做文件监听、mtime/size 指纹或跨进程持久化快照（快照只存在于进程内存中）。
- 不改 `rules` 的工具顺序。工具顺序由扩展组合决定、是确定的；工具顺序一变，durable 会重发全部工具声明，单独给 rules 排序也省不下缓存。
- 不调整节的顺序和内容结构，不改 compaction，不改 gateway/TUI/Web 契约。
- 不缓存全部技能正文；不承诺服务端缓存命中率或以非零 cacheRead 作为必过门槛。

## Decisions

### D1：准备与激活分离，按公开 submission placement 选版本

原始 `createResourceLoader` 保留直读与诊断去重行为，支持可选的显式技能名。扫描每个技能时解析并报告该次读取的原始文本；只暂存匹配显式技能名的两级候选，合并后选取胜出的文件文本用于展开。准备对象中的 `invocation` 不进入长期系统快照。

`snapshots.ts` 中的快照管理器按 conversationId 保存活动快照与 requestId 到准备资源的映射，准备资源不保留 `invocation` 正文：

- `stage(id, requestId, workspace, resources)` 在调用 durable submit 前登记已准备的资源，不替换活动版本。
- `current(id, workspace)` 通过 runtime 提供的回调读取公开 `storage.submissionByRequest` 状态。只有记录包含 input 的 `entry` 才能激活，选择最大的 EntryId；queued/尚未提交的候选不生效，无 entry 的 unanswered 候选清理。激活后释放已消费候选，保存活动 EntryId 防止旧输入倒退覆盖。
- `discard(id, requestId)` 清理提交失败的候选；`forget(id)` 在归档时清理该会话。重复 requestId 不重新加载或展开。
- 没有活动快照时按工作区加载一次，覆盖进程重启、fork 和直接通过 harness 提交的首次请求；工作区变化也重新加载。快照不持久化，重启后当前磁盘版本可能产生一次 patch。

`submitTo` 先准备并展开（使用胜出技能的同次读取内容），在 durable submit 前 stage，失败时 discard。即使 generation 先于 submit 的 Promise 返回运行，公开 submission 记录也已提交，能正确激活。`listSkills` 始终原始加载，不写候选或活动表。

同一 boundary 放入多个输入时，用最后一个 EntryId 的快照作为系统资源；各用户消息的已展开正文保持不变。这是单个系统元数据集合面对多版本输入时的确定性优先级，不保证同时呈现同名技能的多个元数据版本。

原有 `WeakMap<PromptInput>` 保留，确保各节共享一次构建。工具规则仍按实际工具顺序渲染，不缓存整个工具相关提示词。

备选：准入前立即换活动 Map 会让 rejected/queued/aborted 输入污染当前 run，拒绝；每工作区共享会污染其他会话，拒绝；不使用 run taskId 或内部 LiveDoc 判断边界。

### D2：edit 规则对齐 pi

把 `TOOL_GUIDELINES.edit` 替换为 pi `editToolSystemPromptContribution.guidelines` 的四条原文（`edits[].oldText` 精确匹配；多处修改合并为一次调用；各项基于原文件匹配、不重叠；`oldText` 尽量短）。其余工具的规则不变：read/write 已与 pi 一致；bash 的规则只沿用 pi 的条件规则，不引入 pi 的 `PI_*` 环境变量提示，因为 neko 不注入这些变量。

### D3：各层 UTF-16 码元排序

`scanSkillsDir` 改为二元字符串比较（`a < b ? -1 : a > b ? 1 : 0`）。各层排序后仍按用户级、项目级合并；同名覆盖保留 Map 原位置。不要求合并结果全局排序。

## Risks / Trade-offs

- [排队输入] followUp 仅在 final boundary 放入上下文后激活，steer 同样按其实际 placement 激活；撤回候选不改变活动版本。
- [run 内磁盘修改] 没有新输入进入上下文时继续用旧资源，这是缓存稳定性取舍；模型仍可直接 read 最新文件。
- [升级规则文本变化] 存量会话可能产生一次 rules patch，可能降低该轮缓存复用，不承诺整个缓存失效。
- [重启与 fork] 没有内存快照时加载当前文件；不承诺恢复旧的资源版本。
- [内存] 每会话一份活动资源及未消费输入的准备资源；归档清理会话，取消/失败/激活清理候选。AGENTS.md 仍全量注入，64 KiB 仅告警并非大小上限。

## Migration Plan

不涉及数据迁移，快照不落盘。回滚需移除 runtime 的 stage/discard 接线，并恢复 prompt 渲染直接读取资源；归档清理与新增快照模块一并移除。
