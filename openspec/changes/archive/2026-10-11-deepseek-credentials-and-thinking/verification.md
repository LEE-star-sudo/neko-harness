# Verification

## Automated checks

- `bun run check` / `bun run check:write`：Biome、根 TypeScript 与 Web client TypeScript 均通过。
- `bun run build`：全部 workspace 构建通过。Vite 保留现有大于 500 kB 的 bundle 提示，未新增依赖或变更 Pi 锁定版本。
- 完整 `bun test --conditions=neko-source --isolate`：81 pass、0 fail、409 assertions，26 个文件，约 50 秒。
- 完整回归后的启动凭据隔离与 TUI/网关定向回归：19 pass、0 fail。
- 最终幂等边界修正后的 credentials/request-id 测试：6 pass、0 fail、35 assertions；再次通过类型检查和构建。
- `openspec validate deepseek-credentials-and-thinking --strict` 和 `git diff --check` 通过。

新增检查覆盖：0600 文件权限、两进程并发更新、重启持久化、失败保留原文件、Pi CredentialStore 回调错误语义、环境变量回退、显式 runtime 覆盖、缺 Key 不受理输入、无 Key 时已受理 requestId 幂等、Unix/WS 状态同步和脱敏错误、Flash/Pro 能力与强度调整。实际 Pi HTTP 请求通过本地 fetch 模拟验证认证头更新、high 思考参数及标题关闭思考；未调用真实 DeepSeek API。

## Browser

使用隔离的内存会话网关及临时凭据文件，通过真实 WebSocket 驱动页面。测试 Key 为固定测试字符串，不使用真实凭据。

- 设置页保存、状态更新、输入清空、移除和未配置引导通过。
- 1440、1024、768、375 宽度检查，无水平溢出，配置卡和模型弹层均完成检查；测试截图已在归档前清理。
- Flash low 切 Pro 自动预选 high，Pro 仅 off/high/max；确认后状态栏同步。
- Escape 取消保留实际配置，关闭后焦点返回触发按钮。
- 独立 375x812 触屏上下文通过 tap 完成 max 配置；离开设置页再进入不保留未保存 Key。
- 临时 Unix 客户端驱动真实 LoginPanel 保存操作，Web 与 TUI 共用同一凭据服务。

## Terminal

LoginPanel 测试验证粘贴输入仅以星号渲染、关闭后清理输入/撤销缓存、迟到响应不影响新面板。120x40、80x24、60x16 下输入、操作提示、聊天草稿和状态栏可见。另通过实际 Pi 布局引擎及真实 Unix 网关配置状态验证文本渲染；临时渲染记录已在归档前清理。

## Scope

README 使用中文，TUI 产品文本保持英语。未修改 Pi 包、模型目录或锁文件，未迁移/删除会话历史，未使用真实 API Key 发起请求。测试截图和临时文件不纳入归档。
