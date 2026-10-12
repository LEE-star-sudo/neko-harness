# Spec Delta

## ADDED Requirements

### Requirement: Web 技能调用消息展示

Web SHALL 将以 `<skill>` 块开头的用户消息渲染为工具卡风格的折叠卡片：卡片显示技能图标、`skill:<name>` 名称与截断的来源路径，默认折叠，点击展开查看技能正文（等宽、限高滚动）。`</skill>` 之后的参数文本 SHALL 仍以普通用户消息文本显示。无法完整解析的同类文本 MUST 回退为原样渲染，不得丢失内容。卡片样式 SHALL 遵循全站统一的蓝粉白 design tokens。

#### Scenario: 折叠卡片

- **WHEN** 用户通过 `/skill:pdf 总结它` 提交且技能命中展开
- **THEN** 该用户消息显示为折叠的技能卡片（图标 + `skill:pdf` + 来源路径），正文不铺开

#### Scenario: 展开正文

- **WHEN** 用户点击技能卡片
- **THEN** 卡片展开显示技能正文，再次点击折叠

#### Scenario: 参数仍可见

- **WHEN** 技能调用带有参数
- **THEN** 参数文本在卡片外以普通用户消息样式显示

#### Scenario: 解析失败回退

- **WHEN** 用户消息以 `<skill` 开头但不符合展开格式（如手工输入、未命中透传）
- **THEN** 消息按原样纯文本渲染，内容完整可见
