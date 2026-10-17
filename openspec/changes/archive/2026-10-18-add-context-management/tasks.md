# Tasks

## 1. 配置与压缩触发条件

- [x] 1.1 在 `packages/core/src/config.ts` 增加 `context.compaction`/`context.pruning` 类型、校验与合并；补 `config` 单测覆盖合法值、未知字段、越界与类型错误、合并优先级，运行 `bun test --conditions=neko-source packages/core` 通过
- [x] 1.2 `createNekoRuntime` 新增 `contextSettings` 选项与 `app.neko.context-settings` 文档（root 会话、`history: "latest"`，启动读取并缓存），提供 `contextSettings()`/`setContextSettings(patch)`/`resetContextSettings()`（共用配置校验，先校验后持久化再更新缓存，优先级保存值 > 配置值 > 默认）；以 getter 向 `Harness.open` 提供 `settings.compaction`（`triggerPercent` 按最小模型窗口换算 `reserveTokens`，`keepRecentTokens`、`enabled` 直接映射，未设置的字段不返回）。用 faux provider 断言：未设置时与默认一致，配置/保存后阻塞阈值与 `keepRecentTokens` 符合预期且保存后无需重启即生效，`enabled:false` 时手动压缩仍可用，重启保留，非法值被拒且缓存不变
- [x] 1.3 `packages/gateway/src/gateway.ts` 把 `fileConfig.context` 透传给 `createNekoRuntime`；补网关测试：配置文件值生效、非法配置启动失败并报字段
- [x] 1.4 在 README 与 `AGENTS.md` 补 `context.compaction` 说明（含默认不变、最小窗口口径、UI 保存值优先于配置文件）；核对文档示例 JSON 可被 `parseNekoConfig` 解析

## 2. 工具结果裁剪

- [x] 2.1 新增 core 裁剪模块：纯函数选择候选（排除近期 `keepRecent`、已裁剪、体积 < `minChars`）并生成占位 `replace` edits（保持 `toolCallId`/`toolName`/`isError`）；单测覆盖选择规则、占位格式、重复调用不产生新条目
- [x] 2.2 实现触发器：订阅提交，新成功 `pi.assistant` 条目占用 ≥ `triggerPercent` 时提交 `app.neko.context-prune` write（`requestId = prune:<助手条目 id>`）；`enabled` 非 true 时不安装；用 faux provider 的集成测试验证：达阈值后下一次请求的消息含占位、未达阈值不变、历史条目未被改写
- [x] 2.3 恢复与失败路径：重启后不重复写入且上下文一致；写入失败走 `onReport` 并在下次触发重试，不使运行失败；补相应测试
- [x] 2.4 核对并测试展示隔离：投影（含 TUI/Web 共用的 `projection`）、会话导出、移动端投影、会话元数据最后消息时间、输入历史均不显示/不受 prune 条目影响，工具卡片仍显示完整输出；运行相关包测试通过
- [x] 2.5 在 README 与 `AGENTS.md` 补 `context.pruning` 说明（默认关闭、缓存取舍、可恢复性）

## 3. 网关合约与同步

- [x] 3.1 在 `gateway/src/contract.ts` 新增 `NekoContextSettings`（`state: { revision, effective, sources }`，`set(patch)`、`reset()`，严格校验）并导出类型；在 `server-services.ts` 增加状态与处理（经 `serialize`，失败不发布），在 `client-session.ts` 绑定并等待首个状态；补网关测试：多端同步、未 attach 与重连、逐项/整体恢复默认、非法提交与持久化失败不改变状态
- [x] 3.2 将 `APPLICATION_PROTOCOL` 从 5 递增为 6，更新 `application-version`/gateway-startup 测试与 `AGENTS.md` 的协议版本数字；验证旧版本握手被拒的测试通过

## 4. TUI `/context` 面板

- [x] 4.1 新增 `packages/tui/src/context-ui.ts` 与面板：英语列出各项生效值与来源（Default/Config/Saved/Custom），Enter 进入预设选择，Reset to defaults，失败显示不含内部细节的错误，订阅状态保持同步，保持草稿/附件/历史状态；沿用 `/search` 面板的挂载与样式，单测覆盖列表生成、预设选择、恢复默认、保存失败与多端同步
- [x] 4.2 把 `/context` 加入斜杠补全与 `/help`，验证相关测试包含该命令

## 5. Web 「上下文管理」卡片

- [x] 5.1 在 `packages/web/src/client/lib/{gateway,store,bootstrap}.ts` 增加 `contextSettings` 状态（revision 单调保护）与保存/恢复动作；在设置区提供上下文管理界面（见 6.1）：压缩与裁剪两组、来源标签、逐项与整体恢复默认、失败可重试，裁剪说明含缓存取舍；补组件测试覆盖默认状态、非法输入、恢复默认、保存失败与同步；`bun run --cwd packages/web check:client` 通过

## 6. Web 设置栏目与交互优化

- [x] 6.1 把上下文设置从密钥页拆为独立栏目「上下文」（新路由 `/settings/context`、侧栏菜单项与图标）；以触发位置预览条、开关与一键预设芯片重做界面（无文本输入、连续点击按序保存、配置文件值显示为自定义档位）；更新 `packages/web/test/context-settings.test.tsx`，`bun run --cwd packages/web check:client` 与 web 测试通过，并在浏览器中核对桌面与窄屏布局

## 7. 缓存友好的批量裁剪

- [x] 7.1 新增 `context.pruning.minSavePercent`（1–99，默认 5）：配置/保存/网关/TUI/Web 全链路与校验；裁剪触发器在计划预计释放体积不足窗口该比例时不写入；补设置、配置校验与集成测试，更新 spec、design 与 README

## 8. 集成验证

- [x] 8.1 运行 `bun run check`、`bun run test`、`bun run build` 全部通过，并确认 `openspec validate add-context-management --strict` 通过
- [x] 8.2 用小窗口 faux 模型或调低 `triggerPercent` 的真实配置做一次端到端手测：`neko web` 与 `neko tui` 长会话触发压缩与裁剪，并验证 `/context` 与设置页修改在两端同步、无需重启即生效、前端工具卡仍完整，重启后继续对话正常；再验证回退到旧网关时未知的 `app.neko.context-settings` 文档被忽略

## Workflow follow-up

- 评审通过后归档该变更并同步 `agent-runtime`、`context-pruning`、`session-gateway`、`web-ui`、`terminal-ui` 主 spec。
- 升级到含 `compaction.modelOverrides` 的 pi-durable 后，另开变更把压缩百分比改为按模型。
