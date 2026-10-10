# Tasks

## 1. core 凭据表面参数化

- [x] 1.1 在 core 新增 provider 凭据描述表（`deepseek`/`tavily`：envVar、signupUrl、keyless 标记），`CredentialStatus.source` 增加 `"keyless"`；`bun run check` 通过
- [x] 1.2 将 `credentialStatus`/`saveCredential`/`removeCredential` 参数化为按 provider（校验已知集合），Tavily env 探测读 `TAVILY_API_KEY`；扩展 `packages/core/test/credentials.test.ts` 覆盖 per-provider 保存/移除互不影响与 keyless 来源，测试通过
- [x] 1.3 `NekoRuntimeOptions` 增加 `tavilyApiKey`（仅内存覆盖，手法同现有 `runtimeKey`）；`packages/core/test/runtime.test.ts` 增加覆盖用例，测试通过

## 2. core web-search 工具

- [x] 2.1 新增 `packages/core/src/web-search.ts`：`createWebSearchTools(resolveKey)` 工厂返回 `neko-web-search` 扩展（`web_search`/`web_extract`，裸 fetch + 30s 超时 + keyless 头逻辑 + 有界截断，参照 `read-image.ts` 模式）；单测以假 fetch 覆盖 keyless 头、Bearer 优先、限流错误透传、extract 部分失败，测试通过
- [x] 2.2 `runtime.ts` 安装该扩展（闭包注入凭据解析），工具出现在会话 agent 的扩展列表；`getAgent` 相关测试更新并通过
- [x] 2.3 真实冒烟（手动，可选）：不设任何 key 运行示例脚本调用 web_search，确认 keyless 返回真实结果

## 3. 网关契约参数化（breaking）

- [x] 3.1 `NekoCredentialState` 改为 `{ revision, statuses: Record<provider, CredentialStatus> }`，`save({provider,key})`/`remove({provider})`；`server-services.ts` 实现同步更新；`packages/gateway/test/credentials.test.ts` 适配并通过

## 4. TUI /login 支持多 provider

- [x] 4.1 `LoginPanel` 增加 provider 切换（方向键/Tab），状态读取改自 `statuses[provider]`，save/remove 带 provider，切换时清空未保存输入；发送拦截改读 `statuses.deepseek`；面板渲染与键位行为在 80x24/60x16 下人工验证无越界

## 5. Web 设置页重构

- [x] 5.1 提取紧凑的 `ProviderCredentialCard` 共享组件（来源徽章含 keyless 语义、env 状态、密码输入、保存/移除、申请链接），DeepSeek/Tavily 并列；`gateway.ts`/`store.ts` 凭据消费适配新契约；`bun run check` 通过
- [x] 5.2 浏览器人工验证：设置页在 1440/1024/768/375 宽度下无横向溢出，保存/移除/来源切换（含 keyless 显示）行为符合 web-ui spec 场景

## 6. 收尾与集成

- [x] 6.1 CLI usage 文案补充 `TAVILY_API_KEY`；`packages/cli/test/startup.test.ts` 适配并通过
- [x] 6.2 全量验证：`bun run test`、`bun run check`、`bun run build` 全部通过

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived result.
