# Spec Delta

## MODIFIED Requirements

### Requirement: 历史条目的过滤与还原

历史条目 SHALL 只包含用户实际键入的文字：子 agent 内部输入 MUST 被排除；后台任务回报输入 MUST 被排除；默认图片提示 MUST NOT 计入；去掉上述内容后为空白的输入 MUST 被忽略；图片附件 MUST NOT 被恢复，仅回填文字。通过技能命令发送的输入 SHALL 还原为用户键入形式 `/skill:<name>`，有参数时为 `/skill:<name> <args>`，MUST NOT 回填展开后的技能正文。本地命令（如 `/compact`、`/export`、`/copy`）不在 transcript 中，因此 MUST NOT 出现在历史中。

#### Scenario: 技能调用还原

- **WHEN** 用户曾发送 `/skill:review src/a.ts`，该输入在 transcript 中以展开后的技能消息呈现
- **THEN** 历史条目为 `/skill:review src/a.ts`，不含技能正文

#### Scenario: 无参数技能调用

- **WHEN** 用户曾发送不带参数的 `/skill:review`
- **THEN** 历史条目为 `/skill:review`，末尾没有多余空格

#### Scenario: 排除内部与空白输入

- **WHEN** transcript 含子 agent 内部输入，或只含图片且文字由默认图片提示产生的输入
- **THEN** 这些输入不产生历史条目

#### Scenario: 图片输入仅回填文字

- **WHEN** 用户曾发送带图片与文字的输入
- **THEN** 历史条目只含文字，回填后输入框不含图片附件

#### Scenario: 排除后台任务回报

- **WHEN** transcript 含后台任务终止后回投的回报输入
- **THEN** 该输入不产生历史条目，按 ↑ 不会回填回报文本
