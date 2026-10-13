# 发布维护

对外只发布 `neko-harness`，内部 workspace 均保持 private。运行时和验证使用 Bun 1.4.x；Node/npm 仅用于向 npm 上传产物及 OIDC 认证。

## 首次发布

1. 安装 Bun 1.4.x，然后 `bun install --frozen-lockfile`；文件发现组件随 pi-env 提供，无需安装 fd。
2. `bun run build:release && bun run check && bun run test && bun run test:package`
3. 确认 `artifacts/neko-harness-0.1.0.tgz` 的内容，提交并推送代码，等待 CI 通过。
4. `npm login --registry=https://registry.npmjs.org`，然后 `npm publish ./artifacts/neko-harness-0.1.0.tgz --access public --tag latest --registry=https://registry.npmjs.org`；在浏览器完成 npm 要求的认证。
5. 发布成功后创建并推送 `v0.1.0` tag。首次不发布 GitHub Release，避免再次触发 npm 发布。
6. 在 npm 包设置 → Trusted publishing 添加 GitHub Actions：owner `kirineko`，repository `neko-harness`，workflow `release.yml`，environment `npm`。允许 publish。

## 后续发布

1. 更新根 `package.json` 的版本，运行 `bun install --lockfile-only` 更新锁文件，提交并推送；确认 CI 通过。
2. 创建对应 `vX.Y.Z` tag 的 GitHub Release，填写用户可读的更新说明并发布。
3. `release.yml` 验证 tag 与稳定版本号一致，重新执行检查、测试、构建和安装冒烟；随后上传同一份已验证 tarball 至 npm `latest`，附带 provenance。

CI 在 macOS/Linux 使用 Bun 1.4.x。发布流程使用 GitHub-hosted Ubuntu runner 和 `npm` environment，不保存长期 npm token。需先在 npm 完成 Trusted Publisher 配置，提交 workflow 本身不会自动建立信任关系。

`artifacts/`、`dist/` 不提交。实际 npm 包只包含构建产物、README、LICENSE 和 package.json。

## Pi 1.2 升级发版后的 Windows 验证

用户已决定将此次升级的 Windows 验证延后至发版后；归档不表示 Windows 已通过。对应归档的 8.4/9.2 仍未完成，见 [验证记录](../openspec/changes/archive/2026-10-13-upgrade-pi-sdk-1-2/verification.md)。

- [ ] 记录 Windows 版本、架构、Bun 版本和实际发布的 neko-harness 版本；在干净目录安装该版本，确认随包 pi-env helper 可解析、可执行，不依赖开发 reference、Cargo 或运行时下载。
- [ ] 在没有 fd/fdfind 的 PATH 中验证 @ 首次查询、缓存复用、文件创建/删除/重命名后的刷新与故障重试；退出后没有遗留 helper。
- [ ] 验证 TUI/Web 使用 WS-only 网关及 port-file 发现；无 Key 可启动，双端消息/流式输出、模型设置、图片和候选同步，切换会话与单端断连不影响另一端或已受理的回答。
- [ ] 将实际结果补充到上述归档验证记录；对应平台检查通过后再勾选归档任务 8.4/9.2。
