# @neko-harness/tui

终端交互前端（pi-tui，见 design.md D6）。gateway 客户端（design D3/D4）：不打开 SQLite，
经 Unix socket 连接 neko gateway，消费 ChatView 投影订阅；socket 不存在/已死时自动 spawn
gateway 子进程（退出时关停由本进程拉起的实例）。

## 运行

```bash
# 需要 DEEPSEEK_API_KEY
npx tsx packages/tui/src/main.ts [--cwd <dir>] [--model provider/modelId] [--storage <sqlite路径>] [--socket-path <path>] [--theme light|dark|auto]
```

## 用法

- 底部输入框提交：空闲 Enter 正常提交；忙碌时 **Enter = steer**（插入当前工具轮之后）、
  **Alt+Enter = follow-up**（排队等当前 run 结束）；输入框边框与状态栏提示当前行为
- Esc 中止当前运行；Ctrl+C 忙碌时中止、空闲时退出；`/exit`（或 `/quit`）退出
- thinking 内容默认折叠为一行，点击展开/收起
- 工具卡片显示工具名 + 参数摘要 + 状态（运行中/✓/✗）；结果默认预览 8 行，点击展开完整输出
- 状态栏：会话 id · 模型 · 运行状态 · 用量（↑input ↓output 缓存 $成本）· 工作目录

## 会话管理

- `Ctrl+S` 或 `/sessions`：会话列表浮层（SelectList）——切换或新建
- `/fork`：从当前会话分叉（继承历史，之后独立演进）
- `/archive`：归档当前会话（软删除）并切换到下一个（没有则新建）

## 主题

明暗两套主题共享同一组语义槽位（用户气泡、助手强调、工具卡片、thinking 弱化、状态栏等）：

- **dark**：深色终端（Tokyo Night 风）
- **light**：浅色蓝粉白（樱花粉主色 / 天依蓝辅色；文本色按浅底对比度加深）

选择方式（优先级从高到低）：

1. `--theme light|dark|auto`
2. 环境变量 `NEKO_THEME=light|dark|auto`
3. 默认 `auto`

`auto` 的回退链：OSC 11 终端背景查询（pi-tui `queryTerminalColors`，超时 100ms，不阻塞启动；
超时后迟到的应答仍会修正）→ `COLORFGBG` 环境变量（按 Vim 的索引分类）→ 默认浅色。
首帧先用 `COLORFGBG`（无则浅色）渲染，检测完成后如不同则整体重绘；运行期间还会跟随终端的主题变化通知。

## API

```ts
import { runTui } from "@neko-harness/tui";

await runTui({
  cwd: process.cwd(),
  socketPath: "~/.neko/<serverId>.sock",
  theme: "auto", // "light" | "dark" | "auto"
});
```

## 后续

- 会话列表项支持标题预览（目录契约目前只带 id）
- 多前端同会话的在线状态展示
