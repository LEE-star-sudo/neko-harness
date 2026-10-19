# Spec Delta

## ADDED Requirements

### Requirement: TUI 模型选择列表

TUI SHALL 提供按 provider 分组、可过滤的 `/model` 选择列表，只列出已启用 provider 的模型，以英语显示。列表 SHALL 按 provider 分组，输入即过滤（匹配模型名、模型 id 与 provider 名），每项显示 `provider/modelId`、上下文窗口、是否支持 Thinking 与图片，并标出当前模型。已启用但缺少 Key 的 provider 项 SHALL 标注 needs key 且不可选，提示通过 `/login` 配置。Enter 确认、Esc 取消，取消不改变会话与草稿。状态栏与页脚的模型名 SHALL 保留厂商前缀以区分不同厂商的同名模型（如 `anthropic/claude-haiku-4.5`）。

#### Scenario: 过滤与选择

- **WHEN** 用户启用 OpenRouter 后输入 `/model`，键入 `haiku` 并按 Enter 选中某项
- **THEN** 列表仅显示匹配模型并保持分组，确认后会话模型更新，状态栏显示服务端确认的 `provider/modelId`

#### Scenario: 缺 Key 的 provider

- **WHEN** OpenRouter 已启用但未配置 Key
- **THEN** 其模型项标注 needs key 且无法被确认，并提示使用 `/login` 配置

#### Scenario: 同名模型区分

- **WHEN** 两个不同厂商的模型短名相同
- **THEN** 列表与页脚保留厂商前缀，用户可区分

#### Scenario: 小窗口

- **WHEN** 在 80x24 或 60x16 下打开列表
- **THEN** 列表滚动且不越界，当前项与过滤输入可见，操作提示可访问

## MODIFIED Requirements

### Requirement: 登录配置

TUI SHALL 提供 `/login` 面板，以两级结构管理凭据：第一级为 provider 列表，覆盖内置模型 provider 目录与单独分组的联网搜索凭据（Tavily），以英语显示每项的启用状态、生效来源（含 keyless 等受限来源）与环境变量配置状态，支持过滤；第二级为所选 provider 的遮罩密钥输入、保存、移除保存值及对应申请链接引导入口。模型 provider SHALL 可在列表中切换启用（DeepSeek 始终启用且不可取消），启用状态与 Web 同步。密钥 MUST 通过独立输入收集，不作为命令参数或聊天内容。面板 SHALL 保留输入和状态栏，取消后恢复聊天草稿与焦点。

第二级输入非空时 ←/→ SHALL 执行光标移动；返回 provider 列表（Esc 或 Tab）MUST NOT 丢弃未保存的输入。遮罩显示 SHALL 提供可确认粘贴完整性的信息（如已输入字符数），不只渲染星号。面板持有焦点时，密钥输入行 SHALL 在插入点显示与编辑器一致的硬件光标（终端不支持时回退为反色软件光标），遮罩 MUST NOT 因光标泄露密钥内容。保存前 SHALL 自动去除首尾空白；含内部控制字符的密钥 SHALL 以具体原因拒绝。保存或移除失败 SHALL 显示服务端具体错误（不含密钥）；保存或移除成功 SHALL 短暂确认后自动关闭面板并恢复聊天焦点。移除已保存密钥 MUST 经面板内联确认后才执行。

#### Scenario: 首次配置

- **WHEN** 未配置 Key 的用户启动 TUI 并执行 /login，选择 DeepSeek
- **THEN** 可输入并保存 Key，成功后清除敏感输入、短暂显示确认并自动关闭面板，无需重启即可对话

#### Scenario: 启用并配置其他 provider

- **WHEN** 用户在 /login 列表中启用 OpenRouter，进入其输入并保存 Key
- **THEN** OpenRouter 模型出现在 `/model` 列表中且可选；取消启用后其模型从列表消失，已保存 Key 保留

#### Scenario: 锁定 DeepSeek

- **WHEN** 用户尝试取消启用 DeepSeek
- **THEN** 面板拒绝并说明 DeepSeek 始终启用，状态不变

#### Scenario: 切换 provider

- **WHEN** 用户在输入部分内容后返回列表并选择 Tavily
- **THEN** 面板显示 Tavily 的环境变量状态与生效来源（未配置时为 keyless 受限），未保存的输入保留

#### Scenario: 方向键光标移动

- **WHEN** 用户粘贴 Key 后按 ←/→
- **THEN** 光标在输入内移动，内容与当前 provider 均不变化

#### Scenario: 粘贴确认与清洗

- **WHEN** 用户粘贴带首尾空白的长 Key，或粘贴内容含换行等内部控制字符
- **THEN** 前者自动去除首尾空白后可保存；后者以具体原因（如包含换行）拒绝且不改动原凭据；遮罩行始终显示已输入字符数供确认完整性

#### Scenario: 取消和失败

- **WHEN** 用户取消面板或保存失败
- **THEN** 取消不改变凭据并清空敏感输入；失败保留原凭据并显示服务端具体错误与可重试提示，错误不含密钥

#### Scenario: 移除需确认

- **WHEN** 用户对已保存 Key 的 provider 触发移除
- **THEN** 面板先显示内联确认，确认后才移除；取消确认不改变凭据

#### Scenario: 聚焦时显示输入光标

- **WHEN** 用户打开 /login 面板且面板持有焦点
- **THEN** 密钥输入行在插入点显示与编辑器一致的闪烁光标；面板失焦或关闭后光标回到聊天编辑器，渲染输出与文字提取不泄露光标标记或密钥内容

#### Scenario: 小窗口与关闭

- **WHEN** 用户在 80x24 或 60x16 下打开面板、粘贴长 Key，或关闭后异步结果到达
- **THEN** 输入保持遮罩且无越界，操作和状态栏可访问，关闭后的响应不重开面板或夺取焦点
