# Proposal

## Why

技能市场服务端（skill.kirineko.tech）已上线并提供只读公开接口（list/detail/download，无需密钥），但 neko 用户获取市场技能只能靠手工下载解压到技能目录。本变更在 Web 与 TUI 两端提供市场浏览、详情预览、分级安装与本地卸载的完整闭环，让用户不离开客户端即可管理技能。

## What Changes

- 新增服务器级网关服务 `neko.skill-market`：远程列表/详情（60s 内存缓存）、SKILL.md 正文预览（下载 zip 内存解开，按 sha256 缓存）、安装（sha256 校验 + 安全解压 + 单 SKILL.md 定位，写入用户级或项目级技能目录）、本地卸载（删目录）。安装目标已存在时返回 `skill_exists` 错误，由前端确认后带 `overwrite` 重试；内置级技能拒绝卸载/覆盖写。
- 市场地址可配置：`neko.config.json` 增加 `skills.marketUrl`，默认 `https://skill.kirineko.tech`。
- 新增 fflate 依赖（纯 JS zip 解析，Windows 安全，无原生码）。
- core 新增分级技能视图 `listSkillsByLevel()`（每级技能分别列出并带级别标记），供市场 UI 合并安装状态；既有 `listSkills` 不变。
- Web 新增 `/skills` 市场页：分类/来源分组切换（直读服务端 `category` 与 `metadata.source`）、搜索、技能卡片（含两级安装状态与内置标记）、详情抽屉（元数据 + 说明/预览 Tab）、安装到用户级/项目级、覆盖确认、卸载确认。样式严格沿用全站 sakura/tianyi design tokens。
- TUI 新增 `/skills` 命令：分组列表面板（搜索、组头行、来源/版本/已装标记右栏）、详情视图、预览视图，键位 `u`/`p` 安装到用户级/项目级、`d` 卸载、`v` 预览，覆盖与卸载均内联确认。
- 安装/卸载后的生效时机沿用既有快照语义：下一次新用户输入进入上下文时资源快照重建，技能补全查询实时可见，无需重启。

## Capabilities

### New Capabilities

- `skill-market`: 技能市场的浏览、预览、安装与卸载行为——网关侧市场代理服务（缓存、sha256 校验、安全解压、覆盖保护、内置级写保护）、两级安装语义与市场地址配置。

### Modified Capabilities

- `web-ui`: 新增市场页 requirement（路由入口、分组展示、详情与预览、安装/卸载交互与确认流、主题一致性）。
- `terminal-ui`: 新增 `/skills` 市场命令 requirement（面板交互、详情/预览视图、安装/卸载键位与确认流）。

## Impact

- **依赖**：本变更依赖 add-builtin-skills（"内置级"概念与 `NekoSkillInfo.level`）；gateway 新增 `fflate` 依赖。
- **代码**：`packages/core`（`listSkillsByLevel`、config 增加 `skills.marketUrl`）、`packages/gateway`（`neko.skill-market` 服务实现与契约）、`packages/web`（新页面、路由、topbar 入口、Icon 新增）、`packages/tui`（命令注册、面板组件扩展）。
- **外部接口**：只读消费 `GET /api/skills`、`GET /api/skills/{name}`、`GET /api/skills/{name}/download`；不使用上传接口，不携带密钥。
- **安全**：解压复刻服务端 zip-slip 防护；sha256 对照列表值校验；写盘仅限两个技能目录。
- **兼容性**：全部为新增 API 与页面，无破坏变更。
