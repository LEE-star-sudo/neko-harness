# Design

## Context

Windows 支持已归档（`archive/2026-10-11-windows-support`）。实测发现的小坑根因均已定位（见 proposal）；本设计只记录各修复点的取舍。

## Goals / Non-Goals

**Goals:** 修掉 Windows 下高频可踩的四个小坑；POSIX 执行路径零语义变化。

**Non-Goals:** 不处理存储跨平台迁移、静态服务大小写、core 既有测试的 Windows 适配。

## Decisions

### D1: 面包屑 bug 双侧修复

- client（`workspace-picker.tsx`）：检测 `^[A-Za-z]:[\\/]` 形态后按 `[\\/]` 切分 crumb，拼回时不强加 `/` 前缀（Windows 落盘根 `D:\`，POSIX 行为不变）。
- gateway（`workspaces.ts` browse 入口）：`path.replace(/^\/+([A-Za-z]:[\\/])/, "$1")` 归一化——一行兜底手输与旧客户端，正则只命中"斜杠+盘符"形态，POSIX 路径不可能匹配（POSIX 绝对路径 `/` 后不是盘符）。

只做单侧都不够：只修 client 挡不住手输/旧客户端；只修 gateway 则面包屑仍然显示畸形的单 crumb。

### D2: TUI 反斜杠转义按平台分叉

`image-input.ts` 的 `\` 转义分支加 `win32` 条件（Windows 路径分隔符即 `\`，不存在 POSIX 的转义需求）。`tui.ts` 图片显示名与 `file-completion.ts` 的 `.git` 过滤改 `[\\/]`——纯加宽匹配，POSIX 行为不变。

### D3: 端口文件残留由拉起方补删

Windows 上 `child.kill("SIGTERM")` 是 TerminateProcess，网关 `close()`（含端口文件删除）不会执行。在 `stopGatewayProcess` 的调用方（TUI/Web 的 close 路径）终止后补删 `<数据目录>/<serverId>.port`：调用方本来就知道数据目录与 serverId。不在 `stopGatewayProcess` 里做（它不知道端口文件位置语义）。最终兜底仍是探活失败视为无活跃网关。

### D4: Windows 盘符枚举作为虚拟根层

browse 在 win32 收到根路径（`/` 或 `\`）时返回盘符列表页：`A:\`–`Z:\` 逐个 `access` 探测，可用的产出 `{ name: "C:", path: "C:\\" }` 条目，`path: "/"`、`parent: null`。POSIX 的 `/` 行为不变。

面板侧根按钮恢复为始终导航 `/`：POSIX 是文件系统根，win32 是盘符层；盘符 crumb（`D:`）保留为"回到盘根"的入口——原来的"根按钮 = 盘符 crumb"重复随之消失。根按钮 label 在盘符路径下显示"此电脑"，POSIX 仍是 `/`。

替代方案：`wmic`/`Get-PSDrive` 枚举——引入子进程依赖，26 次 `access` 探测足够快且无依赖。

## Risks / Trade-offs

- [归一化正则误伤] → 仅匹配 `/` 开头紧跟 `X:` 的形态，POSIX 合法路径不可能命中；有测试覆盖。
- [补删端口文件误删活跃网关的文件] → 补删发生在"本进程终止了自己 spawn 的子进程"之后，该子进程正是文件属主；接入既有网关（spawned=false）时不删。
