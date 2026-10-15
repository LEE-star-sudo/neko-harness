# Proposal

## Why

当前 TUI/Web 只能作为电脑侧客户端使用，用户不能通过手机方便地查看和控制电脑上运行的 Agent。需要提供内部自用的 Flutter App，以局域网扫码配对建立可信连接，同时保持 Pi 的持久会话、委派和审批语义。

## What Changes

- 新增 Flutter 移动客户端，首版交付 Android APK；原生重建移动 UI，延续现有浅色和深色风格，不依赖 WebView、电脑静态页面或 Dart 版 Chord。
- 在桌面 Web 设置中新增「手机配对」：启用/关闭局域网访问、选择地址、生成限时一次性二维码、查看已配对设备并撤销授权。配对管理仅允许电脑本机操作。
- 同一个 gateway 按需启用独立 HTTPS/WSS 移动入口，默认关闭；现有本机 Unix socket/WebSocket 不直接暴露到局域网，也不启动第二个 Harness。
- 采用持久自签名证书与扫码证书指纹绑定，App 独立校验证书；无需公网域名、公共 CA 或安装系统根证书。设备凭据独立保存，撤销后立即失效。
- 新增薄移动 API，复用现有 TypeScript/Pi 会话服务且不修改既有桌面契约，提供已登记工作区选择、会话列表/搜索/新建、主内容流式查看与文字输入（忙碌时与 Web 相同由电脑排队，可选引导）、停止、子 agent 完整流程和子 agent 命令审批。历史图片可按需预览，首版不提供手机图片上传。
- 明确断线、后台恢复、重复提交、审批竞争、授权撤销、网关升级和 API 不兼容行为；手机断开不停止电脑上已受理的任务，App 不在离线期间自动排队执行控制操作。
- 首批验收先覆盖 Android 真机 release 构建的 TLS、扫码和重连，再开发完整 UI；保留 iOS 项目结构，但不把 iOS 安装交付纳入本次验收。

## Capabilities

### New Capabilities

- `mobile-pairing`: 局域网入口生命周期、电脑身份与证书绑定、一次性扫码配对、设备凭据及撤销、本机管理边界。
- `mobile-api`: 版本化且有界的原生移动 API，复用持久会话和委派服务，提供授权、快照、历史、提交与审批一致性。
- `mobile-ui`: Flutter Android App 的连接、工作区与会话导航、聊天和子 agent 查看/控制、审批、草稿与恢复交互。

### Modified Capabilities

- `web-ui`: 在设置中增加本机手机配对与设备管理入口。
- `session-gateway`: 明确原有本地 Chord 传输与新增受认证移动入口的边界，以及共享运行时和资源释放规则。

## Impact

- Gateway 增加 TLS/配对持久状态、设备授权、移动 API 适配及本机管理服务；Core 保持现有 Pi 1.2.0 语义与精确依赖版本，不迁移会话存储。
- Web 服务新增受本机、Origin/Host 和 CSRF 校验保护的配对管理代理；Web 设置新增配对页面。普通浏览器连接与 TUI 操作不新增配对要求。
- 新增 `apps/mobile/`，独立 Flutter/Dart、Android 构建与锁文件；Bun workspace、npm 主包发布和既有 macOS/Linux CI 保持独立，不新增 Windows CI。
- 新增依赖均精确锁版本：gateway `node-forge`（零依赖证书生成，已在 Bun 1.4.2 验证；弃用依赖全局 `reflect-metadata` 的 `selfsigned`）、Web 客户端 `qrcode-generator`；Flutter 侧 go_router、Riverpod、json_rpc_2、mobile_scanner、flutter_secure_storage、flutter_markdown_plus 等，M0 真机验证后锁定。App 和电脑之间使用独立移动 API 版本，不假定 npm 版本相同。
- 交付分三个里程碑关口：M0 Android 真机 TLS/扫码/重连链路，M1 主会话控制与审批（可日常使用），M2 子 agent 详情、图片与完整体验。
- 不包含公网访问、云中继、后台常驻/推送、mDNS 自动发现、TUI/CLI 配对入口、宿主目录浏览/添加工作区、模型/凭据/技能管理、手机上传附件、自定义 subagent、远程升级或 iOS 发布。本变更无既有客户端破坏性协议修改。
