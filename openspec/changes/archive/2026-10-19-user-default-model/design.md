# Design

## Context

当前默认模型在网关启动时一次定死：`packages/gateway/src/gateway.ts:92` 按 `options.model ?? fileConfig.defaultModel ?? DEFAULT_MODEL` 解析后传给 core，`packages/core/src/runtime.ts:449` 固化，`createConversation`（runtime.ts:1156-1175）对每个新会话直接复制该值，运行期间不可变。用户级 UI 设置已有成熟模式：`defineDoc` 文档（`ProviderSettingsDoc` / `SearchSettingsDoc` / `ContextSettingsDoc`，runtime.ts:315-343）持久化 + 服务器级契约（`neko.search-settings`、`neko.context-settings`，contract.ts:662、730）做状态订阅与修改，且这两个服务新增时都递增了链路协议版本（当前 `APPLICATION_PROTOCOL = 7`，core/src/application-version.ts:4）。上下文设置确立了「保存值 > 配置 > 默认」的解析惯例。

本变更假设 `generalize-model-providers` 已归档（其 Web 模型选择器 `model-picker.tsx` 与 TUI `/model` 分组列表 `provider-ui.ts` 是本次 UI 改造的载体）。

## Goals / Non-Goals

**Goals:**

- Web/TUI 可对可选模型「设为默认」并取消，用户级持久化，双端实时同步。
- 新会话模型解析链：会话级显式指定 > CLI `--model` > 保存值 > 配置文件 `defaultModel` > 内置默认。
- 默认模型状态带出来源（命令行 / 已保存 / 配置文件 / 内置默认），供两端展示。

**Non-Goals:**

- 不改已有会话的模型；不提供按工作区的默认模型。
- 默认思考强度仍按既有规则（所解析模型的 high 换算），不开放「默认强度」设置。
- 移动端 API 不增加默认模型入口（沿用网关解析结果即可）。
- 不把配置文件里的 `defaultModel` 迁移为保存值。

## Decisions

### D1：存储用新文档 `app.neko.default-model`

形状 `{ model: NekoModelRef | null }`（`null` = 从未保存），完全复用 `ProviderSettingsDoc` 模式：`scope: "conversation"`、挂在 root 会话 id、`history: "latest"`、`fork: "initial"`。

- 备选：并入 `ProviderSettingsDoc` —— 拒绝，启用集合与默认模型是两个关注点，且文档版本已发布，加字段要处理旧数据。
- 备选：存 `credentials.json` —— 拒绝，设置类状态统一在 storage 文档，与 search/context settings 一致；凭据文件只管密钥。

### D2：core 增加 `modelOverride`，CLI 与配置来源分开传入

`NekoRuntimeOptions` 新增 `modelOverride?: NekoModelRef`。网关改为 `model = fileConfig.defaultModel ?? DEFAULT_MODEL`、`modelOverride = cliArgs.model` 分别传入（`cli-args.ts` 已解析 `--model`）。`createConversation` 解析：`createOptions?.model ?? modelOverride ?? savedDefault ?? model`，其中 `savedDefault` 每次创建时读文档（与 `setProviderEnabled` 后即时生效一致，无需重启）。

- 备选：保存值优先于 `--model` —— 拒绝，`--model` 是本次启动的显式意图，应压过持久偏好；保存值压过配置文件则与 context-settings「保存值 > 配置」惯例一致。
- 直接调用 core 的既有调用方（examples、测试）只传 `model`，语义不变。

### D3：新契约 `neko.default-model`（v1），不扩 `neko.models`

`state: { effective: NekoModelRef, source: "cli" | "saved" | "config" | "default" }`；方法 `set(model)` / `clear()`。`effective` 是完整解析链的结果，前端直接展示；`set` 校验 provider 在目录内且已启用（否则 `PROVIDER_DISABLED`）、模型已知，不要求已有 Key，与 `configureConversation`（runtime.ts:1193-1197）的校验对齐。

- 备选：`neko.models` 升 v2 加 state 与方法 —— 拒绝，改动既有契约会牵连所有现有客户端的绑定；新契约与 search-settings/context-settings 先例一致，未升级的客户端经协议检查整体拒绝，不存在部分可用状态。

### D4：协议版本 7 → 8

新增服务器级服务按先例递增 `APPLICATION_PROTOCOL`，旧网关/旧客户端被明确拒绝，前端无需做能力探测与降级。

### D5：UI 操作与「可选」规则对齐

「设为默认」只出现在可选条目上（已启用 provider 且有 Key）；无 Key 条目在选择器中本不可选，同样不提供该操作。服务端 `set` 不查 Key（与切换模型一致），UI 限制只是与选择规则保持一致。Web 在 `model-picker.tsx` 行内加星标切换；TUI 在 `/model` 列表加按键（`d`）切换高亮行的默认状态，默认模型带标识。两端订阅契约 state，凭据/启用变化后既有重拉逻辑不变。

### D6：保存值失效不静默回退

保存值指向的 provider 后被取消启用、或保存值因目录收缩变成未知模型时，解析仍返回该值并在状态中如实标出来源；新会话照取，提交时由既有 `guardProvider` 按 `PROVIDER_DISABLED` / 未知模型拒绝。与 `--model` 指向未启用 provider 的先例一致，不引入静默切换。

## Risks / Trade-offs

- [保存的默认模型随 Pi 升级从目录中消失，新会话全部提交失败] → 状态如实展示来源与模型，错误文案指引更换默认；`set` 时校验已知模型防止设置期引入。
- [协议递增迫使旧客户端升级] → 与 search/context settings 变更的既有代价相同，属既定兼容性策略。
- [`createConversation` 每次读文档增加一次存储往返] → 与 `ProviderSettingsDoc` 读取同级，会话创建本就是低频重操作；如需可在 runtime 内缓存并在 `set`/`clear` 时失效。
- [TUI/Web 自动拉起的网关由前端转发 `--model`] → 保持现有转发不变，仅网关侧拆分 CLI 与配置来源，前端启动路径无感知。

## Migration Plan

无数据迁移：新文档缺省 `null`（从未保存），行为与现状一致。协议 7 客户端连新网关被拒并提示更新，为既有既定行为。
