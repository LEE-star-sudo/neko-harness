# Design

## Context

`prompt-context` 已实现：`packages/core/src/prompt/`（skills.ts 扫描/格式化、resources.ts 的 `createResourceLoader(home)` 资源加载器、prompt.ts 的 `createNekoPrompt(home?)`）。loader 目前藏在 `createNekoPrompt` 闭包内。pi 的参考实现：`agent-session.ts:2147-2171` 的 `_expandSkillCommand`（展开在会话层，TUI/RPC/print 共享）与 `interactive-mode.ts:804-822`（TUI 只做补全注册，不做展开）。

neko 链路事实：core `submitTo`（`runtime.ts:420`）是唯一的提交入口，content 为 `UserMessage["content"]`（string 或内容块数组）；gateway 会话级服务是 `NekoChat`（`contract.ts:92`），session-host 实现；TUI 命令表 `labels.ts` 为静态数组、经 `fileCompletion` 进 pi-tui 补全；Web composer 菜单（`composer.tsx:329`）目前只有 `/compact`；Web 持有契约副本 `packages/web/src/client/lib/contract.ts`。

## Goals / Non-Goals

**Goals:**

- `/skill:name [args]` 在 core 准入层统一展开，所有客户端免费生效。
- 前端可查询当前会话技能列表（含 disable-model-invocation 技能）用于补全。
- TUI/Web 补全体验对齐 pi（`skill:<name>` 条目 + 描述）。

**Non-Goals:**

- 不定义 `skill_run` 工具：模型侧 read 自取已覆盖，额外工具只是每个请求多付 schema 成本（调研结论，pi 同样没有）。
- 不做 skill 块在前端的折叠渲染（pi 的 `SkillInvocationMessageComponent`），留作后续。
- 不展开含内容块（图片等）的混合输入，与 pi 的纯文本展开一致。
- 不支持 `expandPromptTemplates: false` 之类的关闭开关（pi 有，neko 暂不需要）。

## Decisions

### D1: 展开在 core `submitTo`，不在 gateway/前端

对应 pi 的 AgentSession 层：`submitTo` 开头（工作区校验之后、幂等检查与内容预处理之前），`typeof content === "string" && content.startsWith("/skill:")` 时查技能并替换 content。理由：单一实现，TUI/Web/未来 RPC 客户端、steer/followUp 全部生效；展开后的文本进入 transcript 与标题命名，与 pi 一致。备选：前端展开——拒绝，需要新增"读技能正文"RPC 且两端重复实现。

### D2: 展开格式照抄 pi

`<skill name="${name}" location="${filePath}">\nReferences are relative to ${baseDir}.\n\n${stripFrontmatter(body)}\n</skill>`，args 非空时 `\n\n${args}` 追加。未知技能名原样透传。实现放 `prompt/invoke.ts`：`expandSkillCommand(text, skills, readFile)` 纯函数化（读文件注入，便于测试）；`stripFrontmatter` 从 `frontmatter.ts` 补一个导出（pi 有同款）。

### D3: 资源加载器提升到 runtime 作用域

`createNekoPrompt` 改为接受共享 loader：`createNekoPrompt(loadResources)`；runtime 里 `const loadResources = createResourceLoader(options.promptHome)`，同时供扩展与展开/列表使用。skills 每次加载重新读取；展开与系统提示词共享发现规则，但读取时间不同，不承诺跨时刻快照一致。新增 `runtime.listSkills(id?)`：解析会话工作区（`agent().cwd` → `savedWorkspace`），返回 `{ name, description, location }[]`。

### D4: RPC 挂会话级 `NekoChat.skills()`

会话级而非服务器级：工作区隐含于会话，前端无需自己传路径；attach 后即可用。返回类型 `NekoSkillInfo = { name, description, location }`（契约新类型，Web 契约副本同步）。session-host 直接调 `runtime.listSkills(sessionId)`。

### D5: TUI 只做动态补全，提交零拦截

attach/切换会话后 `chat.skills()` 拉取，映射为 `{ name: "skill:<name>", description, argumentHint: "[args]" }` 与静态命令表合并进补全。pi-tui 的 `CombinedAutocompleteProvider` 接受命令数组——若不支持运行期更新，则在技能列表变化时重建 provider（实现时在 apply 阶段核实 `packages/tui` 现有用法）。submit() 不加 `/skill:` 分支，原文发送。

### D6: Web composer 菜单加技能条目

输入匹配 `/^\/skill:/` 时菜单列出按前缀过滤的技能条目（label `/skill:<name>`，附 description），选中填入 `/skill:<name> `；提交原样发送。技能列表随会话切换重新拉取。

## Risks / Trade-offs

- [补全列表与会话切换的时序：拉取未完成时用户已输入] → 列表为空时退化为无补全，提交不受影响（展开在 core）。
- [pi-tui 补全 provider 可能不支持动态命令] → 重建 provider 或包一层动态源；apply 时以 pi-tui 实际 API 为准，不裹代码。
- [展开后文本变长，影响首问标题预览] → 与 pi 行为一致（标题基于展开后内容），可接受。
- [同名 requestId 重试时展开结果一致性] → 重复 requestId 在展开前检查，复用已保存 submission，不再读取技能正文。

## Migration Plan

无迁移。新行为只对以 `/skill:` 开头的新输入生效；存量会话与存储不变。回滚即撤掉 core 展开分支与 RPC。
