# Spec Delta

## ADDED Requirements

### Requirement: 简洁的 DeepSeek 设置页

Web 设置页 SHALL 使用蓝粉白风格的 DeepSeek 配置卡，提供生效来源、环境变量配置状态、密码输入、保存、移除保存值和 https://platform.deepseek.com/api_keys 链接。页面 SHALL 保留返回入口和简短连接状态，不将 serverId、socket 路径等技术详情作为主要内容。已有 Key MUST NOT 回填，保存或离开页面后清除敏感输入。

#### Scenario: 保存和回退

- **WHEN** 用户在已有环境变量的情况下保存 Key，再移除保存值
- **THEN** 来源由环境变量变为保存值再回到环境变量，环境变量状态始终显示已配置；成功后密码框清空

#### Scenario: 未配置与操作反馈

- **WHEN** 无 Key 时打开聊天或设置，或者保存期间请求失败
- **THEN** 用户可进入设置，发送前有配置引导；保存期间防止重复提交，失败显示可重试反馈而不宣称已保存或已验证

#### Scenario: 响应式与键盘操作

- **WHEN** 在 1440、1024、768 或 375 像素宽度下使用设置页
- **THEN** 配置卡、输入和按钮无横向溢出，所有操作有可访问名称、可见焦点和完整键盘访问能力

### Requirement: 会话模型与思考强度设置

Web SHALL 在聊天区同一配置面板内提供模型和思考强度选择，选项取自与 TUI 相同的 Pi 能力列表，一次确认提交当前会话配置。面板 SHALL 显示当前值、切换模型后的有效强度及“从下一次请求生效”说明；状态栏展示服务端确认值。设置页的用户级凭据与会话级模型配置 MUST 清楚区分。

#### Scenario: 切换和取消

- **WHEN** 用户从 Flash low 选择 Pro
- **THEN** 草稿强度按 Pi 调整为 high 并显示，确认后模型和强度一并生效；取消不改变会话

#### Scenario: 双端一致

- **WHEN** Pi 1.1.0 下选择 Flash 或 Pro，或 TUI 修改当前会话
- **THEN** Flash 提供 off/low/high/max、Pro 提供 off/high/max；Web 同步实际生效配置，不提供其他档位

#### Scenario: 切换会话与请求失败

- **WHEN** 配置面板打开期间切换会话，或提交失败、返回过期响应
- **THEN** 不向新会话误提交旧草稿，不让旧响应覆盖新会话；失败保持实际生效值并提示重试

#### Scenario: 面板访问

- **WHEN** 用户通过键盘或触屏打开模型面板
- **THEN** 可完成选择和确认，Escape 可取消并恢复焦点，面板在小屏中不越界或遮挡无法访问的操作
