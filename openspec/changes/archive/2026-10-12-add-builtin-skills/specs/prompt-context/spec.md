# Spec Delta

## MODIFIED Requirements

### Requirement: Skills 目录发现

系统 SHALL 扫描三个位置的技能目录：`~/.agents/skills/<name>/SKILL.md`（用户级）、`<workspace>/.agents/skills/<name>/SKILL.md`（项目级）与随包分发的内置技能目录（内置级）。SKILL.md MUST 解析 YAML frontmatter，`description` 缺失或为空时该技能 MUST 被跳过；`name` 缺省时回落到目录名。同名技能优先级 SHALL 为项目级 > 用户级 > 内置级。MUST NOT 支持 `.neko` 目录或裸 `.md` 文件。内置级目录缺失时 MUST 静默视为空集。

#### Scenario: 两级技能合并

- **WHEN** 用户级有技能 a、b，项目级有技能 b、c
- **THEN** 提示词列出 a、b、c 三个技能，其中 b 采用项目级定义

#### Scenario: 内置级兜底

- **WHEN** 内置级有技能 d，用户级与项目级均无同名技能
- **THEN** 提示词列出技能 d

#### Scenario: 三级同名优先级

- **WHEN** 内置级、用户级、项目级各有一个同名技能 e，内容不同
- **THEN** 提示词中 e 采用项目级定义

#### Scenario: 内置目录缺失

- **WHEN** 内置级目录不存在
- **THEN** 用户级与项目级技能正常发现，无告警

#### Scenario: 无效技能跳过

- **WHEN** 某 SKILL.md 缺少 frontmatter 或 description 为空
- **THEN** 该技能不出现在提示词中，其余技能不受影响
