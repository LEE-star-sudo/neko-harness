# Spec Delta

## RENAMED Requirements

- FROM: `### Requirement: DeepSeek 登录配置`
- TO: `### Requirement: 登录配置`

## MODIFIED Requirements

### Requirement: 登录配置

TUI SHALL 提供 `/login` 面板，支持在受支持的 provider（DeepSeek、Tavily）之间切换，以英语显示所选 provider 的环境变量配置状态、生效来源（含 keyless 等受限来源）、遮罩密钥输入、保存、移除保存值及对应申请链接引导入口。密钥 MUST 通过独立输入收集，不作为命令参数或聊天内容。面板 SHALL 保留输入和状态栏，取消后恢复聊天草稿与焦点。

#### Scenario: 首次配置

- **WHEN** 未配置 Key 的用户启动 TUI 并执行 /login
- **THEN** 可输入并保存 Key，成功后清除敏感输入并更新状态，无需重启即可对话

#### Scenario: 切换 provider

- **WHEN** 用户在 /login 面板中从 DeepSeek 切换到 Tavily
- **THEN** 面板显示 Tavily 的环境变量状态与生效来源（未配置时为 keyless 受限），未保存的输入被清除

#### Scenario: 取消和失败

- **WHEN** 用户取消面板或保存失败
- **THEN** 取消不改变凭据并清空敏感输入；失败保留原凭据并显示可重试错误，错误不含密钥

#### Scenario: 小窗口与关闭

- **WHEN** 用户在 80x24 或 60x16 下打开面板、粘贴长 Key，或关闭后异步结果到达
- **THEN** 输入保持遮罩且无越界，操作和状态栏可访问，关闭后的响应不重开面板或夺取焦点
