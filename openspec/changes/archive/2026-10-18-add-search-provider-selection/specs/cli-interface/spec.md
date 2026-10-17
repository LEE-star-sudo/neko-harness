## MODIFIED Requirements

### Requirement: 帮助输出覆盖环境变量与凭据配置

涉及环境变量或凭据的命令帮助 SHALL 在尾部补充段说明：`neko tui --help` SHALL 说明 `NEKO_THEME`；配置凭据的入口（TUI `/login`、Web 设置页、`DEEPSEEK_API_KEY` / `TAVILY_API_KEY`）SHALL 在相应帮助中说明；选择联网搜索 provider 的入口（TUI `/search`、Web 设置页、配置文件 `webSearch.provider`）SHALL 在涉及凭据配置的帮助中一并说明。

#### Scenario: tui 帮助说明主题环境变量

- **WHEN** 用户运行 `neko tui --help`
- **THEN** 输出说明 `--theme` 覆盖 `NEKO_THEME`，并提示可用 `/login` 或 `DEEPSEEK_API_KEY` 配置凭据

#### Scenario: 帮助说明搜索 provider

- **WHEN** 用户运行 `neko --help` 或 `neko tui --help`
- **THEN** 输出提示可用 `/search`（TUI）或 Web 设置页选择联网搜索 provider（默认 tavily），并说明凭据变量
