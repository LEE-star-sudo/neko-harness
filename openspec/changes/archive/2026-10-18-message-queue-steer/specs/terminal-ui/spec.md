# Spec Delta

## MODIFIED Requirements

### Requirement: 消息插话

系统 SHALL 支持在 agent 工作中提交消息：忙时提交一律排队（follow-up，等待当前 run 结束），与 Web、移动端一致；已排队的消息可再被改为 steer（插入当前工具轮之后）或撤回。提交时 MUST NOT 要求预先选择 steer。

#### Scenario: steer 打断

- **WHEN** agent 执行中用户提交消息，随后把该排队消息改为 steer
- **THEN** 该消息在当前工具轮结束后加入进行中的工作

#### Scenario: 默认排队

- **WHEN** agent 执行中用户按 Enter 提交消息
- **THEN** 该消息排队，在当前回答结束后开始下一轮

### Requirement: 一致的终端显示语言
TUI 自有命令说明、状态、操作提示、选择面板与错误上下文 SHALL 使用英语；用户内容、模型回答及原始工具输出 MUST 保留原文。明暗主题 SHALL 使用一致的语义角色，焦点和选中状态不能仅靠颜色识别；快捷键提示 MUST 对应实际行为。

#### Scenario: 忙碌快捷键
- **WHEN** agent 正在运行
- **THEN** 提示 Enter Queue、Esc Stop，Ctrl+C 若中止运行则不得标为退出；有排队消息时排队区提示 Alt+↑ 可选择

#### Scenario: 非英语内容与主题切换
- **WHEN** 用户提交中文并切换明暗主题
- **THEN** 用户内容保持中文，产品控件保持英语，选中项有可见标记且文本可读

## ADDED Requirements

### Requirement: TUI 排队消息选择、引导与撤回

TUI SHALL 在编辑器上方显示当前会话排队输入（最新的靠近编辑器，每项以英语标注 Steer 或 Queued 并显示截断到单行的文字预览，更多项以数量摘要提示），并在同一区域给出按键提示；无排队项时不占位。用户 SHALL 能用 Alt+↑ 直接选中排队区的最新一项，↑/↓ 在排队消息间移动（↓ 越过最新一项即离开选择）；选中后 Enter 把 Queued 项改为 Steer，Esc 只撤回该条并把文字取回编辑器（编辑器非空时追加到新行），其他按键离开选择并照常作用于编辑器。选择期间的 Esc MUST NOT 停止运行或撤回其他排队项；不在选择状态时 Esc 保持停止运行并撤回全部排队项。图片引用不恢复，并以英语提示。

#### Scenario: 发送后可见

- **WHEN** 运行中用户按 Enter 发送一条消息
- **THEN** 编辑器清空，排队区显示 Queued 及该消息预览，消息进入 transcript 后消失

#### Scenario: 选中并引导

- **WHEN** 用户按 Alt+↑ 选中排队区一项并按 Enter
- **THEN** 该项变为 Steer 并仍处于选中，当前运行与其他排队项不变，已是 Steer 的项按 Enter 只提示无需重复引导

#### Scenario: 选中并撤回

- **WHEN** 用户选中排队区一项并按 Esc
- **THEN** 仅该项被撤回，文字回到编辑器，当前运行继续，其余排队项不变

#### Scenario: 离开选择

- **WHEN** 用户在选择状态下输入普通字符或按 ↓ 越过最新一项
- **THEN** 选择结束，普通字符进入编辑器，排队项不变

#### Scenario: 已被放入

- **WHEN** 引导或撤回时该消息刚进入 transcript
- **THEN** 显示英语提示说明该消息已发送，编辑器内容不变

#### Scenario: 旧网关与窄终端

- **WHEN** TUI 连接不提供排队列表的旧网关，或窗口很窄
- **THEN** 旧网关下不显示排队区、Alt+↑ 无作用，窄窗口下排队行截断而不换行溢出，发送与停止照常
