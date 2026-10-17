## ADDED Requirements

### Requirement: TUI 上下文设置面板

TUI SHALL 提供 `/context` 命令，打开与统一选择面板风格一致的上下文设置面板，以英语列出压缩与裁剪各项及其生效值与来源（Default、Config、Saved），并提供 Reset to defaults。选中某项并按 Enter SHALL 进入该项的预设选择（开关为 On/Off，数值为预设档位加 Default），确认后保存并返回列表；Esc 返回上一级或关闭面板。面板 MUST 保持主草稿、附件与输入历史浏览状态不变，`/context` SHALL 出现在命令补全与 `/help` 中。

#### Scenario: 查看与修改

- **WHEN** 用户输入 `/context`，选中压缩触发百分比并选择 50
- **THEN** 该项保存为 50 且来源显示 Saved，列表刷新，后续压缩检查使用新阈值；输入框草稿保持不变

#### Scenario: 恢复默认

- **WHEN** 用户在面板中选择 Reset to defaults
- **THEN** 已保存值被清除，各项回落为配置文件值或内置默认并更新来源

#### Scenario: 保存失败

- **WHEN** 保存失败
- **THEN** 面板显示不含内部细节的错误并保持原值，可重试或取消

#### Scenario: 多端同步

- **WHEN** 面板打开期间另一端修改了上下文设置
- **THEN** 面板更新为最新生效值与来源，未确认的高亮项保留
