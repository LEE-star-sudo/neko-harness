# Spec Delta

## ADDED Requirements

### Requirement: TUI 技能调用消息展示

TUI SHALL 将以 `<skill>` 块开头的用户消息折叠为单行标记：技能图标、`skill:<name>`、单行截断的参数预览与来源路径提示，不铺开技能正文。`</skill>` 之后无参数时只显示技能行。无法完整解析的同类文本 MUST 回退为原样渲染，不得丢失内容。标记文本 SHALL 使用英语（TUI 语言约定）。

#### Scenario: 单行折叠

- **WHEN** 用户提交 `/skill:pdf 总结它` 且技能命中展开
- **THEN** 消息流中该用户消息显示为单行技能标记（含参数预览），正文不出现

#### Scenario: 无参数调用

- **WHEN** 用户提交 `/skill:pdf`
- **THEN** 只显示技能行，无参数预览

#### Scenario: 解析失败回退

- **WHEN** 用户消息以 `<skill` 开头但不符合展开格式
- **THEN** 按原样渲染，内容完整可见
