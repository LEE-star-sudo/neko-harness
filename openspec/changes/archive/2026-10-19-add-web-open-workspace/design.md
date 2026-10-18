# Design

## Context

- 浏览器无法拉起本机应用，必须由服务端执行。Web 进程已有同类先例：`open-browser.ts`（`execFile`、不经 shell、按平台选命令）和 `mobile-admin.ts`（`/api/mobile/*` 同源代理，检查顺序为回环 peer → Host → Origin/Sec-Fetch-Site → CSRF/JSON/体上限，令牌由 `GET /api/mobile/session` 发放）。
- gateway 同时服务手机端，其协议版本已是 6；工作区浏览遵循「客户端只传相对路径」。打开本机应用是宿主机副作用，不属于会话协议。
- 客户端已有当前工作区（`store.workspaceRoot`）与会话视图（`view.cwd`）；顶栏工作区入口目前是文字药丸（`top-bar.tsx`），`Icon` 只有单色描边 path，没有品牌图标。

## Goals / Non-Goals

**Goals:**
- 用最小面积把「打开工作区」放进 Web 服务端，复用既有守卫，不改应用协议。
- 平台差异（macOS、Windows、Linux、WSL）封装在一个可单测的纯函数里，命令构造与真实拉起分离。

**Non-Goals:**
- 不做快捷键，不做文件级定位或「在文件管理器中显示文件」，不做其他编辑器（Cursor、JetBrains 等）。
- 不改 TUI、移动端、gateway、core。
- 不引入新依赖。

## Decisions

**D1 执行位置：Web 服务 `POST /api/open`，不走 gateway。** gateway 还面向手机配对设备，让它拉起宿主 GUI 会扩大攻击面并要提升协议版本。备选的 gateway RPC 被否决。

**D2 守卫抽取共用。** 把 `mobile-admin.ts` 里的回环、Host、Origin、Sec-Fetch-Site、CSRF、体上限检查抽成共用模块（`local-guard.ts`），两处复用；`createMobileAdminContext` 已产出 `csrf` 与 `allowedHosts`，共享同一份。新增 `GET /api/local/session` 返回 `{ csrf, targets }`；非回环对端返回 403，前端据此隐藏入口。抽取不得改变 `/api/mobile/*` 的现有行为，现有 `mobile-admin.test.ts` 必须保持通过。备选「复制一份守卫」会让两处安全逻辑漂移，被否决。

**D3 目标与探测。** 请求体 `{ target: "vscode" | "file-manager", path }`。探测与命令构造集中在 `open-target.ts`：

| 平台 | VS Code | 文件管理器 |
|---|---|---|
| macOS | PATH 中有 `code` 则 `code <dir>`；否则 `/Applications` 或 `~/Applications` 下存在 `Visual Studio Code.app` 则 `open -a "Visual Studio Code" <dir>` | `open <dir>`，名称 Finder |
| Windows | 在 PATH 中找到 `code.cmd`，由其位置推出 `..\Code.exe` 直接 `execFile`（Node 不经 shell 无法直接执行 `.cmd`）；找不到则不可用 | `explorer.exe <dir>`，名称资源管理器 |
| Linux | PATH 中有 `code` 则 `code <dir>` | `xdg-open <dir>`，名称文件管理器 |
| WSL | PATH 中有 `code`（Windows 互操作提供）则 `code <dir>` | `explorer.exe .`，以工作区目录为 cwd，名称资源管理器 |

WSL 判定为 `process.platform === "linux"` 且（`WSL_DISTRO_NAME` 存在或 `/proc/version` 含 `microsoft`）。所有拉起均 `execFile`、带超时、`windowsHide`，路径只作参数传递。`explorer.exe` 成功时常返回非 0 退出码，因此以「进程成功启动」而非退出码判定成功；探测结果缓存到进程生命周期，但每次请求拉起前再校验目标仍可用。

**D4 路径信任。** 客户端传当前工作区绝对路径；服务端校验为绝对路径、无控制字符、`realpath` 后是已存在目录，不再要求注册进 gateway 的工作区列表。理由：请求已经过回环、Host、Origin、CSRF 守卫，且只是「打开一个目录」，不读写内容；要求查 gateway 工作区注册表需要为每次请求新建 gateway 连接，成本高而收益小。风险见下。

**D5 前端结构。** 新增 `open-workspace-menu.tsx`（分体按钮，复用 `Popover`，样式参照 `export-menu.tsx`）与 `lib/open-workspace.ts`（取令牌、调用、localStorage 记忆）。`TopBar` 在工作区入口前渲染它。`Icon` 新增 `panel-right`（右侧栏）和 `code` 等描边图标；VS Code 与 Finder、资源管理器使用独立的内联彩色 SVG 组件，不污染单色 `Icon`。工作区入口保留 `data-workspace-entry`，因为 `WorkspacePanel` 关闭后靠它还原焦点。

**D6 窄屏。** 沿用现有移动断点（`MOBILE_QUERY`）：窄屏只显示图标，不显示分体箭头，选择目标改在菜单项内完成；375 像素下与连接状态、会话标题、导出入口不重叠，由样式测试和手动检查覆盖。

**D7 记忆。** localStorage 键 `neko.openTarget`，值为目标；读取到不可用或无效值时回退到第一个可用目标，缺省 `vscode`。

## Risks / Trade-offs

- [服务端不校验工作区注册表，守卫被绕过时可打开任意本机目录] → 回环 + Host + Origin + CSRF 全部通过才执行；只打开目录，不执行其中内容；VS Code 自带工作区信任提示。
- [Windows 上 `code.cmd` 定位到 `Code.exe` 的假设在自定义安装下不成立] → 找不到即标为不可用并说明原因，文件管理器仍可用，不退回到 shell。
- [WSL 下 `explorer.exe .` 与 `code` 的互操作行为随发行版和配置而异] → 用户已确认本机能调起，命令构造有单测，真实拉起标为手动验证。
- [浏览器经 SSH 端口转发访问时对端看起来也是回环] → 无法在服务端识别，接受为已知限制，文档说明入口只在本机使用时有意义。
- [守卫抽取可能改变 mobile-admin 行为] → 抽取只做搬移，现有测试全部保留并通过。

## Open Questions

- 角标在改动数超过两位数时的具体显示形式（`99+` 还是 `9+`）可在实现时按视觉决定，不影响规格。
