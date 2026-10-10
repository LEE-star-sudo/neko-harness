# Spec Delta

## MODIFIED Requirements

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
