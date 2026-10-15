# Design

## Context

- 现状：`MobileGateway`（`packages/gateway/src/mobile/listener.ts`）在用户所选 IPv4 上起 HTTPS/WSS 监听（禁止 `0.0.0.0`），二维码 `ep` 直接取该监听地址（`pairing.ts`）；候选地址来自 `os.networkInterfaces()` 并过滤虚拟网卡。证书固定指纹、SAN 为固定名，不含 IP。认证失败限流按 `socket.remoteAddress` 计数；`lastConnectedAddress` 取连接的本地地址。
- WSL2 NAT 下 WSL 只有 `172.x` 与 localhost；Windows 宿主能直接访问 WSL 的 `172.x`，WSL 也能调用 `powershell.exe`（互操作默认开启）。用户确认 mirrored 不是可接受方案，Windows 防火墙由用户自行处理。
- 关闭链路：`web/main.ts` 的 `shutdown` 先 `await server.close()`，再关 gateway，信号处理器在 `startWebServer` 之后才注册；`mobile-admin.ts` 的代理调用无超时；`stopGatewayProcess` 对已退出的子进程直接返回；`gateway/main.ts` 的 `stop` 无超时、无二次信号强退。终端 Ctrl+C 会把信号同时发给 web 与 gateway 子进程。我在 macOS 上冻结 gateway 并保留一个进行中的 `/api/mobile/state` 请求时，web 在 SIGINT 后一直不退出（直到该请求超时）。Windows/WSL 上的确切挂起点未复现，因此关闭流程按「任何环节都不能无限等待」设计。
- 见 proposal.md 的动机与范围。

## Goals / Non-Goals

**Goals:**
- Ctrl+C / 终止信号后 web、gateway、中继都在有界时间内退出，端口释放。
- WSL NAT 默认配置下，手机经 Windows 局域网地址即可配对与使用，无需管理员权限与额外配置。
- 非 WSL 平台行为与协议（二维码字段、证书校验）保持兼容。

**Non-Goals:**
- 不配置 Windows 防火墙、portproxy 或 WSL 网络模式；不做中继的真实来源 IP 透传（PROXY protocol）。
- 不在非 WSL 平台引入中继；不改移动 App。

## Decisions

**D1 中继放在 gateway 内，由 `MobileGateway` 管理。** 监听与中继同属「手机入口」，在 `startListening`/`stopListening`/`close` 内一并创建、销毁，状态机（starting/listening/error/stopping）覆盖两者。备选：在 web 进程里起中继——TUI/serve 启动的 gateway 也需要，且生命周期会与入口脱节，否决。

**D2 中继实现：`powershell.exe` + 内嵌 C#（`Add-Type`）的 `TcpListener` 转发。** 无需管理员、无需额外二进制或 Windows 侧 Node。脚本以 `-EncodedCommand` 传入（避开引号转义），`-NoProfile -NonInteractive`。参数（监听 IP:端口、目标 IP:端口）经命令行传递，并先校验为 IPv4 字面量。备选：`netsh interface portproxy`（需管理员、且 WSL IP 变化需维护）；Windows 侧 `node.exe`/`bun.exe`（不保证存在）；WSL 内 `socat`（无法暴露到 Windows 局域网网卡）。均否决。

**D3 监听与宣告分离。** WSL 中继模式下，移动监听绑定 WSL 自身主 IPv4（`eth0`，每次启用时重新解析），端口沿用配置端口；中继在 Windows 侧监听「所选 Windows 局域网 IP:同一端口」，转发到 WSL 监听。状态 `listening.address/port` 表示**宣告地址**（保持旧客户端读取语义），新增可选 `bindAddress` 与 `mode: "direct" | "wsl-relay"`；`pairing` 取宣告地址。持久化的 `address` 也是宣告地址；`lastConnectedAddress` 在中继模式下记宣告地址。`mobile.enable({ address })` 在中继模式下要求 address 属于最新一次读取的 Windows 候选集合，拒绝任意地址。`assertListenAddress` 的 `0.0.0.0` 禁令保持不变。

**D4 Windows 候选地址发现。** 经 `powershell.exe` 读取网卡（仅 Up、非回环/隧道），输出 JSON 后复用现有过滤规则（虚拟网卡名前缀/关键字、`169.254`、`198.18/15`），把过滤逻辑抽成作用于「网卡列表」的纯函数以便共享与用 fixture 测试；排除 `vEthernet`/WSL/Hyper-V。读取结果有短时缓存（避免每次轮询都拉起 PowerShell）。过滤后为空时沿用「回退未过滤」策略。所选地址若同时存在于 WSL 自身网卡（mirrored）则走 `direct` 模式。

**D5 中继控制通道与生命周期。** 中继的 stdin 用作控制通道：gateway 每 2 秒写入心跳；中继在 stdin EOF/出错，或 8 秒内无心跳时自行退出（覆盖 gateway 被 SIGKILL、互操作进程残留的情况）。stdout 逐行回报 `READY` / `ERROR <message>`：中继在宣告 READY 之前须已成功监听并对目标做一次 TCP 连通探测（即「入口自检」，证明 Windows 经 `172.x` 可达 WSL 监听）。gateway 在 `stopListening` 先关闭中继 stdin、等待最多 1 秒，再 `kill`；`close()` 与进程信号路径同样调用。中继意外退出时触发状态 `error`、使二维码失效并停止监听。端口被占用时（可能是上一个未及时退出的中继）在 ≤10 秒内有限重试后再报错。备选：只依赖 `kill`——WSL 互操作下终止 Linux 侧包装进程不保证结束 Windows 进程，否决。

**D6 web 关闭流程重构。**
- 在启动网关前就注册信号处理，并给 `startWebServer`/`ensureNekoGateway` 传 `AbortSignal`，启动阶段被打断时终止已拉起的 gateway 并退出。
- 关闭为幂等的单次流程：`server.close()`（不 await）→ 销毁所有已跟踪的 socket → 取消在途代理调用 → 关闭 gateway 句柄（自己拉起的：SIGTERM，3 秒后 SIGKILL；Windows 补删端口文件）→ `process.exit(0)`。总时限 5 秒，超时 `process.exit(1)`；第二次信号立即 `process.exit`。
- 信号集：SIGINT、SIGTERM；其余在支持时注册 SIGHUP/SIGBREAK（逐个 try 注册）。
- `stopGatewayProcess` 对「正在退出但未退出」的子进程仍等待其 exit，并保证 exit 监听在发送信号前已注册。
- gateway `main.ts` 的 `stop` 同样加总时限与二次信号强退，TUI 内置的网关关闭路径沿用同一兜底。
备选：仅加 `closeAllConnections()`——不能覆盖悬挂的代理调用与启动阶段信号，否决。

**D7 代理调用超时。** `createMobileAdminCaller` 的每次调用加超时（`enable` 因含拉起中继取 30 秒，其余 10 秒），并把在途调用登记，供关闭流程取消；超时返回明确错误（504 风格），浏览器端提示不可用。

**D8 前端。** Web 配对页沿用现有地址下拉与状态展示：WSL 下候选即 Windows 局域网地址，状态中展示 `mode` 以显示「经 Windows 中继」，失败原因（互操作不可用、端口被占用、PowerShell 受限）原样展示。旧 gateway 缺少新字段时保持现有渲染。

## Risks / Trade-offs

- [PowerShell 启动与 `Add-Type` 编译耗时 1–3 秒] → 启用时显示「正在启动中继」；候选读取带缓存。
- [受限语言模式/安全软件阻止 `Add-Type` 或监听] → 启用失败并给出原因，不回退到展示不可达地址。
- [WSL 互操作被禁用] → 明确提示（启用互操作或在 Windows 原生运行），不显示二维码。
- [中继残留（SIGKILL 的 gateway）] → 心跳超时 8 秒自退；下次启用对端口占用有限重试。
- [经中继后限流以中继来源地址计数，所有手机共享额度] → 暴力破解仍受限（凭据高熵）；已知限制，记录在文档，不透传来源 IP。
- [WSL IP 在会话中变化] → 中继转发失败；入口显示失败/断开，用户重新启用即重新解析（重启 WSL 同理）。
- [Windows 防火墙首次放行提示] → 文档说明；不在本变更处理。
- [web 强制退出时 gateway 清理被截断] → 总时限后 SIGKILL；gateway 自身有心跳与中继兜底，下次启动按既有流程恢复。

## Migration Plan

- 协议为向后兼容的可选字段扩展；旧 Web 连新 gateway、新 Web 连旧 gateway 均保持可用（缺字段时按旧语义）。
- 已保存的手机入口配置（地址/端口）在非 WSL 平台无变化；WSL 上旧配置的 `172.x` 地址不在候选内，启用时提示重新选择 Windows 局域网地址。
- 回滚：移除中继模块与关闭流程改动即可恢复旧行为，无数据迁移。
