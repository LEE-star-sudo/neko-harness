# Design

## Context

全新项目，仅有 `reference/pi/`（Pi monorepo 浅克隆，gitignored）作为参考。基座依赖均为 npm 已发布包：`pi-durable` / `pi-ai` / `chord` 1.1.0，`pi-server` / `pi-client` 为实验性包。

调研结论（基于 `reference/pi/packages/ai` 源码与 DeepSeek 官方文档）：

- pi-ai 内置 **43 个 provider**，其中 `deepseek` 已是一等公民（`packages/ai/src/providers/deepseek.ts`，仅 15 行工厂），走 `openai-completions` API 实现模块，内置模型目录（deepseek-flash / deepseek-v4-pro，1M 上下文）。
- pi-ai 的 `openai-completions` 模块（`packages/ai/src/api/openai-completions.ts`）已处理全部 DeepSeek 方言：`thinking:{type}` + `reasoning_effort` 请求参数、`reasoning_content` 流式增量、`prompt_cache_hit_tokens` 缓存命中统计、历史消息重放时的空 `reasoning_content` 兼容等。
- DeepSeek 官方同时提供 OpenAI 兼容端点（`api.deepseek.com`）与 Anthropic 兼容端点（`api.deepseek.com/anthropic`）；**不支持 OpenAI Responses API**。
- DeepSeek 的 Anthropic 端点存在已知兼容性差异（如 messages 数组内不接受 system 角色、thinking 参数形态与 Anthropic 原生不同），且 pi-ai 的 `anthropic-messages` 模块按 Anthropic 原生方言发请求（`thinking:{type,budget_tokens}`），未经实测。

## Goals / Non-Goals

**Goals:**

- 单一可执行入口同时拉起：durable 运行时（SQLite 存储）、会话网关（Unix socket + WebSocket）、TUI、Web UI 静态托管
- 多前端 attach 同一持久会话，状态以存储为准，前端崩溃不影响 agent 工作
- DeepSeek 开箱即用（只需 `DEEPSEEK_API_KEY`），provider 可扩展
- 锁死 pi-* 依赖版本，升级走显式变更

**Non-Goals:**

- 远端/多用户部署（网关仅面向本机）
- 自研 API 协议转换层（直接复用 pi-ai 的 10 种 API 实现）
- MCP、沙箱、权限门（后续变更再议）
- Web UI 的账号体系（本机单用户）

## Decisions

### D1: API 格式只用 OpenAI Chat Completions

**决策：provider 层只走 pi-ai 内置 `deepseek`（Chat Completions 格式），不提供 Anthropic / Responses 支持。**

| 候选 | 结论 | 理由 |
|---|---|---|
| **Chat Completions**（`api.deepseek.com`） | ✅ 唯一支持 | DeepSeek 原生主力端点，功能最全；pi-ai 内置 provider 与全部方言处理，**零新增代码**；缓存命中统计、thinking、tool use 均已验证 |
| **Anthropic Messages**（`api.deepseek.com/anthropic`） | ❌ 不做 | 已知兼容差异（messages 数组不接受 system 角色、thinking 参数形态不同）需额外实测与维护；当前无复用 Anthropic 生态的需求，未来若需要可加 ~20 行 provider 工厂重新引入 |
| **OpenAI Responses** | ❌ 排除 | DeepSeek 不提供该端点；它是 OpenAI 私有协议，选它会锁死 provider 迁移路径 |

关键认知：**harness 内部消息格式是 pi-ai 的规范化 transcript，与外部 API 格式解耦**——API 格式只是 provider 边缘的序列化选择，不影响运行时、存储或前端设计。因此收敛到单一格式不损失架构灵活性。

### D2: monorepo 布局

npm workspaces + TypeScript + Biome + Vitest（与 Pi 同工具链，便于对照参考源码）：

```
packages/
  core/       # pi-durable 封装：Harness 启动、扩展注册、内置工具、存储打开
  gateway/    # pi-server 宿主：会话目录、Unix + WebSocket 传输、Web UI 静态托管
  tui/        # 终端前端（pi-client 经 Unix socket）
  web/        # 浏览器前端（pi-client 经 WebSocket）
  cli/        # 单一入口：neko serve / neko tui / neko -p "..."
```

**备选**：单包。否决——四个可部署单元边界清晰，且 web 前端有独立构建链。

### D3: 网关复用 pi-server 的路由模型

gateway 以 `RoutedServerServiceHost` 托管 durable Session，attachment 语义（幂等 attach、断连延迟释放、`{serverId, sessionId, attachmentId}` 路由）直接继承，不自研协议。WebSocket 传输按 `pi-client` 的 `ByteTransportFactory` 契约实现一个薄适配层。

**风险**：pi-server 是实验性包、API 可能变 → 锁版本 + 将路由代码收敛在 gateway 包内，升级时只动一处。

### D4: 前端数据流以"提交后的状态"为准

两个前端都只消费 `viewState()`/`watch()`（或等价的 agent events 流）——即 pi-durable 已提交的视图状态 + Chord 操作增量，不在前端维护影子状态。断线重连 = 重新 attach + 取当前快照，天然满足"不重放历史"。

### D5: 配置层

单个 `neko.config.json`（`$ENV` 插值）：providers、默认模型/thinking level、存储路径、网关地址。模型目录直接用 pi-ai 内置目录 + `modelOverrides` 扩展。

### D6: TUI 渲染用 pi-tui

TUI 基于 `@earendil-works/pi-tui`（与 pi 生态同源，组件与流式渲染模型和 pi-durable 的视图状态契合）。

**备选**：Ink（React 生态熟悉度高）。否决——引入 React 渲染模型与额外依赖，且与参考源码不同源，对照成本高。

### D7: Web UI 技术栈：React + Vite + Tailwind CSS v4 + TanStack

**决策：Web 前端从一开始引入成熟框架，不手写裸 DOM。**

- **React 19 + Vite**：构建为静态资源，由 gateway 托管（spec: web-ui "静态托管"）。Vite 的 library/app 模式对 monorepo 友好
- **Tailwind CSS v4**：以 `@theme` CSS-first 配置承载二次元风格的 design tokens（配色、圆角、描边、发光/投影、字体）；**浅色主题**，蓝粉白配色——主色樱花粉（sakura pink，约 `#FFB7C5`）、辅色天依蓝（约 `#66CCFF`）、白色基底，OKLCH 定义以保证感知均匀与对比度可控
- **TanStack Query**：RPC 式调用（会话目录、提交输入、configure 等）的缓存与失效管理
- **TanStack Router**：路由（会话列表 / 会话详情 / 设置）
- WebSocket 流式状态不进 Query 缓存——按 D4 由 pi-client 的 watch/snapshot 驱动一个独立 store（TanStack Store），组件订阅它
- **二次元风格**落为 design tokens + 少量关键组件（聊天气泡、角色看板、状态徽章），不做重度插画资源；动画用 CSS transitions（`content-visibility` 控制长对话离屏渲染）

**备选**：Next.js。否决——需要 Node 服务端渲染运行时，与"静态资源由网关托管"矛盾。
**备选**：shadcn/ui 组件库。暂留——其组件可原样拷贝进项目，首个里程碑只取需要的少量组件，避免整库引入。

实现阶段遵循的 modern-web-guidance 指南（已检索确认）：`color`（OKLCH 配色与对比度——浅底上樱花粉/天依蓝用于文本时必须用加深档过对比度）、`sanitize-untrusted-html`（Markdown 渲染必须消毒）、`efficient-background-processing`（离屏暂停高频渲染）、`scroll-position-aware-elements`（回到底部按钮）。

## Risks / Trade-offs

- [pi-durable / pi-server 均为实验性，跨版本 API 可能不兼容] → package.json 锁精确版本；升级作为独立 OpenSpec 变更；core/gateway 包做薄封装隔离上游类型
- [pi-server 当前仅见 Unix socket 实现，WebSocket 需自写适配] → 适配面小（`ByteTransportFactory` 契约仅 send/close），gateway 内实现并配一致性测试
- [单进程独占存储，多网关实例无锁] → 本机单实例约束写进 CLI 行为：默认端口/socket 已占用时拒绝启动并提示
- [pi-tui 文档少，组件 API 需从源码与 Pi TUI 包用法反推] → 参考 `reference/pi/packages/tui/` 与 coding-agent 的实际用法；tui 包内做组件薄封装

## Migration Plan

全新项目，无迁移。落地顺序见 tasks.md：先 core（运行时 + DeepSeek 打通 CLI print 模式），再 gateway，最后双前端。

## Open Questions

（无）
