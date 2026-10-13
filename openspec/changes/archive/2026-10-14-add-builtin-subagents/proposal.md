# Proposal

## Why

当前主 agent 承担所有调查、规划和实现，探索日志挤占主上下文，也无法让用户分别查看委派任务的执行过程。Pi 1.2.0 已提供持久子会话、任务归属与前台 subagent 示例，可以据此增加可观察、可停止、可恢复的内置委派能力。

## What Changes

- 内置 explore、plan、coder，由主 agent 在合适时机通过 subagent 工具前台委派；独立上下文，一层委派，多个读任务可并行，主 agent 等待结果后汇总。
- 直接复用 pi-durable 工具任务、owned conversation、幂等提交、取消和恢复模式；不实现独立调度运行时。
- 增加标准文件发现、内容搜索工具，让只读角色能够从未知路径开始完成调查；保留 Pi 原生 read/write/edit/bash。
- 为子 agent 保存归属与结果，普通会话目录不展示子会话，提供单独停止与明确用量归属。
- Web 主对话委派卡片及右侧栏、TUI 委派卡片及详情面板，均展示子 agent 完整的可见调用流程，包括任务、助手文字、模型返回的思考内容、工具参数/输出/结果、图片与错误；沿用现有组件和主题。
- 首版不支持后台委派、用户自定义 agent、递归派发、直接与子 agent 对话、独立模型配置或自动 worktree。

## Capabilities

### New Capabilities

- `subagents`: 内置角色、前台委派、生命周期、持久归属与结果。
- `agent-file-search`: 面向模型的只读文件发现与内容搜索工具。

### Modified Capabilities

- `agent-runtime`: 主会话与子会话用量归属。
- `prompt-context`: 角色提示和自动委派规则，保留五节结构与资源快照语义。
- `session-gateway`: 隐藏子会话目录项，提供子 agent 状态、只读详情和停止契约。
- `web-ui`: 委派卡片、右侧栏与完整子会话流程。
- `terminal-ui`: 委派摘要、列表与完整子会话详情面板。

## Impact

涉及 core 的 runtime/prompt/projection、新增工具与文档，gateway 契约及共享观察资源，Web 消息列表和布局、TUI transcript/panel/focus。增加相应运行时恢复、跨端同步和交互测试。沿用 Pi 1.2.0，不升级依赖，不新增 Windows CI/CD；Windows 工具路径与文本行为仍需兼容。此次仅创建规划文档。
