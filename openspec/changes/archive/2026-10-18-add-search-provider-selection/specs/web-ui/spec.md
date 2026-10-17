## ADDED Requirements

### Requirement: Web 搜索服务设置

Web 设置页 SHALL 在凭据配置旁提供「搜索服务」卡片，风格与站内 design tokens 一致，可选择 tavily（默认）、deepseek，不提供 auto 选项，并说明各项使用的凭据。卡片 SHALL 显示当前选择及各 provider 的凭据状态；选择 deepseek 但缺少 DeepSeek Key 时 SHALL 提示去对应凭据条目配置。选择变更 SHALL 即时保存并同步到其他前端，保存期间防止重复提交，失败显示可重试反馈而不宣称已保存。页面 MUST NOT 显示或回填任何密钥。

#### Scenario: 切换 provider

- **WHEN** 用户在设置页将搜索服务由 tavily 改为 deepseek
- **THEN** 卡片显示当前选择为 deepseek，TUI 同步更新，后续联网调用使用 DeepSeek

#### Scenario: 选择 deepseek 但缺少 Key

- **WHEN** 选择 deepseek 且未配置 DeepSeek Key
- **THEN** 卡片提示需配置 DeepSeek Key 或改选 Tavily，并可跳转到下方 DeepSeek 凭据条目

#### Scenario: 保存 Key 不改变选择

- **WHEN** 选择为 tavily，用户在同一页保存 DeepSeek Key
- **THEN** 卡片的当前选择仍为 tavily

#### Scenario: 保存失败与重复提交

- **WHEN** 保存选择期间再次点击，或请求失败
- **THEN** 重复提交被阻止，失败显示可重试反馈，页面展示的仍是服务端最终选择
