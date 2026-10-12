# Tasks

## 1. core 共享解析器

- [x] 1.1 `packages/core/src/prompt/invoke.ts` 新增并导出 `parseSkillInvocation(text)`：识别 `expandSkillCommand` 输出形态（开头 `<skill name= location=>`、最后一个 `</skill>` 收尾、XML 反转义、分离 args），失败返回 null；core index 导出。验证：新增单测覆盖 有/无 args、转义字符、正文含字面 `</skill>`、手工畸形文本回退 null

## 2. Web 折叠卡片

- [x] 2.1 Icon 组件新增 `sparkles` 图标路径；新 `SkillInvocationCard` 组件（ToolCard 视觉骨架、sakura 着色、点击折叠/展开、限高等宽正文）。验证：组件渲染快照/冒烟测试或手工核对 token 使用
- [x] 2.2 `UserRow` 接入解析器：命中时渲染卡片 + 参数文本，未命中保持现状。验证：`bun run check` 通过；浏览器手工核对折叠/展开/参数显示/回退

## 3. TUI 单行折叠

- [x] 3.1 `UserMessageComponent` 接入解析器：命中时渲染单行技能标记（图标 + `skill:<name>` + 参数截断预览 + dim 来源行），未命中走原 Markdown 路径。验证：TUI 中 `/skill:skill-finder test` 实际显示为单行

## 4. 端到端验证

- [x] 4.1 `bun run build && bun run test && bun run check` 全绿。验证：命令通过
