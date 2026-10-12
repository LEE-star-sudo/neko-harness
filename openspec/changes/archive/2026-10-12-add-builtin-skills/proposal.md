# Proposal

## Why

neko 目前只有用户级与项目级两级技能目录，所有技能都要用户手工放置才能使用。skill-creator（造技能的元技能）与 skill-finder（发现技能的入口技能）是技能生态的"自举"能力：没有它们，用户既难以创建自己的技能，也不知道技能市场的存在。将二者随包内置，让每个安装 neko 的用户开箱即有完整的技能创建与发现闭环，也为后续 skill 市场（add-skill-market）提供模型侧的引导入口。

## What Changes

- core 新增第三级技能发现来源：随包分发的内置技能目录 `packages/core/skills/`（最低优先级），发现优先级变为 项目级 > 用户级 > 内置级。
- 内置两个技能：
  - `skill-creator`：基于 anthropics/skills 官方元技能裁剪（移除 Claude.ai / Cowork 平台专节），指导创建、评估、迭代 SKILL.md。
  - `skill-finder`：对 vercel-labs `find-skills` 的 neko 改写版。**改名以避让**：市场已上架原版 `find-skills`（驱动 `npx skills` 生态），用户可自行安装，两者共存互不干扰。正文改写为指向 neko 技能市场：模型可用 bash curl 查询市场 API 代为检索，但安装动作引导用户到 Web 市场页或 TUI `/skills` 完成，模型不代为安装。
- 技能信息携带来源级别：`NekoSkillInfo` 增加 `level`（`project` / `user` / `builtin`），技能列表查询返回值随之扩展。
- Web 输入框 `/skill:` 命令菜单对内置技能显示「内置」标记，与市场下载的技能可辨识。
- 内置技能只读：随包分发，不提供卸载；同名用户级/项目级技能按优先级正常覆盖内置版本。

## Capabilities

### New Capabilities

- `builtin-skills`: 随包分发的内置技能集及其发现机制——内置目录的位置与分发形式、内置技能的只读性质、skill-creator 与 skill-finder 两个初始内置技能的行为约定（skill-finder 的发现引导语义与改名避让理由）。

### Modified Capabilities

- `prompt-context`: 「Skills 目录发现」requirement 从两级目录扩展为三级，同名优先级 项目级 > 用户级 > 内置级；扫描失败语义沿用（单级失败不影响其他级）。
- `skill-invocation`: 「两级技能解析」requirement 改为三级解析（展开与查询均沿新优先级）；「技能列表查询」requirement 返回值增加来源级别字段。
- `web-ui`: composer `/skill:` 技能条目增加来源级别标记（内置技能可辨识）。

## Impact

- **代码**：`packages/core/src/prompt/resources.ts`（第三扫描源）、`packages/core/src/prompt/skills.ts`（Skill 类型带 level）、`packages/core/src/runtime.ts`（NekoSkillInfo.level、listSkills）、`packages/web/src/client/lib/command-suggestions.ts` 与 `composer-suggestions.tsx`（内置徽章）。
- **新资产**：`packages/core/skills/skill-creator/`、`packages/core/skills/skill-finder/`（SKILL.md + references）。
- **API**：`NekoSkillInfo` 增加只读字段，向后兼容（新增字段，无破坏）。
- **依赖**：无新增运行时依赖。
- **路径解析约束**：内置目录须同时兼容 Bun 源码模式（`neko-source` 条件指向 `src/`）与 tsc 构建产物（`dist/` 镜像 `src/` 结构），以 `import.meta.url` 相对定位 `packages/core/skills/`。
