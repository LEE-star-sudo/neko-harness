# Proposal

## Why

默认模型目前只能由 `--model` 或配置文件 `defaultModel` 指定，未指定时固定为 `deepseek/deepseek-flash`。已启用多个 provider 的用户想让新会话默认走别的模型时，只能改配置文件或每次加 CLI 参数，无法在 Web/TUI 里直接设置。

## What Changes

- 新增用户级「默认模型」设置：Web 模型选择器与 TUI `/model` 列表中对任一可选模型提供「设为默认」，可再次操作取消；设置按用户持久化、所有工作区共用、重启保留。
- 新会话模型解析链变为：会话级显式指定 > CLI `--model` > UI 保存值 > 配置文件 `defaultModel` > 内置默认（`deepseek/deepseek-flash`）。已有会话与显式配置保持自身设置，不受影响。
- 设为默认只接受目录内已启用 provider 的模型；不要求已有 Key（缺 Key 仍在提交时按 `PROVIDER_KEY_REQUIRED` 拦截）。保存值指向的 provider 后被取消启用时不静默回退，沿用 `--model` 先例：新会话仍取该模型，提交时按 `PROVIDER_DISABLED` 拒绝。
- 网关新增服务器级默认模型服务（状态订阅 + 设置/清除），按 `neko.search-settings` / `neko.context-settings` 先例递增链路协议版本（7 → 8）。
- 为区分 `--model` 与配置文件来源，网关向 core 分别传递 CLI 模型与配置/内置解析值。

## Capabilities

### New Capabilities

（无新能力；全部归入既有能力。）

### Modified Capabilities

- `model-providers`: 「默认模型与思考强度」改为包含用户级保存值及完整解析链。
- `session-gateway`: 新增「默认模型同步」服务器级服务要求（含协议版本递增）。
- `web-ui`: 新增 Web 模型选择器的默认模型标识与「设为默认」操作要求。
- `terminal-ui`: 新增 TUI 模型列表的默认模型标识与按键操作要求。
- `cli-interface`: 「帮助输出覆盖环境变量与凭据配置」补充默认模型设置入口与优先级说明。

## Impact

- **core**（`packages/core/src/runtime.ts` 等）：新增 `app.neko.default-model` 文档；`createConversation` 改为按解析链取模型；新增 `defaultModel()` / `setDefaultModel()` 运行时方法。
- **gateway**（`packages/gateway/src/contract.ts`、`gateway.ts`、`cli-args.ts`）：新增 `neko.default-model` 契约；CLI `--model` 与配置 `defaultModel` 分开传入 core；应用协议版本 7 → 8；帮助文本更新。
- **web**：模型选择器增加默认标识与设为默认/取消操作，凭据或启用变化后保持同步。
- **tui**：`/model` 列表增加默认标识与按键（设为默认/取消）。
- **依赖前提**：本变更的 Web/TUI delta 建立在 `generalize-model-providers` 的模型选择器之上，须在其归档后再 apply；MODIFIED 要求正文按归档后的 spec 书写。
- **文档**：AGENTS.md 模型 provider 一节、README 同步。
