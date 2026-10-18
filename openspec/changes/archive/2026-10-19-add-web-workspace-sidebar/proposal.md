# Proposal

## Why

用户在 Web 上看 agent 干活时，只能在聊天流里逐个展开 edit/write 工具卡才能知道「改了哪些文件」，更没法顺手看一眼工作区里的某个文件。要确认一轮修改，只能回到编辑器或终端，来回切换打断了「提需求 → 看结果 → 追问」的闭环。现有基础已经够用：工作区文件枚举（含 gitignore、watcher、路径越界防护）、工具项里的展示型 diff、代码高亮与 diff 渲染，缺的是一个常驻的只读查看入口。

## What Changes

- Web 会话页新增**右侧栏「工作区」**，包含两个标签页：
  - **文件**：当前会话工作区的文件树（按目录懒加载），点击文件在栏内只读显示内容（行号、语法高亮、截断与二进制提示）。
  - **改动**：本会话中 agent（主 agent 与子 agent）通过 `edit` / `write` 修改过的文件列表（路径、增删行数、操作次数、改动者），点击文件按时间顺序显示各次改动的 diff，并可一键跳到该文件的当前内容。
- 网关为当前会话新增只读接口：目录子项、文件内容、改动列表与单文件改动详情；`ChatView` 新增可选的改动摘要（含 revision），前端据此刷新。全部为可选扩展，不提升应用协议，旧网关下入口隐藏。
- core 新增会话级「改动跟踪」：从会话条目（工具调用参数 + 工具结果）派生，不引入新的持久化文档，随回溯/分叉自然一致。
- 右侧栏与已有的子 agent 面板、后台任务面板共用右侧位置，同一时刻只显示一个；窄屏沿用抽屉形态。
- 只读：不提供编辑、保存、新建、删除、重命名；不引入 git 依赖；不改 TUI 与手机端。
- 凭据类文件（`.env`、私钥等固定模式）在树中可见但不下发内容。

**不在本变更内**：git status/diff 视图（覆盖 bash 造成的改动）、会话开始时的快照对比、文件编辑、图片/二进制预览、全文搜索、TUI 与手机端。

## Capabilities

### New Capabilities
- `workspace-browser`: 会话工作区的只读文件树与文件内容查看（目录懒加载、大小与二进制边界、越界与凭据文件防护、变更感知刷新）。
- `session-file-changes`: 会话内 agent 通过 edit/write 产生的文件改动的聚合、列表与逐次 diff 查看（含子 agent、失败调用排除、体量上限、不依赖历史分页）。

### Modified Capabilities
- `web-ui`: 新增右侧「工作区」栏及其与子 agent / 后台任务面板的位置共用规则、响应式与可访问性要求。
- `session-gateway`: 新增文件树、文件内容、改动列表/详情接口与 `ChatView` 可选改动摘要，约定可选扩展与旧网关兼容。

## Impact

- `packages/core`：新增改动跟踪模块；`WorkspaceFiles` 增加基于既有枚举缓存的子项查询与受限读取；`runtime`/`NekoSession` 暴露对应方法；`projection` 增加可选 `changes` 摘要。
- `packages/gateway`：`contract.ts` 新增 schema 与 `NekoChat` 方法，`session-host.ts` 实现，`client-session.ts` 增加能力探测（沿用 jobs/queue 的可选扩展模式）。
- `packages/web`：新增 `workspace-panel` 及文件树、代码查看、改动列表组件；`chat-page.tsx`/`top-bar.tsx` 接入；`highlight.ts` 按需补注册少量常见语言。
- 无新增依赖；`APPLICATION_PROTOCOL` 与移动端 API 版本不变；pi 依赖版本不变。
