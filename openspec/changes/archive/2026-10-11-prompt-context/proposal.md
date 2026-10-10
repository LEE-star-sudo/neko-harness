# Proposal

## Why

neko-harness 目前没有任何系统提示词组装：所有扩展只提供工具，`sections` / `instructions` 注入点闲置，模型拿到的只有裸工具集——没有角色定义、没有项目指令（AGENTS.md）、没有技能（skills）。pi（`reference/pi`）已验证了一套成熟设计：提示词按命名分节增量 diff 进 transcript，AGENTS.md 层级加载，skills 渐进式披露（提示词只放元数据，正文靠 read 工具自取）。pi-durable 原生提供 sections 每请求渲染 + `pi.system` 增量 patch 的机制，缺的是宿主侧的资源加载与节渲染。

## What Changes

- core 新增内置扩展 `neko-prompt`，以五个命名节组装系统提示词：`preamble`（角色定义）、`rules`（按启用工具拼接的规则）、`project_context`（AGENTS.md 内容）、`skills`（技能元数据列表）、`cwd`（会话工作区）。节文本自带 XML 标签（`tag: false`），同一次请求的所有节共享一次构建（WeakMap 按 PromptInput 缓存）。
- AGENTS.md 注入：`~/.agents/AGENTS.md`（用户级）+ `<workspace>/AGENTS.md`（项目级），各渲染为 `<project_instructions path="...">` 块；不向上遍历目录，不支持其他文件名回退。
- skills 注入：扫描 `~/.agents/skills/<name>/SKILL.md` 与 `<workspace>/.agents/skills/<name>/SKILL.md`（不支持 `.neko` 目录），解析 YAML frontmatter（`name` / `description` / `disable-model-invocation`），提示词只注入 `<skill>` 元数据（name/description/location 绝对路径），正文由模型用 `read` 工具自取；同名冲突项目级优先。
- 资源加载每次按 workspace 重读，同一次提示词各节共享结果，文件修改后下一次请求自动生效，无需显式 reload；读文件失败时节返回 `undefined`（省略该节），不向 durable 抛错。
- 新增 `yaml` 作为 core 的精确锁版本直接依赖（仿 pi 的 frontmatter 解析方式）。
- 上下文压缩维持 pi-durable 默认策略不变（本变更只涉及提示词侧，durable 的节 diff / system 前置 / prompt cache 保护为原生行为，免费获得）。

## Capabilities

### New Capabilities

- `prompt-context`: 系统提示词的分节组装与项目上下文注入——节结构与顺序、AGENTS.md 发现与渲染、skills 目录扫描与渐进式披露、资源刷新与请求内一致性、渲染失败语义。

### Modified Capabilities

（无。`agent-runtime` 的扩展机制、原生上下文压缩等需求不变，本变更只是启用已有注入点。）

## Impact

- **代码**：`packages/core` 新增提示词扩展与资源加载模块（预计 `src/prompt/` 下若干文件），`runtime.ts` 注册 `neko-prompt` 扩展；`packages/core/README.md` 与根 `AGENTS.md` 同步更新。
- **API**：`createNekoRuntime` 可能新增可选配置（如关闭用户级目录）；gateway/TUI/Web 无契约变更。
- **依赖**：`packages/core` 新增 `yaml`（精确版本）；`bun.lock` 随之更新。
- **行为**：所有新会话的系统提示词从空变为五节结构；已存在的会话在下一次请求时以 `pi.system` 增量 patch 获得提示词（durable 原生语义，无需迁移）。
- **参考实现**：`reference/pi/packages/coding-agent/src/core/system-prompt.ts`、`core/skills.ts`、`core/resource-loader.ts`、`experimental/durable/prompt.ts`（只读参考，不裹代码）。
