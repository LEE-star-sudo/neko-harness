## MODIFIED Requirements

### Requirement: 内置角色与工具边界
系统 SHALL 提供 explore、plan、coder 三种内置角色。explore 与 plan SHALL 具有文件发现、内容搜索、读取以及已配置的网络调研能力，不具有直接文件写入或编辑工具。explore SHALL 默认只读，Bash 必须经用户逐次审批后执行，获批命令可能产生修改；plan MUST 无 shell 执行能力；coder SHALL 可使用现有编码工具。所有子 agent MUST 无法再次委派；未知角色 MUST 被拒绝。

#### Scenario: 未知路径调查
- **WHEN** 主 agent 向 explore 提交仅包含调查目标而没有具体文件路径的任务
- **THEN** 子 agent 能发现文件、搜索内容、读取证据并交付结论，未经用户批准不得执行命令或通过命令修改工作区

#### Scenario: 实现和角色限制
- **WHEN** coder 执行明确的实现任务，或 explore/plan 尝试直接写入、编辑、嵌套委派，或 plan 尝试执行 shell
- **THEN** coder 可修改并验证；受限调用在执行前被拒绝，不仅从模型工具列表隐藏

#### Scenario: explore 请求命令执行
- **WHEN** explore 需要 Git、版本查询或其他诊断命令
- **THEN** 可发起 Bash 审批，批准前等待，拒绝后可继续调查；不向 plan、coder 或主 agent 扩散该角色权限变更
