# Proposal

## Why

当前子 agent 已有持久会话，但每次新委派只创建新子会话，主 agent 无法定位和接续既有子 agent，导致重复调查、上下文重传和重复成本。需要将子 agent 身份与每轮委派分开，让主 agent 在同一主会话内继续派发任务并正确观察、停止和计费。

## What Changes

- 为内置 explore、plan、coder 提供绑定持久子会话的稳定身份；向主模型返回 agentId，并可查询已有子 agent。
- 扩展现有 subagent 工具支持 create / continue / list；保留不带 action 的既有创建调用。continue 只向当前主会话所属的空闲子 agent 提交新任务，使用原上下文并前台等待交付。
- 每轮保存独立任务、输入、状态、报告和用量增量；同一子 agent 一次只接受一轮，忙碌时明确拒绝，不排队、不 steer。不同子 agent 沿用三任务及单 coder 配额。
- 接续轮次使用 Pi 原生持久任务、提交幂等和取消路径；停止当前轮不删除子 agent，完成、失败或取消后均可继续。
- 审批准确绑定当前轮，新 Bash 调用逐次授权；保持现有输入区审批交互。
- Web/TUI 列表按子 agent 去重，详情展示连续上下文及轮次分隔；主委派卡仍按轮次显示并定位对应任务。子 agent 显示运行/排队/空闲，轮次保留完成/失败/停止状态。
- 用量区分主会话总量、子 agent 累计量和本轮增量，同一子会话在总量中只统计一次。历史分叉继续只读且冻结原子会话内容与用量。
- **BREAKING**：gateway 子 agent 投影和定位契约调整为稳定身份与轮次；递增应用协议，沿现有版本兼容提示处理。
- 不增加后台委派、运行中消息注入、用户直接向子 agent 输入、自定义角色、跨主会话共享、权限升级或 Windows CI；不升级 Pi 依赖。

## Capabilities

### New Capabilities

无；扩展现有子 agent 能力边界。

### Modified Capabilities

- `subagents`: 持久身份、空闲前台接续、单轮互斥、取消恢复和用量归属。
- `prompt-context`: 引导主 agent 查询和复用已有子 agent，保持角色与资源边界。
- `session-gateway`: 稳定身份观察、轮次定位与停止、去重总用量及分叉隔离。
- `tool-approvals`: 复用子会话时审批绑定当前轮，旧轮请求无法放行新操作。
- `terminal-ui`: 子 agent 去重列表、空闲与轮次状态、连续流程及用量。
- `web-ui`: 侧栏稳定身份、卡片定位轮次、连续流程及用量。

## Impact

涉及 core subagents、角色提示、原生任务注册、用量与分叉元数据；gateway contract、session/subagent projection、审批 reader；TUI/Web 列表、详情、卡片定位与测试。已有历史子会话按持久归属协调为稳定身份，不重建对话；旧记录缺少轮次用量基线时不伪造精确增量。发布包依赖和 macOS/Linux CI 范围保持现有约定。
