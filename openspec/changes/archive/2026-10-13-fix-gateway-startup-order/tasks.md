# Tasks

## 1. TUI 默认双传输与跨前端复用

- [x] 1.1 移除 POSIX TUI 自动启动参数中的强制 `--port 0`，保持配置优先级与 Windows 分支；调整现有 TUI 启动测试使用隔离空闲端口配置，验证 WS 实际可连接及默认启动参数不禁用 WS。
- [x] 1.2 在 CLI 启动测试中增加 TUI→Web、Web→TUI 两种顺序，实际验证 WS 握手、serverId 一致、目录查询、同一会话 attach 和不重复 spawn；关闭复用方后验证原客户端仍可操作，关闭拥有方后验证子进程/地址资源清理。Windows 分支验证随机端口文件发现与清理。
- [x] 1.3 更新相关启动注释和现有用户启动文档，说明 POSIX 默认双传输、非默认 WS 地址需匹配及旧仅 Unix gateway 的重启方式；核对文档命令与现有 CLI 参数一致。

## 2. Web WS 就绪验证与失败隔离

- [x] 2.1 为 Web 启动探测使用可取消、有界的连接生命周期，验证将发布地址的 WS 握手与 serverId 并释放探测客户端；在复用和新子进程分支接入验证。用延迟/停滞握手测试验证截止时间有效且失败后探测资源释放。
- [x] 2.2 区分活跃 Unix gateway 的 WS 不可用与无活跃实例：前者明确报错且不 spawn/停止原 gateway，后者沿用启动流程；补充仅 Unix、错误 WS 地址、不同 serverId 与正确自定义地址测试，验证失败后原客户端仍可查询且错误含地址与修复提示。
- [x] 2.3 新子进程只有在所需传输验证成功后返回 handle，启动超时或提前退出时清理自己拉起的子进程；补充 WS 尚未就绪和失败清理测试，验证不发布虚假成功地址，既有 Windows 启动/重连测试仍通过。

## 3. 集成验证

- [x] 3.1 执行相关启动测试与 `bun run test`、`bun run check`、`bun run build`，确认无回归并记录验证结果；真实 key 不打印、不落盘，启动测试不调用模型。
- [x] 3.2 在本机实际验证两种 CLI 启动顺序，检查 Web 能连接且两端共享会话；如有 Windows 环境执行同样验证，否则明确记录 Windows 实机验证未执行，不能以 POSIX 结果宣称 Windows 已验证。

## Verification record

- 2026-10-13，macOS，Bun 1.4.2。
- 全量 `bun run test`：285 pass / 0 fail，69 个测试文件；最终启动专项测试：11 pass / 0 fail。
- `bun run check`、`bun run build`、`git diff --check` 与 OpenSpec strict 校验通过。check 保留既有 theme-syntax 测试中的一条信息级建议；build 保留既有客户端 chunk 大小提示。
- 真实 CLI 验证：在隔离临时数据目录启动 PTY TUI 与 Web CLI（两种顺序），验证 `/api/info`、实际 WS 握手与 attach；经 WS 将同一会话 thinkingLevel 设置为 off，TUI 显示同步更新的 Think off。测试使用占位 key，未提交模型请求；进程退出后移除临时数据。
- Windows 保留随机端口文件发现、复用与清理分支，跨前端测试具备 Windows 路径；当前无 Windows 实机环境，未执行 Windows 实机验证。
