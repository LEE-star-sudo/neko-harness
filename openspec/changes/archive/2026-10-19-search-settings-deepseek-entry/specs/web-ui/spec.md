## MODIFIED Requirements

### Requirement: Web 搜索服务设置

Web 联网搜索设置页 SHALL 提供「搜索服务」选择卡片，风格与站内 design tokens 一致，可选择 tavily（默认）、deepseek，不提供 auto 选项，并说明各项使用的凭据。卡片 SHALL 显示当前选择及各 provider 的凭据状态；选择 deepseek 但缺少 DeepSeek Key 时 SHALL 提示在本页的 DeepSeek 凭据卡配置，或改选 Tavily。选择变更 SHALL 即时保存并同步到其他前端，保存期间防止重复提交，失败显示可重试反馈而不宣称已保存。页面 MUST NOT 显示或回填任何密钥。

#### Scenario: 切换 provider

- **WHEN** 用户在联网搜索页将搜索服务由 tavily 改为 deepseek
- **THEN** 卡片显示当前选择为 deepseek，TUI 同步更新，后续联网调用使用 DeepSeek

#### Scenario: 选择 deepseek 但缺少 Key

- **WHEN** 选择 deepseek 且未配置 DeepSeek Key
- **THEN** 卡片提示需在本页 DeepSeek 凭据卡配置 Key 或改选 Tavily，不要求离开本页

#### Scenario: 保存 Key 不改变选择

- **WHEN** 选择为 tavily，用户在联网搜索页保存 DeepSeek Key
- **THEN** 当前选择仍为 tavily

#### Scenario: 保存失败与重复提交

- **WHEN** 保存选择期间再次点击，或请求失败
- **THEN** 重复提交被阻止，失败显示可重试反馈，页面展示的仍是服务端最终选择

### Requirement: Web 联网搜索设置页

Web SHALL 提供独立的「联网搜索」设置栏目（侧栏菜单项，路径 `/settings/search`），不与模型服务页混排。页面 SHALL 承载搜索服务选择（tavily 默认、deepseek，无 auto），并 SHALL 始终同时显示 Tavily 与 DeepSeek 两张凭据卡，各自管理 Key（来源、环境变量状态、保存、移除、申请链接），与当前选择无关。DeepSeek 凭据卡 SHALL 说明该 Key 与「模型服务」共用，在任一页面保存或移除都对另一页生效；该卡 MUST NOT 提供 provider 启用开关。页面 MUST NOT 显示或回填任何密钥。

#### Scenario: 独立入口

- **WHEN** 用户打开设置
- **THEN** 侧栏同时有「模型服务」与「联网搜索」两个独立菜单项，模型服务页中不再出现搜索服务卡片与 Tavily 条目

#### Scenario: 管理 Tavily

- **WHEN** 用户在联网搜索页保存并移除 Tavily Key
- **THEN** 来源在保存值与 keyless（无环境变量时）之间切换，成功后密码框清空，其他 provider 凭据不受影响

#### Scenario: 选择 tavily 时仍可配置 DeepSeek

- **WHEN** 当前搜索服务为 tavily，用户打开联网搜索页
- **THEN** 页面显示 DeepSeek 凭据卡及其当前来源，用户可直接保存 DeepSeek Key，无需前往模型服务页

#### Scenario: DeepSeek Key 与模型服务共用

- **WHEN** 用户在联网搜索页保存 DeepSeek Key
- **THEN** 模型服务页的 DeepSeek 条目同步显示已保存，TUI 的 /login 也显示同一状态；移除后各处同步回退为环境变量或无 Key

#### Scenario: 选择 deepseek 缺少 Key

- **WHEN** 选择 deepseek 且未配置 DeepSeek Key
- **THEN** 页面提示配置 DeepSeek Key 或改选 Tavily，指向本页的 DeepSeek 凭据卡
