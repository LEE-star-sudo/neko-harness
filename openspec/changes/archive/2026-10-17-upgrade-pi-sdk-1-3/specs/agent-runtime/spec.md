## MODIFIED Requirements

### Requirement: 持久化会话

系统 SHALL 将对话条目、文档与任务状态在展示前原子提交到本地 SQLite 存储，进程重启后重新打开同一存储 MUST 恢复全部会话。本次恢复保证以 Pi 1.3.0 创建的数据为基线；1.2 及更早会话测试数据可清理，不提供跨版本数据或未完成任务兼容。

#### Scenario: 重启恢复

- **WHEN** 使用 Pi 1.3.0 的进程在模型回答途中被杀掉，随后重新启动并打开同一存储文件
- **THEN** 会话记录完整存在，且未完成的 run 可被恢复继续

#### Scenario: 重复提交去重

- **WHEN** 客户端用相同 requestId 重复提交同一条输入
- **THEN** 系统返回已有 submission 而不是创建第二条
