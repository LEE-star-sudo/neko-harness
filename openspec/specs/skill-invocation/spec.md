# skill-invocation Specification

## Purpose

让用户以 `/skill:name [args]` 显式调用技能：core 在准入层把命令展开为结构化用户消息，前端可查询当前会话可用的技能列表。

## Requirements

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

### Requirement: 多级技能解析

展开与查询 SHALL 沿用三级发现规则，同名优先级为项目级 > 用户级 > 内置级。被显式调用的技能正文与元数据 MUST 从同一次文件读取取得，读取间不得重新读正文。准备快照在对应输入进入上下文后生效；同批多输入以最后一个快照决定系统元数据，各已展开正文不变。列表查询 MUST 直读最新文件且不改变会话快照。文件修改在下一次展开或查询时体现；重启后资源按当前磁盘重建。

#### Scenario: 项目级覆盖

- **WHEN** 用户级与工作区级存在同名技能，内容不同
- **THEN** `/skill:` 展开使用工作区级版本的正文

#### Scenario: 内置级被覆盖

- **WHEN** 内置级与用户级存在同名技能，内容不同
- **THEN** `/skill:` 展开使用用户级版本的正文

#### Scenario: 展开与系统节同源

- **WHEN** 用户提交 `/skill:pdf`，展开完成后、模型请求发出前 pdf 的 SKILL.md 被修改
- **THEN** 该请求 `skills` 节中 pdf 的元数据与展开所用版本一致

#### Scenario: 扫描与展开之间文件变化

- **WHEN** 已扫描显式调用的 SKILL.md，随后在展开前修改该文件
- **THEN** 展开正文仍来自扫描时的文件文本，不混合两个版本

#### Scenario: 多个排队技能输入

- **WHEN** 同名技能两个版本分别展开为两个 followUp 输入，并依次进入上下文
- **THEN** 两条用户消息保留各自正文版本，对应的活动系统元数据按 placement 顺序切换

#### Scenario: 查询不影响进行中的 run

- **WHEN** 会话 run 进行中新增了一个技能，前端随后查询技能列表
- **THEN** 查询结果包含新技能，该 run 后续请求的 `skills` 节不变

### Requirement: 技能列表查询

系统 SHALL 提供按会话查询技能列表的能力，返回每个技能的 name、description、SKILL.md 绝对路径与来源级别（项目级/用户级/内置级），包含 `disable-model-invocation` 技能。

#### Scenario: 查询当前会话技能

- **WHEN** 前端请求某会话的技能列表
- **THEN** 返回该会话工作区、用户级目录与内置目录合并后的技能（name、description、location、level）

#### Scenario: 内置技能级别标识

- **WHEN** 当前会话的技能列表包含内置技能
- **THEN** 该技能条目的级别字段为内置级

#### Scenario: 文件变化后查询

- **WHEN** 技能文件在会话进行中新增或修改后再次查询
- **THEN** 返回最新的技能列表
