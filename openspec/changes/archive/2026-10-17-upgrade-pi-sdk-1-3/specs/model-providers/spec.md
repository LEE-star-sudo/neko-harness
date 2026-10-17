## MODIFIED Requirements

### Requirement: 模型目录与切换

系统 SHALL 提供可用模型列表（含上下文窗口、价格、支持的能力及思考强度），并允许按会话切换模型与 thinking level。能力列表及不支持强度的调整 MUST 遵循已安装 Pi 1.3.0 的约定，TUI/Web MUST 使用同一能力数据，不能根据外部目录扩展选项或覆盖上游映射。切换模型后，系统 MUST 沿用 Pi 的历史转换，不把先前模型的思考内容作为新模型的可见回答文本发送，也不改写持久历史。

#### Scenario: 会话级切换模型

- **WHEN** 用户在某会话中切换模型
- **THEN** 该会话的下一次请求使用新模型，其他会话不受影响

#### Scenario: 已锁定 Pi 的能力

- **WHEN** 使用 Pi 1.3.0 内置 DeepSeek 模型目录
- **THEN** Flash 可选 off/low/high/max，Pro 可选 off/high/max；两端不提供 minimal/medium/xhigh

#### Scenario: 切换到不支持当前强度的模型

- **WHEN** Flash low 切换为 Pro
- **THEN** 遵循 Pi 将强度调整为 high，两端显示相同实际生效值，不将 low 透传为 Pro 的有效选项

#### Scenario: 切换模型后的历史

- **WHEN** 会话中已有他模型产生思考内容的回答，用户切换到另一模型后继续提问
- **THEN** 新请求不把旧思考内容当作回答文本发送，持久历史与两端展示的旧思考内容保持不变
