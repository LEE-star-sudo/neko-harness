# Proposal

## Why

发版后在 Windows / WSL 上实测出两个问题：

1. 在终端按 Ctrl+C 后 `neko web` 只关掉了 gateway，web 进程仍然存活并占用静态端口（8322），下次启动失败。现有 `shutdown` 要等 `server.close()` 返回才会退出：只要还有未结束的 HTTP 请求（如无超时的 `/api/mobile/*` 代理调用，其对端 gateway 此时正在退出），进程就会一直挂住；也没有总超时、二次 Ctrl+C 强退或 Windows 信号处理。
2. 在 WSL2 默认 NAT 网络下，手机配对页只能选到 WSL 内部的 `172.x` 地址，与手机不在同一网段，手机无法连接。现有设计把监听地址与二维码地址绑定为同一个值，且不识别 WSL。要求用户切换 mirrored 网络既不通用也已验证无助，需要让默认 NAT 形态直接可用。

## What Changes

- **web 关闭可靠性**：`neko web` 收到 SIGINT/SIGTERM（Windows 另含 SIGBREAK/SIGHUP）后进入幂等关闭流程：停止接收新连接、立即断开全部 HTTP 连接、关停自己拉起的 gateway；带总超时（超时强制结束子进程并退出）；第二次 Ctrl+C 立即强退；`/api/mobile/*` 代理调用增加超时，避免悬挂请求拖住关闭。`neko serve`/TUI 的关闭路径做同样的超时兜底。
- **WSL 手机入口地址映射**：gateway 识别 WSL（互操作可用）后，手机配对的候选地址改为 **Windows 侧局域网 IPv4**（经 `powershell.exe` 读取并过滤 vEthernet/WSL/虚拟/代理 fake-ip 网卡）。监听仍在 WSL 内部地址上，由 gateway 在 Windows 侧拉起一个只绑定所选 Windows 局域网 IP 的 TCP 中继，把连接转发到 WSL 监听地址；二维码与配对文本使用 Windows 局域网地址（“对外宣告地址”）。纯 TCP 透传，TLS 与证书指纹校验不变；不需要管理员权限、portproxy 或切换 mirrored。
- **中继生命周期**：中继严格跟随手机访问入口：用户关闭手机访问、gateway 正常或被强杀退出、拉起它的前端退出时，中继都必须被关停，不残留 Windows 进程或占用端口；再次启用重新拉起。
- **接入前自检与反馈**：启用后从 WSL 内连通宣告地址，不通则显示失败原因且不展示二维码；互操作不可用、端口被占、无可用 Windows 局域网地址等有明确提示。WSL 之外的平台行为不变。
- **地址学习**：最近接入地址改为记录宣告地址，使候选排序在 WSL 下仍有意义。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `mobile-pairing`：监听地址与对外宣告地址分离；WSL NAT 下的 Windows 侧中继、其生命周期、自检与失败反馈；二维码使用宣告地址。
- `web-ui`：「Web 手机配对设置」在 WSL 下展示 Windows 局域网候选地址、中继状态与相应提示。
- `cli-interface`：`neko web` 的退出行为（Ctrl+C 幂等关闭、总超时、二次 Ctrl+C 强退、端口释放）。
- `session-gateway`：gateway 与拉起方的关闭可靠性；关闭时释放移动监听与中继。

## Impact

- 代码：`packages/web/src/main.ts`、`server.ts`、`mobile-admin.ts`、`gateway-spawn.ts`；`packages/gateway/src/main.ts`、`process.ts`、`mobile/listener.ts`、`mobile/admin.ts`、`mobile/pairing.ts`、`mobile/store.ts`，新增 WSL 探测与中继模块；`packages/tui/src/gateway.ts` 的关闭兜底；Web 配对页 `components/mobile-pairing.tsx`。
- 接口：`neko.mobile-admin` 的 `state`/`enable` 增加可选字段（宣告地址、WSL 模式信息），保持对旧客户端与旧 gateway 向后兼容。
- 依赖：不新增 npm 依赖；WSL 下依赖 `powershell.exe` 互操作（默认开启）。
- 安全：中继仅绑定用户选定的 Windows 局域网 IP，仅在手机访问开启期间存在；管理边界不变（管理请求仍只允许本机）。已知限制：经中继后认证失败限流以中继来源地址计数，所有手机共享同一额度。
- 不在范围：Windows 防火墙配置、mirrored 网络支持改动、移动 App 变更。
