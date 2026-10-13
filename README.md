# neko-harness

在终端或浏览器中使用的本地 AI 编程助手。支持工作区与会话管理、文件读写、命令执行、图片输入、网页搜索和技能调用，默认使用 DeepSeek V4.1 Flash，思考强度为 high。

## 安装

需要 **Bun 1.4.2 或更新的 1.4.x 版本**。当前支持 macOS 和 Linux。

先按 [Bun 安装说明](https://bun.sh/docs/installation)安装 Bun，然后运行：

```bash
bun add --global neko-harness
neko --version
```

如果找不到 `neko` 命令，请将 Bun 的全局可执行目录（通常是 `~/.bun/bin`）加入 `PATH`。

`@` 文件与目录补全使用随包提供的 Pi 1.2 本地文件发现组件，无需安装 fd/fdfind。
候选遵守 Git 工作树的忽略规则；非 Git 目录不应用 `.gitignore`，均不读取 `.ignore`/`.fdignore`。包含未被忽略的隐藏项并排除 `.git`。
网关共享有界目录缓存，文件变化使缓存失效，最长 30 秒后按需刷新；结果不完整时可指定子目录缩小范围。发现组件异常时可以重试查询，普通消息仍可发送。

## 开始使用

进入你要处理的项目目录，选择一种界面：

```bash
cd /path/to/your/project
neko tui
# 或打开浏览器界面
neko web
```

Web 默认自动打开 `http://127.0.0.1:8322`。两种界面都会按需启动本地网关，无需另行启动服务。

macOS/Linux 上默认网关同时监听 Unix socket 和 WebSocket（`127.0.0.1:8321`），TUI 与 Web 可以按任意顺序启动并共享网关。后启动的界面退出时不会停止已有网关。
如果已有网关使用自定义 WS 端口，启动 Web 时使用匹配的 `--gateway-port`（例如 `neko web --gateway-port 8331`）。
Web 会验证 WS 连接及网关身份；若旧版 TUI 拉起的网关未启用 WS，请先正常退出拥有网关的界面，再重新启动。Web 不会自动重启正在运行的网关。

首次使用，在 TUI 输入 `/login`，或打开 Web 设置页，填入 [DeepSeek API Key](https://platform.deepseek.com/api_keys)。也可以在启动前设置环境变量：

```bash
export DEEPSEEK_API_KEY='你的 API Key'
neko tui
```

界面保存的 Key 优先于环境变量；删除已保存 Key 后恢复使用环境变量。Key 保存在本机 `~/.neko/credentials.json`，请勿分享此文件。

## 日常操作

- **工作区**：默认使用启动目录；可通过 `neko tui --cwd /path/to/project` 或 `neko web --cwd /path/to/project` 指定。Web 也可添加目录并切换工作区。
- **会话**：TUI 输入 `/sessions` 切换会话；Web 使用侧栏。会话自动保存。
- **模型与思考强度**：TUI 使用 `/model` 和 `/think`；Web 点击聊天区的模型选择器。
- **文件引用**：输入 `@`，选择工作区中的文件或目录。
- **图片**：TUI 使用 `Ctrl+V` 粘贴剪贴板图片；Web 支持粘贴、拖放和选择图片。是否能够识图取决于当前模型。
- **仅图片输入**：没有文字说明时，neko 会为一张或多张图片附上默认用户提示，优先结合对话任务，否则说明关键信息并询问意图。提示与图片一起保存，不修改系统提示词；带文字的图片消息不补词。点击消息上的默认图片提示标记可展开查看。旧图片历史保持原样。
- **压缩上下文**：输入 `/compact`。内容不足以压缩时会显示提示。
- **技能**：输入 `/skill:` 选择技能。技能从 `~/.agents/skills/` 和工作区 `.agents/skills/` 加载。
- **网页搜索**：默认使用有速率限制的 Tavily 免 Key 模式；也可在凭据设置中配置自己的 Key，或使用 `TAVILY_API_KEY` 环境变量。

工作区用于组织会话和确定默认目录，**不是文件访问沙箱**；助手可以执行命令和修改文件，请在可信项目中使用。

## 常用选项

```bash
neko web --port 8333        # 更换网页端口
neko web --no-open          # 启动后不打开浏览器
neko tui --theme dark       # 使用深色终端主题
neko serve                 # 独立运行网关
neko tui --help
neko web --help
neko serve --help
```

本地数据默认保存在 `~/.neko/`，会话数据库为 `neko.sqlite`。退出界面不会删除会话。备份数据前请先停止正在使用该目录的 neko 进程。

升级：先完成任务，退出使用同一数据目录的 TUI/Web 和独立 `neko serve`，然后执行：

```bash
neko update
```

升级后重新运行 `neko tui` 或 `neko web`。TUI `/version` 和 Web 设置中的「关于与更新」可查看版本、检查更新。界面只提示，不自动安装或重启；仅页面需要更新时使用刷新入口，文字草稿会保留，有未发送附件时先发送或移除。源码、项目局部或链接安装请按原方式更新。

发布包的产品版本来自根 manifest，独立于 Pi 依赖和 workspace 包版本。后台检查稳定渠道缓存 24 小时，离线不影响聊天；安装版本单独检查，升级后仍运行的旧网关会提示重启。

## 许可证

[MIT](LICENSE)。基于 [Pi](https://github.com/earendil-works/pi) 生态构建。
