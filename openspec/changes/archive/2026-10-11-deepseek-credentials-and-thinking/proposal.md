# Proposal

## Why

当前 DeepSeek 凭据依赖环境变量，缺少密钥时前端无法启动配置；Web 设置页仍为占位内容，模型选择缺少思考强度。需要在 TUI/Web 提供一致的配置体验，并严格复用已锁定 Pi 的认证和模型能力约定。

## What Changes

- 提供宿主用户级 DeepSeek Key 持久化管理，保存值覆盖环境变量，移除后回退环境变量；两端显示环境变量是否存在及当前生效来源，不回传密钥。
- 无凭据时允许启动和浏览，发送请求前引导配置；保存后无需重启。
- TUI 新增 `/login` 遮罩输入面板，Web 重写为简洁蓝粉白配置卡，提供获取 Key 链接。
- 两端共用 Pi `getSupportedThinkingLevels` 和 `clampThinkingLevel`：当前 Flash 为 off/low/high/max，Pro 为 off/high/max，不覆盖上游映射或升级依赖。
- 显式设置默认模型为 `deepseek/deepseek-flash`、默认思考强度为 `high`；保留显式配置和已有会话设置，标题总结继续使用非思考模式。

## Capabilities

### New Capabilities

无；凭据管理归入现有模型提供商能力。

### Modified Capabilities

- `model-providers`: 凭据持久化、优先级、无凭据启动、Pi 能力列表和默认设置。
- `session-gateway`: 凭据状态同步和保存/移除接口。
- `terminal-ui`: `/login` 与基于 Pi 能力的模型/思考选择。
- `web-ui`: 简洁配置页和会话级模型/思考选择。

## Impact

涉及 core 的 runtime/config/凭据存储、gateway 服务契约与客户端、TUI 命令和面板、Web 设置页与模型选择器，以及对应测试和中文 README。新增用户级凭据文件，不修改会话存储格式，不清理历史会话，不引入 OAuth、账户系统或多 provider 配置 UI。Pi 依赖继续精确锁定 1.1.0。
