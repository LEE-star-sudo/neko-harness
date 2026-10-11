# Proposal

## Why

Web 端目前存在两套并行设计系统：导航/弹层是 Notion 式中性灰（5px 圆角、13px），聊天区是蓝粉白二次元主题（1.75rem 圆角、15px），视觉上像两个产品拼接，设置页与弹层之间主题还会互相穿越。同时聊天区字号与布局密度偏大、输入框区域缺少统一治理，且存在 inline code 粉色药丸过噪、工具卡片错误态不可辨、断点与布局常量散落硬编码、若干 a11y 缺口和死代码。需要一次以"蓝粉白全站统一"为主线的视觉与体验收敛。

## What Changes

- **统一主题为蓝粉白全站**：废弃 `.nav-theme` 中性灰体系，侧栏、顶栏、抽屉、弹层（Modal/Popover/目录选择面板）全部迁移到樱花粉/天依蓝/白 token；统一圆角、焦点环、滚动条、表单控件样式。**BREAKING（视觉）**：导航区域不再呈中性灰。
- **收敛字号与密度**：建立明确的 type scale 与间距阶梯，聊天区正文 15px → 14px，导航 13px 保留但作为 scale 一档而非硬编码；修正 ink 色阶缺档（补 300/800）。
- **输入框区域治理**：composer 区域结构整理（附件、提示行、建议弹层、按钮组的视觉层级）；为主输入框补 accessible name；技能命令菜单条目改为"名称 + 截断的一行简述"，不再塞整段英文描述。
- **inline code 降噪**：Markdown 行内代码由粉底药丸改为中性浅底（ink 系）+ 等宽字体，保留代码块高亮不变。
- **工具卡片状态可辨识**：错误态在边框色差之外增加图标与文字/底色区分，不再仅靠 sakura-300/400 一档色差。
- **常量与断点收敛**：消息列宽（`max-w-3xl`）、移动断点（767px）、气泡宽度抽为共享 token/常量，JS 与 CSS 单一来源。
- **a11y 补漏**：聊天页补 `<main>` landmark 与 skip-link；会话 tooltip 接 `aria-describedby`；连接状态圆点不再作为唯一非文本信号以外的补充（保留文本，补充形状/图标差异）。
- **死代码清理**：移除未使用的 `@tanstack/react-query` Provider 与 `lib/api.ts`；WelcomeCat SVG 硬编码 hex 改为引用 token。

明确不在本次范围：暗色模式（本次确立蓝粉白浅色为唯一主题，暗色作为后续独立变更）；store selector/流式渲染性能重构（架构级改动，另起变更）；`document.execCommand` 替换（有意的撤销栈保留行为）。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `web-ui`：修订「二次元主题系统」为全站统一蓝粉白主题并纳入字号/密度阶梯与 inline code 降噪；修订「响应式导航与可访问操作」纳入 landmark/skip-link/tooltip 等 a11y 补漏与断点单一来源；修订「Web 技能命令菜单」约束条目描述为单行截断简述；修订「凭据设置页」「图片预览与响应式访问」「Web 候选呈现与生命周期」中"遵循聊天区蓝粉白主题/所在区域 tokens"的表述为全站统一主题。

## Impact

- **代码**：`packages/web/src/client/styles.css`（主题 token 大改、nav-theme 移除、type scale）、`components/` 下 session-list、top-bar、nav-primitives、composer、composer-suggestions、tool-card、message-list、status-bar、workspace-picker、model-picker、thinking、image-gallery 的 class 与结构微调、`pages/chat-page.tsx`（landmark/skip-link）、`lib/store.ts`（不变）、`main.tsx`（移除 react-query Provider）、删除 `lib/api.ts`、`index.html`。
- **依赖**：移除 `@tanstack/react-query`。
- **API/协议**：无变化（纯前端表现层）。
- **测试**：`packages/web/test` 中引用 nav-theme class、字号或主题色的断言需同步更新；新增断点/token 单一来源的守护测试。
- **兼容性**：无数据与协议破坏；视觉变更为 BREAKING（用户可见界面全面改版）。
