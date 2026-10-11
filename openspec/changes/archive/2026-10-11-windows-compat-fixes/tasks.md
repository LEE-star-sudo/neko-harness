# Tasks

## 1. Web 工作区面板 Windows 路径

- [x] 1.1 `packages/web/src/client/components/workspace-picker.tsx` 面包屑平台感知：盘符路径按 `[\\/]` 切分、拼回不强加 `/` 前缀（POSIX 行为不变），验证 Web 客户端类型检查通过并新增/调整组件级用例
- [x] 1.2 `packages/gateway/src/workspaces.ts` browse 入口归一化 `/^\/+([A-Za-z]:[\\/])/` 形态，验证新增测试覆盖 `/D:\code`、`//D:/code` 归一化且 POSIX 路径不受影响
- [x] 1.3 Windows 本机验证：Web 面板从 `D:\code` 点面包屑/手输路径不再报 "Workspace is not available"
- [x] 1.4 `packages/gateway/src/workspaces.ts` win32 根请求（`/`、`\`）返回可用盘符列表（`A:\`–`Z:\` access 探测，`path: "/"`、`parent: null`），验证新增测试覆盖盘符枚举且 POSIX `/` 行为不变
- [x] 1.5 picker 根按钮恢复为始终导航 `/`（win32 落盘符层，label 显示"此电脑"），消除与盘符 crumb 的重复，验证 path-crumbs 测试更新后两平台通过

## 2. TUI Windows 路径小修

- [x] 2.1 `packages/tui/src/image-input.ts` 反斜杠转义分支加 win32 条件（Windows 下 `\` 不转义），验证新增测试覆盖 `D:\code\img.png` 完整识别且 POSIX 转义行为不变
- [x] 2.2 `packages/tui/src/tui.ts` 图片显示名与 `packages/tui/src/file-completion.ts` `.git` 过滤改 `[\\/]` 双分隔符，验证相关测试两平台通过

## 3. 端口文件强杀残留兜底

- [x] 3.1 TUI/Web 的 `stopGatewayProcess` 调用方（`packages/tui/src/gateway.ts`、`packages/web/src/gateway-spawn.ts` 的 close 路径）在终止自己 spawn 的网关后补删 `<数据目录>/<serverId>.port`（仅 win32），验证 Windows 本机 kill 网关后端口文件不残留、接入既有网关（spawned=false/null）时不删

## 4. 集成验证

- [x] 4.1 Windows 本机 `bun run build` 通过，gateway/tui/web/cli 网关级套件全绿
- [ ] 4.2 POSIX 回归随 CI（ubuntu/macos）确认无行为变化
