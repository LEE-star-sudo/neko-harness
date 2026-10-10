# Spec Delta

## RENAMED Requirements

- FROM: `### Requirement: 简洁的 DeepSeek 设置页`
- TO: `### Requirement: 凭据设置页`

## MODIFIED Requirements

### Requirement: 凭据设置页

Web 设置页 SHALL 以美观紧凑的多 provider 列表组织凭据配置，风格与所在区域 design tokens 统一。每个 provider 条目 SHALL 提供生效来源（含 keyless 等受限来源）、环境变量配置状态、密码输入、保存、移除保存值和对应的密钥申请链接。页面 SHALL 保留返回入口和简短连接状态，不将 serverId、socket 路径等技术详情作为主要内容。已有 Key MUST NOT 回填，保存或离开页面后清除敏感输入。

#### Scenario: 保存和回退

- **WHEN** 用户在已有环境变量的情况下保存 Key，再移除保存值
- **THEN** 来源由环境变量变为保存值再回到环境变量，环境变量状态始终显示已配置；成功后密码框清空

#### Scenario: 多 provider 展示

- **WHEN** 用户打开设置页且 Tavily 未配置任何 Key
- **THEN** DeepSeek 与 Tavily 条目以一致布局并列展示，Tavily 生效来源显示为 keyless 受限而非"未配置"

#### Scenario: 未配置与操作反馈

- **WHEN** 无 Key 时打开聊天或设置，或者保存期间请求失败
- **THEN** 用户可进入设置，发送前有配置引导；保存期间防止重复提交，失败显示可重试反馈而不宣称已保存或已验证

#### Scenario: 响应式与键盘操作

- **WHEN** 在 1440、1024、768 或 375 像素宽度下使用设置页
- **THEN** 各 provider 条目、输入和按钮无横向溢出，所有操作有可访问名称、可见焦点和完整键盘访问能力
