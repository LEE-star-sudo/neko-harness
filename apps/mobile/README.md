# neko_mobile

neko 的 Android 手机端（Flutter），通过局域网 HTTPS/WSS 控制电脑上的 Agent。协议见
`docs/mobile-api-v1.md`，设计见 `openspec/changes/add-flutter-mobile-control/design.md`。

## 开发

固定 Flutter 3.47.7 / Dart 3.13.5（`pubspec.yaml` 的 `environment`），依赖精确锁版本。

```bash
cd apps/mobile
flutter pub get --enforce-lockfile
dart format --set-exit-if-changed . && flutter analyze && flutter test
flutter build apk --release --split-per-abi   # 产物：build/app/outputs/flutter-apk/app-arm64-v8a-release.apk
```

`flutter test` 包含读取 `packages/gateway/test/fixtures/mobile-api-v1/` 的协议对拍测试；协议变更须同时更新 fixtures、
`docs/mobile-api-v1.md` 与 `lib/core/api/models.dart`。

依赖取舍：不使用 `permission_handler`（14.x 要求 compileSdk 37），相机设置跳转由 `MainActivity` 的 MethodChannel 实现；
`mobile_scanner` 使用 bundled 模型，无 Google Play 服务也能扫码；Markdown 用 `flutter_markdown_plus`（`flutter_markdown` 已停止维护），
HTML 按原文显示。

代码结构：`lib/core`（网络指纹绑定、配对、RPC、存储、API 模型）、`lib/features`（连接、会话、聊天、审批、子 agent、电脑设置）、
`lib/ui`（主题 tokens 与共用组件）。

## 发布签名

release 签名读取 `android/key.properties`（已 gitignore）；缺失时退回 debug 签名，只用于编译验证。本机生成并备份 keystore：

```bash
cd apps/mobile/android
keytool -genkeypair -v -keystore neko-release.jks -alias neko -keyalg RSA -keysize 4096 -validity 10000
cat > key.properties <<'PROPS'
storeFile=neko-release.jks
storePassword=<密码>
keyAlias=neko
keyPassword=<密码>
PROPS
```

keystore 与密码请离线备份：丢失后无法以同一签名覆盖安装，用户只能卸载重装并重新扫码（已配对凭据在 Keystore 中，不随备份迁移）。
同签名覆盖安装会保留配对与草稿。

## 真机回归

`scripts/mobile-e2e-gateway.ts` 启动隔离数据目录与脚本化 faux 模型的 gateway（不访问外部模型）：

```bash
bun --conditions=neko-source scripts/mobile-e2e-gateway.ts --address <电脑局域网 IPv4> --port 8324 --serve-pairing 8325
adb reverse tcp:8325 tcp:8325
cd apps/mobile && flutter test integration_test/mobile_e2e_test.dart -d <设备>
```

集成测试经回环取新鲜配对文本，随后走真实局域网 TLS 指纹绑定、配对、WSS 与 JSON-RPC，覆盖新建会话、流式回答、
子 agent 审批、子详情、忙碌排队与停止、长内容展开。手工验证 release 包时可直接扫码，或粘贴 `<数据目录>/pairing.txt`。

## M0 真机验证记录

- 日期：2026-10-15
- 设备：V2419A，Android 16（API 36，arm64）
- 电脑侧：macOS 26.6.2，Bun 1.4.2，临时隔离数据目录与 faux provider
- App 侧：Flutter 3.47.7，Dart 3.13.5，release arm64 APK

已通过：

- 首次扫码配对；首次拒绝相机权限后进入系统设置授权，返回并重试成功。
- 错误自签名证书、已过期证书、伪造签发者攻击链均在 TLS/证书校验阶段拒绝；攻击链测试服务端未收到任何配对 HTTP 请求。
- App 进程结束后重启，无需扫码即恢复连接并完成 `server.hello`。
- gateway 重启后，同一证书与授权保持不变，App 自动恢复连接。
- App 退到后台 5 分钟后返回前台，连接恢复为 ready。
- 本机 admin 服务撤销设备后服务端删除授权；App 显示“设备授权已被电脑撤销”，停止重试并仅提供重新扫码入口。

同时通过：`flutter analyze`、`flutter test`（87 个）、`flutter build apk --release --split-per-abi`；仓库侧 `bun run check`、`bun run build` 与全量 Bun 测试（656 个）。
