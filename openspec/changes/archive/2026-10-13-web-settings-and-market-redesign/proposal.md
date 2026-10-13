# Proposal: Web 端配置页面与技能市场架构解耦及视觉规范统一

## Why

当前 Web 端的「密钥」、「技能市场」与「关于与更新」三个页面共存于同一个 `SettingsShell` 侧栏外壳下，导致信息架构与视觉风格产生严重撕裂：
1. **心智模型错位**：技能市场具备搜索、分类、大量卡片网格和详情抽屉等大盘特性，体量庞大且属于生态发现中心，硬塞在「设置」子菜单下产生强烈的层级违和感；同时导致用户在主界面寻找技能市场路径过深。
2. **视觉与布局规范断层**：三个页面的容器宽度（5xl vs 3xl）、Header 组织节奏、按钮系统及卡片封装各写各的。关于与更新页更是以裸露未经修饰的 `<dl>` 呈现，与密钥页精致的表单卡片形成鲜明落差。
3. **版本状态信息倾倒**：关于与更新页同时平铺了页面、Web 服务、本地安装、网关运行版、网关已安装、最新稳定版等 6 项内部多进程架构细节，日常使用时意义不明且缺乏层级。

本次变更旨在将技能市场独立为全局一级入口，将设置中心收敛为纯粹的配置与系统关于模块，并重塑卡片化视觉规范与状态驱动的版本展示逻辑。

## What Changes

- **会话侧栏底部双入口解耦**：
  - 会话侧栏（`SessionList`）底部提供清晰平级的两个入口：`[store] 技能市场 (/skills)` 与 `[settings] 设置 (/settings)`。
- **技能市场独立大盘化**：
  - 技能市场脱离 `SettingsShell` 二级侧栏，拥有独立的全局顶栏（`← 返回聊天`、标题、分类/来源切换、搜索框、连接状态），在宽屏下占满视口宽度展示 3~4 列卡片网格，解除原设置侧栏的宽度束缚。
- **设置中心（SettingsShell）回归纯粹**：
  - 二级菜单收敛为配置与系统项：`[key] 密钥` 与 `[info] 关于与更新`（废除借用 `store` 图标，启用专用 `info` 图标），为后续通用/模型偏好配置预留清晰空间。
- **视觉层级与卡片化规范统一**：
  - 规范统一的 `PageHeader`（主标题 + 副标题说明 + 状态区），设置区统一主容器宽度。
  - 彻底卡片化：关于与更新页告别裸露 `<dl>`，重构为与密钥页一致的圆角柔和阴影卡片（`rounded-2xl border bg-surface p-5 shadow-soft`）。
  - 统一操作按钮规范（主操作浅粉胶囊、辅助操作线框白底）。
- **版本状态驱动与渐进式展示**：
  - 正常日常状态下，版本区域仅展示一行**当前版本**及状态徽章（如 `v0.1.0-alpha.12` `已是最新`），不再平铺最新版与多重已安装项。
  - **按需显式**：仅在检查到更高稳定版本时展示“最新版本：vX.Y.Z”及更新引导按钮；仅在已升级未重启时展示“已就绪，请重启本地 neko 服务”人话提示；仅在页面待更新时展示“刷新页面”按钮。
  - **调试信息折叠**：将 Web 页面、Web 服务、网关进程等内部多组件版本收纳于折叠面板（`<details>`），默认降噪不打扰用户。

## Capabilities

### Modified Capabilities
- `web-ui`: 调整会话侧栏底部导航项；技能市场独立为一级大盘页面并调整顶栏；设置中心二级菜单收敛并统一卡片化布局与视觉 tokens。
- `application-updates`: 明确 Web 端关于页面的版本展示规范，确立状态驱动的渐进式呈现与调试信息折叠规范。

## Impact

- **受影响页面与组件**：
  - `packages/web/src/client/components/session-list.tsx`（侧栏底部入口）
  - `packages/web/src/client/components/settings-shell.tsx`（菜单项调整与图标修正）
  - `packages/web/src/client/pages/skills-page.tsx`（脱离 SettingsShell，重构独立大盘顶栏）
  - `packages/web/src/client/pages/settings-page.tsx`（对齐统一 PageHeader 与容器宽度）
  - `packages/web/src/client/pages/about-page.tsx`（卡片化重构、状态驱动版本展示与调试折叠）
  - `packages/web/src/client/components/primitives.tsx`（补充 `info` 等图标支持）
- **路由与 API**：
  - 路由路径保持 `/skills`、`/settings`、`/about`（或 `/settings/about`）完全兼容，不破坏现有书签与深层链接。
  - 网关及后端 API 零变更。
