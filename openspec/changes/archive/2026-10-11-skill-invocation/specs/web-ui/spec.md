# Spec Delta

## ADDED Requirements

### Requirement: Web 技能命令菜单

Web composer SHALL 在输入 `/`、`/skill` 或 `/skill:` 前缀时于命令菜单中列出当前会话的技能（名称与描述），选中后填入 `/skill:<name> `；提交时 MUST 原样发送，展开由 core 完成。

#### Scenario: 菜单列出技能

- **WHEN** 用户在输入框键入 `/skill` 或 `/skill:`
- **THEN** 菜单列出当前会话的技能条目及其描述

#### Scenario: 选中填入

- **WHEN** 用户通过方向键、鼠标、Enter 或 Tab 选中某技能条目
- **THEN** 输入框变为 `/skill:<name> `，等待参数输入

#### Scenario: 原样提交

- **WHEN** 用户提交 `/skill:pdf 参数`
- **THEN** 原文发送给 gateway，不在客户端展开


#### Scenario: 加载与连接恢复

- **WHEN** 技能列表正在加载、加载失败、没有匹配项，或会话连接恢复
- **THEN** 菜单显示对应反馈而非消失；连接就绪或重新打开菜单后重新查询，旧会话响应不覆盖新会话

#### Scenario: 空工作区

- **WHEN** 当前工作区尚未建立会话且用户查询技能
- **THEN** 菜单提示先新建会话，不伪造空技能列表
