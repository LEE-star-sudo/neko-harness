# neko-harness

在终端或浏览器中使用的本地 AI 编程助手。支持文件读写、命令执行、图片输入、网页搜索和技能调用，会话自动保存。

## 安装

支持 macOS 和 Linux，需要 **Bun 1.4.2 或更新的 1.4.x 版本**。

先按 [Bun 安装说明](https://bun.sh/docs/installation)安装 Bun，然后运行：

```bash
bun add --global neko-harness
```

如果找不到 `neko` 命令，请将 `~/.bun/bin` 加入 `PATH`。

## 开始使用

进入项目目录，启动终端或浏览器界面：

```bash
cd /path/to/your/project
neko tui
# 或
neko web
```

Web 会自动打开浏览器。两种界面可以同时使用，无需额外启动服务。

首次使用，在 TUI 输入 `/login`，或打开 Web「设置 → 密钥」，填入 [DeepSeek API Key](https://platform.deepseek.com/api_keys)。默认使用 DeepSeek V4.1 Flash，也可在界面中切换模型。

也可以通过环境变量提供 Key：

```bash
export DEEPSEEK_API_KEY='你的 API Key'
neko tui
```

界面保存的 Key 优先于环境变量，并保存在本机，请勿分享。

## 日常操作

- **工作区**：默认使用启动目录，Web 可在侧栏添加和切换项目。
- **会话**：TUI 用 `/new` 新建、`/sessions` 切换；Web 使用侧栏。
- **模型与思考强度**：TUI 使用 `/model` 和 `/think`；Web 点击输入框中的模型入口。
- **文件与目录**：输入 `@` 选择引用。
- **图片**：TUI 用 `Ctrl+V` 粘贴；Web 支持粘贴、拖放和选择图片。识图能力取决于所选模型。仅发送图片时会自动补充简短提示，可点击消息中的「默认图片提示」查看。
- **压缩上下文**：输入 `/compact`，整理较长的对话。
- **复制**：Web 在消息气泡下方点击复制按钮（回答不含思考过程，技能调用复制为 `/skill:` 形式）；TUI 输入 `/copy` 复制最后一条回答。
- **导出**：Web 点击顶栏「导出」，选择 Markdown、HTML 或 JSON，可勾选「包含思考过程」；TUI 输入 `/export [path] [--thinking]`，按扩展名 `.md`、`.html`、`.json` 判定格式，省略路径时写入工作区目录，已存在的文件不会被覆盖。导出的是已提交对话的可读转录，不含原始工具参数、时间戳和系统提示词；HTML 会内嵌图片（总量超过 32 MiB 的部分以占位代替）。
- **技能**：输入 `/skill:` 选择；Web 可从侧栏进入技能市场，浏览和安装技能。
- **子 agent**：助手会按任务需要委派探索、规划或编码工作，并等待结果后整合。Web 点击委派卡片或侧栏、TUI 用 `/agents` 查看完整过程；主智能体可接续已有子 agent 的上下文；详情中可单独停止当前任务，保留后续接续能力。探索子 agent 的 Bash 命令需逐次批准，可允许本次或拒绝；获批命令可能修改文件。
- **后台任务**：`npm run dev`、`uv run` 等长时间运行的命令，助手可通过 `job` 工具放到后台并继续对话（同时最多 4 个运行中）；任务结束或异常退出时，助手会收到回报并继续处理。Web 点击顶栏「任务」、TUI 用 `/jobs` 查看实时输出，并可手动停止。重启后运行中的任务会标记为已丢失，不会自动重跑；关闭 neko 或归档会话会停止其任务，若进程被强制结束（如 `kill -9`），可能残留子进程需手动清理；Windows 上的进程树终止尚未验证。
- **网页搜索**：默认可直接使用；如需使用自己的 Tavily Key，可在密钥设置中配置。
- **手机配对**：Web 设置页「手机配对」开启手机访问，选择局域网地址与端口后用 App 扫码（也可复制配对文本粘贴）。请确保手机与电脑在同一网络、系统防火墙放行所选端口。撤销设备、重新生成证书均在设置页完成；断开或撤销不会停止电脑上已受理的任务。若 gateway 由 `neko web` 启动，退出 Web 页面会同时停止手机入口，需要手机长期连接时请改用 `neko serve` 或保持 TUI 运行。
  - **WSL（默认 NAT 网络）**：地址下拉里列出的是 Windows 的局域网地址，无需切换 mirrored、无需管理员权限，也不用配置 portproxy。开启时 neko 会通过 `powershell.exe` 在 Windows 侧启动一个只绑定所选地址的转发进程，把连接转到 WSL 内的监听；关闭手机访问或退出 neko 时它会随之停止（neko 被强制结束时，约 8 秒内自行退出）。需要 WSL 的 Windows 互操作可用；Windows 防火墙若开启，首次监听可能弹出放行提示，请对 `powershell.exe` 放行。经转发后所有手机在认证失败限流中共用同一个来源地址。

助手可以执行命令和修改文件，请在可信项目中使用；工作区目录不限制助手的文件访问范围。

## 常用设置

```bash
neko tui --cwd /path/to/project  # 指定项目目录，Web 也支持
neko tui --theme dark            # 使用深色终端主题
neko web --port 8333             # 更换网页端口
neko web --no-open               # 启动后不自动打开浏览器
```

更多选项见 `neko tui --help` 和 `neko web --help`。

会话与设置保存在 `~/.neko/`，退出不会删除。备份前请先退出所有 neko 界面及服务；备份可能包含 API Key，请妥善保管。

## 升级

先完成任务，退出正在运行的 neko 界面及服务，然后执行：

```bash
neko update
```

完成后重新运行 `neko tui` 或 `neko web`。

Windows 上的 `neko update` 会显示手动升级指引。先退出 neko，再运行 `bun add --global neko-harness@latest`，完成后重新启动。

TUI 输入 `/version`，或打开 Web「设置 → 关于与更新」，可查看版本、检查更新。界面会提示何时需要升级、重启或刷新，由你手动操作。

如果当前版本没有 `neko update` 命令，可重新运行 `bun add --global neko-harness`。

## 许可证

[MIT](LICENSE)。基于 [Pi](https://github.com/earendil-works/pi) 生态构建。
