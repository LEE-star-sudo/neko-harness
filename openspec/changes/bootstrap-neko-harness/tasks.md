# Tasks

## 1. 项目骨架

- [ ] 1.1 初始化 npm workspaces + TypeScript + Biome + Vitest（参照 reference/pi 根配置），`npm install && npm run build` 全绿
- [ ] 1.2 创建 packages/{core,gateway,tui,web,cli} 五个包骨架，包间依赖按 design.md D2 接线，`vitest run` 通过（空测试套件）
- [ ] 1.3 锁版本安装 pi 依赖（pi-durable/pi-ai/chord/pi-server/pi-client 精确版本），写 AGENTS.md 与 README 项目说明

## 2. core：运行时与 DeepSeek 打通

- [ ] 2.1 实现 core 包：`Harness.open` 封装（SQLite 存储、内置 deepseek provider、CodingTools 扩展），以脚本验证：提交"1+1=?"并拿到回答（需 DEEPSEEK_API_KEY）
- [ ] 2.2 验证持久化与恢复：进程在工具执行中 kill 后重启，`resume()` 继续未完成任务；测试断言 pi.tool 任务不被重放（spec: agent-runtime）
- [ ] 2.3 验证 requestId 幂等：相同 requestId 重复提交返回同一 submission（spec: agent-runtime）
- [ ] 2.4 实现配置层 `neko.config.json`（$ENV 插值、默认模型、thinking level、存储路径），单测覆盖解析与缺省值（spec: model-providers）
- [ ] 2.5 验证用量统计：按会话查询 docs["pi.usage"]，断言含模型与工具分组（spec: agent-runtime）

## 3. gateway：会话网关

- [ ] 3.1 基于 pi-server 实现网关宿主：会话目录（创建/列出/删除）+ Unix socket 传输，集成测试覆盖目录广播（spec: session-gateway）
- [ ] 3.2 实现多前端 attach：两客户端 attach 同一会话，一方提交输入，断言双方均收到流式事件（spec: session-gateway）
- [ ] 3.3 实现 WebSocket 传输适配（ByteTransportFactory 契约），浏览器裸 WebSocket 客户端完成握手 + 会话列表查询（spec: session-gateway）
- [ ] 3.4 断连语义：客户端断开后 attachment 延迟释放、会话不受影响；重连后从快照恢复不重放历史（spec: session-gateway, web-ui）
- [ ] 3.5 单实例约束：默认 socket/端口被占用时拒绝启动并给出明确提示

## 4. tui：终端前端

- [ ] 4.1 基于 pi-tui 搭建 TUI 骨架：输入框 + 滚动视图 + 流式渲染，参考 reference/pi/packages/tui 与 coding-agent 用法
- [ ] 4.2 实现交互式对话：提交输入、流式渲染回答与工具调用（spec: terminal-ui）
- [ ] 4.3 实现 steer / follow-up 插话，agent 执行中 steer 在当前工具轮后生效（spec: terminal-ui）
- [ ] 4.4 实现会话列表/切换/fork 与状态栏（模型、用量、忙碌状态）（spec: terminal-ui）

## 5. web：浏览器前端

- [ ] 5.1 web 包构建链：React 19 + Vite + Tailwind CSS v4 + TanStack Query/Router/Store（design.md D7），构建为静态资源并由网关托管，浏览器访问网关地址可加载页面（spec: web-ui）
- [ ] 5.2 实现二次元主题系统：Tailwind v4 `@theme` design tokens，浅色蓝粉白配色（樱花粉 #FFB7C5 / 天依蓝 #66CCFF / 白底，OKLCH 定义，文本用加深档过 WCAG AA 对比度），遵循 modern-web-guidance 的 color 指南（spec: web-ui）
- [ ] 5.3 实现对话界面：会话选择、历史渲染、流式回答与工具调用详情；Markdown 渲染经消毒（遵循 sanitize-untrusted-html 指南）（spec: web-ui）
- [ ] 5.4 实现断线自动重连与快照恢复（spec: web-ui）
- [ ] 5.5 双前端联调：TUI 与 Web 同时 attach 同一会话，操作互可见（spec: session-gateway）

## 6. 集成验收

- [ ] 6.1 CLI 入口 `neko serve` / `neko tui` / `neko -p "..."` 三种模式端到端可跑
- [ ] 6.2 全量 `vitest run` + `biome check` 通过；按 specs 逐条走查场景

## Workflow follow-up

- 归档：`/skill:openspec-archive-change`
