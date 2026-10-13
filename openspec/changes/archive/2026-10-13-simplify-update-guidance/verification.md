# 验证记录

平台：macOS arm64，Bun 1.4.2。

- `bun run test`：309 pass、0 fail，79 文件，1810 assertions。
- `bun run build:release`、`bun run check`、`bun run test:package`、`openspec validate simplify-update-guidance --strict`、`git diff --check` 通过。类型检查依赖包构建声明，清理产物后先构建再检查；保留已有 Biome useTemplate 信息与 Vite chunk 提示。
- Windows 平台注入：稳定版本和 development 均返回完整手动命令；entry/run/checker 访问即失败的桩未触发，提前返回不进入升级占用；帮助与无效参数测试通过。
- TUI 单元测试覆盖平台命令、状态矩阵、缺失信息、无降级建议、重启优先级、检查异常、返回结果优先于旧订阅、独立详情、滚动和 Esc。
- 实际 CLI PTY：80×24、60×16，独立 HOME/存储/工作区，网关随机端口；`/version` → 概览 → 检查 → 详情 → 逐层 Esc 后可正常输入。没有真实模型请求。
- 实际组件 PTY：相同两个尺寸，使用产品布局、编辑器与版本面板注入 Windows 平台及稳定版本状态；可查看完整 `bun add --global neko-harness@latest`，滚动、离线检查反馈、详情及退出后 KEEP-DRAFT-EDIT 保留均通过。
- 本次未在 Windows 真机运行，不宣称 Windows 自动安装或整体应用兼容性已经验证。未修改 Web、协议、依赖、lockfile、会话或凭据数据结构。
