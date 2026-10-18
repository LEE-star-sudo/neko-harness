# Proposal

## Why

neko 缺少模型可维护、用户可跨端查看的结构化待办列表，也缺少让模型暂停并等待用户选择或补充文字的可靠问答工具。pi-durable 1.3.0 已提供工具、原子文档与观察机制，应由 neko 实现产品语义，而不是引入另一套 agent runtime。

## What Changes

- 新增主 agent 的 `todo` 工具，读取或整体更新有序待办，保存稳定 ID、内容与 `pending` / `in_progress` / `completed` 状态；Web、TUI、Mobile 展示同一列表和完成进度。
- 新增主 agent 的 `ask_user` 工具：每次提出一道问题，支持单选或多选（`multiple`）、模型推荐标记（`recommended`，仅作提示不预选）、选项与补充文字同时提交或纯自由文字，以及明确跳过；等待期间停止该调用的后续模型推进，回答经专用接口返回工具，不提交为普通聊天输入。工具结果向模型明确区分已回答（含选项标签与文字）、已跳过（不等于同意）与已取消。
- 持久保存问题、回答与调用身份，支持等待期及回答提交后重启恢复、多端竞争、停止和归档取消，避免重复提问与重复消费回答。
- 交互规则统一：问题与选项按纯文本呈现；选择只改变草稿、须显式提交；自动展开不抢占聊天焦点；等待期间聊天输入提示其排队语义；会话目录标记“等待回答”，使其他会话和旧标签页中的阻塞也可被发现。
- core 实现工具和状态，gateway 提供共享投影及回答入口，Web/TUI/Flutter Mobile 分别适配交互。已有 Bash 审批保持独立。
- 显式扩展移动 API 的允许操作，增加能力声明、schema、fixtures、文档和 App 适配；沿用可选能力探测，不为新增功能提升应用协议或移动 API 版本。
- pi-durable 继续作为依赖；pi-coding-agent 的 todo/question 示例仅作参考，不引入依赖、不修改上游代码。

## Capabilities

### New Capabilities

- `agent-todos`: 会话级结构化待办、模型维护、原子更新与恢复、三端只读呈现。
- `user-questions`: 持久化结构化问答、回答与跳过、调用恢复、跨端结算与交互。

### Modified Capabilities

- `mobile-api`: 将当前严格列举的移动控制边界扩展为可读取待办、查询和回答主会话问题，并在会话列表可选标记“等待回答”，保留设备认证、订阅归属和传输限制。
- `prompt-context`: 在既有五节结构内新增按实际工具集启用的 todo/ask_user 规则，不引入动态列表的第六个系统节。
- `session-gateway`: 会话目录条目增加可选的“等待回答”标记，使 Web/TUI 会话列表能区分“模型运行中”与“等待用户”。

## Impact

- `packages/core`: 新工具与文档、runtime/session 生命周期、工具投影及 prompt rules；子 agent 工具过滤和恢复配置必须保持边界。
- `packages/gateway`: Chord schema、共享投影刷新、会话回答方法、可探测客户端 helper、会话目录“等待回答”标记，以及 mobile adapter/protocol/projection。
- `packages/web`、`packages/tui`、`apps/mobile`: 待办入口、问题交互、错误/离线处理和现有审批、排队、输入焦点之间的协调。
- `docs/mobile-api-v1.md`、移动契约 fixtures、README 与相关测试；不改依赖版本、不增加存储引擎、不产生宿主 todo 文件。

### 首版规划默认（待评审）

用户已确认依赖边界及 Web/TUI/Mobile 全覆盖。以下细节采用保守默认，不视为用户已逐项确认：两个工具仅主 agent 可用；Todo 由模型维护、用户只读，不提供依赖图或调度；一次问一道题，支持单选/多选，并允许选项与补充文字同时提交（文字单独提交即自定义答案），不提供任意 JSON Schema 表单，也不在一次调用中批量多题（相互独立的问题可在同一轮连续调用，按序逐个呈现）；用户可明确跳过，无自动超时答案，结算后不可修改。这些默认保持子 agent 不直接询问用户的现有约定。
