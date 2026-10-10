# @neko-harness/web

浏览器前端（React 19 + Vite + Tailwind CSS v4 + TanStack Query/Router，design.md D7）+ 静态托管与网关发现服务器。v1 后迁移为**浏览器直连 gateway WebSocket**（pi 协议帧，design D3），本包不再内置 runtime/自定义 JSON 协议。

## 结构

**服务器侧（Bun，仅静态托管 + 网关发现）：**

- `src/server.ts` — `startWebServer(options)`：确保 gateway 运行 + 静态托管 `dist/client` + `GET /api/info`（返回 `{ gatewayWs, serverId, socketPath, workspaceRoot }`）。
- `src/gateway-spawn.ts` — `ensureNekoGateway(options)`：serverId/socket 确定后在 Unix socket 上探活（pi 握手 + 服务绑定，复用 gateway 的 `connectNekoGateway`）；不通则 用当前 Bun 启动 gateway 子进程（源码用 main.ts，构建产物用 main.js）并轮询探活。socket 存在即复用既有网关（不 spawn 不代管）。
- `src/main.ts` — CLI：`bun --conditions=neko-source packages/web/src/main.ts [--port 8322] [--gateway-port 8321] [--storage <path>] [--socket-path <path>] [--cwd <dir>] [--model <ref>]`。

**客户端（`src/client/`，浏览器直连 pi 协议）：**

- `lib/contract.ts` — neko 服务契约的浏览器镜像（与 `packages/gateway/src/contract.ts` 同服务 id；网关包带 node 依赖不能进 bundle，类型全部 `import type` 擦除）。
- `lib/transport.ts` — `createBrowserWsTransportFactory(url)`：浏览器 WebSocket binary → pi-server 有序字节连接；帧封送（4 字节长度前缀 + CBOR）由 pi-client 内部完成，本层只搬运字节。
- `lib/gateway.ts` — `GatewayConnection`：`Client.connect`（serverId 校验）→ 目录订阅 + 会话管理 → attach → `NekoChat.view` 订阅；断线指数退避重连（800ms→8s），重连 = 重新 attach 取最新快照（D4，不重放历史）。
- `lib/store.ts` / `lib/bootstrap.ts` — useSyncExternalStore 外部 store + 事件接线；组件经 `appActions` 提交/中止/切换/新建/归档。
- `components/` — 聊天页（气泡、Markdown 消毒渲染 + 代码块高亮、工具卡片、thinking 折叠）、`session-list.tsx` 会话侧栏（目录实时、当前高亮、明确归档确认）、TopBar/StatusBar/Composer。
- `pages/` — 聊天页（`/`，含会话管理）与设置页（`/settings`，网关信息 stub）。

## 构建与运行

```bash
bun run --cwd packages/web build   # tsc 服务端 → dist/ + vite 客户端 → dist/client/
bun --conditions=neko-source packages/web/src/main.ts              # 起静态服务（自动 spawn gateway）
```

可在设置页配置 DeepSeek Key，或使用 `DEEPSEEK_API_KEY`。浏览器访问打印的地址（默认 http://127.0.0.1:8322）。

## 工作区与会话导航

Web 默认进入自身启动目录（或 `--cwd`）对应的工作区，即使复用了其他目录启动的网关也保持该归属。工作区切换器可访问网关的全部工作区，下方列表只展示当前工作区的非归档会话，并按最近消息排序、支持搜索。新建会话显式绑定该目录；归档当前会话后仅在同工作区内回退，最后一个会话归档后显示空态，不自动创建会话。重连保留当前选择，刷新页面回到该 Web 实例的启动工作区。

在工作区切换菜单中点击“添加工作区”，通过面板浏览 Harness 所在电脑的文件夹。支持路径面包屑、完整路径输入、名称过滤、隐藏目录开关和分页；确认“选择文件夹”后由服务端验证并登记。相同真实目录只登记一次。空工作区持久保存，取消浏览不产生记录。此操作不上传文件、不创建或删除宿主目录。

侧栏、顶栏及导航弹层采用中性配色，聊天区保留蓝粉白主题。桌面侧栏可折叠，移动端默认收起。会话行的操作菜单提供明确的归档确认；键盘可聚焦操作，方向键可移动菜单和目录列表，Escape 关闭弹层并恢复焦点。提交添加/归档时会暂时锁定确认界面以防止重复操作。

## 会话名称与时间

侧栏每行显示会话标题和距最近消息的时间；后台命名完成前使用首问摘要，空会话显示“新会话”。搜索同时匹配标题、首问摘要和 ID。列表按最近消息倒序排列，查看旧会话或标题更新不改变顺序；启动恢复仍使用独立的最近访问记录。顶栏及归档确认使用相同名称，界面不展示内部会话 ID，可通过完整时间辅助辨认同名会话。

相对时间每分钟及窗口重新聚焦时刷新。鼠标悬停或键盘聚焦会话行可查看完整标题和时间，辅助技术通过按钮名称读取同样信息；触屏用户可打开行操作菜单查看完整标题和时间。标题保留对话语言，导航继续使用中文。后台标题更新保留当前会话、输入草稿与工作区选择。

## DeepSeek 凭据与思考配置

未配置 Key 也可启动、浏览会话；发送前通过 TUI `/login` 或 Web 设置页配置。保存值位于宿主用户的 `~/.neko/credentials.json`（权限 `0600`），所有工作区共用，重启后保留；优先于网关进程的 `DEEPSEEK_API_KEY`，移除后回退环境变量。两端只显示配置状态和生效来源，不回显已有 Key；“已配置”不代表已通过远端认证。获取 Key：https://platform.deepseek.com/api_keys 。

默认新会话使用 DeepSeek V4.1 Flash + high，显式配置和已有会话保留自身设置。TUI `/model`、`/think` 与 Web 聊天区模型面板共用 Pi 1.1.0 能力：Flash 为 off/low/high/max，Pro 为 off/high/max。Flash low 切换到 Pro 时遵循 Pi 调整为 high。变更仅作用于当前会话后续请求，标题总结仍使用非思考模式。

### 压缩与图片输入

输入 `/compact` 可打开命令入口并附加摘要要求，输入区菜单也提供压缩入口。压缩状态独立展示，命令不进入聊天记录或改变会话排序。

通过加号、多选、拖放或粘贴添加 PNG/JPEG/WebP 图片，添加不会自动发送。缩略图支持移除，处理或提交失败保留草稿；每条消息最多 4 张，也可仅发送图片。Flash 支持图片，Pro 下保留附件并提示切换模型或移除。图片草稿按会话隔离，历史预览按需加载，支持放大及保存，关闭恢复焦点。
