# Spec Delta

## ADDED Requirements

### Requirement: 技能命令补全

TUI SHALL 在输入 `/skill:` 前缀时提供当前会话技能的动态补全，条目为 `skill:<name>` 并展示技能 description；技能列表在会话切换后刷新。提交 `/skill:...` 输入时 MUST 原样发送，展开由 core 完成。

#### Scenario: 补全技能名

- **WHEN** 用户输入 `/skill:p`
- **THEN** 补全候选包含名称以 p 匹配的技能，附描述

#### Scenario: 原样提交

- **WHEN** 用户提交 `/skill:pdf 参数`
- **THEN** TUI 把原文发送给 gateway，不在本地展开

#### Scenario: 切换会话

- **WHEN** 用户切换到另一个工作区的会话
- **THEN** 补全候选反映新会话的技能列表
