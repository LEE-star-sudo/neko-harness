# Spec Delta

## ADDED Requirements

### Requirement: Web 模型选择器

Web SHALL 提供按 provider 分组、可搜索的模型选择器，取代平铺的模型按钮列表。选择器 SHALL 只列出已启用 provider 的模型，按 provider 折叠分组，顶部提供按模型名、模型 id 与 provider 名的即时搜索；每个模型 SHALL 显示上下文窗口、是否支持图片与思考能力；当前模型所在分组默认展开并定位。已启用但缺少 Key 的 provider 分组 SHALL 标明未配置并提供前往模型服务设置的入口，其模型不可选。

#### Scenario: 分组与搜索

- **WHEN** 用户启用多个 provider 后打开模型选择器并输入 `claude`
- **THEN** 仅显示名称或 id 含 claude 的模型，保持 provider 分组并自动展开命中分组；清空搜索恢复分组视图

#### Scenario: 缺 Key 的 provider

- **WHEN** OpenRouter 已启用但未配置 Key
- **THEN** 其分组显示未配置标记与配置入口，模型不可选；配置完成后无需刷新即变为可选

#### Scenario: 超大列表

- **WHEN** 已启用的 provider 合计包含数百个模型
- **THEN** 分组默认折叠（当前模型所在分组除外），操作不卡顿，无横向溢出

#### Scenario: 键盘与小屏

- **WHEN** 用户仅使用键盘，或在 375 像素宽度下使用选择器
- **THEN** 搜索、分组展开、模型选择与确认均可访问，焦点可见，Escape 取消并恢复焦点

### Requirement: Web 联网搜索设置页

Web SHALL 提供独立的「联网搜索」设置栏目（侧栏菜单项，路径 `/settings/search`），不与模型服务页混排。页面 SHALL 承载搜索服务选择（tavily 默认、deepseek，无 auto）与 Tavily Key 管理（来源、环境变量状态、保存、移除、申请链接）。选择 deepseek 但缺少 DeepSeek Key 时 SHALL 提示并链接到模型服务页的 DeepSeek 条目，页面 MUST NOT 管理 DeepSeek Key。页面 MUST NOT 显示或回填任何密钥。

#### Scenario: 独立入口

- **WHEN** 用户打开设置
- **THEN** 侧栏同时有「模型服务」与「联网搜索」两个独立菜单项，模型服务页中不再出现搜索服务卡片与 Tavily 条目

#### Scenario: 管理 Tavily

- **WHEN** 用户在联网搜索页保存并移除 Tavily Key
- **THEN** 来源在保存值与 keyless（无环境变量时）之间切换，成功后密码框清空，其他 provider 凭据不受影响

#### Scenario: 选择 deepseek 缺少 Key

- **WHEN** 选择 deepseek 且未配置 DeepSeek Key
- **THEN** 页面提示配置 DeepSeek Key 或改选 Tavily，并提供跳转到模型服务页 DeepSeek 条目的链接

## MODIFIED Requirements

### Requirement: 凭据设置页

Web 设置页 SHALL 以美观紧凑的「模型服务」provider 列表组织模型凭据配置，风格与全站统一的蓝粉白 design tokens 一致，侧栏菜单项名称为「模型服务」，路径保持 `/settings`。列表 SHALL 覆盖内置 provider 目录，每个条目提供启用勾选（DeepSeek 始终启用且不可取消）、生效来源、环境变量配置状态、密码输入、保存、移除保存值和对应的密钥申请链接；未启用条目 SHALL 折叠展示且可搜索，不要求先有 Key 才能启用。页面 SHALL 保留返回入口和简短连接状态，不将 serverId、socket 路径等技术详情作为主要内容。已有 Key MUST NOT 回填，保存或离开页面后清除敏感输入。

#### Scenario: 保存和回退

- **WHEN** 用户在已有环境变量的情况下保存 Key，再移除保存值
- **THEN** 来源由环境变量变为保存值再回到环境变量，环境变量状态始终显示已配置；成功后密码框清空

#### Scenario: 启用 provider

- **WHEN** 用户在模型服务页勾选启用 OpenRouter 并保存其 Key
- **THEN** 聊天区模型选择器出现 OpenRouter 分组且模型可选；取消勾选后分组消失，已保存 Key 保留

#### Scenario: 默认与锁定

- **WHEN** 新用户首次打开模型服务页
- **THEN** 仅 DeepSeek 为已启用，其勾选不可取消并说明原因，其余 provider 折叠且未启用

#### Scenario: 多 provider 展示

- **WHEN** 用户打开模型服务页且仅 DeepSeek 已启用
- **THEN** DeepSeek 条目以统一布局展示，其余 provider 以同一布局折叠列出且不要求配置 Key；Tavily 不出现在本页，而在联网搜索页管理

#### Scenario: 未配置与操作反馈

- **WHEN** 无 Key 时打开聊天或设置，或者保存期间请求失败
- **THEN** 用户可进入设置，发送前有配置引导；保存期间防止重复提交，失败显示可重试反馈而不宣称已保存或已验证

#### Scenario: 响应式与键盘操作

- **WHEN** 在 1440、1024、768 或 375 像素宽度下使用设置页
- **THEN** 各 provider 条目、勾选、输入和按钮无横向溢出，所有操作有可访问名称、可见焦点和完整键盘访问能力

### Requirement: 会话模型与思考强度设置

Web SHALL 在聊天区同一配置面板内提供模型和思考强度选择，模型通过按 provider 分组、可搜索的选择器选取，选项取自与 TUI 相同的 Pi 1.3.0 能力列表，一次确认提交当前会话配置。面板 SHALL 显示当前值、切换模型后的有效强度及“从下一次请求生效”说明；输入卡片工具行展示服务端确认值。设置页的用户级凭据与会话级模型配置 MUST 清楚区分。当前会话模型所属 provider 未启用或缺 Key 时，面板与输入卡片 SHALL 明确提示并提供启用 / 配置入口。

#### Scenario: 切换和取消

- **WHEN** 用户从 Flash low 选择 Pro
- **THEN** 草稿强度按 Pi 调整为 high 并显示，确认后模型和强度一并生效；取消不改变会话

#### Scenario: 双端一致

- **WHEN** Pi 1.3.0 下选择 Flash 或 Pro，或 TUI 修改当前会话
- **THEN** Flash 提供 off/low/high/max、Pro 提供 off/high/max；Web 同步实际生效配置，不提供其他档位

#### Scenario: 切换会话与请求失败

- **WHEN** 配置面板打开期间切换会话，或提交失败、返回过期响应
- **THEN** 不向新会话误提交旧草稿，不让旧响应覆盖新会话；失败保持实际生效值并提示重试

#### Scenario: 面板访问

- **WHEN** 用户通过键盘或触屏从输入卡片工具行打开模型面板
- **THEN** 可完成选择和确认，Escape 可取消并恢复焦点，面板在小屏中不越界或遮挡无法访问的操作

#### Scenario: 当前模型 provider 不可用

- **WHEN** 会话使用的 provider 被取消启用或缺少 Key
- **THEN** 输入卡片显示对应提示与入口，发送被拦截并保留草稿；模型面板仍可打开以切换到其他可用模型

### Requirement: Web 搜索服务设置

Web 联网搜索设置页 SHALL 提供「搜索服务」选择卡片，风格与站内 design tokens 一致，可选择 tavily（默认）、deepseek，不提供 auto 选项，并说明各项使用的凭据。卡片 SHALL 显示当前选择及各 provider 的凭据状态；选择 deepseek 但缺少 DeepSeek Key 时 SHALL 提示去模型服务页对应条目配置。选择变更 SHALL 即时保存并同步到其他前端，保存期间防止重复提交，失败显示可重试反馈而不宣称已保存。页面 MUST NOT 显示或回填任何密钥。

#### Scenario: 切换 provider

- **WHEN** 用户在联网搜索页将搜索服务由 tavily 改为 deepseek
- **THEN** 卡片显示当前选择为 deepseek，TUI 同步更新，后续联网调用使用 DeepSeek

#### Scenario: 选择 deepseek 但缺少 Key

- **WHEN** 选择 deepseek 且未配置 DeepSeek Key
- **THEN** 卡片提示需配置 DeepSeek Key 或改选 Tavily，并可跳转到模型服务页的 DeepSeek 条目

#### Scenario: 保存 Key 不改变选择

- **WHEN** 选择为 tavily，用户在模型服务页保存 DeepSeek Key
- **THEN** 联网搜索页的当前选择仍为 tavily

#### Scenario: 保存失败与重复提交

- **WHEN** 保存选择期间再次点击，或请求失败
- **THEN** 重复提交被阻止，失败显示可重试反馈，页面展示的仍是服务端最终选择
