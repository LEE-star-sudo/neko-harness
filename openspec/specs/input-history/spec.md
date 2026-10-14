# input-history Specification

## Purpose

定义前端输入框历史（↑/↓ 回填已发送输入）的数据来源与派生规则，使 Web 与 TUI 对同一会话得到相同的历史条目，并在重连、重开后保持可用。

## Requirements

### Requirement: 输入历史来自会话 transcript

输入历史 SHALL 仅由当前会话 transcript 中已提交的用户输入派生，按时间由新到旧排列；历史 MUST 按会话隔离，不同会话之间互不可见，也 MUST NOT 引入额外的持久化或网关协议。已排队、被拒绝或撤回而未进入 transcript 的输入 MUST NOT 出现在历史中。

#### Scenario: 重开后仍可浏览

- **WHEN** 用户在某会话发送过若干输入后刷新 Web 页面或重启 TUI 并重新打开该会话
- **THEN** 该会话的输入历史包含此前已进入 transcript 的输入，顺序与发送顺序一致

#### Scenario: 会话间隔离

- **WHEN** 用户在会话 A 发送过输入，随后切换到从未发送过输入的会话 B
- **THEN** 会话 B 的输入框按 ↑ 不回填任何内容，切回会话 A 后历史仍完整

#### Scenario: 两端一致

- **WHEN** 同一会话在 Web 与 TUI 中分别打开
- **THEN** 两端得到相同的历史条目序列

#### Scenario: 未进入 transcript 的输入不计入

- **WHEN** 输入因排队未被接纳、提交失败或被撤回而未出现在 transcript
- **THEN** 该输入不出现在历史中

### Requirement: 历史条目的过滤与还原

历史条目 SHALL 只包含用户实际键入的文字：子 agent 内部输入 MUST 被排除；默认图片提示 MUST NOT 计入；去掉上述内容后为空白的输入 MUST 被忽略；图片附件 MUST NOT 被恢复，仅回填文字。通过技能命令发送的输入 SHALL 还原为用户键入形式 `/skill:<name>`，有参数时为 `/skill:<name> <args>`，MUST NOT 回填展开后的技能正文。本地命令（如 `/compact`、`/export`、`/copy`）不在 transcript 中，因此 MUST NOT 出现在历史中。

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

### Requirement: 历史去重与上限

历史 SHALL 折叠连续相同的条目，仅保留一条；总数 SHALL 不超过 100 条，超出时保留最近的条目。条目比较与存储前 MUST 去除首尾空白，保留内部换行。

#### Scenario: 连续重复折叠

- **WHEN** 用户连续两次发送相同文字（如重试）
- **THEN** 历史中仅有一条该文字，不连续重复

#### Scenario: 非连续重复保留

- **WHEN** 用户依次发送 A、B、A
- **THEN** 历史由新到旧为 A、B、A

#### Scenario: 数量上限

- **WHEN** 会话已发送超过 100 条互不连续重复的输入
- **THEN** 历史只保留最近 100 条

#### Scenario: 多行输入保持换行

- **WHEN** 用户曾发送含换行的多行输入
- **THEN** 历史条目保留内部换行，仅去除首尾空白
