# Spec Delta

## ADDED Requirements

### Requirement: TUI 默认模型设置

TUI `/model` 列表 SHALL 标识当前默认模型，并对高亮的可选模型提供「设为默认」按键；已是默认的模型可用同一按键取消默认。未配置 Key 而不可选的模型 MUST NOT 响应该操作。操作结果 SHALL 即时反映在列表标识上；默认模型 SHALL 只影响新建会话，不改变当前会话模型。

#### Scenario: 设为默认与取消

- **WHEN** 用户在 `/model` 列表中对可选模型按设为默认键，随后对默认模型再按一次
- **THEN** 第一次后该模型显示默认标识，新建会话默认使用它；第二次后标识消失，新建会话回落为配置文件或内置默认

#### Scenario: 无 Key 模型

- **WHEN** 高亮停在已启用但未配置 Key 的模型上按设为默认键
- **THEN** 不产生任何更改，默认模型保持不变

#### Scenario: 跨端一致

- **WHEN** Web 修改默认模型后用户在 TUI 打开 `/model`
- **THEN** 列表显示同一默认模型标识
