# Verification

## 自动检查

- 全量 `bun run test`：355 passed，0 failed，89 files，2340 assertions。
- 最后补充多请求选择与忙碌行布局修正后，`bun test --conditions=neko-source --isolate packages/tui/test`：85 passed，0 failed，874 assertions。
- `bun run build` 通过；最后 TUI 调整另跑 TUI build 通过。
- `bun run check` / `check:write` 类型与格式校验通过；仅既有 theme-syntax.test.ts 的 useTemplate 信息提示。Vite 保留既有大 chunk 提示。
- `openspec validate add-explore-bash-approval --strict --no-interactive` 通过。
- `git diff --check` 通过。

## 行为验证

- Core faux provider：允许前无文件效果，允许后一次执行；拒绝及取消无效果，迟到允许不能复活任务；不同参数/cwd 不能复用批准。
- Nested Bash 同样经过审批；相同命令的新调用产生新请求。plan/coder 与主 agent 保持原边界，已有子会话恢复按角色配置。
- SQLite 重开：等待中的请求沿用 id/version；决定已保存但 Hook 尚未返回可恢复；意图已提交或执行效果已发生后不自动重跑，返回 interrupted。
- Gateway：双客户端不开详情也显示待审批摘要；长命令完整分块读取；竞争决定只结算一次，越界版本及分叉历史决定被拒绝。
- TUI：80x24 dark、60x16 light 真实 PTY，长命令审阅、方向键/滚轮/翻页、左右与 Esc 导航、允许/拒绝提示可见；组件测试覆盖鼠标命中、无隐式 Enter 授权、多请求选择、控制字符可见化及订阅释放。
- Web：375/768/1440/1920 宽度、light/dark 系统配色下浏览器验证，41 行命令完整，稳定布局 document.scrollWidth 等于 viewport width。Web 沿用现有配色响应，不新增主题。
- 联合验收：Web 批准第一条命令，关闭侧栏后下一条审批不强制打开；主草稿 `keep this draft` 保留。TUI 拒绝第二条；Web 最终同步已允许/已拒绝、无 pending，显示子报告和主报告。
- 审批到来不强制抢焦点；现有子详情打开/关闭沿既有焦点恢复规则。完整命令使用只读可聚焦文本区域，可键盘滚动查看。

## 最小人工验收

### Web 会话切换回归

- 复现：子面板保持打开，切换会话再切回，渲染阶段抛出“会话未就绪”，进入 Something went wrong。网关 phase 已 ready，但会话 attachment 操作尚未结束。
- 修复：子面板等待 operating 结束且主会话快照存在后恢复子会话订阅；保留每个会话的面板开关状态。
- 浏览器验证：待审批状态连续往返 5 次，已完成状态往返 3 次，内容恢复且无控制台错误；主动关闭后往返仍保持关闭。Web 23 项测试、Web build、bun run check 均通过。

1. 启动 `bun run neko tui` 或 `bun run neko web`，要求主 agent：使用 explore 子 agent 执行 `git status --short` 调查当前工作区。
2. 主视图出现待审批提示。TUI 在输入区上方自动出现选项，上下选择 Allow once / Deny，Enter 确认；Web 在输入框附近点“允许本次”（窄屏子视图位于底部）。确认随后出现命令输出并交付报告。
3. 再请求一条 explore Bash，在输入区附近拒绝，确认不执行且子 agent 能报告限制。需要跨端验证时同时连接 Web/TUI，在一端决定，另一端应同步。
4. 等待审批时重启 gateway，重连后仍可处理原请求；停止子任务后旧请求不可批准。关闭详情本身不拒绝或允许。

## 范围

未使用真实模型 API key；实际运行环境为 macOS。未新增 Windows CI，未对 Windows shell 执行作真实环境验收。不提供沙箱或严格只读保证；获批命令可能修改文件或访问网络。


## 输入区审批交互调整验收（2026-10-14）

此节替代前述旧版独立审批详情/持久审批卡的交互描述。审批区只展示 pending，结算后移除；对应工具调用旁保留 Allowed once/Denied/Cancelled 或中文结果，不把允许表示为命令成功。

- Gateway 复用有界子 reader 聚合当前会话请求；单测覆盖多子任务、分叉隔离、结算与会话切换释放。
- Web 在 375/768/1440/1920 宽度验证主输入区审批，375 窄屏子视图底部审批，完整长命令可滚动；关闭子面板仍可审批，页面无错误。已完成子面板跨会话往返 3 次正常。
- TUI 真实 PTY：80x24 dark 主视图 Ctrl+Y 审阅；60x16 light 子视图 Ctrl+Y、D 拒绝；翻页/滚轮可查看，操作提示可达。组件测试覆盖主/子布局、普通输入和 Enter 不批准、新请求不继承审批焦点、监听释放。
- 双端：Web 允许第一条后卡片移除，TUI 拒绝第二条后 Web 同步移除审批区，两条对应命令分别标注结果，输入草稿保留。
- `bun run test`：358 pass / 0 fail（91 files）；最后补充的新请求焦点测试单独通过。`bun run check:write`、`bun run build` 通过；仅已有 theme-syntax 提示与 Vite chunk 提示。
- 新手验收：申请 explore Bash → 不打开子任务即可看到审批 → TUI 上下选择后 Enter，或 Web 允许本次/拒绝 → 卡片消失 → 在对应命令旁查看结果。


### TUI 选项交互更新

替代上一节 Ctrl+Y 和 A/D 操作：审批出现后自动接收选项输入，使用 Pi 原生 SelectList。上下选择、Enter 确认；PgUp/PgDn 或滚轮查看命令，[/] 切换请求。结果返回后恢复原视图/草稿；新请求重置选项，尚未渲染的请求不能被连带确认。

TUI 回归 86 pass / 0 fail，check 通过。组件测试覆盖主/子布局、自动选择、拒绝/允许、未渲染确认保护和监听释放。

真实 PTY 80x24 dark 与 60x16 light 均确认自动出现 Allow once / Deny，不按进入快捷键即可操作；60x16 使用下箭头和 Enter 拒绝。TUI build 与严格 spec 校验通过。
