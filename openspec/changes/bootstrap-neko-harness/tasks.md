# Tasks

> v1 范围（用户决策 2026-10-10）：对话 + 内置工具 + TUI/Web 双前端，`neko tui` / `neko web` 启动。
> 2026-10-11：暂缓项已全部实施，前端已迁移为 gateway 客户端（pi-server 宿主，Unix socket + WebSocket 同协议）。

## 1. 项目骨架

- [x] 1.1 初始化 npm workspaces + TypeScript + Biome + Vitest（参照 reference/pi 根配置），`npm install && npm run build` 全绿
- [x] 1.2 创建 packages/{core,gateway,tui,web,cli} 五个包骨架，包间依赖按 design.md D2 接线，`vitest run` 通过（空测试套件）
- [x] 1.3 锁版本安装 pi 依赖（pi-durable/pi-ai/chord 精确 1.1.0），写 AGENTS.md 与 README 项目说明
- [x] 1.4 安装 pi-server/pi-client/pi-protocol 1.1.0（gateway 包）

## 2. core：运行时与 DeepSeek 打通

- [x] 2.1 实现 core 包：`Harness.open` 封装（SQLite 存储、内置 deepseek provider、CodingTools 扩展），真实 API 验证：问答 + 工具调用（write/read 落盘核对一致）
- [x] 2.2 验证持久化与恢复：双实例模拟崩溃重开，`replay:"safe"` 工具重跑、未声明的工具收 interrupted（test/recovery.test.ts，spec: agent-runtime）
- [x] 2.3 验证 requestId 幂等：相同 requestId 重复提交返回同一 submission，重开后仍成立（test/request-id.test.ts，spec: agent-runtime）
- [x] 2.4 实现配置层 `neko.config.json`（$ENV 插值、默认模型、thinking level、存储路径、gateway 地址、theme），7 个单测覆盖解析/插值/优先级（test/config.test.ts，spec: model-providers）
- [x] 2.5 验证用量统计：models 按 provider/model 分组、tools 按工具名分组、带 usage 的错误工具结果也计入（test/usage.test.ts，spec: agent-runtime）

## 3. gateway：会话网关

- [x] 3.1 基于 pi-server 实现网关宿主：会话目录（创建/列出/归档）+ Unix socket 传输，目录变化实时广播（test/directory.test.ts，spec: session-gateway）
- [x] 3.2 实现多前端 attach：Unix 端与 WS 端 attach 同一会话，一方提交双方均收到回答，attach 幂等（test/attach.test.ts，spec: session-gateway）
- [x] 3.3 WebSocket 传输：WS 连接适配为 pi-server ByteConnection，与 Unix socket 跑同一 pi 协议帧（CBOR），契约一致（spec: session-gateway）
- [x] 3.4 断连语义：断开后会话不受影响、其他 attachment 继续；重连 attach 取最新快照不重放历史（test/disconnect.test.ts，spec: session-gateway, web-ui）
- [x] 3.5 单实例约束：活 socket/EADDRINUSE 拒绝启动并明确提示，stale socket 自动接管（test/single-instance.test.ts）

## 4. tui：终端前端

- [x] 4.1 基于 pi-tui 搭建 TUI 骨架：输入框 + 滚动视图 + 流式渲染，参考 reference/pi/packages/tui 与 coding-agent 用法
- [x] 4.2 实现交互式对话：提交输入、流式渲染回答与工具调用（spec: terminal-ui）——真实 API 冒烟通过
- [x] 4.3 实现 steer / follow-up 插话：忙碌时 Enter=steer、Alt+Enter=follow-up，契约加 whenBusy，网关测试断言落点顺序（spec: terminal-ui）
- [x] 4.4 实现会话列表/切换/新建/归档/fork（Ctrl+S 或 /sessions 浮层、/fork、/archive）与状态栏（模型、用量、忙碌、会话 id）（spec: terminal-ui）

## 5. web：浏览器前端

- [x] 5.1 web 包构建链：React 19 + Vite + Tailwind CSS v4 + TanStack Query/Router（design.md D7），静态资源由 web 服务器托管（spec: web-ui）
- [x] 5.2 实现二次元主题系统：浅色蓝粉白 sakura/tianyi OKLCH scale，文本加深档过 WCAG AA（spec: web-ui）
- [x] 5.3 实现对话界面：历史渲染、流式回答、工具调用详情；Markdown 经 DOMPurify 消毒；highlight.js 浅色语法高亮（spec: web-ui）
- [x] 5.4 实现断线自动重连与快照恢复：指数退避 + 重连 attach 取最新快照（spec: web-ui）
- [x] 5.5 双前端联调：浏览器直连 gateway WS（pi-client + CBOR 帧，与 Unix 同协议）；会话列表/新建/切换/归档 UI；TUI(Unix) 与 WS 客户端 attach 同一会话互见消息，实测通过（spec: session-gateway）

## 6. 集成验收

- [x] 6.1 CLI 入口端到端可跑：`neko tui` / `neko web` / `neko serve`（均经真实 DeepSeek API 验证；`neko -p` print 模式未做，留待后续变更）
- [ ] 6.2 全量 `vitest run` + `biome check` 通过（27/27 绿）；spec 走查遗留两个未覆盖场景：会话级切换模型（model-providers）、扩展热替换（agent-runtime）——留待后续变更补齐后勾选

## Workflow follow-up

- 归档：`/skill:openspec-archive-change`（待 6.2 走查补齐后）
