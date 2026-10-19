# Spec Delta

## MODIFIED Requirements

### Requirement: 凭据设置页

Web 设置页 SHALL 以美观紧凑的「模型服务」页组织模型凭据配置，风格与全站统一的蓝粉白 design tokens 一致，侧栏菜单项名称为「模型服务」，路径保持 `/settings`。页面 SHALL 提供可键入搜索的 provider 下拉，覆盖内置 provider 目录，每项标注已启用/未启用与 Key 状态；选中某 provider 后页面只显示该 provider 的凭据卡，卡内提供启用勾选（DeepSeek 始终启用且不可取消）、生效来源、环境变量配置状态、密码输入、保存、移除保存值和对应的密钥申请链接，不要求先有 Key 才能启用。深链 `/settings#credential-<provider>` SHALL 选中并定位该 provider。页面 SHALL 保留返回入口和简短连接状态，不将 serverId、socket 路径等技术详情作为主要内容。已有 Key MUST NOT 回填，保存或离开页面后清除敏感输入。

#### Scenario: 保存和回退

- **WHEN** 用户在已有环境变量的情况下保存 Key，再移除保存值
- **THEN** 来源由环境变量变为保存值再回到环境变量，环境变量状态始终显示已配置；成功后密码框清空

#### Scenario: 启用 provider

- **WHEN** 用户在模型服务页下拉选中 OpenRouter，勾选启用并保存其 Key
- **THEN** 聊天区模型选择器的 provider 下拉出现 OpenRouter 且模型可选；取消勾选后该项消失，已保存 Key 保留

#### Scenario: 默认与锁定

- **WHEN** 新用户首次打开模型服务页
- **THEN** 默认选中 DeepSeek，其勾选不可取消并说明原因；其余 provider 在下拉中标为未启用

#### Scenario: provider 下拉与搜索

- **WHEN** 用户打开 provider 下拉并输入 `open`
- **THEN** 列表只含名称、id 或环境变量名匹配的 provider（如 OpenRouter、OpenAI、OpenCode Go/Zen），选中其一后页面只显示该 provider 的凭据卡；Tavily 不出现在本页，而在联网搜索页管理

#### Scenario: 多 provider 展示

- **WHEN** 用户打开模型服务页且仅 DeepSeek 已启用
- **THEN** 页面显示 DeepSeek 的凭据卡，其余 provider 在下拉中以同一格式列出为未启用且不要求配置 Key；不会同时堆叠多个 provider 的卡片

#### Scenario: 深链定位

- **WHEN** 用户从模型选择器、输入卡片或联网搜索页打开 `/settings#credential-openrouter`
- **THEN** 页面选中 OpenRouter 并显示其凭据卡且滚动到可见位置，无需手动查找

#### Scenario: 切换 provider 不泄露输入

- **WHEN** 用户在某 provider 的密码框输入内容后切换到另一 provider
- **THEN** 已输入的密钥被清除，不出现在另一 provider 的卡片或浏览器持久存储中

#### Scenario: 未配置与操作反馈

- **WHEN** 无 Key 时打开聊天或设置，或者保存期间请求失败
- **THEN** 用户可进入设置，发送前有配置引导；保存期间防止重复提交，失败显示可重试反馈而不宣称已保存或已验证

#### Scenario: 响应式与键盘操作

- **WHEN** 在 1440、1024、768 或 375 像素宽度下使用设置页
- **THEN** provider 下拉、凭据卡的勾选、输入和按钮无横向溢出，所有操作有可访问名称、可见焦点，下拉可仅用键盘打开、过滤、导航与选定

### Requirement: 会话模型与思考强度设置

Web SHALL 在聊天区同一配置面板内提供模型和思考强度选择，模型通过「provider 下拉 + 紧凑模型列表」且可搜索的选择器选取，选项取自与 TUI 相同的 Pi 1.3.0 能力列表，一次确认提交当前会话配置。面板 SHALL 显示当前值、切换模型后的有效强度及“从下一次请求生效”说明；输入卡片工具行展示服务端确认值。设置页的用户级凭据与会话级模型配置 MUST 清楚区分。当前会话模型所属 provider 未启用或缺 Key 时，面板与输入卡片 SHALL 明确提示并提供启用 / 配置入口。

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

### Requirement: Web 模型选择器

Web SHALL 提供「provider 下拉 + 紧凑模型列表」的模型选择器，取代折叠分组与平铺的模型按钮列表。选择器 SHALL 只列出已启用 provider 的模型；provider 下拉可键入过滤，每项显示模型数，默认选中当前会话模型所属 provider（不可用时选首个可选 provider）。模型列表每项 SHALL 为单行紧凑呈现，显示名称及上下文窗口、是否支持图片与思考能力，并可查看模型 id；当前模型在所选 provider 的列表中高亮并定位。搜索框 SHALL 按模型名、模型 id 与 provider 名即时匹配：有查询词时跨 provider 显示命中模型，按 provider 小标题（不折叠）标注所属 provider，清空后恢复「下拉 + 列表」视图。已启用但缺少 Key 的 provider SHALL 在下拉与列表头标明未配置并提供前往模型服务设置的入口，其模型不可选。

#### Scenario: 下拉切换与列表

- **WHEN** 用户启用多个 provider 后打开模型选择器，在下拉中选择 OpenRouter
- **THEN** 只显示 OpenRouter 的紧凑模型列表，其他 provider 的模型不出现，无需展开或折叠任何分组

#### Scenario: 分组与搜索

- **WHEN** 用户启用多个 provider 后打开模型选择器并输入 `claude`
- **THEN** 仅显示名称或 id 含 claude 的模型，跨 provider 显示并以小标题保留 provider 标注；清空搜索恢复 provider 下拉与单 provider 列表

#### Scenario: 缺 Key 的 provider

- **WHEN** OpenRouter 已启用但未配置 Key
- **THEN** 其下拉项与列表头显示未配置标记与配置入口，模型不可选；配置完成后无需刷新即变为可选

#### Scenario: 超大列表

- **WHEN** 单个 provider 含数百个模型
- **THEN** 列表在固定高度内滚动、操作不卡顿，无横向溢出；已选模型在所属列表中可见

#### Scenario: 键盘与小屏

- **WHEN** 用户仅使用键盘，或在 375 像素宽度下使用选择器
- **THEN** provider 下拉、搜索、模型选择与确认均可访问，焦点可见，Escape 取消并恢复焦点；面板无横向溢出

#### Scenario: 默认选中当前模型的 provider

- **WHEN** 当前会话使用 DeepSeek Flash 时打开选择器
- **THEN** 下拉选中 DeepSeek，列表中 Flash 高亮；若该 provider 已被取消启用，则改选首个可选 provider 并显示不可用提示
