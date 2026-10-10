# Spec Delta

## ADDED Requirements

### Requirement: 会话技能列表服务

会话级聊天服务 SHALL 提供 `skills()` 方法，返回当前会话可用的技能列表（name、description、SKILL.md 绝对路径），供前端补全使用；该列表 MUST 包含禁用模型调用的技能，并随技能文件变化更新。

#### Scenario: 前端拉取技能

- **WHEN** 已 attach 会话的前端调用 `skills()`
- **THEN** 返回该会话工作区与用户级目录合并的技能列表

#### Scenario: 技能文件变化

- **WHEN** 会话进行中技能文件新增或修改，前端再次调用 `skills()`
- **THEN** 返回更新后的列表
