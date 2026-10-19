# Spec Delta

## ADDED Requirements

### Requirement: provider 启用同步

网关 SHALL 为 TUI/Web 提供服务器级 provider 启用状态的订阅与修改能力，无需 attach 会话。启用状态 SHALL 随各 provider 的凭据状态一并发布；修改持久化成功后 SHALL 通知所有已连接前端，断线重连 SHALL 恢复最新状态。网关 MUST 拒绝未知 provider、取消启用 DeepSeek 以及提交非布尔取值的请求，且不发布成功状态。启用变更 SHALL 同步更新模型列表，响应和广播 MUST NOT 包含密钥。

#### Scenario: 双端同步

- **WHEN** Web 启用 OpenRouter 且 TUI 已连接
- **THEN** 两端收到相同的新启用状态，模型列表包含 OpenRouter 模型，无需重启或切换会话

#### Scenario: 无效请求

- **WHEN** 客户端提交未知 provider、取消启用 DeepSeek，或持久化失败
- **THEN** 请求被拒绝并返回不含密钥的错误，原启用状态保持且不向其他前端发布成功状态

#### Scenario: 无会话与重连

- **WHEN** 未 attach 会话的客户端打开模型服务设置，或修改期间断线后重连
- **THEN** 可读取并修改启用状态，重连显示服务端最终状态，不因旧响应覆盖新状态

### Requirement: provider 拒绝错误码

网关 SHALL 将缺少凭据与 provider 未启用两类受理失败分别以 `PROVIDER_KEY_REQUIRED` 与 `PROVIDER_DISABLED` 返回给客户端，消息包含 provider 名称与可操作指引且不含密钥。该错误码 SHALL 对所有目录内 provider 一致，取代 DeepSeek 专属的错误码。

#### Scenario: 缺少凭据

- **WHEN** 会话模型所属 provider 已启用但没有凭据，客户端提交输入
- **THEN** 客户端收到 `PROVIDER_KEY_REQUIRED` 与 provider 名称，输入不被接受

#### Scenario: provider 未启用

- **WHEN** 会话模型所属 provider 未启用，客户端提交输入或手动压缩
- **THEN** 客户端收到 `PROVIDER_DISABLED`，会话状态与历史不变

## MODIFIED Requirements

### Requirement: 凭据配置与同步

网关 SHALL 为 TUI/Web 提供服务器级凭据状态订阅、保存和移除能力，按 provider 分别管理且无需 attach 会话。状态 SHALL 以 provider 标识为键，覆盖目录内全部模型 provider 与 Tavily；每个 provider 的状态 SHALL 包含已保存凭据是否存在、网关环境变量是否配置、生效来源，模型 provider 另含启用状态。任一 provider 变更持久化成功后 SHALL 通知所有已连接前端，断线重连 SHALL 恢复最新状态；响应和广播 MUST NOT 包含密钥。凭据与启用状态的契约变更 SHALL 递增链路协议版本，沿用"协议版本不同即被明确拒绝"的既有约束，不提供回退。

#### Scenario: 双端配置

- **WHEN** Web 保存或移除某 provider 的 Key 且 TUI 已连接
- **THEN** 两端收到相同新状态，后续请求使用同一凭据来源，无需重启或切换会话

#### Scenario: 无会话与重连

- **WHEN** 未 attach 会话的客户端打开设置，或配置期间断线后重连
- **THEN** 可读取并管理各 provider 凭据，重连显示服务端最终状态，不因旧响应覆盖新状态

#### Scenario: 并发和失败

- **WHEN** 两端同时修改凭据，或某次持久化失败
- **THEN** 修改按服务端顺序处理并发布一致状态；失败操作不发布成功状态，错误不回显提交的 Key

#### Scenario: 未知 provider

- **WHEN** 客户端对目录之外的 provider 保存或移除凭据
- **THEN** 操作被拒绝并返回不含密钥的错误，其他 provider 状态不变

#### Scenario: 协议版本递增

- **WHEN** 仍运行协议版本 6 的网关被新版 TUI/Web 连接，或旧版客户端连接新网关
- **THEN** 连接以可识别的协议不兼容原因被拒绝，不进入部分可用状态
