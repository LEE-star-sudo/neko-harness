# Tasks

## 1. Windows CLI 手动升级指引

- [x] 1.1 在有效参数解析后的升级入口增加 Windows 提前返回，输出完整 Bun 命令和退出/重启步骤；用平台注入测试验证发布版及 development 均正常返回，安装识别、检查、占用与安装均不发生，macOS/Linux 原测试继续通过。
- [x] 1.2 更新 CLI 帮助和 README 的 Windows 升级说明；验证帮助包含手动命令，无效参数维持非零退出，文档不宣称自动安装已完成或扩展整体 Windows 支持范围。

## 2. TUI 版本展示精简

- [x] 2.1 拆分简洁概览、检查结果和独立详情入口，使用准确状态与条件操作文案；测试已最新、待安装、旧 gateway、旧 TUI、多差异、未检查、检查中、未知、失败和 development，确认默认不平铺组件版本、不提示降级。
- [x] 2.2 为 TUI 升级提示选择平台对应命令并保留详细组件信息的按需查看；测试 Windows 完整命令、Unix 命令、检查异常不沿用旧成功反馈，以及菜单返回、详情滚动、关闭后可编辑。
- [x] 2.3 用实际 PTY 在 80×24/60×16 验证概览/检查/详情、长命令可访问、Esc 焦点恢复和草稿保留；记录平台与可复核结果，不把平台注入视为 Windows 真机验证。

## 3. 集成验证

- [x] 3.1 运行 `bun run check`、`bun run test`、`bun run build:release`、`bun run test:package`、OpenSpec strict 与 `git diff --check`；确认无协议、依赖、锁文件、会话及凭据变更，记录验证结果。
