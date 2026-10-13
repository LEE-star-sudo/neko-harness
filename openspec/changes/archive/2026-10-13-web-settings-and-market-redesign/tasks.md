# Tasks

## 1. 基础元件与导航解耦

- [x] 1.1 在 `packages/web/src/client/components/primitives.tsx` 中为 `Icon` 组件添加 `info` 图标，并在图标类型与渲染中验证其可用
- [x] 1.2 在 `packages/web/src/client/components/session-list.tsx` 的侧栏底部（`sidebar-bottom`）添加平级的「技能市场」与「设置」导航入口，验证桌面端与移动端抽屉中均展示两项且链接跳转正常

## 2. 技能市场页面独立化

- [x] 2.1 重构 `packages/web/src/client/pages/skills-page.tsx`，移除 `SettingsShell` 嵌套，实现专属全宽顶栏（包含 `← 返回聊天`、标题、分类/来源切换、搜索框、连接状态），并调整主容器为全宽自适应布局
- [x] 2.2 验证技能市场独立页面中卡片分组、搜索过滤、抽屉详情弹窗及安装/卸载交互在各断点下正常运作

## 3. 设置外壳与页面规范对齐

- [x] 3.1 更新 `packages/web/src/client/components/settings-shell.tsx`，二级菜单移除 `market`，保留 `credentials` 与 `about`，并将关于更新图标改为专属 `info` 图标
- [x] 3.2 优化 `packages/web/src/client/pages/settings-page.tsx` 页面头部与主容器宽度，与统一设置规范对齐

## 4. 关于与更新页面卡片化与版本展示重构

- [x] 4.1 重构 `packages/web/src/client/pages/about-page.tsx` 布局为标准卡片化结构（`rounded-2xl border bg-surface p-5 shadow-soft`），并对齐统一 PageHeader 节奏
- [x] 4.2 实现状态驱动的版本展示逻辑：日常默认单行展示当前版本与生效徽章（如“已是最新”），仅在检测到更新时显示最新版与复制命令，仅在未重启时显示重启提示，仅在待更新时显示刷新按钮
- [x] 4.3 将 Web 页面、Web 静态服务、网关运行版及已安装版本收纳至底部 `<details>` 折叠面板

## 5. 验证与回归测试

- [x] 5.1 运行代码质量与类型检查命令（`bun run check`、`bun run test`、`bun run build`），确保无类型错误、语法问题或测试断言失败
- [x] 5.2 验证端到端各路由跳转与可访问性（从会话侧栏分别进入技能市场与设置、在技能市场返回聊天、在设置内平滑切换密钥与关于更新）
