# Spec Delta

## Purpose

让用户以 `/skill:name [args]` 显式调用技能：core 在准入层把命令展开为结构化用户消息，前端可查询当前会话可用的技能列表。

## ADDED Requirements

### Requirement: 技能命令展开

系统 SHALL 在会话准入层展开以 `/skill:` 开头的纯文本输入：按名称查找技能，命中时把提交内容替换为 `<skill name="..." location="...">` XML 块——块内首行声明 `References are relative to <baseDir>.`（SKILL.md 所在目录），随后是去除 frontmatter 的正文；空格后的参数原样追加在 `</skill>` 之后。展开 MUST 只作用于纯文本输入，含图片等内容块的输入 MUST NOT 展开。

#### Scenario: 命中技能

- **WHEN** 用户提交 `/skill:pdf 总结一下这份文档`，且技能 pdf 存在
- **THEN** 模型收到的用户消息是 `<skill name="pdf" location="...">` 块加正文，块后追加 `总结一下这份文档`

#### Scenario: 无参数调用

- **WHEN** 用户提交 `/skill:pdf`
- **THEN** 用户消息只有 skill 块，无追加内容

#### Scenario: 图片混合输入不展开

- **WHEN** 用户提交以 `/skill:pdf` 开头且带图片内容块的输入
- **THEN** 输入原样提交，不做展开

### Requirement: 未知技能透传

`/skill:` 后的名称未命中任何技能时，系统 SHALL 原样提交输入文本，MUST NOT 报错或阻断提交。

#### Scenario: 技能不存在

- **WHEN** 用户提交 `/skill:nonexistent hello`
- **THEN** 模型收到原文 `/skill:nonexistent hello`

### Requirement: 禁用模型调用技能的显式可达

frontmatter 含 `disable-model-invocation: true` 的技能 MUST 可从 `/skill:` 展开，即使它不出现在系统提示词的技能列表中。

#### Scenario: 显式调用隐藏技能

- **WHEN** 技能 hidden 声明了 `disable-model-invocation: true`，用户提交 `/skill:hidden`
- **THEN** 该技能正常展开为 `<skill>` 块

### Requirement: 两级技能解析

展开与列表查询 SHALL 使用与系统提示词注入相同的技能集合：`~/.agents/skills/` 与 `<会话工作区>/.agents/skills/`，同名技能项目级覆盖用户级，文件修改在下一次展开或查询时生效。

#### Scenario: 项目级覆盖

- **WHEN** 用户级与工作区级存在同名技能，内容不同
- **THEN** `/skill:` 展开使用工作区级版本的正文

### Requirement: 技能列表查询

系统 SHALL 提供按会话查询技能列表的能力，返回每个技能的 name、description 与 SKILL.md 绝对路径，包含 `disable-model-invocation` 技能。

#### Scenario: 查询当前会话技能

- **WHEN** 前端请求某会话的技能列表
- **THEN** 返回该会话工作区与用户级目录合并后的技能（name、description、location）

#### Scenario: 文件变化后查询

- **WHEN** 技能文件在会话进行中新增或修改后再次查询
- **THEN** 返回最新的技能列表
