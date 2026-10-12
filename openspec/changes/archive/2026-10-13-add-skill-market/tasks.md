# Tasks

## 1. core：分级视图与配置

- [x] 1.1 `runtime.ts` 新增 `listSkillsByLevel()`：返回三级各自技能（name/description/location/level），不动 `listSkills`。验证：单测覆盖三级分离与内置级标记（依赖 add-builtin-skills 已合入）
- [x] 1.2 `config.ts` 增加 `skills.marketUrl`（默认 `https://skill.kirineko.tech`），非法值在加载时按既有配置校验语义处理。验证：config 单测通过

## 2. gateway：neko.skill-market 服务

- [x] 2.1 gateway 新增 `fflate` 精确版本依赖（`bun add --filter` 后确认 bun.lock 变更最小）。验证：`bun install --frozen-lockfile` 通过
- [x] 2.2 市场 HTTP 客户端：list/detail/download，60s 目录缓存、按 sha256 的包字节 LRU（16 项）、按 `size_bytes` 拒绝超限包（32MB）、网络失败映射为可辨识远程错误。验证：单测用本地 mock HTTP 服务覆盖缓存命中与失败映射
- [x] 2.3 安全解压与安装：内存解 zip、拒绝路径逃逸条目、唯一 SKILL.md 定位、临时目录（位于 `<skillsDir>` 兄弟位置，避开技能扫描）写入 + rename 落盘、sha256 校验、skill_exists 覆盖保护、遮蔽提示（shadowed）；失败路径 finally 清理临时目录，install 前惰性清扫遗留 `.tmp-*`。验证：单测覆盖 zip-slip 样本、摘要不匹配不留半成品、覆盖两阶段、写盘失败/模拟崩溃后无 `.tmp-*` 残留且残留目录不会被技能扫描发现
- [x] 2.4 卸载与内置写保护：删目录、未安装错误、builtin scope 拒绝。验证：单测覆盖三条路径
- [x] 2.5 契约与注册：`contract.ts` 定义 `NekoSkillMarket` 服务（list/detail/preview/install/uninstall），`server-services.ts` 注册。验证：类型检查通过；gateway 启动后 TUI/Web 可调通 list

## 3. Web 市场页

- [x] 3.1 路由与入口：新增 `/skills` 路由，topbar 加 store 图标按钮；Icon 组件扩 store/download/trash/eye。验证：点击入口导航到市场页并返回
- [x] 3.2 列表页：分组切换（按分类/按来源）、搜索、卡片网格（名称/简述/来源徽章/版本/大小/三级状态标记）、加载/错误/空态。验证：1440/1024/375 三档视口无横向滚动；仅使用主题 token（对照 styles.css 注释自查）
- [x] 3.3 详情抽屉：桌面抽屉/移动全屏，元数据表 + 说明/预览 Tab（markdown.tsx 渲染 + 文件清单）。验证：预览不触发写盘（服务端目录无变化）
- [x] 3.4 安装/卸载交互：两级安装按钮、覆盖确认 modal、遮蔽提示、卸载确认、内置技能隐藏操作、加载态与结果反馈。验证：手工走通 spec 五个 scenario

## 4. TUI /skills

- [x] 4.1 PickerPanel 扩展：不可选中组头行、list→detail→preview 面板内状态机、Esc 逐层回退。验证：组头行跳过选中、空组隐藏
- [x] 4.2 `/skills` 命令：labels.ts 注册、dispatch 分支、分组列表（右栏来源/版本/状态标记）、加载/失败/空反馈。验证：`/skills` 打开面板可搜索
- [x] 4.3 详情与操作：详情视图、u/p/d/v 键位、内联 y/n 确认、内置技能无操作键位。验证：手工走通 spec 各 scenario（含预览滚动）

## 5. 端到端验证

- [x] 5.1 真实市场冒烟：Web 与 TUI 各完成一次 用户级安装→覆盖确认→卸载 全流程，安装后 `/skill:` 补全立即可见、下次发送生效。验证：实际操作录屏或日志
- [x] 5.2 `bun run build && bun run test && bun run check` 全绿。验证：命令通过

## 6. 验收优化（手动验收反馈）

- [x] 6.1 Web：顶栏移除市场图标入口；设置页改为双菜单（密钥 / 技能市场），市场菜单项导航到 `/skills`，市场页可返回设置。验证：设置页两菜单可见可点，顶栏无突兀图标
- [x] 6.2 TUI 预览改用 Markdown 渲染（pi-tui Markdown，复用主题），保持滚动与 Esc 回退。验证：预览中标题/列表有样式
- [x] 6.3 TUI 市场详情/预览/确认的操作提示以配色区分键位与说明（键位 accent、说明 dim），面板详情行状态着色。验证：渲染输出含键位配色的 ANSI 序列
- [x] 6.4 Web 设置区统一外壳：设置与市场页共用侧栏菜单外壳（返回聊天 + 密钥/技能市场侧栏项，可切换，未来可扩展），移动端菜单转为顶部横排。验证：两页风格一致、侧栏切换顺畅、375px 无横滚
