# Tasks

按 design「Migration Plan」的三个里程碑组织；每个里程碑末尾的关口任务未通过，不开始下一里程碑。文件路径见 design D12。TS 侧验证默认 `bun run check && bun run test`，Flutter 侧默认在 `apps/mobile/` 执行 `dart format --set-exit-if-changed . && flutter analyze && flutter test`。

## 1. M0：工程骨架与依赖

- [x] 1.1 `flutter create --org dev.neko.harness --project-name neko_mobile --platforms android,ios apps/mobile`，applicationId 改为 `dev.neko.harness.mobile`；pubspec 写入 design D1 表中的精确版本，`environment` 固定 Flutter 3.47.7 / Dart 3.13.5；提交 `pubspec.lock`；`.gitignore` 排除 `build/`、`.dart_tool/`、`android/key.properties`、`*.jks`。验证 `flutter pub get`、`flutter analyze`、`flutter build apk --release` 成功，且 `bun install --frozen-lockfile`、`bun run check` 不受影响。
- [x] 1.2 Android main manifest 声明 `INTERNET`、`CAMERA`、`ACCESS_LOCAL_NETWORK`（不请求），`allowBackup=false` + `dataExtractionRules` 全排除，compileSdk/targetSdk 显式为 36；`mobile_scanner` 确认使用 bundled 模型；`MainActivity` 增加打开应用详情设置的 MethodChannel（不引入 `permission_handler`）。用 `apkanalyzer manifest print` 检查 release APK 的合并 manifest，并确认 `--split-per-abi` 的 arm64 产物可安装。
- [x] 1.3 gateway 增加 `node-forge@1.4.0` 与 dev `@types/node-forge@1.3.14`（精确版本、更新 `bun.lock`），确认 Pi 依赖版本未变。

## 2. M0：gateway 证书、入口、配对与认证最小链路

- [x] 2.1 `mobile/store.ts`：`<数据目录>/mobile/` 0700、`state.json`（`formatVersion:1`，enabled/address/port/devices/receipts）、`tls/`、`admin-token`；写入经串行队列 + 临时文件 + `rename`，私钥/令牌 0600。测试：重启后读回一致、写失败不改变内存状态也不返回成功、损坏文件给出可读错误且不覆盖、POSIX 权限位正确。
- [x] 2.2 `mobile/certificate.ts`：按 design D3 证书画像生成（RSA-2048、SHA-256、128-bit 正序列号、SAN 仅 `.invalid` DNS、825 天）；导出 DER SHA-256 与到期时间。测试：指纹与 `node:crypto.X509Certificate(pem).fingerprint256` 一致、重启不重生成、`regenerate` 产生新指纹。
- [x] 2.3 `mobile/listener.ts`：`node:https` + `ws`（`noServer`，`maxPayload` 256 KiB），绑定单个 IPv4，状态机 `disabled/starting/listening/error/stopping`，候选地址过滤；挂入 `bindGateway` 与 `NekoGateway.close()`（先关移动入口）。测试：默认无监听；端口占用/地址不存在进入 `error` 而 Unix/WS 本地传输照常；运行中启停无需重启 gateway；enabled 配置在 gateway 重启时恢复，恢复失败不阻断启动；未知路径 404。
- [x] 2.4 `mobile/pairing.ts`：内存配对码（120 s、单一有效码、刷新作废、gateway 重启作废）、`POST /mobile/v1/pair` 按 design D4 处理与状态码、回执持久化 10 分钟、同 deviceId 替换并递增 grantRevision、请求体 ≤ 4 KiB、每 IP 10 次/分钟与全局在途 ≤ 4。测试：过期、刷新后旧码、两个并发兑换恰一成功（另一 `409 code_used`）、响应丢失后同请求重试（含 gateway 重启后）返回原结果、恢复窗口外拒绝、错误体不回显请求字段。
- [x] 2.5 `mobile/auth.ts`：`Authorization: Neko-Device <deviceId>.<credential>` 解析、`timingSafeEqual` 哈希比较、失败限速；认证在 `upgrade` 阶段完成，失败 401 并销毁 socket。测试：无头/错凭据/未知设备/已撤销设备都无法升级；凭据、配对码、私钥不出现在日志、错误体、URL。
- [x] 2.6 `mobile/protocol.ts` + `mobile/adapter.ts` 最小版：每连接 `memoryLinkPair` + `chord.accept(…, { principal: { connectionId, kind:"mobile", deviceId, grantRevision } })`、JSON-RPC 分发、`server.hello` 版本协商与 `MOBILE_LIMITS`、hello 前其他方法即关闭。测试：版本无交集返回 `incompatible{needs}`；撤销调用 `invalidatePrincipal({deviceId})` 后连接以 4401 关闭；桌面 `createGatewayConnection` 行为与契约不变（现有 gateway 测试全绿）。
- [x] 2.7 临时 M0 管理入口：仅测试/开发用的脚本 `scripts/mobile-dev-pair.ts`（经 admin 服务调用 enable + createPairing，在终端打印配对文本与二维码 ASCII），用于在 Web 页面完成前做真机验证；M1 完成后删除或保留为开发工具并在移动开发文档说明。

## 3. M0：App 最小链路与真机关口

- [x] 3.1 `core/net/pinned_client.dart`：design D3 的专用 `HttpClient`（无系统根、指纹+有效期+host/port、DIRECT、禁止重定向、仅 https/wss）。Dart 单测启动本地 TLS 服务器（测试证书在 `test/fixtures/tls/`），覆盖：正确证书、错误自签名、被 pin 但过期、伪造签发者攻击链、重定向，负面用例断言服务端未收到请求。
- [x] 3.2 `core/pairing/`：解析 `nekopair:1:` 文本（非法/过期/版本不支持区分）、生成 deviceId/pairRequestId/credential 并先写安全存储、POST 配对、响应丢失重试、成功后转为已配对电脑记录；`core/rpc/`：`IOWebSocketChannel` + `json_rpc_2` + `server.hello`。最小页面：扫码（含粘贴文本入口、相机权限拒绝引导）、连接状态、hello 结果。
- [x] 3.3 **M0 关口**：在 Android 真机 release 构建上，用 2.7 的脚本完成：首次扫码配对；错误证书/过期证书/攻击链拒绝（用 spike 同款证书切换 gateway 证书文件复现）；相机拒绝后恢复；App 退后台 5 分钟返回后重连；App 进程重启与 gateway 重启后无需扫码重连；撤销后 App 显示 `revoked` 且不再重试。结果（设备型号、Android 版本、Flutter/Bun 版本、通过项）写入 `apps/mobile/README.md` 的验证记录小节。

## 4. M1：本机配对管理与 Web 设置

- [x] 4.1 `mobile/admin.ts`：`NekoMobileAdmin`（`neko.mobile-admin` v1）契约与服务，input `{token}` 常量时间校验、拒绝 `kind:"mobile"` principal；方法 `state/enable/disable/createPairing/cancelPairing/revoke/regenerateCertificate`。测试：无 token/错 token 的本地连接与手机 principal 均 `forbidden` 且错误不含 token；`createGatewayConnection` 不绑定该契约；撤销/重新生成证书断开对应手机且已受理任务继续。
- [x] 4.2 `packages/web/src/mobile-admin.ts`：读取 admin-token、服务端专用客户端连接 gateway、`/api/mobile/*` 路由与 design D5 的全部来源检查与 CSRF；旧 gateway 返回 `501 gateway_unsupported`。测试：非回环 peer、错误 Host（含 DNS rebinding 形式）、跨源 Origin、`Sec-Fetch-Site: cross-site`、缺失/错误 CSRF、非 JSON、超限体、`X-Forwarded-For` 伪造均在副作用前拒绝；`/api/info` 不含 token。
- [x] 4.3 Web 设置新增「手机配对」分区（`components/mobile-pairing.tsx`，二维码由 `qrcode-generator@2.0.4` 渲染 SVG）：开关、地址选择、端口、实际状态与错误原因、二维码倒计时与刷新、「复制配对文本」、简短同网/防火墙指引、Web spawn gateway 的生命周期提示、证书到期提示与「重新生成证书」确认。验证：默认关闭、失败不显示有效二维码、多网卡可选、375px/1440px 与浅/深主题、键盘可达；`bun run --cwd packages/web check:client` 通过。
- [x] 4.4 设备列表（名称、在线、最后连接时间）与单设备撤销确认（说明任务继续运行），以请求序号防止迟到结果覆盖；失败保留真实状态可重试。补充 README 中电脑侧配对说明。

## 5. M1：移动 API 主会话能力

- [x] 5.1 `docs/mobile-api-v1.md` 与 `packages/gateway/test/fixtures/mobile-api-v1/`：hello、错误码、workspaces、sessions、chat attach/patch/reset/history/content/submit/status、approvals 的请求/结果/通知示例；TS 测试用 `protocol.ts` schemas 校验全部 fixtures。
- [x] 5.2 workspaces/sessions：`workspaces.list`、`sessions.list`（按工作区过滤、`lastUsedAt` 倒序、50 条分页、标题/首条预览搜索）、`sessions.create`（`cwd` 必须在已登记列表）、变更通知。测试：未知工作区拒绝且不回落 gateway 启动目录；工作区 B 新建会话在桌面目录可见。
- [x] 5.3 `mobile/projection.ts` + chat attach/detach/history：快照（状态 + 尾部 ≤ 50 条且 ≤ 128 KiB）、key 游标历史、窗口 digest 增量 `upsert`、key 消失/重排发 `reset`、streaming `append`、100 ms 合并、`subscriptionId`+`seq`。测试：2000 条目会话首包与每页均在限制内且分页无重复/遗漏；流式期间工具结果更新只发对应 upsert；快速切换会话后旧订阅通知被丢弃、旧 attachment 调用返回 `gone`。
- [x] 5.4 大字段 contentRef 与 `chat.content`（8 KiB 阈值、2 KiB 预览、64 KiB 分块、digest 校验）。测试：超长工具结果可完整读回且与原文逐字节相同、多字节 UTF-8 跨块正确、流式修订后旧 ref 返回 `content_changed`、原工具截断标记保留。
- [x] 5.5 `chat.submit`/`chat.submissionStatus`/`chat.abort`：`mode` 仅缺省或 `steer`，结果 `{accepted, queued}`；受理状态经 `submissionByRequest` 读取。测试：同 requestId 重复提交（含断线与 gateway 重启后）只产生一条输入；忙碌时被排队而非拒绝且 `queued=true`；凭据缺失等错误原样返回；未知 requestId 返回 `unknown`。
- [x] 5.6 approvals：`approvals.list/get`（来自 `runtime.approvals.list`，仅本会话委派、pending）、`approvals.decide`（经对应 `NekoSubagent.decideApproval`）、`approvals.changed` 通知。测试：手机与桌面竞争只一次生效并返回最终状态；子任务停止后的决定返回实际终态且不执行；撤销后旧决定被拒绝。
- [x] 5.7 边界：每连接在途 ≤ 8（`busy_limit`）、发送缓冲 > 2 MiB 关闭（4408）、非法 JSON/超限帧只关闭该连接、每次副作用前复核 grantRevision。测试：慢消费者不影响本地 WS 客户端与 Agent 运行；撤销与提交竞争时撤销后到达的提交被拒、已受理的不回滚。

## 6. M1：App 主会话控制

- [x] 6.1 主题与基础组件：从 Web `styles.css` 提取 tokens 为 `ThemeExtension<NekoTokens>`（自动/浅/深）；消息、Markdown（`flutter_markdown_plus`，禁 HTML）、思考、工具卡、错误/系统条目。组件测试：代码/表格/长路径不横向撑页、HTML 原样显示为文本、字体 2.0 倍可用、两主题快照。
- [x] 6.2 连接状态机与恢复（design D9 状态与退避、前台恢复、generation/subscription 丢弃）、已保存电脑列表、切换/忘记电脑。测试：短断网恢复最新快照、旧响应被丢弃、`revoked/trustChanged/incompatible` 停止重试并显示对应操作、状态未就绪时控制禁用。
- [x] 6.3 工作区抽屉与会话列表/搜索/新建/切换，恢复上次选择，失效回退同工作区。组件测试：同名不同路径工作区显示完整路径、长标题、快速切换与连续点击新建只创建一个会话。
- [x] 6.4 聊天页：懒加载列表、向上分页锚点、流式 append、回到底部、contentRef 展开读取；输入区草稿、发送、steer（忙碌时可选）、停止、待确认请求。测试：prepend 无跳动/重复、新输出不打断阅读、受理后仅清除原文草稿、`unknown` 状态显示待确认并只允许原请求重试、重启后先查状态、离线不自动发送。
- [x] 6.5 审批条与底部面板（主页与子详情共用），完整命令/目录/超时、允许本次/拒绝、竞争后显示终态。测试：未打开子详情也可决定、新请求不抢焦点不清草稿、已决定请求重连后不再出现。
- [x] 6.6 **M1 关口**：真机 + 电脑 TUI/Web 同时使用：Web 设置开启并扫码、B 工作区新建会话、发送/流式/工具调用、忙碌时排队与 steer、手机审批子 agent 命令并与 Web 竞争、手机休眠/断网/进程结束后恢复、gateway 重启后恢复、撤销后断开；记录到验证小节。

## 7. M2：子 agent、图片与完整体验

- [x] 7.1 gateway：`subagents.open/history/close/stop` 与 `subagents.patch`，复用 `NekoSubagent` chunk/history 并映射为同一 DTO、同一 contentRef 规则；`stop` 绑定 taskId。测试：多轮接续同一身份、旧轮 stop 返回 `gone` 不影响新轮、用量与桌面一致、fork 历史只读。
- [x] 7.2 gateway：`media.read` 绑定主/子会话、entryId、contentIndex，按 64 KiB 重切 `getImage` 结果。测试：原文件删除后仍可读历史图片、越界/他会话引用拒绝、每帧（含 base64）不超过公布限制。
- [x] 7.3 App：委派卡、稳定子列表、全屏子详情（连续历史、轮次定位、累计/本轮用量、当前轮停止、返回保留主草稿与滚动）。测试：打开旧轮定位正确、切换会话再返回无渲染错误。
- [x] 7.4 App：图片缩略与全屏预览（分块读取、缓存于内存、离开页面释放）。测试：大图分块拼接正确、读取中撤销显示错误不崩溃。
- [x] 7.5 无障碍与适配：软键盘/安全区、系统返回（返回不发送/停止/批准）、屏幕阅读器标签、可点区域 ≥ 48dp；组件测试覆盖。真机验证小屏、大字体、浅/深主题下发送、停止、审批和长内容阅读。

## 8. M2：交付与整体验收

- [x] 8.1 `.github/workflows/mobile.yml`（ubuntu-latest、Flutter 3.47.7、路径过滤，format/analyze/test/`flutter build apk --release`）；协议 fixtures 变更同时触发 Dart fixture 测试。验证既有 `ci.yml`、`release.yml` 与 `bun run test:package` 不依赖 Flutter。
- [ ] 8.2 签名：`android/key.properties` 读取方式、本机生成 keystore 与备份说明写入 `apps/mobile/README.md`；验证签名 APK 安装与同签名覆盖更新保留配对。
- [x] 8.3 端到端回归：在 6.6 基础上增加子 agent 接续/历史/停止、历史图片、超长工具结果、换地址重新扫码沿用授权、重新生成证书后要求重配、关闭/重开入口、gateway 升级重启；确认任务不重复、不被隐式停止、草稿可恢复、错误提示可操作。
- [x] 8.4 运行 `bun run check`、`bun run test`、`bun run build` 与 Flutter 全部检查/测试/release 构建；确认不需要迁移旧会话、关闭入口即可回退；删除或归档 M0 临时脚本；README 补最终用户安装/扫码/恢复说明。
