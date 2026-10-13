# Spec Delta

## MODIFIED Requirements

### Requirement: 模型目录与切换

系统 SHALL 提供可用模型列表（含上下文窗口、价格、支持的能力及思考强度），并允许按会话切换模型与 thinking level。能力列表及不支持强度的调整 MUST 遵循已安装 Pi 1.2.0 的约定，TUI/Web MUST 使用同一能力数据，不能根据外部目录扩展选项或覆盖上游映射。

#### Scenario: 会话级切换模型

- **WHEN** 用户在某会话中切换模型
- **THEN** 该会话的下一次请求使用新模型，其他会话不受影响

#### Scenario: 已锁定 Pi 的能力

- **WHEN** 使用 Pi 1.2.0 内置 DeepSeek 模型目录
- **THEN** Flash 可选 off/low/high/max，Pro 可选 off/high/max；两端不提供 minimal/medium/xhigh

#### Scenario: 切换到不支持当前强度的模型

- **WHEN** Flash low 切换为 Pro
- **THEN** 遵循 Pi 将强度调整为 high，两端显示相同实际生效值，不将 low 透传为 Pro 的有效选项

### Requirement: 模型图片能力一致性

系统 SHALL 向两端提供已安装 Pi 1.2.0 的输入类型和图片限制，不使用外部目录覆盖。新图片消息 MUST 在受理时验证实际会话模型支持图片；不支持时保留草稿和附件并提示切换模型或移除图片。历史图片及 read 工具图片结果在模型请求中的转换 SHALL 沿用 Pi，不修改持久历史或伪称非视觉模型能看见原图；工具读取不采用附件提交的能力拒绝策略。

#### Scenario: Flash 与 Pro

- **WHEN** Pi 1.2.0 下用户选择 DeepSeek V4.1 Flash 或 V4 Pro
- **THEN** 两端分别显示 Flash 支持图片、Pro 仅文本，并使用 Flash 声明的图片限制

#### Scenario: 添加后切换模型

- **WHEN** 草稿已有图片时模型切换为 Pro，或另一客户端在提交前更改模型
- **THEN** 不静默移除图片，服务端以受理时能力拒绝无效新输入，前端保留草稿并展示处理选项

#### Scenario: 历史含图但新输入为文字

- **WHEN** 含图片历史的会话切换到 Pro 后发送纯文字
- **THEN** 允许对话，历史原图可查看，模型请求按 Pi 降级图片内容；界面明确当前模型无法查看原图

#### Scenario: 非视觉工具读取

- **WHEN** Pro 通过 read 读取有效的受支持图片
- **THEN** 遵循原生工具保存图片结果并向模型提供占位符和能力诊断，不能把结果展示为模型已看见图片；同一会话的新图片附件提交仍被拒绝
