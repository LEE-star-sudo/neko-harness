# Tasks

## 1. core 三级发现机制

- [x] 1.1 `Skill` 类型增加 `readonly level: "project" | "user" | "builtin"`；`scanSkillsDir` 支持给扫描结果贴级别标签（参数或调用方映射）。验证：`bun run test` 中 skills 相关用例通过
- [x] 1.2 新增内置目录常量与定位：`packages/core/src/prompt/resources.ts` 增加以 `import.meta.url` 相对定位 `packages/core/skills/` 的 `builtinSkillsDir`；目录缺失/不可读静默视为空集且不产生诊断。验证：新增单测断言缺失目录无告警
- [x] 1.3 `readResources` 改为扫描三个来源并按 `mergeSkills([builtin, user, project])` 合并；显式调用技能（invocation capture）覆盖三个来源。验证：新增单测覆盖三级同名优先级（project>user>builtin）、内置兜底、内置目录缺失
- [x] 1.4 `NekoSkillInfo` 增加 `readonly level`；`runtime.ts` `listSkills` 透传级别。验证：类型检查通过（`bun run check`）

## 2. 内置技能内容

- [x] 2.1 编写 `packages/core/skills/skill-creator/SKILL.md`：以 anthropics/skills 官方版为底裁剪（移除 Claude.ai 与 Cowork 专节），同步精简 references/，头部注明来源版本与裁剪点，附带归属说明。验证：`parseSkillFile` 能解析且 description 触发"创建技能"意图；目录内经 read 加载路径正确
- [x] 2.2 编写 `packages/core/skills/skill-finder/SKILL.md`：全新撰写——触发条件、bash curl 只读查询市场 API、候选呈现格式、安装引导（Web 市场页 / TUI `/skills`，若可用）、模型不代安装的约束、无结果回落（通用能力 + 建议 skill-creator 自建）、自定义市场地址说明。验证：frontmatter 合法；`disable-model-invocation` 未设置（对模型可见）

## 3. Web 补全内置标记

- [x] 3.1 `command-suggestions.ts`：技能条目携带 level；`composer-suggestions.tsx` 对内置级渲染「内置」徽章（`text-xs`、ink 浅底，仅用现有主题 token）。验证：补全条目徽章映射的纯函数测试通过

## 4. 端到端验证

- [x] 4.1 `bun run build && bun packages/cli/dist/main.js tui` 冒烟：构建产物形态下 `/skill:skill-creator` 与 `/skill:skill-finder` 可展开，补全可见两技能。验证：TUI 实际展开成功
- [x] 4.2 覆盖链冒烟：在 `~/.agents/skills/skill-finder/` 放置同名技能，确认提示词与展开使用用户级版本；删除后恢复内置版。验证：行为符合 spec scenario
- [x] 4.3 `bun run test && bun run check` 全绿。验证：CI 命令通过
