# Verification

## 本机结果（2026-10-12）

- macOS arm64，Bun 1.4.2，fd 10.4.2。
- `bun run check` 通过。
- `bun run test`：192 pass，0 fail，1038 assertions。测试需允许临时 socket/端口监听；受限沙箱首次 RPC 测试出现 EPERM，允许监听后通过。
- `bun run build` 通过；Vite 提示现有主 bundle 超过 500 kB，无构建错误。
- `git diff --check` 通过。
- fd 替身模拟 Windows 默认反斜杠输出：临时移除新参数后测试失败，只保留 README.md；恢复参数后目录及嵌套文件返回正确。该实验不等同于原生 Windows 验证。
- core 验证真实 fd 的空查询目录、嵌套名称搜索、带空格目录、前缀继续定位、忽略规则及工作区边界；隔离 PATH 验证缺少依赖和 fdfind 发现。
- socket 与 WebSocket 集成测试验证完整安装提示透传，非依赖错误不会提示安装，恢复 PATH 后查询成功。
- 平台文案单元测试覆盖 win32/darwin/linux/freebsd。

## 浏览器验收

使用独立临时工作区、内存 gateway、模拟模型和构建后的真实 Web 页面，未调用真实模型 API。

- 375×812 视口：缺少 fd 时展示完整中文提示与 brew 命令，文字换行且未越出视口；截图经过目视检查。
- Esc 关闭候选，保留原草稿；普通消息可提交并清空已发送草稿。
- 浏览器模拟 Windows UA/platform，macOS 宿主仍返回 brew 提示。
- 延迟 WebSocket 服务端消息 400ms，在查询发出后关闭面板；等待迟到错误后面板未重开，草稿未变化。
- 恢复临时 gateway 的 PATH 后，真实 fd 返回 README.md 和 src 目录；选择插入 `@src/`，再次触发可定位并选择 `@src/index.ts `。
- Web 已有的错误展示和生命周期逻辑满足要求，无需更改前端组件。

## 原生平台覆盖限制与复现步骤

当前无可用 Windows/Linux 执行环境，未执行这两个平台的原生进程、PATH 和浏览器端到端验收；跨平台参数与平台提示已在 macOS 上模拟验证。

在 Windows/Linux 原生环境复验：

1. 安装依赖并构建，在临时工作区建立 README.md、src/index.ts、my files/example.ts；这些路径应未被忽略。
2. 确认 gateway 启动环境能找到 fd（Windows：`where.exe fd`；Linux：`command -v fd` 或 `command -v fdfind`），启动 `neko web --cwd <临时工作区>`，建立会话。
3. 输入 `@`，确认文件和目录均出现；选择 src 后继续触发补全，选择 index.ts；搜索 example 并选择空格路径，检查引用与光标。
4. 使用独立终端和临时数据目录，在不含 fd/fdfind 的 PATH 下以绝对路径启动 neko，避免连接到原有 gateway；确认 Windows 显示 winget 命令，Linux 显示标注 Debian/Ubuntu 的 apt 示例及其他发行版文档。
5. 关闭候选并发送普通文本，确认草稿和输入可用；恢复 PATH、重新打开终端并重启独立 gateway，确认补全恢复。Linux 另验证仅有 fdfind 的 PATH。

缺少依赖的测试不需要卸载系统工具，也不要求实际执行安装命令。
