# Proposal

## Why

Web 的右侧工作区栏只能只读浏览，用户想用 VS Code 继续编辑或在文件管理器里定位工作区时，只能手动复制路径再切换应用。同时顶栏的「工作区 N」文字药丸占位大、辨识度低，与其他图标化的顶栏控件风格不一致。

## What Changes

- Web 顶栏新增「打开工作区」分体按钮：主按钮用上次选择的方式（缺省 VS Code）打开当前会话的工作区根目录，下拉可选「VS Code」或「文件管理器」。文件管理器标签随平台显示为 Finder、资源管理器或文件管理器，WSL 按 Windows 处理（显示资源管理器，经 Windows 互操作拉起）。
- Web 服务新增 `POST /api/open`：由服务端用 `execFile`（不经 shell）在本机拉起 VS Code 或文件管理器；沿用 `/api/mobile/*` 的回环 peer、Host、Origin/Sec-Fetch-Site 与 CSRF 校验，目标路径必须是已存在的绝对目录。`/api/info` 新增平台与可用打开方式探测结果，客户端据此显示、置灰或隐藏。
- 顶栏「工作区 N」文字药丸改为右侧栏图标按钮，改动文件数以角标显示；可访问名称、`aria-expanded`、焦点回归行为保持不变。
- 窄屏下打开方式收进顶栏已有的菜单位置，不与连接状态、会话标题重叠。
- 不做快捷键；不做文件级「在 VS Code 中定位到行」或「在 Finder 中显示文件」（留待后续）。

## Capabilities

### New Capabilities
- `workspace-open-external`: 用本机 VS Code 或文件管理器打开会话工作区的能力，包括 Web 服务端接口、平台探测、安全校验、记忆上次选择与失败反馈。

### Modified Capabilities
- `web-ui`: 顶栏的工作区入口由文字药丸改为带角标的右侧栏图标按钮，并新增「打开工作区」分体按钮的呈现、窄屏与可访问性要求。

## Impact

- `packages/web/src/server.ts`：新增 `/api/open` 路由与 `/api/info` 字段；新增服务端模块（打开目标探测与拉起，参照 `open-browser.ts`、`mobile-admin.ts` 的守卫写法）。
- `packages/web/src/client`：`top-bar.tsx`、`primitives.tsx`（新增图标，含 VS Code 彩色 logo）、新增打开菜单组件与 `lib` 封装、`bootstrap.ts` 读取新增的 info 字段、`styles.css`。
- 测试：`packages/web/test` 新增服务端守卫/拉起命令测试与顶栏组件测试，更新现有顶栏相关用例。
- 不改动 gateway、core 与应用协议（链路协议版本不变），不改动 TUI 与移动端。
