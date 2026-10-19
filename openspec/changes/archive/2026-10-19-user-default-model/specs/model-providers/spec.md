# Spec Delta

## MODIFIED Requirements

### Requirement: 默认模型与思考强度

系统 SHALL 按「会话级显式指定 > CLI `--model` > 用户保存的默认模型 > 配置文件 `defaultModel` > 内置默认」为新会话解析模型，内置默认为 DeepSeek V4.1 Flash（deepseek-flash），强度按所解析模型以 high 为默认换算。用户保存的默认模型 SHALL 按用户持久保存、所有工作区共用、重启后保留，可清除；清除后 SHALL 回落到配置文件或内置默认。已有会话和显式配置 MUST 保留自身设置；自动标题总结 MUST 继续使用独立非思考请求。

#### Scenario: 默认与显式配置

- **WHEN** 用户从任一前端新建无显式模型/强度覆盖、无保存默认模型的会话
- **THEN** 默认值为 Flash high；恢复已有会话不重置其配置，显式指定 off 时保持 off

#### Scenario: 保存值生效与清除

- **WHEN** 用户把某可选模型设为默认后新建会话，随后清除该保存值再新建会话
- **THEN** 前者使用保存的模型并按其能力换算默认强度；后者回落为配置文件 `defaultModel`，无则内置 Flash

#### Scenario: 解析优先级

- **WHEN** CLI `--model`、保存的默认模型与配置文件 `defaultModel` 同时存在
- **THEN** 新会话使用 `--model`；无 `--model` 时使用保存值；两者都无时使用配置文件值

#### Scenario: 保存值的 provider 被取消启用

- **WHEN** 保存的默认模型所属 provider 随后被取消启用，用户新建会话并提交输入
- **THEN** 新会话仍取保存的模型，不静默改用其他模型；提交按 `PROVIDER_DISABLED` 拒绝并提示启用或更换默认
