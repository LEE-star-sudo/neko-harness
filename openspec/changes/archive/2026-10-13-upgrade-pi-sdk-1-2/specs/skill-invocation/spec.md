# Spec Delta

## MODIFIED Requirements

### Requirement: 技能命令展开

系统 SHALL 在会话准入层展开以 `/skill:` 开头的纯文本输入：按名称查找技能，命中时生成 `<skill name="..." location="...">` XML 块，块内首行声明 `References are relative to <baseDir>.`，随后为去除 frontmatter 的正文，参数原样追加于 `</skill>` 之后。展开 SHALL 同时生成 name、location、body、args 展示元数据，与输入同次持久提交，供前端直接渲染；不得从模型文本反向解析。展开 MUST 只作用于纯文本输入，含图片等内容块的输入 MUST NOT 展开。

#### Scenario: 命中技能

- **WHEN** 用户提交 `/skill:pdf 总结一下这份文档`，且技能 pdf 存在
- **THEN** 模型收到 `<skill name="pdf" location="...">` 块加正文及参数；前端获得同次读取产生的结构化技能展示数据

#### Scenario: 无参数调用

- **WHEN** 用户提交 `/skill:pdf`
- **THEN** 用户消息只有 skill 块，无追加内容；展示元数据的 args 为空

#### Scenario: 图片混合输入不展开

- **WHEN** 用户提交以 `/skill:pdf` 开头且带图片内容块的输入
- **THEN** 输入原样提交，不做展开，也不生成技能卡片元数据

#### Scenario: 手工输入同类文本

- **WHEN** 用户手工输入完整或不完整的 `<skill>` XML，而非成功展开的技能命令
- **THEN** 按普通消息保留原文，不依据文本内容伪造技能调用卡片

#### Scenario: 排队与持久恢复

- **WHEN** 成功展开的技能输入排队后重启，或在放入上下文后分叉会话
- **THEN** 模型文本及对应展示元数据保持同源；排队不提前切换活动资源快照，重启后的系统资源仍按当前磁盘重建
