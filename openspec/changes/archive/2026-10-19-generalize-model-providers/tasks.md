# Tasks

## 1. Provider 目录与启用设置（core）

- [x] 1.1 在 `packages/core/src/credential-providers.ts` 新增 32 项 `MODEL_PROVIDERS`（id、名称、`envVar`、`signupUrl`）与 Tavily 搜索凭据项，扩展 `CredentialProviderId` 并保持浏览器安全子路径无 Node 导入；运行 `bun run check` 确认类型通过
- [x] 1.2 新增目录对账测试：逐项设置 `process.env[envVar]` 后断言 `models.checkAuth(id).source === envVar`，并断言目录 id 都存在于 Pi 内置 provider；运行该测试通过
- [x] 1.3 `runtime.ts` 注册目录内全部 Pi provider（保留 `options.providers` 扩展口），新增 `ProviderSettingsDoc`（缺省 `["deepseek"]`，读取时与目录求交并强制含 deepseek），提供读取 / `setProviderEnabled`（未知 id、取消 DeepSeek 抛错）；单测覆盖默认、持久化重启后保留、锁定与未知 id
- [x] 1.4 `credentialStatus` / `saveCredential` / `removeCredential` 对目录内任一 id 通用，目录外 id 拒绝；单测覆盖共用环境变量（OpenCode Go 与 Zen）、保存与回退、空值拒绝、未知 provider

## 2. 拦截与模型列表（core）

- [x] 2.1 实现统一的 provider 校验（先 `PROVIDER_DISABLED` 后 `PROVIDER_KEY_REQUIRED`），接入受理输入与 `compact`，替换 `runtime.ts` 中两处 `provider === "deepseek"` 判断；单测覆盖缺 Key、被禁用、DeepSeek 缺 Key 行为不变、被拒绝输入不更新时间且不发起请求
- [x] 2.2 子 agent 启动 / 修复与会话命名复用该校验（不可用则不启动 / 走 fallback）；单测覆盖主模型 provider 被禁用时子任务不启动、命名回退
- [x] 2.3 `listModels()` 只返回已启用 provider 的模型并带 `available`；`configure` 切换到未启用 provider 抛错且配置不变；单测覆盖列表范围、切换拒绝、含 `/` 的 OpenRouter 模型 id 往返、`--model` 指向未启用 provider 时 runtime 正常启动并在提交时被拦截
- [x] 2.4 在 `packages/core/test/providers.test.ts`（或新测试）用 faux / 注册 OpenRouter 与 OpenCode Go 真实 provider 的模型定义验证两者出现在列表中且 thinking 能力来自 Pi；运行 `bun run test` 中 core 相关用例通过

## 3. 网关契约与协议（gateway）

- [x] 3.1 `contract.ts`：`NekoCredentials` 升至 version 2，`statuses` 改为按 provider 的映射（模型 provider 带 `enabled`），`save`/`remove` 的 provider 改为目录 id，新增 `setEnabled`；`modelInfo` 增加 `available`；`APPLICATION_PROTOCOL` 6 → 7；契约测试覆盖 schema 与协议不匹配被拒绝
- [x] 3.2 `session-host` / `server-services` 接入 `setEnabled` 与新状态发布；`session-host.ts` 错误映射改为 `PROVIDER_KEY_REQUIRED` / `PROVIDER_DISABLED`（保留引导文案、不含密钥）；单测覆盖多端同步、非法请求不发布成功状态、重连恢复最终状态
- [x] 3.3 `client-session.ts` 与 `packages/gateway/src/index.ts` 导出新状态类型（`NekoCredentialState` 映射形状）；更新 `credentials` 与 `model-switching` 现有网关测试并全部通过
- [x] 3.4 更新 `cli-args.ts`、`packages/cli/src/main.ts`、`packages/web/src/main.ts`、`packages/tui/src/main.ts` 的帮助文案（多 provider 环境变量、需先启用、`--model` 格式），更新 `cli/test/help.test.ts` 并通过

## 4. Web：模型服务页与联网搜索页

- [x] 4.1 抽出共用 `ProviderCredentialCard`（含启用勾选、来源、环境变量状态、保存 / 移除、申请链接），`settings-page.tsx` 改为「模型服务」provider 列表（已启用 / 未启用折叠与搜索，DeepSeek 勾选禁用并说明）；组件测试覆盖启用 / 取消、锁定、保存回退、保存中防重复
- [x] 4.2 新增 `/settings/search` 页（`settings-search-page.tsx` + `main.tsx` 路由 + `settings-shell.tsx` 菜单「联网搜索」），承载 `SearchServiceCard` 与 Tavily 凭据卡，并从模型服务页移除；deepseek 缺 Key 时链接到 `/settings` 的 DeepSeek 条目；测试覆盖路由、独立菜单项、Tavily 保存、deepseek 缺 Key 提示
- [x] 4.3 `store.ts` / `lib/gateway.ts` 适配新凭据状态映射与 `setEnabled`；更新或新增 store 测试并通过

## 5. Web：模型选择器重构

- [x] 5.1 在 `lib/` 新增分组、过滤与排序纯函数（按 provider 分组、匹配模型名 / id / provider 名、当前模型分组优先展开），单测覆盖含 `/` 的 id、搜索、空结果
- [x] 5.2 重写 `model-picker.tsx` 的 `ModelForm`：搜索框、折叠分组、模型能力标签、缺 Key 分组引导（链接 `/settings`）、保持一次确认与强度选择；组件测试覆盖分组搜索、缺 Key 不可选、键盘与 Escape 焦点恢复、切换会话不误提交
- [x] 5.3 `composer.tsx` 缺 Key 判断泛化为按当前 provider 状态，新增“provider 未启用”提示（含入口、保留草稿并拦截发送）；删除 `providerNames` 硬编码改用目录名称；测试覆盖未启用 / 缺 Key / 当前模型不在列表的回落标签
- [x] 5.4 在 375 / 768 / 1024 / 1440 宽度下手动验证设置页与选择器无横向溢出，并用 OpenRouter 全量模型（396 项）确认选择器渲染流畅；记录结果（结果：Playwright 在 375/768/1024/1440 下设置页与选择器无横向溢出；OpenRouter 396 项展开渲染 398 个条目、展开耗时 <50ms）

## 6. TUI：/login 两级面板与 /model 列表

- [x] 6.1 重构 `components/login.ts` 为 list → key 两级状态机（过滤、启用切换、DeepSeek 锁定、Tavily 独立分组、Esc 返回保留输入、保存成功自动关闭）；保留遮罩计数、硬件光标与移除确认逻辑；更新 `login.test.ts` 覆盖列表导航、启用、锁定、输入保留、小窗口与关闭后异步结果
- [x] 6.2 `/model` 选择列表改为按 provider 分组并支持过滤，needs key 项不可确认且提示 `/login`；`tui.ts` 发送前检查泛化为按当前 provider 状态引导；测试覆盖过滤、缺 Key、取消不改变会话与草稿
- [x] 6.3 页脚与状态栏模型名保留厂商前缀（`footer.ts`、`tui.ts` 的 `modelShort`）；`labels.ts` 的 `/login` 描述改为多 provider；`footer`/`layout` 测试覆盖同名模型区分
- [x] 6.4 运行 `bun run test` 中 TUI 相关用例与 80x24、60x16 渲染用例通过

## 7. 文档与集成验证

- [x] 7.1 更新 `README.md` 与 `AGENTS.md` 中的凭据 / provider 说明（目录、启用机制、环境变量、`/login`、`/settings` 与 `/settings/search`）；运行文档中给出的命令确认可用
- [x] 7.2 运行 `bun run check` 与 `bun run test` 全量通过；运行 `bun run build` 通过
- [x] 7.3 端到端手动验证：仅 DeepSeek 默认；启用 OpenRouter 并保存 Key 后在 Web / TUI 切换模型并对话；取消启用后拒绝新输入而历史可浏览；旧协议网关被明确拒绝
- [x] 7.4 运行 `openspec validate generalize-model-providers --strict` 通过

## Workflow follow-up

- 评审通过后归档该变更并确认主 specs 已同步。
