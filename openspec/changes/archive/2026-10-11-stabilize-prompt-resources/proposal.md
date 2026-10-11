# Proposal

## Why

`neko-prompt` 在每次 generation 的 prepare 阶段都重新读取 AGENTS.md 与 skills，工具轮结束后也会重读。agent 修改这些文件会使下一轮系统节变化；默认 `deepseek-flash` 会把 system patch 合并回开头，破坏修改位置之后的历史前缀复用机会，但不保证此前公共前缀是否命中。另有两处细节需要修正：edit 规则未对齐实际的 `edits[].oldText` 参数，skills 排序依赖 locale。

## What Changes

- 用户提交新输入时准备资源快照，按会话与 requestId 保存；仅当 durable 将该输入放入 transcript 时激活。未进入上下文的 followUp、失败或撤回的输入不得改变活动快照。**BREAKING（行为）**：run 内磁盘修改在下一条输入进入上下文时生效，不在下一工具轮自动生效。
- `/skill:` 的正文与元数据从同一次 SKILL.md 读取中取得，仅暂存被显式调用的文件文本，不缓存所有技能正文。多个输入同批进入上下文时，最后一个输入的快照决定系统元数据；所有已展开正文保持原样。
- 前端技能列表查询仍直接读磁盘、返回最新结果，查询结果不写入、也不改变会话快照。
- 各会话的快照互相独立：会话 A 提交新输入，不会改变会话 B 正在执行的 run 的系统提示词，即使两者共用同一工作区。
- `rules` 节的 edit 规则对齐 pi 的 `editToolSystemPromptContribution.guidelines`，与 durable edit 工具的 `edits[]` 参数一致。
- 各层 skills 目录按 UTF-16 码元顺序排序，不依赖 locale；保持用户级先合并、项目级同名覆盖保留位置的现有语义。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `prompt-context`：准备与激活分离、输入 placement 决定活动快照、失败/排队/撤回隔离；目录排序与 locale 无关，edit 规则与工具接口一致。
- `skill-invocation`：被显式调用的技能正文与元数据单次读取；列表查询仍实时，多个排队输入保持各自已展开的正文版本。

## Impact

- **代码**：`packages/core/src/prompt/resources.ts`（单次读取显式技能、按输入版本管理快照）、`prompt.ts`（按会话获取活动快照；edit 规则）、`skills.ts`（扫描回调与排序）、`runtime.ts`（准备、提交失败清理、按公开 submission placement 激活、归档清理）。
- **测试**：`packages/core/test/prompt-runtime.test.ts` 等增加 run 内修改资源、会话隔离、排序稳定性的覆盖。
- **文档**：根 `AGENTS.md` 与 `packages/core/README.md` 说明准备/激活时机、排队输入及重启行为。
- **API/契约**：gateway、TUI、Web 均无契约变更；`createNekoRuntime` 选项不变。
- **缓存效果**：没有新输入进入上下文时，资源磁盘修改不触发系统节 patch，避免无谓破坏前缀复用。真实 API 记录 cache hit/miss，不保证非零命中或提升幅度。
