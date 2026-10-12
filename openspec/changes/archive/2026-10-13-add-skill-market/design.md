# Design

## Context

市场服务端（`~/Github/skill-market`，FastAPI + SQLite）只读接口已实测：`GET /api/skills?q=`（全量返回，无分页；`category` 顶层字段 + `metadata.source` 对象）、`GET /api/skills/{name}`、`GET /api/skills/{name}/download`（zip，顶层 `<name>/` 目录，实测均 <200KB）。**无 CORS 头**——浏览器无法跨域直连，且技能安装要写宿主文件系统，二者都要求网关做服务端代理。网关已有服务器级 Chord 服务先例（`neko.workspaces`/`neko.credentials`，`server-services.ts`）；TUI 有统一选择面板 `PickerPanel`（单层 list→pick）；Web 有 `/` 与 `/settings` 两个 tanstack router 页面及严格主题 token 体系（styles.css 头部注释）。本变更依赖 add-builtin-skills 引入的"内置级"与 `level` 标记。

## Goals / Non-Goals

**Goals:**

- 单一网关服务 `neko.skill-market` 同时喂饱 Web 与 TUI，两端行为一致由契约保证。
- 安装路径安全（摘要校验、zip-slip 防护、原子落盘）与覆盖保护（服务端强制，确认只是 UX）。
- Web/TUI 市场体验对等：浏览、详情、预览、两级安装、卸载。

**Non-Goals:**

- 不做上传、不做评分评论、不做自动更新检查（服务端无版本历史接口，仅 latest）。
- 不做技能启停/禁用管理；不动 `/skill:` 展开机制。
- 市场服务端改造不在本变更内（客户端容忍 `category`/`metadata` 缺失，缺失时归入"未分类"/"未知来源"）。

## Decisions

### D1: 服务器级 `neko.skill-market` 服务，workspaceRoot 显式传参

对照 `NekoWorkspaceFiles`（方法带 `workspaceRoot`）而非会话级服务：市场目录是全局的，只有"项目级安装状态/安装目标"依赖工作区。方法集：

```
list({ query?, workspaceRoot? })   → 远程目录 ⨯ 本地三级安装状态合并
detail({ name })                   → 单项元数据（来自 list 缓存）
preview({ name })                  → { body, files[] }（内存解 zip，不写盘）
install({ name, scope, workspaceRoot?, overwrite? })  → 写入 + 结果含 shadowed 提示
uninstall({ name, scope, workspaceRoot? })
```

备选：会话级服务——市场的浏览/安装与会话无关，强绑会话反而让"无会话时逛市场"变复杂，否决。备选：Web 另开 HTTP 端点——两套传输语义漂移，否决；统一走 WS 契约。

### D2: fflate 解 zip，内存操作

`unzipSync(new Uint8Array(buf))` 返回路径→字节映射，天然适配"内存解开预览"与"安全解压"（自己遍历条目、拒绝绝对路径与 `..` 逃逸、按 manifest 白名单写盘），比 spawn 系统 unzip 跨平台安全（Windows 无 unzip；仓库刚修过 Windows 兼容 e62f8d4），也无原生码。依赖挂在 gateway（core 保持零新增依赖；config 的 `skills.marketUrl` 只是字符串字段）。

### D3: 两级缓存

- 目录缓存：list 结果按 (marketUrl) 缓存 60s，detail 从中取；前端每次打开市场页主动调用即自然刷新，不做后台轮询。
- 包字节缓存：preview/install 下载的 zip 按 `sha256` 存内存 LRU（上限如 16 项）；preview 后安装同一版本零重复下载。进程重启即失效，无持久缓存一致性负担。

### D4: 安装的事务语义与临时目录卫生

下载 → 校验 sha256（对照目录缓存值，缓存缺失时先刷新）→ 内存解 zip 并校验条目 → 定位唯一 SKILL.md（复刻服务端 `find_single_skill` 语义：全包递归找，多于一个即拒绝）→ 写入临时目录 → `rename` 到 `<skillsDir>/<name>/`（覆盖时先 `rm` 旧目录）。同文件系统 rename 保证目标目录要么旧要么新，不留半成品。目标已存在且未声明 `overwrite` → 抛 `RemoteServiceError("skill_exists")`；内置级 scope 非法（builtin 不可写，scope 枚举只有 `user`/`project`，卸载同理拒绝内置）。

临时目录三条纪律（成功路径由 rename"消费"临时目录，这三条覆盖失败与崩溃路径）：

1. **临时目录必须避开技能扫描范围**：放在 `<skillsDir>` 的兄弟位置（如用户级用 `~/.agents/.tmp-<rand>/`、项目级用 `<workspace>/.agents/.tmp-<rand>/`），不放 `<skillsDir>` 内——`scanSkillsDir` 会扫描第一层子目录，残留在内的半成品会被当作技能发现出来。兄弟位置同文件系统，rename 语义不变。
2. **finally 兜底清理**：临时目录创建后，任何后续步骤失败都尽力 `rm -rf` 该目录；清理失败只记诊断，不掩盖原始错误。
3. **惰性清扫**：每次 install 开始前，删除同一父目录下遗留的陈旧 `.tmp-*`（崩溃窗口的兜底）。

### D5: core 增加 `listSkillsByLevel()`

市场合并状态需要分级视图（哪级有、谁生效），而既有 `listSkills` 是合并视图。新增方法返回三级各自的技能（含 level、location），合并视图逻辑已在 `mergeSkills` 中，前端/网关自行推导 activeLevel。旧方法不动，skill-invocation 的查询 requirement 不受影响。

### D6: Web 市场页（`/skills` 路由）

- 入口：topbar 新增 store 图标按钮（Icon 组件扩 `store`/`download`/`trash`/`eye` 四个 path，描边风格一致）。
- 布局：页头（标题 + 分组切换 segmented control「按分类/按来源」+ 搜索框）→ 分组节（组头 = 分类名 + 数量，卡片网格 `grid` 自适应列数）。卡片沿用 settings 页卡片语言：`rounded-2xl border border-sakura-200 bg-surface shadow-soft`；来源徽章 tianyi 浅底，安装状态 sakura 点 + `text-xs` 文字，内置徽章 ink 浅底。
- 详情：桌面右抽屉（`shadow-lift`），移动端（`--breakpoint-mobile`）全屏 overlay；Tab「说明 | 预览」，预览用既有 `markdown.tsx` 渲染 SKILL.md 正文，文件清单为等宽列表。
- 确认流：`createPortal` modal（primitives 已有先例），覆盖/卸载确认与遮蔽提示统一一套对话框组件。
- 状态管理：页面局部 state + 调网关服务，不进全局 store（市场与会话正交）。

### D7: TUI `/skills` 面板（PickerPanel 扩展两级视图）

PickerPanel 现状是单层 `show(title, load, pick)`。扩展方式：pick 回调内把面板内容切换为详情视图（同面板内状态机：list → detail → preview，Esc 逐层回退），不新开组件类。分组用不可选中标题行（PickerItem 加 `header: true` 形态，渲染为分组名，搜索过滤时随空组隐藏）。详情视图键位：`u`/`p` 安装、`d` 卸载、`v` 预览（strip frontmatter 纯文本滚动）、Esc 返回。确认流内联：面板底部切换为 `Overwrite user-level think? [y/n]` 一行。命令注册进 `labels.ts`，dispatch 加 `trimmed === "/skills"` 分支（对照 `/model` 先例）。

备选：新开独立组件类——重复实现焦点/渲染/异步代际管理，PickerPanel 的状态机已覆盖 loading/error/applying，扩展成本更低。

### D8: 生效时机不做主动通知

安装/卸载后，技能补全（`chat.skills()`）直读磁盘即时可见；系统提示词快照在下一次新输入进入上下文时重建（既有 prompt-context 语义）。前端操作成功后显示"下次发送消息时生效"的静态提示即可，不推快照刷新——避免破坏 run 内一致性保证。

## Risks / Trade-offs

- [市场是单点且客户端无签名校验，sha256 只防传输损坏不防服务端被篡改] → 文档化信任模型（私有市场，HTTPS 传输）；服务端签名留作后续演进。
- [目录缓存 60s 内市场新版本不可见] → 详情/安装以缓存内 sha256 为准，保证"看到的即装到的"；接受短暂滞后。
- [覆盖安装删除旧目录不可逆，本地改动丢失] → spec 强制确认流；对话框文案明确"本地改动将丢失"。
- [zip 全量读内存，恶意大包可撑内存] → 下载前按 `size_bytes` 拒绝超限包（阈值如 32MB）；市场当前包均 <200KB。
- [fflate 是首个非上游运行时依赖] → 精确锁版本（仓库纪律）；如未来 Bun 原生 unzip 成熟可替换，接口已隔离在网关内部。

## Migration Plan

纯新增。配置缺省即指向官方市场；已有技能目录不受影响。回滚 = 移除路由入口与服务注册。

## Open Questions

- TUI 详情视图在窄终端（<80 列）的折叠排版，实现期按 pi-tui 实测调整，不影响契约与 spec。
