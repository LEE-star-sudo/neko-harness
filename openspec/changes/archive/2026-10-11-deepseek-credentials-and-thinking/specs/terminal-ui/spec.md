# Spec Delta

## ADDED Requirements

### Requirement: DeepSeek 登录配置

TUI SHALL 提供 `/login` 面板，以英语显示环境变量配置状态、生效来源、遮罩密钥输入、保存、移除保存值及 https://platform.deepseek.com/api_keys 引导入口。密钥 MUST 通过独立输入收集，不作为命令参数或聊天内容。面板 SHALL 保留输入和状态栏，取消后恢复聊天草稿与焦点。

#### Scenario: 首次配置

- **WHEN** 未配置 Key 的用户启动 TUI 并执行 /login
- **THEN** 可输入并保存 Key，成功后清除敏感输入并更新状态，无需重启即可对话

#### Scenario: 取消和失败

- **WHEN** 用户取消面板或保存失败
- **THEN** 取消不改变凭据并清空敏感输入；失败保留原凭据并显示可重试错误，错误不含密钥

#### Scenario: 小窗口与关闭

- **WHEN** 用户在 80x24 或 60x16 下打开面板、粘贴长 Key，或关闭后异步结果到达
- **THEN** 输入保持遮罩且无越界，操作和状态栏可访问，关闭后的响应不重开面板或夺取焦点

### Requirement: 基于模型能力的思考选择

TUI SHALL 使用网关提供的 Pi 能力列表显示当前模型的思考选项。`/think` SHALL 打开选择面板，`/think <level>` SHALL 仅接受当前列表内的值；无效值提供有效选项提示。模型切换造成的强度调整 SHALL 与 Web 一致，状态栏显示服务端确认的实际值。

#### Scenario: Pro 强度选择

- **WHEN** Pi 1.1.0 下当前模型为 Pro，用户打开 /think 或输入 /think low
- **THEN** 面板仅列 off/high/max；low 命令被拒绝并提示有效选项，不伪装为已设置 low

#### Scenario: 切换与同步

- **WHEN** Flash low 切为 Pro，或 Web 改变同一会话强度
- **THEN** TUI 展示服务端确认的配置，模型切换按 Pi 调整为 high，取消选择保留原配置与草稿
