# context-pruning Specification

## Purpose
在不改写会话历史的前提下，按用户配置缩减旧工具结果在模型上下文中的占用，降低长会话的请求规模；默认关闭。

## Requirements

### Requirement: 工具结果裁剪默认关闭且可配置

系统 SHALL 提供配置文件 `context.pruning` 与 UI 保存的同名设置，优先级为已保存值高于配置文件、后者高于内置默认，字段为 `enabled`（布尔，默认 false）、`triggerPercent`（1 至 99，默认 35）、`keepRecent`（非负整数，默认 10）、`minChars`（正整数，默认 4000）、`minSavePercent`（1 至 99，默认 5）。`enabled` 不为 true 时系统 MUST NOT 产生任何裁剪行为，也 MUST NOT 改变模型请求。配置文件中的非法字段或取值 MUST 使启动失败并指明字段，UI 提交的非法值 MUST 被拒绝且不落盘；配置文件变更在下次启动时生效，UI 保存的设置在之后的下一次触发判断即生效。

#### Scenario: 未配置

- **WHEN** 配置文件未设置 `context.pruning`，或 `enabled` 为 false
- **THEN** 不写入任何裁剪条目，模型上下文与升级前一致

#### Scenario: UI 开关即时生效

- **WHEN** 用户在 UI 开启、关闭、调整或恢复默认裁剪设置
- **THEN** 之后的触发判断使用新值，已写入的裁剪不被撤销；关闭后不再产生新的裁剪

#### Scenario: 非法配置

- **WHEN** `context.pruning` 含未知字段，或 `triggerPercent`、`keepRecent`、`minChars`、`minSavePercent` 取值越界或类型错误
- **THEN** 启动失败并给出指明字段的错误

### Requirement: 按占用比例触发的上下文裁剪

开启后，当会话最近一次成功回答反映的上下文占用达到当前模型窗口的 `triggerPercent` 时，系统 SHALL 对该会话在模型上下文中批量替换较旧的工具结果：只替换最近 `keepRecent` 个工具结果之外、文本体积不小于 `minChars` 的结果，替换为说明已省略及原体积的简短占位。裁剪 MUST 通过 pi-durable 的上下文 edits 完成，MUST NOT 删除或改写原始条目；被裁剪结果的工具调用与结果配对 MUST 保持有效。已被裁剪的结果 MUST NOT 被重复裁剪。每次裁剪都会使提供方的前缀缓存从最早被替换的位置起失效，因此只有当本批预计释放的体积（按 DeepSeek 文档的换算：英文字符约 0.3 token、中文字符约 0.6 token 估算）达到当前模型窗口的 `minSavePercent` 时才 SHALL 写入，否则累积到后续触发再合并为一批。

#### Scenario: 超过阈值后批量裁剪

- **WHEN** 开启裁剪且占用达到阈值，较旧的 bash、read 等结果超出保留数量且体积不小于 `minChars`
- **THEN** 这些结果在后续请求的模型上下文中变为占位，近期结果与体积较小的结果保持原样

#### Scenario: 批量不足时不裁剪

- **WHEN** 占用已达触发阈值，但可裁剪结果预计释放的体积不足窗口的 `minSavePercent`
- **THEN** 不写入裁剪条目、模型上下文不变；之后又有结果滑出保留范围而累计足够时，一次性裁剪整批

#### Scenario: 未达阈值

- **WHEN** 占用低于 `triggerPercent`
- **THEN** 不裁剪，模型上下文保持不变，以保护提供方前缀缓存

#### Scenario: 无可裁剪项或重复触发

- **WHEN** 达到阈值但没有满足条件的旧结果，或已全部被裁剪
- **THEN** 不产生新的裁剪条目

#### Scenario: 与压缩共存

- **WHEN** 同一会话同时配置裁剪与压缩，并先后达到各自阈值
- **THEN** 二者独立执行；压缩摘要遵循原生切分，不因裁剪失效，历史仍完整保留

### Requirement: 裁剪不改变用户可见内容

裁剪 SHALL 只影响发送给模型的上下文。TUI、Web、移动端的工具卡片、会话导出和历史翻阅 MUST 继续展示完整的原始工具结果，裁剪条目 MUST NOT 作为聊天项出现，也 MUST NOT 改变会话标题、最近消息时间或用量统计。

#### Scenario: 前端与导出保持完整

- **WHEN** 某工具结果已被裁剪
- **THEN** 各前端和导出仍显示其完整输出，上下文用量在下一次回答后按实际请求规模更新

### Requirement: 裁剪幂等与恢复

裁剪决定 SHALL 以会话内稳定的请求标识提交，进程重启或重复触发不得产生重复裁剪。裁剪写入 MUST 随会话持久化，重启后模型上下文保持一致；写入失败 MUST NOT 使当前运行失败，仅按报告通道记录并在后续触发时重试。

#### Scenario: 重启后保持

- **WHEN** 已发生裁剪的会话在网关重启后继续对话
- **THEN** 模型上下文仍使用占位，且不重复写入裁剪条目

#### Scenario: 写入失败

- **WHEN** 裁剪写入因非致命原因失败
- **THEN** 当前运行继续，失败被报告，下一次触发时重新尝试
