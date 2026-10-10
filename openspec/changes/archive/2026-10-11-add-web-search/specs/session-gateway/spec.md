# Spec Delta

## MODIFIED Requirements

### Requirement: 凭据配置与同步

网关 SHALL 为 TUI/Web 提供服务器级凭据状态订阅、保存和移除能力，按 provider 分别管理且无需 attach 会话。每个 provider 的状态 SHALL 包含已保存凭据是否存在、网关环境变量是否配置及生效来源。任一 provider 变更持久化成功后 SHALL 通知所有已连接前端，断线重连 SHALL 恢复最新状态；响应和广播 MUST NOT 包含密钥。

#### Scenario: 双端配置

- **WHEN** Web 保存或移除某 provider 的 Key 且 TUI 已连接
- **THEN** 两端收到相同新状态，后续请求使用同一凭据来源，无需重启或切换会话

#### Scenario: 无会话与重连

- **WHEN** 未 attach 会话的客户端打开设置，或配置期间断线后重连
- **THEN** 可读取并管理各 provider 凭据，重连显示服务端最终状态，不因旧响应覆盖新状态

#### Scenario: 并发和失败

- **WHEN** 两端同时修改凭据，或某次持久化失败
- **THEN** 修改按服务端顺序处理并发布一致状态；失败操作不发布成功状态，错误不回显提交的 Key
