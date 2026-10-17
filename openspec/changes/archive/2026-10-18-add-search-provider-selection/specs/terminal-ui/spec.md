## ADDED Requirements

### Requirement: TUI 搜索 provider 面板

TUI SHALL 提供 `/search` 命令，打开与统一选择面板风格一致的搜索 provider 面板，以英语列出 tavily、deepseek，标出当前选择，并显示各 provider 的凭据状态（已保存、环境变量、keyless 等），DeepSeek 缺少 Key 时给出指向 `/login` 的提示。Enter SHALL 确认选择，Esc SHALL 取消；确认后面板自动关闭并短暂提示结果。面板 MUST NOT 收集或显示密钥，打开与关闭不改变主草稿、附件与输入历史浏览状态。`/search` SHALL 出现在命令补全与 `/help` 中。

#### Scenario: 查看与切换

- **WHEN** 用户输入 `/search`，选中 deepseek 并按 Enter
- **THEN** 选择保存为 deepseek，面板关闭并提示结果，后续联网工具调用使用 DeepSeek；输入框草稿保持不变

#### Scenario: 默认选择

- **WHEN** 从未选择过 provider 时打开 `/search`
- **THEN** 面板标出 tavily 为当前选择，不存在 auto 选项

#### Scenario: DeepSeek 缺少 Key

- **WHEN** DeepSeek 未配置 Key 时查看 deepseek 项
- **THEN** 面板提示先通过 `/login` 配置 DeepSeek Key，不声称搜索可用

#### Scenario: 保存失败

- **WHEN** 保存选择失败
- **THEN** 面板显示不含密钥的错误并保持原选择，可重试或取消

#### Scenario: 多端同步

- **WHEN** 面板打开期间另一端更改了选择或 DeepSeek Key
- **THEN** 面板更新为最新选择与凭据状态，未确认的高亮项保留
