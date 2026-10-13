# Apply 验证记录

日期：2026-10-14。实现范围为内置 explore / plan / coder 的 Pi 原生前台委派。

## 自动化验证

- `bun run test`：334 pass，0 fail，86 个测试文件，2186 次断言。
- `bun run build`：通过；后续最终 Web 交互调整另外通过 `bun run --cwd packages/web build`。
- `bun run check`：通过。仅有原有 `theme-syntax.test.ts` 的 useTemplate 提示。
- `openspec validate add-builtin-subagents --strict --no-interactive`：通过。
- `git diff --check`：通过。
- Pi 依赖继续精确锁定 1.2.0，未改 lockfile、CI/CD 或添加 Windows CI。

新增测试覆盖：

- Pi 文件发现、忽略规则、中文/空格及模拟 Windows 路径；字面搜索、CRLF、二进制/大文件、读取失败、预算截断、取消和超时；实际 discover → search → native read 闭环。
- 角色工具限制、禁递归、未知角色拒绝、独立上下文、配置继承、空报告；三任务上限、coder 串行、排队/运行取消和兄弟继续。
- SQLite 在创建后、子工具执行中、报告返回前重开；保持同一子会话和输入，不重放不安全工具；恢复后仍保持三个活跃子任务上限。
- 归档级联取消、取消后的用量保留、任务/全局用量无重复、用户 fork 固定历史水位和只读权限。
- 禁止普通 attach 子会话、错误归属和失效 attachment 拒绝；55 轮工具历史分页、完整长文本分块传输、子图片读取与跨主子图片隔离。
- 两客户端共享一个原生观察器，最后一个详情关闭后释放；停止 RPC 只停止选中的子任务。
- TUI 复用完整消息组件、思考/工具展开、错误/图片占位、分页去重、关闭释放和重新打开。

## 两端验收

使用隔离临时工作区与 faux provider：并行 explore 读取 evidence.ts，主 agent 汇总，再由 coder 写入 delivery.txt 并返回图片。没有调用真实模型服务。

Web 浏览器已验证：375 / 768 / 1440 / 1920 宽度；工具与思考展开；图片加载/放大/Esc；无横向溢出；关闭回到入口焦点；草稿及附件保留；切换子任务保留展开；切换主会话保持主动关闭意图；窄屏 dialog 背景 inert。

验收过程中修正：主委派文档更新未及时通知前端、关闭详情未 release Chord handle、浏览器误引入 core Node 入口、图片弹窗 Esc 冒泡关闭侧栏。

TUI 使用真实 PTY 检查 80×24 dark、60×16 light：/agents、Enter、展开、Esc 返回、历史重新打开、主编辑器持续保留；80×24 下另验证委派卡鼠标入口。原有主题与附件编辑器测试继续通过。

截图、终端原始记录和可复跑模拟脚本保存在 gitignore 的 `artifacts/subagents/`：

- `web-final-375.png` / `web-final-768.png` / `web-final-1440.png` / `web-final-1920.png`
- `web-image.png`
- `tui-80x24-dark-*.ansi` / `tui-60x16-light-*.ansi`
- `browser-check.js` / `browser-state-check.js` / `pty-check.py` / `preview.ts`

## 验证边界

- 未使用真实模型 API；模型自主选择委派的质量需要实际使用反馈。
- Windows 路径通过 ExecutionEnv 模拟验证；未在 Windows 机器执行，也未增加 Windows CI。
- PTY 验证了图片占位和共享图片组件；实际 Kitty 图像协议仍沿用已有组件行为。
- 文件发现按用户确认的 Pi 原生语义提示：枚举可能跳过不可读项，已枚举文件的读取失败、截断和超时仍显式报告。

## TUI 验收反馈补充（2026-10-14）

- 子详情使用 Pi 原生鼠标事件滚动；补齐布局代理的鼠标转发及列表点击命中。PageUp/PageDown 按当前详情可视页高滚动；滚轮回看不被新输出拉回底部。
- 空编辑器右键打开列表，列表右键进入，左键直返主视图；非空草稿保持方向键编辑。状态栏保留可点击的子任务计数，全部完成仍显示。
- `bun run check`、TUI build、TUI 19 文件 77 测试（779 assertions）通过；原有 theme-syntax useTemplate 信息级提示未改动。
- 模拟 gateway + 实际 PTY 验证 80x24 深色、60x16 浅色：80 行报告滚轮上下、整页往返、左右导航、非空草稿方向键、状态栏点击及详情展开位置保留。80 列翻页首行 59→43→59，60 列 67→59→67。证据在 gitignored `artifacts/subagents/tui-*-{wheel-up,wheel-down,page-up,page-down,footer-click,return-draft}.ansi`，脚本 `pty-scroll.py` / `scroll-preview.ts`。
- 所有本轮模拟 gateway 和 PTY 已退出；未使用真实 API，也未重新运行未受影响的 core/gateway/Web 全套测试。

## TUI 英文文案与操作提示验收补充

- Agents 菜单、状态、停止确认、加载提示和命令说明统一英文；对话与工具内容保留原文。Picker、Skills、Agents、Login 共用快捷键格式（accent 键名、dim 动作、单字母大写、居中点分隔）。
- 状态栏缩短操作提示，面板打开时不重复底部操作；窄屏优先上下文占用、费用及 Agents 入口。
- 移除 H 和 Web 加载历史按钮；向上滚动自动补齐较早记录，保持内容位置。TUI 测试覆盖 H 不再处理、请求去重、已加载内容位置及无更多记录；两种主题验证提示样式。
- `bun run check`、完整 build、TUI 79 测试 / 795 assertions、Web 23 测试 / 87 assertions 通过。Web 测试初次受沙箱本地 socket EPERM 限制，在获准绑定本地端口后全部通过。
- Web 浏览器真实测试：55 轮工具记录，初始 50 条，向上滚动自动增至 55 条，滚动锚点保留（scrollTop 415），无加载历史按钮。截图 `artifacts/subagents/web-auto-history.png`，脚本 `browser-paging.js`。
- PTY 80x24 深色 / 60x16 浅色复验英文菜单、状态栏、滚轮与快捷导航；所有模拟 gateway、浏览器和 PTY 均已关闭。React 变更检查了按需分页、订阅生命周期与异步旧响应边界。

## 技能预览与帮助验收补充

- 恢复 `U Install user` / `P Install project`，详情快捷键提示随宽度换行。技能预览支持原生鼠标滚动及 PageUp/PageDown；所有面板详情复用原生翻页转发，避免滚动隐藏的主转录。
- 新增 `/help` 及命令补全，集中展示宿主操作、角色菜单、技能/凭据操作、当前 Pi 编辑/主转录键位和命令列表，Esc 直接返回。状态栏显示 `/help Keys`。
- TUI 20 文件 82 测试 / 845 assertions 通过；最终面板标题小修后重跑 help/picker 10 测试通过。`bun run check`、TUI build、OpenSpec 严格校验通过。
- PTY 80x24 深色及 60x16 浅色验证 `/help` 打开、滚轮、整页滚动、Esc 直接返回；证据为 gitignored `artifacts/subagents/tui-*-help*.ansi` 与 `pty-help.py`。技能预览组件测试验证长正文滚动/翻页和 40/60/80 列安装提示完整可见。模拟 gateway、PTY 已自动退出。

归档校验：七份 delta 已同步并逐项核对；主规格普通校验 16/16 通过。本变更严格校验通过；全量主规格严格校验存在既有 web-ui Purpose 少于 50 字符警告，原 Purpose 保持未改。
