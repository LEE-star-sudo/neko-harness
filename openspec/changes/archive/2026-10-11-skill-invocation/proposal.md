# Proposal

## Why

`prompt-context` 已把 skills 以元数据注入系统提示词（模型用 read 自取正文），但用户没有显式调用技能的手段：`disable-model-invocation` 的技能永远进不了对话，想强制使用某技能也只能靠自然语言碰运气。pi 的成熟做法是在会话层把 `/skill:name [args]` 展开为 `<skill>` XML 用户消息——TUI/RPC/print 全端免费生效，无需 `skill_run` 工具（read 自取已覆盖模型侧，额外工具只是每个请求多付 schema 成本）。

## What Changes

- core 在 `submitTo` 准入层展开 `/skill:name [args]`：文本输入以 `/skill:` 开头时查技能（会话工作区两级目录 + promptHome），命中则展开为 `<skill name location>` XML 块（正文去 frontmatter，首行注明相对路径基准目录，args 原样追加）；未命中原样透传。资源加载器从 `neko-prompt` 闭包提升到 runtime 作用域共享。
- core 新增 `listSkills(id?)`，gateway 会话级 `NekoChat` 新增 `skills()` 方法（按当前会话工作区 + promptHome 返回 name/description/location，含 `disable-model-invocation` 技能）。
- TUI：`/skill:<name>` 动态补全（attach 会话后拉取技能列表，与静态命令合并）；提交不拦截，原样发送由 core 展开。
- Web：composer 菜单支持 `/skill:` 前缀的技能条目；提交同样原样发送。
- 不做：`skill_run` 工具；skill 块在前端的折叠渲染（pi 有，留作后续）；图片混合输入的展开（仅纯文本输入展开，与 pi 一致）。

## Capabilities

### New Capabilities

- `skill-invocation`: 技能的显式调用——`/skill:` 输入在 core 准入层的展开语义、包装格式、参数追加、未知技能透传、禁用模型调用技能的可达性，以及面向前端的技能列表查询。

### Modified Capabilities

- `session-gateway`: 会话级服务新增 `skills()` 方法。
- `terminal-ui`: 新增 `/skill:<name>` 动态补全。
- `web-ui`: composer 命令菜单新增 `/skill:` 技能条目。

## Impact

- **代码**：`packages/core`（`prompt/` 加载器提升、`runtime.ts` submitTo 展开与 listSkills、`src/index.ts` 导出）、`packages/gateway`（contract + session-host）、`packages/tui`（动态补全）、`packages/web`（composer 菜单 + 契约副本）。
- **API**：`NekoChat` 契约新增方法（客户端需同步契约副本）；`NekoRuntime` 新增 `listSkills`。
- **行为**：所有前端发送的 `/skill:x` 文本在 core 统一展开；存量会话无迁移。
- **依赖**：无新增外部依赖。依赖已完成的 `prompt-context` 变更的 `prompt/` 模块。
