# Tasks

## 1. core：展开与列表

- [x] 1.1 `prompt/frontmatter.ts` 补 `stripFrontmatter` 导出（pi 同款）；`prompt/invoke.ts` 实现 `expandSkillCommand(text, skills, readFile)`：仅 `/skill:` 前缀纯文本、命中展开为 `<skill name location>` 块（References 行 + 去 frontmatter 正文 + args 追加）、未命中原样返回；验证单测覆盖命中/无参数/未知技能/disable 技能可展开
- [x] 1.2 loader 提升：`createNekoPrompt` 改收共享 loader，`runtime.ts` 创建 `createResourceLoader(options.promptHome)` 并传入；新增 `runtime.listSkills(id?)`（按会话工作区返回 `{name, description, location}`，`src/index.ts` 导出类型）；验证现有 prompt 测试与 runtime 测试仍绿
- [x] 1.3 `submitTo` 接入展开（工作区校验及幂等检查后，仅 string content）；验证单测：提交 `/skill:x args` 后 faux provider 收到的 user 消息为展开块、混合内容块输入不展开、未知技能透传

## 2. gateway 与契约

- [x] 2.1 `contract.ts`：`NekoChat` 新增 `skills()`，新类型 `NekoSkillInfo`；session-host 实现（调 `runtime.listSkills`）；验证 gateway 测试通过
- [x] 2.2 同步 Web 契约副本 `packages/web/src/client/lib/contract.ts`；验证 `bun run check` 全绿

## 3. TUI 动态补全

- [x] 3.1 attach/切换会话后拉取 `chat.skills()`，映射为 `skill:<name>` 命令（description + argumentHint）与静态命令表合并进补全（pi-tui 不支持运行期更新则重建 provider，以实际 API 为准）；验证 TUI 补全测试通过
- [x] 3.2 确认 submit() 对 `/skill:` 无本地拦截、原文发送；验证手动或测试断言

## 4. Web composer 菜单

- [x] 4.1 输入 `/skill:` 前缀时菜单列出按前缀过滤的技能条目（label + description），选中填入 `/skill:<name> `；技能列表随会话切换刷新；提交原样发送；验证 Web 客户端类型检查与相关测试通过

## 5. 集成验证与文档

- [x] 5.1 `bun run test` 与 `bun run check` 全绿
- [x] 5.2 端到端：临时工作区放技能（含一个 disable-model-invocation），faux provider 断言 `/skill:` 展开内容、args 追加、disable 技能可展开、列表 RPC 返回全量
- [x] 5.3 更新 `packages/core/README.md`（/skill: 展开语义、listSkills）、根 `AGENTS.md` 提示词与技能一节补一句显式调用；TUI/Web README 或帮助文本如有命令清单则同步
