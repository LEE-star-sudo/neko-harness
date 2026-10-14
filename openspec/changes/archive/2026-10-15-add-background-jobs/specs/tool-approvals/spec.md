# Spec Delta

## ADDED Requirements

### Requirement: 后台任务不绕过 explore 审批边界
explore 子 agent 的每次 Bash 调用审批边界 SHALL 保持不变，后台任务能力 MUST NOT 成为绕过它的途径：`job` 工具不提供给任何子 agent，审批请求只针对 explore 的 Bash 调用，不因后台任务产生新的审批类型。主会话 agent 的 `job start` 与其 `bash` 一致，不经逐次审批。

#### Scenario: explore 无法启动后台命令
- **WHEN** explore 子 agent 需要执行长期命令
- **THEN** 其工具集中没有 `job`，只能通过需审批的 Bash 调用，未经允许不启动命令

#### Scenario: 审批流程不受影响
- **WHEN** 主会话存在运行中 job，同时 explore 子 agent 提交 Bash 审批
- **THEN** 审批的展示、决定与结算行为与没有 job 时相同
