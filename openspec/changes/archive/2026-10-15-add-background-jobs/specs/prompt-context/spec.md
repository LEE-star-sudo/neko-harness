# Spec Delta

## ADDED Requirements

### Requirement: 后台任务工具规则
启用 `job` 工具时，`rules` 节 SHALL 包含其规则并使用该工具实际声明的动作与参数名：长期运行或不会自行退出的命令（开发服务器、watcher）用 `job` 的 `start`，而不是 `bash`；`start` 返回后用 `output` 读取日志、`stop` 终止；job 无 stdin，不得用于需要交互输入的命令；job 终止后会收到系统回报，不需轮询。未启用 `job` 时 MUST NOT 出现这些规则，且 `bash` 规则不变。

#### Scenario: 规则引用实际参数
- **WHEN** 请求启用了 `job` 工具
- **THEN** `rules` 节以 `start`、`output`、`stop`、`list` 及 `command`、`jobId`、`timeout` 指代用法，并包含长期命令用 `job`、不用于交互命令、终止后自动回报的指引

#### Scenario: 子 agent 不含规则
- **WHEN** 渲染子 agent 的提示词
- **THEN** 其 `rules` 节不包含 `job` 规则，与其工具集一致
