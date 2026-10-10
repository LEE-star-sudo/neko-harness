# prompt-context Specification

## Purpose

为会话组装分节系统提示词并注入项目上下文：固定五节结构、两级 AGENTS.md、标准化目录下的 skills 渐进式披露，以及请求级资源刷新。

## Requirements

### Requirement: 分节系统提示词

系统 SHALL 以固定顺序的五个命名节组装系统提示词：`preamble`（角色定义）、`rules`（按本次请求启用的工具拼接的规则列表，全局去重）、`project_context`、`skills`、`cwd`（会话工作区绝对路径）。无内容的节 MUST 省略。preamble SHALL 为无标签角色文本，其余节 MUST 自带 XML 标签，同一次请求的所有节 MUST 共享同一次构建结果。

#### Scenario: 新会话首次请求

- **WHEN** 新会话发起第一次模型请求
- **THEN** 系统提示词按 preamble、rules、project_context、skills、cwd 顺序呈现，preamble 为无标签文本，其余节以对应 XML 标签包裹

#### Scenario: 空内容节省略

- **WHEN** 会话工作区与用户目录均无 AGENTS.md
- **THEN** 系统提示词不包含 `project_context` 节，其余节顺序不变

#### Scenario: 规则随工具集变化

- **WHEN** 两次请求之间启用的工具集发生变化
- **THEN** `rules` 节只包含当前启用工具对应的规则，且不存在重复条目

### Requirement: AGENTS.md 发现与注入

系统 SHALL 收集两个位置的 AGENTS.md：`~/.agents/AGENTS.md`（用户级，在前）与 `<workspace>/AGENTS.md`（项目级，在后），每个文件渲染为一个带 `path` 属性的 `<project_instructions>` 块。系统 MUST NOT 向父目录遍历，MUST NOT 识别 AGENTS.md 以外的文件名（无 override、无 CLAUDE.md 回退），MUST NOT 扫描 `.neko` 目录。

#### Scenario: 两级文件共存

- **WHEN** 用户级与项目级 AGENTS.md 都存在
- **THEN** `project_context` 节含两个 `<project_instructions>` 块，用户级在前，路径属性为各自的绝对路径

#### Scenario: 仅项目级存在

- **WHEN** 只有 `<workspace>/AGENTS.md` 存在
- **THEN** `project_context` 节只含该项目级块

#### Scenario: 其他文件名不识别

- **WHEN** 工作区只有 `CLAUDE.md` 或 `AGENTS.override.md`
- **THEN** 这些文件不出现在系统提示词中

### Requirement: Skills 目录发现

系统 SHALL 扫描 `~/.agents/skills/<name>/SKILL.md` 与 `<workspace>/.agents/skills/<name>/SKILL.md` 两个目录。SKILL.md MUST 解析 YAML frontmatter，`description` 缺失或为空时该技能 MUST 被跳过；`name` 缺省时回落到目录名。同名技能项目级 SHALL 覆盖用户级。MUST NOT 支持 `.neko` 目录或裸 `.md` 文件。

#### Scenario: 两级技能合并

- **WHEN** 用户级有技能 a、b，项目级有技能 b、c
- **THEN** 提示词列出 a、b、c 三个技能，其中 b 采用项目级定义

#### Scenario: 无效技能跳过

- **WHEN** 某 SKILL.md 缺少 frontmatter 或 description 为空
- **THEN** 该技能不出现在提示词中，其余技能不受影响

### Requirement: Skills 渐进式披露

系统 SHALL 在 `skills` 节只注入每个技能的 name、description 与 location（SKILL.md 的绝对路径），MUST NOT 内联技能正文；提示词 MUST 指引模型用 `read` 工具按 description 匹配后自行加载技能文件。frontmatter 含 `disable-model-invocation: true` 的技能 MUST NOT 出现在提示词中。

#### Scenario: 元数据注入

- **WHEN** 技能正文有数千行
- **THEN** 提示词中该技能只占 name、description、location 三元组，正文不进上下文

#### Scenario: 禁用模型调用的技能

- **WHEN** 某技能 frontmatter 声明 `disable-model-invocation: true`
- **THEN** 该技能不出现在 `skills` 节

### Requirement: 资源刷新与请求内一致性

系统 SHALL 按会话工作区重新读取 AGENTS.md 与 skills；文件修改、删除和权限变化 MUST 在下一次加载生效，无需显式 reload 或重启。同一次提示词渲染的各节 MUST 共享一次加载结果。

#### Scenario: 编辑后自动生效

- **WHEN** 用户在会话进行中编辑了 `<workspace>/AGENTS.md`，随后发起下一次请求
- **THEN** 该请求的系统提示词包含编辑后的内容

#### Scenario: 新增技能目录

- **WHEN** 用户在会话进行中新建 `<workspace>/.agents/skills/x/SKILL.md`，随后发起下一次请求
- **THEN** `skills` 节包含技能 x

### Requirement: 渲染失败语义

资源读取或解析失败时，对应节 SHALL 返回"省略"而非抛错；单个文件失败 MUST NOT 影响其他文件与其他节。失败 MUST NOT 阻断模型请求。

#### Scenario: 文件不可读

- **WHEN** AGENTS.md 存在但读取失败（权限、编码等）
- **THEN** 该文件对应的块被省略，请求正常继续

#### Scenario: frontmatter 解析失败

- **WHEN** 某 SKILL.md 的 YAML frontmatter 无法解析
- **THEN** 该技能被跳过，其余技能正常注入

#### Scenario: 诊断可见且不暴露正文

- **WHEN** 资源不可读、技能名称含空白或控制字符、frontmatter 非合法映射，或指令文件过大
- **THEN** 诊断只包含路径与固定原因，不包含正文或 YAML 片段；无效技能被跳过，过大指令保留全文且提示历史压缩不能缩短系统输入
