# Spec Delta

## MODIFIED Requirements

### Requirement: 帮助输出覆盖环境变量与凭据配置

涉及环境变量或凭据的命令帮助 SHALL 在尾部补充段说明：`neko tui --help` SHALL 说明 `NEKO_THEME`；配置凭据的入口（TUI `/login`、Web 设置页「模型服务」与「联网搜索」、各 provider 的环境变量如 `DEEPSEEK_API_KEY`、`OPENROUTER_API_KEY`、`OPENCODE_API_KEY`、`TAVILY_API_KEY`）SHALL 在相应帮助中说明，并说明除 DeepSeek 外的 provider 需先在 `/login` 或 Web 设置页启用；选择联网搜索 provider 的入口（TUI `/search`、Web 设置页「联网搜索」、配置文件 `webSearch.provider`）SHALL 在涉及凭据配置的帮助中一并说明。`--model` 帮助 SHALL 说明格式为 `provider/modelId`（模型 id 可含 `/`）。

#### Scenario: tui 帮助说明主题环境变量

- **WHEN** 用户运行 `neko tui --help`
- **THEN** 输出说明 `--theme` 覆盖 `NEKO_THEME`，并提示可用 `/login` 或 `DEEPSEEK_API_KEY` 配置凭据

#### Scenario: 帮助说明搜索 provider

- **WHEN** 用户运行 `neko --help` 或 `neko tui --help`
- **THEN** 输出提示可用 `/search`（TUI）或 Web 设置页「联网搜索」选择联网搜索 provider（默认 tavily），并说明凭据变量

#### Scenario: 帮助说明多 provider

- **WHEN** 用户运行 `neko --help`、`neko tui --help` 或 `neko web --help`
- **THEN** 输出说明可通过 `/login` 或 Web 设置页启用其他 provider（如 OpenRouter、OpenCode Go）并配置对应环境变量，且 `--model` 采用 `provider/modelId` 格式
