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

`@` 文件与目录补全需要额外安装 `fd`：

```bash
# macOS（Homebrew）
brew install fd
# Ubuntu / Debian
sudo apt-get install fd-find
```

## 开始使用

进入你要处理的项目目录，选择一种界面：

```bash
cd /path/to/your/project
neko tui
# 或打开浏览器界面
neko web
```

Web 默认自动打开 `http://127.0.0.1:8322`。两种界面都会按需启动本地网关，无需另行启动服务。

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

升级：

```bash
bun add --global neko-harness@latest
```

## 许可证

[MIT](LICENSE)。基于 [Pi](https://github.com/earendil-works/pi) 生态构建。
