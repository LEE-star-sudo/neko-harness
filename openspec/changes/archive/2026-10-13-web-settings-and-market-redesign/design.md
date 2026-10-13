# Design: Web 端配置页面与技能市场架构解耦及视觉规范统一

## Context

见 `proposal.md`。当前前端技术栈为 React + Vite + TanStack Router + Tailwind CSS。
现有路由包括 `/` (ChatPage)、`/settings` (SettingsPage)、`/skills` (SkillsPage) 与 `/about` (AboutPage)。
原实现中，`/settings`、`/skills` 与 `/about` 三者均被包裹在 `SettingsShell` 内，导致视觉宽度、侧栏占用及组件布局产生了严重不协调。

## Goals / Non-Goals

**Goals:**
- 将技能市场（`/skills`）解耦为独立的一级大盘页面，解除 `SettingsShell` 二级侧栏对其宽度的限制，具备专属全宽顶栏与返回聊天导航。
- 在会话侧栏底部（`SessionList`）平级提供清晰的「技能市场」与「设置」两个独立入口。
- 将设置中心（`SettingsShell`）收敛为真正的系统配置外壳（包含密钥与关于更新），修补菜单图标（为关于项增加专属 `info` 图标，去除 `store` 图标借用）。
- 建立统一的设置区卡片容器规范与页面标题节奏，消除关于与更新页裸露 `<dl>` 的草稿感。
- 重构关于与更新页面的版本呈现：默认单行展示主要运行版本及当前状态徽章，仅在检测到新版或组件未生效时条件呈现目标版本与行动按钮，底层多组件版本折叠收纳。

**Non-Goals:**
- 不修改底层网关协议、会话接口及版本更新检查的数据结构（`UpdateState`、`updateAction` 保持复用）。
- 不改变现有的全局路由路径（保持 `/skills`、`/settings`、`/about` 兼容可访问）。
- 不在此变更中引入额外的通用偏好持久化设置，但为未来扩展预留干净的侧栏空间。

## Decisions

### D1: 会话侧栏底部的双入口排布
在 `packages/web/src/client/components/session-list.tsx` 的 `sidebar-bottom` 区域中，工作区路径下方平级排列两个入口按钮：
1. `技能市场` (`<Link to="/skills"> <Icon name="store" /> 技能市场 </Link>`)
2. `设置` (`<Link to="/settings"> <Icon name="settings" /> 设置 </Link>`)
- **备选方案**：将技能市场移到顶栏。
  - *否决原因*：顶栏目前集中承载当前工作区、当前会话标题与全局连接状态，且移动端顶栏空间有限。放置在会话侧栏底部与“新建会话”、“会话列表”并列，符合工作区整体功能入口的发现惯例。

### D2: 技能市场独立大盘布局
`SkillsPage` 不再嵌套 `<SettingsShell active="market">`，改为自包含全宽布局：
- 顶部导航条：统一提供 `← 返回聊天` 链接、页面标题、分类/来源切换 Pill Tabs、搜索输入框以及网关连接状态。
- 主内容区：使用 `max-w-7xl`（或全宽自适应容器），网格卡片在宽屏下自然扩展为 3 列或 4 列。
- 抽屉交互：继续复用原有的 `SkillDrawer` Portal 弹层。
- **收益**：避免被 12rem 的二级侧栏抢占空间，还原沉浸式插件/技能大盘体验。

### D3: 设置中心二级菜单与图标修正
`SettingsShell` 的菜单项收敛为：
- `credentials` (`/settings`，密钥，图标 `key`)
- `about` (`/about`，关于与更新，图标 `info`)
在 `packages/web/src/client/components/primitives.tsx` 的 `Icon` 组件中新增 `info` 图标（标准圆圈 i 路径），替换原先错配的 `store` 商店图标。

### D4: 页面 Header 与卡片化视觉规范
在设置区域建立统一的版式节奏：
- **Header 规范**：标题（`text-xl font-bold`）+ 右侧连接/检查状态 + 副标题说明（`text-sm text-ink-500`）。
- **容器规范**：设置区主容器统一采用 `max-w-4xl mx-auto px-5`，居中舒适排布。
- **卡片规范**：所有设置模块均放入标准卡片：
  ```tsx
  <section className="rounded-2xl border border-sakura-200 bg-surface p-5 shadow-soft">
  ```
  关于更新页拆分为两大卡片：
  1. 「版本与运行状态」卡片；
  2. 「系统更新与操作指引」卡片。

### D5: 状态驱动的版本渐进式展示逻辑
关于页版本区域基于现有的 `useUpdateAction` 与 `updates` 状态进行人话化精简：
- **主版本项（仅 1 行）**：
  - 显示“当前版本”，取运行构建版本（如 `RUNNING_VERSION`）。
  - 右侧状态徽章：
    - `action === "none"`：绿色/浅色徽章「已是最新」；
    - `checking`：徽章「检查中…」；
    - `checkState === "failed"`：徽章「检查失败」；
    - `checkState === "development"`：徽章「开发构建」。
- **条件目标版本行（仅当存在差异时显式插入）**：
  - `action === "install"`：显示「最新稳定版：vX.Y.Z (发现新版本)」，并展示「复制 neko update」主要按钮。
  - `action === "restart-service"`：显示「本地已就绪：vX.Y.Z (待重启)」，并展示人话指引：“新版本已安装到本地，请重新启动本地 neko 进程”。
  - `action === "refresh-page"`：显示「页面待更新」，并展示「刷新页面」主要按钮。
- **组件内部版本折叠收纳**：
  - 底部增加可展开折叠项 `<details>`：“组件详细信息”，内含 Web 页面、Web 静态服务、网关运行版及已安装版本的只读清单，仅供开发者排查使用。

## Risks / Trade-offs

- **[Trade-off] 技能市场与设置页面的样式复用**
  - 解耦后，技能市场与设置页面不再共享外壳代码。
  - *缓解方式*：抽取轻量清晰的顶栏结构或保留共同的 CSS 基础类，不增加额外抽象过度设计。
- **[Risk] 移动端侧栏抽屉中的底部导航可访问性**
  - 侧栏底部新增一个导航项可能导致短屏设备下需要滚动才能看到设置。
  - *缓解方式*：侧栏中间会话列表保持 `flex-1 overflow-y-auto`，确保 `sidebar-bottom` 始终贴底固定吸附，保证两个核心入口时刻可见。
