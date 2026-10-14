# Proposal

## Why

explore 当前不能执行命令，难以调查 Git 历史、依赖版本或运行诊断。逐次用户审批能够补齐这些能力，并避免维护复杂的命令参数白名单，同时复用 Pi Durable 原生工具和恢复语义。

## What Changes

- explore 默认使用读取和搜索工具；需要 Bash 时逐次请求用户授权，批准后可以执行有副作用的命令，因此不再承诺严格只读。
- 使用 Pi 1.2.0 的异步 `beforeTool` 和持久审批记录；保留原生 Bash 的不可安全重放策略。
- Web/TUI 在输入区附近显示会话级待审批操作，主视图和子视图均可处理；决定后收起，结果附于对应命令；保持既有主题、导航和草稿状态。
- 审批支持重连、重启、取消和多端竞争；批准只绑定当前具体调用，不授予永久权限。
- plan 继续只读，coder 与主 agent 权限不变；不增加白名单、沙箱、自定义 agent 或 Windows CI。

## Capabilities

### New Capabilities

- `tool-approvals`: 工具调用逐次审批的持久状态、决定、取消和恢复语义；首版仅用于 explore Bash。

### Modified Capabilities

- `subagents`: explore 工具边界变为默认只读、Bash 需逐次批准。
- `prompt-context`: 角色提示准确描述审批能力及用户约束。
- `session-gateway`: 提供归属校验的审批观察和决定接口。
- `terminal-ui`: 会话级待审批交互及命令结果标记。
- `web-ui`: 会话级待审批交互及命令结果标记。

## Impact

涉及 core 子 agent 配置、扩展与持久文档，gateway 协议和订阅，TUI/Web 子任务详情及测试。新增审批服务接口需要更新应用协议版本及相关测试，复用现有版本不匹配提示。无 Pi 依赖升级，不改变 Bash 执行器；已有 explore 会话需在恢复前按角色迁移工具边界，不能只给新建子会话安装审批保护。
