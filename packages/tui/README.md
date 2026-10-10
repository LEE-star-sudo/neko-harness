# @neko-harness/tui

终端交互前端（pi-tui，见 design.md D6）。gateway 客户端（design D3/D4）：不打开 SQLite，
经 Unix socket 连接 neko gateway，消费 ChatView 投影订阅；socket 不存在/已死时自动 spawn
gateway 子进程（退出时关停由本进程拉起的实例）。

## 运行

```bash
# 可启动后通过 /login 配置 DeepSeek Key
bun --conditions=neko-source packages/tui/src/main.ts [--cwd <dir>] [--model provider/modelId] [--storage <sqlite路径>] [--socket-path <path>] [--theme light|dark|auto]
```

## 用法

- 底部输入框提交：空闲 Enter 正常提交；忙碌时 **Enter = steer**（插入当前工具轮之后）、
  **Alt+Enter = follow-up**（排队等当前 run 结束）；输入框边框与状态栏提示当前行为
- Esc 中止当前运行；Ctrl+C 忙碌时中止、空闲时退出；`/exit`（或 `/quit`）退出
- thinking 内容默认折叠为一行，点击展开/收起
- 工具卡片显示工具名 + 参数摘要 + 状态（运行中/✓/✗）；结果默认预览 8 行，点击展开完整输出
- 状态栏：模型 · 运行状态 · 用量（↑input ↓output 缓存 $成本）· 工作目录

## 会话与模型

- `Ctrl+S` 或 `/sessions`：会话列表浮层（SelectList）——切换或新建
- `/fork`：从当前会话分叉（继承历史，之后独立演进）
- `/archive`：归档当前会话（软删除）并切换到下一个（没有则新建）
- `/model`：模型选择浮层（`neko.models` 全量列表：name、provider/modelId、上下文长度、
  thinking 支持；当前模型置顶标记）——`neko.chat.configure` 只改当前会话，下一次请求生效，
  状态栏模型名随 ChatView.agent 投影即时更新
- `/think`：选择当前模型支持的思考强度；也支持 `/think <level>`。选项遵循 Pi，Flash 为 off/low/high/max，Pro 为 off/high/max
- 每个会话的模型/thinking 配置相互独立；新建会话回到 gateway 默认模型

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

- 多前端同会话的在线状态展示

## 工作区语义

`neko tui --cwd <directory>` 使用指定目录作为工作区；省略该参数时使用启动目录。路径会解析为实际目录的绝对路径，不会将子目录提升到 Git 根目录。会话持久化保存工作区，分叉会话继承该工作区；从其他目录重启网关不会改变已有会话的工作区。read、write、edit 和 bash 默认使用保存的工作区。工作区不是沙箱：在宿主权限允许的范围内，仍可通过显式路径访问其他目录。

TUI 只列出当前工作区的会话，并恢复最近激活或提交过输入的会话。共享网关和 Web 保留全局会话目录。工作区目录不存在时会明确报错，不会回退到网关目录。不支持未保存绝对工作区路径的旧会话存储，需要使用新的存储路径；应用不会自动删除或迁移旧数据。

底部状态栏在流式输出、编辑和选择操作期间保持可见。窄终端会优先隐藏次要字段；窗口小于 40 列或 10 行时，需要调整尺寸后继续操作（Ctrl+C 退出）。界面文案使用英语，会话内容和工具输出保留原语言。

`/sessions` 或 Ctrl+S 打开当前工作区的会话选择面板；`/model` 打开模型选择面板。输入文字进行搜索，上下方向键移动，Enter 确认，Esc 取消；加载失败时可按 Enter 重试。选择面板占用会话展示区域，关闭后恢复编辑器草稿和焦点。当前会话详情包含完整工作区路径和用量。空闲时 Enter 发送消息，忙碌时 Enter 提交引导消息；Alt+Enter 将后续消息加入队列。忙碌时 Esc 或 Ctrl+C 停止当前运行，空闲时 Ctrl+C 退出。

## 会话名称与时间

`/sessions`、`/session` 和 Ctrl+S 使用同一面板，仅展示当前工作区，并按最近消息倒序排列。每行显示自动标题（生成前为首问摘要）、相对时间及当前会话标记；选中详情展示模型、运行状态和完整时间。搜索匹配标题、首问摘要、ID，界面标签使用英语，标题保留对话语言。

面板打开期间订阅目录更新，每分钟刷新时间；后台重排按 ID 保持选中项，选中项消失时回退到相邻项。关闭面板停止计时并恢复编辑器草稿和焦点。Kitty 按键释放事件不触发二次移动。120×40、80×24、60×16 窗口均保持底部状态栏，较小高度优先显示会话行和操作提示。

## DeepSeek 凭据与思考配置

未配置 Key 也可启动、浏览会话；发送前通过 TUI `/login` 或 Web 设置页配置。保存值位于宿主用户的 `~/.neko/credentials.json`（权限 `0600`），所有工作区共用，重启后保留；优先于网关进程的 `DEEPSEEK_API_KEY`，移除后回退环境变量。两端只显示配置状态和生效来源，不回显已有 Key；“已配置”不代表已通过远端认证。获取 Key：https://platform.deepseek.com/api_keys 。

默认新会话使用 DeepSeek V4.1 Flash + high，显式配置和已有会话保留自身设置。TUI `/model`、`/think` 与 Web 聊天区模型面板共用 Pi 1.1.0 能力：Flash 为 off/low/high/max，Pro 为 off/high/max。Flash low 切换到 Pro 时遵循 Pi 调整为 high。变更仅作用于当前会话后续请求，标题总结仍使用非思考模式。

### 压缩与图片输入

使用 `/compact` 或 `/compact 保留当前任务和未完成事项` 手动压缩。状态栏显示原生压缩状态；压缩期间仍可编辑。Esc 保持会话中止语义，弹层打开时先关闭弹层。

空闲编辑时，在 400 毫秒内连续按两次 Esc 清空当前输入。Backspace/Delete 在图片引用内或紧邻引用时会整体删除该附件引用；Ctrl+- 可撤销删除或清空，恢复文字和图片引用。

macOS/Linux 使用 Ctrl+V、Windows 使用 Alt+V 粘贴图片；也可拖入独立图片路径或用路径补全选择图片。编辑器以 `[Image …]` 引用表示附件，删除引用即不再发送该图片，普通句子中的路径不自动附加。支持仅发送图片；失败保留草稿。终端支持时显示图片，否则显示文件名、格式与尺寸。剪贴板适配直接读取到内存，不额外落盘临时图片；用户原始文件不会删除。剪贴板后端不可用时使用路径方式。

验收范围：macOS 上已通过独立 PTY 的图片路径输入、删除/撤销、会话草稿恢复及 Web 联动；PNG/JPEG/WebP 到 Pi Kitty 协议与无图形文字回退有自动测试，120×40、80×24、60×16 布局有组件测试。Ghostty 实际画面与交互由用户于 2026-10-11 确认验收；代理未绕过电脑控制工具的应用访问限制。Windows/Linux 剪贴板后端仅做模拟测试，不能视为对应平台实测。

状态栏 `Ctx 百分比/窗口大小` 按 pi-durable 口径显示最近一次成功回答的上下文占用，不使用会话累计用量。首次回答前或压缩后尚无新回答时显示 `?`，超过 90% 标红；窄屏优先保留上下文比例。
