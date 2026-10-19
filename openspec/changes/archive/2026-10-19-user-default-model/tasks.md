# Tasks

## 1. core：存储与解析链

- [x] 1.1 在 `packages/core/src/runtime.ts` 新增 `DefaultModelDoc`（`app.neko.default-model`，`{ model: NekoModelRef | null }`，模式同 `ProviderSettingsDoc`），并在 `NekoRuntimeOptions` 增加 `modelOverride`；`createConversation` 改为 `createOptions?.model ?? modelOverride ?? savedDefault ?? model` 解析（含 thinkingLevel 换算），新增测试覆盖解析链四档优先级并跑通 `bun run test -- runtime`
- [x] 1.2 在 runtime 增加 `defaultModel()`（返回 `{ effective, source }`，source 为 `cli | saved | config | default`）与 `setDefaultModel(model | null)`（校验目录内已知模型、provider 已启用否则 `PROVIDER_DISABLED`，不查 Key；持久化文档），新增测试覆盖设置/清除/未知模型/未启用 provider/持久化后重开运行时仍生效

## 2. gateway：契约与接线

- [x] 2.1 `packages/core/src/application-version.ts` 的 `APPLICATION_PROTOCOL` 升为 8，跑通现有协议兼容测试（`bun run test -- application-updates gateway-startup`）
- [x] 2.2 `packages/gateway/src/contract.ts` 新增 `neko.default-model` 契约（state `{ effective, source }` + `set`/`clear`），`gateway.ts` 把 CLI `--model` 与配置/内置默认拆分传入 core 并接好服务实现（变更后广播），新增契约与服务测试（含双端订阅同步、非法提交拒绝、持久化失败不广播）
- [x] 2.3 更新 `packages/gateway/src/cli-args.ts`、`packages/cli/src/main.ts`、`packages/tui/src/main.ts` 等帮助文本：说明「设为默认」入口与优先级（`--model` > 保存值 > 配置文件），更新 `packages/cli/test/help.test.ts` 并跑通

## 3. Web

- [x] 3.1 `model-picker.tsx`：默认模型显示标识，可选行提供「设为默认/取消默认」，无 Key 条目不提供；订阅 `neko.default-model` 状态保持同步，新增组件测试（设置/取消/无 Key 隐藏/跨端状态）并跑通 `bun run test` 中 web 相关项
- [x] 3.2 凭据或启用状态变化后的既有重拉逻辑顺带核对默认标识仍正确（models-refresh 测试补一例）

## 4. TUI

- [x] 4.1 `provider-ui.ts` / `/model` 列表：默认模型标识 + 高亮行 `d` 键切换默认，无 Key 行不响应；新增渲染/交互测试并跑通 tui 测试

## 5. 文档与整体验证

- [x] 5.1 更新 AGENTS.md「模型 provider」一节（解析链、`app.neko.default-model`、`neko.default-model` 契约、协议 8）与 README 相关段落
- [x] 5.2 `bun run check && bun run build && bun run test` 全绿，`openspec validate user-default-model --strict` 通过

## Workflow follow-up

- 确认 `generalize-model-providers` 已归档后再 apply 本变更（其 Web/TUI 选择器是本变更 UI 的载体，MODIFIED 正文按归档后 spec 书写）。
- 满足项目评审要求后归档本变更并验证归档结果。
