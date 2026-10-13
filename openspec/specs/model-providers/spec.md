# model-providers Specification

## Purpose

管理模型提供商接入：DeepSeek 为默认 provider，统一处理认证、模型目录与 thinking level 映射。

## Requirements

### Requirement: DeepSeek 接入

系统 SHALL 内置 DeepSeek provider，使用 OpenAI Chat Completions 格式（api.deepseek.com），按 Pi 认证约定优先读取保存的凭据并回退 DEEPSEEK_API_KEY，支持 deepseek 系列模型的 thinking、tool use 与流式输出。缺少凭据 MUST NOT 阻止网关与前端启动。

#### Scenario: 未配置密钥

- **WHEN** 未保存密钥且 DEEPSEEK_API_KEY 未设置时启动
- **THEN** 用户可浏览会话和配置密钥；提交 DeepSeek 输入前收到配置引导，不接受该输入为新消息、不更新时间且不发起模型请求

#### Scenario: thinking 级别映射

- **WHEN** 会话配置 thinking level 为 high
- **THEN** 发往 DeepSeek 的请求携带该 provider 方言对应的 thinking 参数，且回答中的推理内容与正文分离呈现

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

### Requirement: 用户级凭据管理

系统 SHALL 将 UI 保存的凭据按 provider 分别持久保存于宿主用户级独立存储，所有工作区共用，重启后保留，不同 provider 的凭据互不影响。同一 provider 的保存凭据 SHALL 优先于环境变量；移除后 SHALL 回退环境变量。保存和移除 MUST 不修改进程环境变量；后续请求使用最新凭据，已发出的请求不被强制中断。

#### Scenario: 保存与回退

- **WHEN** 环境变量已有 Key，用户保存另一个 Key 后重启，再移除保存值
- **THEN** 重启后先使用保存值，移除后使用环境变量；环境变量配置状态始终为已配置

#### Scenario: 空值与存储失败

- **WHEN** 用户提交空白 Key，或凭据文件写入失败
- **THEN** 拒绝操作并显示不含密钥的错误，保留原生效凭据；空值不视为删除

#### Scenario: 多 provider 互不影响

- **WHEN** 用户保存或移除某一 provider（如 Tavily）的 Key
- **THEN** 其他 provider（如 DeepSeek）的保存凭据与生效来源保持不变

### Requirement: 凭据保密与状态

系统 MUST 仅向前端返回各 provider 的保存状态、环境变量是否配置及当前生效来源，不返回已有密钥。凭据文件 SHALL 仅宿主用户可读写；密钥 MUST NOT 写入会话、日志、项目配置或浏览器持久存储。"已配置" SHALL 仅表示存在凭据，不声称已通过远端认证。

#### Scenario: 查看与编辑

- **WHEN** 任一前端打开配置界面
- **THEN** 只读取无敏感内容的各 provider 状态，环境变量状态来自网关进程；输入框为空，可输入替换值，保存或取消后清除输入

### Requirement: 默认模型与思考强度

系统 SHALL 在没有显式覆盖时为新会话使用 DeepSeek V4.1 Flash（deepseek-flash）及 high 强度。已有会话和显式配置 MUST 保留自身设置；自动标题总结 MUST 继续使用独立非思考请求。

#### Scenario: 默认与显式配置

- **WHEN** 用户从任一前端新建无显式模型/强度覆盖的会话
- **THEN** 默认值为 Flash high；恢复已有会话不重置其配置，显式指定 off 时保持 off

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
