# Tasks

## 1. 依赖与模块骨架

- [x] 1.1 `packages/core` 新增 `"yaml": "2.9.1"` 精确依赖，`bun install --frozen-lockfile` 失败后按流程更新 `bun.lock`，验证 `bun install --frozen-lockfile` 通过
- [x] 1.2 新建 `packages/core/src/prompt/` 目录与 `frontmatter.ts`（照 pi `utils/frontmatter.ts`：`---` 分隔、BOM/CRLF 归一、`yaml.parse`），验证 `bun run check` 无新增错误

## 2. Skills 扫描与格式化

- [x] 2.1 实现 `prompt/skills.ts`：扫描给定 skills 目录的一级子目录 `SKILL.md`，frontmatter 校验（description 必填 ≤1024、name 缺省回落目录名、`disable-model-invocation`），解析失败/缺 description 跳过该技能；验证对应单测通过
- [x] 2.2 实现 `formatSkillsForPrompt`（`<available_skills>` XML + `escapeXml` + read 工具指引文案，照 pi `skills.ts:358-397`），验证格式化输出与转义的单测通过

## 3. 资源加载与请求内复用

- [x] 3.1 实现 `prompt/resources.ts`：AGENTS.md 两级候选（`~/.agents/AGENTS.md`、`<workspace>/AGENTS.md`）读取与 `<project_instructions path="…">` 渲染；逐文件 try/catch，失败跳过；验证单测覆盖两级共存/仅项目级/不可读场景
- [x] 3.2 按修订后的 design D4 每次重读工作区资源，同一次提示词共享加载，两级 skills 合并同名项目级覆盖用户级；验证单测覆盖编辑后失效、新增技能目录后失效、权限恢复与删除生效

## 4. neko-prompt 扩展与接入

- [x] 4.1 实现 `prompt/prompt.ts`：`createNekoPrompt()` 按 design D2 组装五节（`tag: false`、WeakMap 按 PromptInput 共享构建、空节返回 undefined、cwd 取 `input.agent.cwd`），静态规则表覆盖七个内置工具；验证节顺序/空节省略/规则去重的单测通过
- [x] 4.2 `runtime.ts` 在工具扩展之后 `registry.install(createNekoPrompt())`；`src/index.ts` 不导出 prompt 模块（Node-only）；验证 `bun run check` 与现有 runtime 测试通过
- [x] 4.3 更新 `packages/core/README.md` 与根 `AGENTS.md`（提示词节结构、两级 AGENTS.md 与 skills 目录约定），验证文档中的路径与行为描述和实现一致

## 5. 集成验证

- [x] 5.1 `bun run test` 与 `bun run check` 全绿
- [x] 5.2 端到端验证：临时目录放置 AGENTS.md 与 `.agents/skills/x/SKILL.md`，以该目录为 workspace 创建会话并提交一次输入（faux provider 或测试内断言），确认系统提示词含五节、`project_context` 与 `skills` 内容正确；编辑 AGENTS.md 后再提交，确认下一请求提示词更新
