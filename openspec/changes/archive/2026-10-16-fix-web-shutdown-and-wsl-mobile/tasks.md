# Tasks

## 1. 关闭可靠性：web / gateway / TUI

- [x] 1.1 在 `packages/web/src/server.ts` 跟踪所有 HTTP socket，并让 `close()` 先 `server.close()` 再销毁连接；`gateway-spawn.ts` 与 `startWebServer` 接受 `AbortSignal`，启动等待被打断时终止已拉起的 gateway。验证：新增 `packages/web/test` 用例——保持一个空闲 keep-alive 连接与一个悬挂请求时 `close()` 在时限内返回；启动阶段 abort 后无 gateway 子进程残留。
- [x] 1.2 重构 `packages/web/src/main.ts` 的 `shutdown`：在启动网关前注册 SIGINT/SIGTERM（并在支持的平台 try 注册 SIGHUP/SIGBREAK），幂等、5 秒总时限、二次信号立即强退，复用已有 gateway 时不终止它。验证：针对关闭流程的测试覆盖幂等、超时强退与二次信号；手动在 macOS 上冻结 gateway 子进程后按 Ctrl+C，web 在时限内退出且端口释放。
- [x] 1.3 调整 `packages/gateway/src/process.ts` 的 `stopGatewayProcess`（先注册 exit 监听再发信号，兼容子进程已同时收到信号），并给 `packages/gateway/src/main.ts` 的 `stop` 加总时限与二次信号强退；TUI 的 gateway 关闭路径（`packages/tui/src/gateway.ts`）同样接入兜底。验证：gateway 单测/集成测覆盖「拉起方与网关同时收到信号」与「3 秒后 SIGKILL」；`bun run test` 通过。
- [x] 1.4 为 `packages/web/src/mobile-admin.ts` 的代理调用加超时（`enable` 30 秒，其余 10 秒）并登记在途调用，关闭时取消；超时返回明确错误。验证：`packages/web/test` 用例——gateway 不响应时请求在上限内以错误结束，且不阻塞关闭。
- [x] 1.5 在 Linux 容器（`oven/bun`）里用终端式整组 SIGINT 复测 `neko web`（含保持的浏览器连接与进行中的配对状态请求），确认 web 与 gateway 均退出、端口可立即重用。验证：复测脚本输出显示两进程已退出且二次启动成功。

## 2. WSL 探测与 Windows 候选地址

- [x] 2.1 新增 WSL 探测模块（`WSL_DISTRO_NAME` / `/proc/version`、`powershell.exe` 路径发现含 `/mnt/c/Windows/System32/WindowsPowerShell/v1.0/` 回退、互操作可用性检测）。验证：单元测试以注入的环境/文件内容覆盖 WSL、非 WSL、互操作不可用三种情形。
- [x] 2.2 把 `listener.ts` 的虚拟网卡/保留网段过滤抽成作用于「网卡列表」的纯函数，并新增经 PowerShell 读取 Windows 网卡并复用该函数的候选发现（带短时缓存、过滤 vEthernet/WSL/Hyper-V/`169.254`/`198.18/15`）。验证：现有 `packages/gateway/test/mobile` 过滤用例保持通过，并新增 Windows fixture 用例（含 vEthernet、WSL、VPN、fake-ip）。

## 3. Windows 侧中继

- [x] 3.1 新增中继模块：内嵌 C# 的 `TcpListener` 转发脚本（`-EncodedCommand`，监听/目标先校验为 IPv4 字面量）、stdin 心跳（2 秒）与 8 秒无心跳/EOF 自退、stdout `READY`/`ERROR` 协议、READY 前对目标做 TCP 探测。验证：单元测试用假 `powershell.exe`（可注入 spawn）覆盖就绪、错误、心跳超时与 stdin 关闭；在 Windows 或 WSL 上手动验证脚本可编译并转发。
- [x] 3.2 在 `MobileGateway` 中集成中继：中继模式下监听绑定 WSL 主 IPv4、宣告 Windows 候选地址；`enable` 校验地址属于最新 Windows 候选；所选地址属于 WSL 自身网卡时走 `direct`；端口占用做 ≤10 秒有限重试；中继意外退出使状态变为 `error` 并让二维码失效。验证：`packages/gateway/test/mobile` 用例覆盖 direct / relay / 互操作不可用 / 端口占用 / 中继崩溃。
- [x] 3.3 保证中继与入口同生命周期：`disable`、更换地址或端口、`close()`、进程信号与强杀路径都停止中继（先关 stdin、等 1 秒、再 kill）；关闭中继不影响 gateway 与已受理任务。验证：测试断言每条路径之后中继进程已被结束、端口释放；手动强杀 gateway 后 8 秒内 Windows 侧中继进程消失。

## 4. 协议、状态与配对

- [x] 4.1 扩展 `neko.mobile-admin` 的 `state`/`enable` 为可选字段（`mode`、`bindAddress`，宣告地址仍放在 `address`），`pairing.ts` 取宣告地址，`lastConnectedAddress` 在中继模式记宣告地址（含 `listener.ts` 的学习逻辑）。验证：契约测试确认旧客户端读取不受影响，配对二维码 `ep` 为宣告地址，`bun run test` 通过。
- [x] 4.2 更新 `docs/mobile-api-v1.md`（若涉及字段）与 `README.md` 手机配对一节：WSL 下经 Windows 中继、无需管理员/portproxy/mirrored、防火墙放行提示、认证限流共享来源地址的已知限制。验证：文档中的命令与步骤与实现一致，复核链接与字段名。

## 5. Web 配对页

- [x] 5.1 更新 `packages/web/src/client/components/mobile-pairing.tsx` 与 `lib/mobile-admin.ts`：展示 `mode`（「经 Windows 中继」）、中继启动中/失败原因，缺字段时按旧网关渲染；失败时不显示二维码。验证：`packages/web/test/mobile-admin-client.test.ts` 增加用例；在 375px/1440px 宽度检查无溢出。

## 6. 集成验证

- [x] 6.1 `bun run check`、`bun run test`、`bun run build` 全部通过；`openspec validate fix-web-shutdown-and-wsl-mobile --strict` 通过。
- [ ] 6.2 在真实 WSL2（NAT）环境手动验证：开启手机访问后同网段手机可扫码配对并对话；关闭手机访问后 Windows 侧中继与端口释放；`neko web` 中按 Ctrl+C 后 web、gateway、中继均退出，且立即重启不因端口被占用而失败。

## Workflow follow-up

- 实现完成并通过评审后归档该变更（`/openspec-archive-change`）。
