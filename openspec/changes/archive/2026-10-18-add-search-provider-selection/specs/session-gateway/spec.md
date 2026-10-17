## ADDED Requirements

### Requirement: 搜索设置同步

网关 SHALL 为 TUI/Web 提供服务器级搜索设置的状态订阅与修改能力，无需 attach 会话。状态 SHALL 包含当前选择（tavily、deepseek），凭据的保存或移除 MUST NOT 改变它。修改持久化成功后 SHALL 通知所有已连接前端，断线重连 SHALL 恢复最新状态；响应和广播 MUST NOT 包含密钥。新增该服务 SHALL 递增链路协议版本，沿用"协议版本不同即被明确拒绝"的既有约束，不提供回退。

#### Scenario: 双端同步

- **WHEN** Web 将搜索 provider 改为 tavily 且 TUI 已连接
- **THEN** 两端收到相同的新选择，后续工具调用使用 Tavily，无需重启或切换会话

#### Scenario: 凭据变化不影响选择

- **WHEN** 选择为 deepseek，某前端保存或移除 DeepSeek Key
- **THEN** 所有前端的搜索选择保持 deepseek 不变

#### Scenario: 无会话与重连

- **WHEN** 未 attach 会话的客户端打开搜索设置，或修改期间断线后重连
- **THEN** 可读取并修改设置，重连显示服务端最终状态，不因旧响应覆盖新状态

#### Scenario: 持久化失败与无效取值

- **WHEN** 搜索设置持久化失败，或提交未知 provider 取值
- **THEN** 操作被拒绝并返回不含密钥的错误，不发布成功状态，原选择保持不变

#### Scenario: 协议版本递增

- **WHEN** 仍运行上一协议版本的网关被新版 TUI/Web 连接，或旧版客户端连接新网关
- **THEN** 连接以可识别的协议不兼容原因被拒绝，不进入部分可用状态
