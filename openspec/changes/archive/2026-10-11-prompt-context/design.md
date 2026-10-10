# Design

## Context

现状见 proposal.md。约束与已核实的事实：

- pi-durable 的 `PromptSection.render(input)` 中 `input.agent.cwd` 即是会话工作区（neko 创建会话时必写，`runtime.ts:364-370`、`:678-697`），无需经 `input.env` 取。
- durable 按扩展安装顺序拼接各扩展的 sections；同 key 后装覆盖先装。我们的五个 key 无冲突，节顺序由扩展内部声明顺序决定。
- durable 的 `section(key, render, { tag: false })` 允许节文本自带标签——pi 的 durable 桥（`reference/pi/packages/coding-agent/src/experimental/durable/prompt.ts`）正是这样做的，并用 `WeakMap<PromptInput, ...>` 让同一请求的五个节共享一次构建。
- durable 的 CodingTools 不携带 `promptSnippet` / `promptGuidelines`（那是 coding-agent 的 ToolDefinition 概念），所以工具规则文案要宿主自备。
- `packages/core` 的 `src/index.ts` 被 Web 客户端（浏览器）引入；凡是 Node-only 的模块（fs 访问）不得进入该导出面（参照 `workspace-files.ts` 走 subpath 的先例）。
- pi 的 frontmatter 解析用 `yaml` 包（pi 锁 2.9.0）；neko 依赖中尚无 `yaml`。

## Goals / Non-Goals

**Goals:**

- 一个 `neko-prompt` 扩展完成五节组装，渲染逻辑与 pi 的 durable 桥同构。
- AGENTS.md 两级发现与 skills 两级扫描，每次加载重读资源、请求内共享快照。
- 资源访问失败省略该节/该文件并提供不含正文的诊断，请求不阻断。

**Non-Goals:**

- 不动 compaction 策略、不改 gateway/TUI/Web 契约。
- 不做 SYSTEM.md / APPEND_SYSTEM.md 之类的提示词模板替换机制（pi 有，neko 暂不需要）。
- 不做向上目录遍历、AGENTS.override.md、CLAUDE.md 回退、`.neko` 目录。
- 不提供关闭用户级目录 / 禁用 skills 的配置开关（v1 始终开启；若后续需要再加 `createNekoRuntime` 选项）。
- skills 只进提示词，不做 `/skill:name` 显式调用命令（那是前端斜杠命令的范畴）。
- 不截断 AGENTS.md 内容（pi 同样全量注入；超大文件的风险由用户自负，见 Risks）。

## Decisions

### D1: 模块布局——`packages/core/src/prompt/` 四文件，不进浏览器导出面

- `prompt.ts`：`createNekoPrompt()` 返回扩展（`defineExtension({ name: "neko-prompt", sections })`）；`runtime.ts` 在工具扩展之后 `registry.install`。
- `resources.ts`：按工作区的 AGENTS.md 加载与 skills 收集。
- `skills.ts`：SKILL.md 扫描、frontmatter 校验（name ≤ 64、description 必填 ≤ 1024、name 缺省回落目录名）、`formatSkillsForPrompt`（照抄 pi 的 `<available_skills>` XML 与 `escapeXml`）。
- `frontmatter.ts`：`---` 分隔、BOM/CRLF 归一后交给 `yaml.parse`（照抄 pi 的 `utils/frontmatter.ts`）。

这些模块只被 `runtime.ts`（Node 侧）引用，不从 `src/index.ts` 导出。备选：放进 `runtime.ts` 单文件——拒绝，资源加载逻辑值得独立测试。

### D2: 五节结构与渲染——照抄 pi 的 durable 桥模式

- 节顺序 `["preamble", "rules", "project_context", "skills", "cwd"]`；每个节 `section(key, input => build(input)[key], { tag: false })`；`build` 用 `WeakMap<PromptInput, Promise<Record<string, string | undefined>>>` 保证同一请求只构建一次。
- `preamble` 不带标签（与 pi 一致），一句话角色定义（"expert coding assistant operating inside neko"），静态文本。
- `rules`：静态规则表 `Record<toolName, string[]>` 覆盖七个工具（read/write/edit/bash/read_image/web_search/web_extract），按 `input.agent.tools` 实际启用集拼接、全局去重，兜底追加 "Be concise…" / "Show file paths clearly…"（pi `buildRules` 同款）；无 bash 派生的条件规则之外不加 `tools` 列表节——工具清单已由请求里的 tool declarations 携带，重复进提示词是冗余（与 pi 的差异点，有意为之）。
- `project_context`：`"Project-specific instructions and guidelines:"` + 每个文件一个 `<project_instructions path="…">` 块（pi `renderProjectContext` 同款）。
- `skills`：pi `formatSkillsForPrompt` 同款文案（"Use the read tool to load a skill's file…" + 相对路径解析提示），location 为 SKILL.md 绝对路径；`disableModelInvocation` 的排除。neko 恒有 `read` 工具，不需要 pi 的 bash/indirect 分支。
- `cwd`：`input.agent.cwd`（`\` 转 `/`）。节在 cwd 缺失时省略（防御；neko 正常路径必然有值）。

### D3: AGENTS.md 与 skills 的两级发现——固定路径，无遍历

- AGENTS.md 候选恰好两个：`~/.agents/AGENTS.md`（前）、`<workspace>/AGENTS.md`（后）。存在且可读才进列表。
- skills 目录恰好两个：`~/.agents/skills/`、`<workspace>/.agents/skills/`；各取一级子目录下的 `SKILL.md`（不递归，pi 的默认目录也不递归进嵌套）。同名项目级覆盖用户级（按收集顺序后者覆盖前者，与 pi 的 first-wins 相反——pi 的 first-wins 是为了让更具体的路径先注册；两级模型下"项目覆盖用户"语义更直观，且与用户级→项目级的覆盖惯例一致）。

备选：照 pi 向上遍历 + worktree 去重——拒绝，proposal 已定为两级，遍历的收益在 monorepo 场景，成本是发现规则复杂度。

### D4: 资源刷新——重读文件，请求内复用

核对本地 Pi 参考实现：普通 resource-loader 通过显式 reload 重新加载；experimental/durable/prompt.ts 使用按目录一次加载的 Map。两者均未使用 mtime/ctime/size 指纹缓存。

neko 保留已约定的“下一请求自动生效”，因此每次 loader 调用重读两级资源，不做跨请求文件内容缓存，也不新增 ctime/size 猜测。同一个 PromptInput 的各节通过 WeakMap 中的 Promise 共享一次加载。扫描按目录名排序，保证稳定输出；代价为每次加载读取所有技能文件，资源数量较大时需实测再优化。

共享 loader 代表相同发现规则，不保证用户提交展开与稍后模型生成跨时刻看到同一磁盘版本；显式调用正文以准入时读取并持久化的版本为准，系统元数据以生成准备阶段加载版本为准。

### D5: frontmatter 依赖——新增 `yaml` 精确版本

`packages/core` 新增 `"yaml": "2.9.1"`（pi 锁 2.9.0，取最新 patch），`bun.lock` 随之更新。备选：手写 key: value 子集解析——拒绝，YAML 标量转义/多行的边角会咬人，且偏离"仿 pi"。

### D6: 失败语义——逐文件 try/catch，节级返回 undefined

读文件、stat、YAML 解析的任何异常都在单文件粒度捕获并跳过该文件；节内容为空则 render 返回 `undefined`（durable 语义 = 省略该节，且 `pi.system` patch 里记 `null` 删除旧节）。绝不向 durable 抛 render 错误（抛错会触发 durable 的"保留旧文本"路径，文件被删时残留过期内容）。

## Risks / Trade-offs

- [每次加载的磁盘成本] → 每次读取两级指令与技能；请求内复用，暂不引入未经验证的缓存机制。
- [超大 AGENTS.md 全量注入挤占上下文] → 保留全量注入，超过 64 KiB 时诊断提示（neko 自有阈值）；历史压缩不会缩短下一次重新注入的系统指令，不承诺压缩兜底。
- [技能正文依赖模型主动 read，小模型可能不会用] → pi 同款披露文案已含指引；neko 的默认模型能力足够。后续若需强制注入可加 `include` frontmatter 字段，不阻塞 v1。
- [新增 `yaml` 依赖的供应链面] → 精确锁版本 + bun.lock 审查，与项目现有依赖纪律一致。

## Migration Plan

无迁移。存量会话在下一次请求时由 durable 的 `pi.system` 增量 patch 自然获得五节提示词；回滚即移除 `neko-prompt` 的 install，下一请求 patch 会把节置 `null` 删除。


## Review 修正

- frontmatter 只接受独占一行的分隔符及 YAML 映射；这是对 Pi 宽松实现的局部纠错。
- Pi 名称规则产生 warnings 后仍可加载；neko 仅新增拒绝不可调用的空白/控制字符名称，保留命名空间名称，不把 Pi 的所有命名警告升级为错误。
- 资源缺失正常省略；读取/解析失败产生路径和固定原因诊断，不记录正文。已知技能展开失败保留原文并报告，沿用 Pi 语义。

- 诊断按工作区去重，只记路径和固定原因；连续同一问题不刷屏，恢复后再次失败会重新报告。
