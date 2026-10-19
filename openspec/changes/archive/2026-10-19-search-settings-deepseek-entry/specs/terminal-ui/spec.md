## MODIFIED Requirements

### Requirement: TUI 搜索 provider 面板

TUI SHALL 提供 `/search` 命令，打开与统一选择面板风格一致的搜索 provider 面板，以英语列出 tavily、deepseek，标出当前选择，并始终显示各 provider 的凭据状态（已保存、环境变量、keyless、无 Key 等）。面板 SHALL 提供 `k` 快捷键（过滤框为空时），对高亮的 provider 关闭本面板并打开 `/login` 的该 provider 密钥输入；DeepSeek 缺少 Key 时的提示 SHALL 指向该快捷键与 `/login`。Enter SHALL 确认选择，Esc SHALL 取消；确认后面板自动关闭并短暂提示结果。面板自身 MUST NOT 收集或显示密钥，打开与关闭不改变主草稿、附件与输入历史浏览状态。`/search` SHALL 出现在命令补全与 `/help` 中，`/help` SHALL 提及 `k`。

#### Scenario: 查看与切换

- **WHEN** 用户输入 `/search`，选中 deepseek 并按 Enter
- **THEN** 选择保存为 deepseek，面板关闭并提示结果，后续联网工具调用使用 DeepSeek；输入框草稿保持不变

#### Scenario: 默认选择

- **WHEN** 从未选择过 provider 时打开 `/search`
- **THEN** 面板标出 tavily 为当前选择，不存在 auto 选项

#### Scenario: DeepSeek 缺少 Key

- **WHEN** DeepSeek 未配置 Key 时查看 deepseek 项
- **THEN** 面板提示按 `k` 或通过 `/login` 配置 DeepSeek Key，不声称搜索可用

#### Scenario: 直达密钥输入

- **WHEN** 用户在 `/search` 高亮 deepseek 并按 `k`
- **THEN** 搜索面板关闭，`/login` 面板打开并直接进入 DeepSeek 的密钥输入；Esc 返回 `/login` 列表，主草稿保持不变

#### Scenario: 保存失败

- **WHEN** 保存选择失败
- **THEN** 面板显示不含密钥的错误并保持原选择，可重试或取消

#### Scenario: 多端同步

- **WHEN** 面板打开期间另一端更改了选择或 DeepSeek Key
- **THEN** 面板更新为最新选择与凭据状态，未确认的高亮项保留
- **THEN** 时间文字自动刷新但不移动选中项；关闭面板后停止其定时刷新

### Requirement: 登录配置

TUI SHALL 提供 `/login` 面板，以两级结构管理凭据：第一级为 provider 列表，覆盖内置模型 provider 目录与单独分组的联网搜索凭据（Tavily 与 DeepSeek），以英语显示每项的启用状态、生效来源（含 keyless 等受限来源）与环境变量配置状态，支持过滤；第二级为所选 provider 的遮罩密钥输入、保存、移除保存值及对应申请链接引导入口。DeepSeek SHALL 同时出现在「Model providers」与「Web search」分组，两处是同一份凭据：来源与状态一致，任一处保存或移除后另一处同步，进入后是同一个密钥输入。模型 provider SHALL 可在列表中切换启用（DeepSeek 始终启用且不可取消），启用状态与 Web 同步；「Web search」分组中的项没有启用开关。密钥 MUST 通过独立输入收集，不作为命令参数或聊天内容。面板 SHALL 保留输入和状态栏，取消后恢复聊天草稿与焦点。

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

#### Scenario: 搜索分组中的 DeepSeek

- **WHEN** 用户打开 /login，在「Web search」分组选中 DeepSeek 并按 Enter
- **THEN** 进入 DeepSeek 的密钥输入，保存后「Model providers」分组中的 DeepSeek 同步显示已保存；在该分组按 Space 不切换任何状态并提示它共用 DeepSeek 凭据

#### Scenario: 过滤同时匹配两个分组

- **WHEN** 用户在过滤框输入 deepseek
- **THEN** 列表中 DeepSeek 在两个分组各出现一次，高亮与 Enter 作用于当前高亮的那一行

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
