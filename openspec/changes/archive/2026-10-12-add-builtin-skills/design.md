# Design

## Context

现状（详见 proposal.md - Why）：core 的技能发现由 `packages/core/src/prompt/resources.ts` 的 `readResources` 完成，扫描 `userSkillsDir` 与 `workspaceSkillsDir` 两个目录，`mergeSkills` 按"后者覆盖同名"合并；`Skill` 类型（`skills.ts`）只有 name/description/filePath/disableModelInvocation；`NekoSkillInfo`（`runtime.ts`）暴露 name/description/location 给前端补全。运行形态有两种：Bun 源码模式（`neko-source` 条件指向 `src/`）与 tsc 构建产物（`dist/` 镜像 `src/` 目录结构，`packages/core/tsconfig.build.json` 的 rootDir/outDir 保证）。

## Goals / Non-Goals

**Goals:**

- 第三级"内置级"技能来源，随包分发，源码/构建两种形态路径一致。
- 内置 `skill-creator` 与 `skill-finder` 两个技能；skill-finder 为市场生态引导入口（市场 UI 由 add-skill-market 提供，本变更只写技能正文中的引导口径）。
- 技能携带 `level` 标记贯通 core → gateway → web 补全。

**Non-Goals:**

- 不做内置技能的用户可配置开关（如禁用某内置技能）；需要时用同名空 description 覆盖或后续变更。
- 不动技能正文的按需加载机制（read 工具自取）与快照语义。
- 不在本变更实现市场服务与前端市场页（add-skill-market 的职责）。

## Decisions

### D1: 内置目录放在 `packages/core/skills/`，以模块 URL 相对定位

内置技能作为纯资产文件（SKILL.md + references）放在 core 包根下的 `skills/`，不进 `src/`。定位用 `new URL("../../skills/", import.meta.url)`：`src/prompt/resources.ts` 与 `dist/prompt/resources.js` 向上两级都是 `packages/core/`，两种运行形态解析一致（spec「两种运行形态一致」scenario 的直接保障）。

备选：构建期拷贝到 `dist/skills/`——多一步构建拷贝且要维护 tsconfig 之外的资产管线，tsc 本身不拷贝非 TS 文件，否决。备选：打进单文件 bundle——CLI 目前不以 bundle 分发（`bun packages/cli/dist/main.js` 直接跑 dist），暂不引入。

core 是 `private: true` 的 monorepo 内部包，无 npm `files` 白名单问题；若未来发布，需把 `skills/` 加进发布清单（记入 Risks）。

### D2: `Skill` 增加 `level`，合并顺序改为 [builtin, user, project]

`scanSkillsDir` 增加 level 参数（或返回后由调用方贴标），`Skill` 类型加 `readonly level: "project" | "user" | "builtin"`。`mergeSkills` 语义不变（后者覆盖同名），调用点改为 `mergeSkills([builtin, user, project])`，优先级自然落成 项目级 > 用户级 > 内置级。`formatSkillsForPrompt` 不变——提示词里的 `<available_skills>` 不带级别（模型不需要感知，减少提示词噪声）。

`NekoSkillInfo` 加 `readonly level` 字段，`listSkills` 透传。纯新增字段，gateway 契约向后兼容。

### D3: skill-finder 正文改写为"检索代办、安装归人"

内置技能正文（Markdown）要点：

- **skill-creator**：以 anthropics/skills 官方版为底（注意附带其 LICENSE 归属说明），删除 Claude.ai 专节与 Cowork 专节（这两个平台特性 neko 没有），保留创建/评估/迭代/description 调优主线。references 目录随正文裁剪同步精简。
- **skill-finder**：全新撰写，不复用 vercel 原版正文（其 `npx skills` / skills.sh 装机量叙事与私有市场语义不符）。要点：
  - 触发：用户问"有没有 X 的技能 / 怎么做 X"且 X 可能是常见任务；
  - 检索：模型可用 bash `curl -s "https://skill.kirineko.tech/api/skills?q=<query>"` 只读查询（无需密钥），向用户呈现候选（名称/描述/分类/来源）；
  - 安装引导：Web 端引导到市场页，TUI 端提示 `/skills` 命令；模型 MUST NOT 自行下载安装（安装确认权属用户，与市场 UI 的覆盖确认设计一致）；
  - 无结果时回落：直接以通用能力帮忙，并可建议用 skill-creator 自建。
  - 市场地址不写死为唯一事实：正文注明默认地址，若用户配置了自定义市场地址（add-skill-market 的 `skills.marketUrl`）以其为准——通过让模型读 neko.config.json 获得，不在技能正文内嵌配置逻辑。

备选：模型代办安装（curl 下载 zip + 解压写盘）——绕过覆盖确认 UX、写盘路径语义（用户级/项目级）对模型不透明，否决。

### D4: Web 补全菜单内置标记为纯展示层改动

`command-suggestions.ts` 把 `NekoSkillInfo.level === "builtin"` 映射为条目右端的「内置」徽章（`text-xs`、ink 浅底，沿用主题 token），`composer-suggestions.tsx` 渲染。不新增图标、不改菜单结构。

### D5: 测试策略

- core 单测：三级合并优先级、内置目录缺失静默、同名覆盖链（builtin→user→project）、`parseSkillFile` 不受影响回归。
- 路径定位测试：两种形态的一致性用"内置目录解析结果存在且含两个技能"的断言覆盖（测试本身跑在源码模式，构建形态由 `bun run build` 后的冒烟验证兜底，写入 tasks）。
- web 侧：补全条目带徽章的纯函数测试（command-suggestions 层）。

## Risks / Trade-offs

- [内置技能正文与上游演进脱节] → skill-creator 正文头部注明来源版本与裁剪点，升级走显式变更（与上游 pi 依赖同一纪律）。
- [未来 core 发布 npm 时漏带 `skills/` 资产] → 在 core package.json 注释/发布检查单中登记；本变更不解决发布问题。
- [skill-finder 提及的市场地址在 add-skill-market 落地前无对应 UI] → 正文写成"市场页或 /skills 命令（若可用）"，两个变更独立可用；add-builtin-skills 先合入也不产生坏引用（curl 检索路径独立有效）。
- [三级合并使"我的技能为什么没生效"排查变复杂] → `listSkills` 已返回 location 与 level，用户可直接看到生效版本的来源。

## Migration Plan

纯新增能力，无数据迁移。升级即得两个内置技能；已有同名用户级/项目级技能的用户无感知（其版本继续优先）。
