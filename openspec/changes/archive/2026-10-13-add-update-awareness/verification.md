# 验证记录（2026-10-13）

## 自动化

- macOS arm64，Bun 1.4.2。全量 `bun run test`：304 pass、0 fail，79 文件；后续针对最终业务绑定保护的 gateway/Web/CLI 升级集成测试通过。
- `bun run check`、`bun run build:release`、`bun run test:package`、OpenSpec strict 与 `git diff --check` 最终全部通过。保留已有 Biome useTemplate 信息与 Vite chunk 大小警告。
- core 更新测试覆盖版本优先级、unknown/development、不降级、缓存/损坏缓存、并发合并、错误响应、超限、请求和响应体停滞、关闭后无检查。
- CLI 使用临时 Bun 全局安装布局、假 registry/安装器；覆盖相同安装确认、自定义 bin、链接/不支持安装拒绝、互斥/失效占用、已最新不安装、权限/安装失败、假成功和新进程验证。集成测试把实际安装文件更新连接到活跃 gateway/Web 状态，依次验证 install → restart-service → refresh-page → none。
- Unix/WS 测试验证服务器级版本信息无需 attach、安装变化双端一致、相同状态不反复广播，以及不兼容网关不触发竞争 spawn。Web 测试验证旧服务/新磁盘版本与 no-store、换 WS 地址重新发现、不兼容停止重试和 HTTP 的可解释兼容状态。
- 发布包冒烟实际验证 CLI/gateway/Web 服务/页面版本一致，`neko update --help` 可用，项目局部安装执行 update 非零拒绝。没有修改开发者真实全局安装，也未执行真实 npm 发布或真实包升级。

## TUI 实际 PTY

- 启动隔离 sqlite gateway（faux provider），通过真正 CLI 的 `tui --cwd <temp> --storage <temp>/session.sqlite --theme dark` 接入。
- 80×24、60×16 下显示简洁英语重启提示；`/version` → Enter 查看版本 → 方向键滚动 → Esc 返回 → 选择 Check for updates → Esc 关闭；关闭后输入 KEEP-DRAFT 正常显示，输入和状态栏保持可用。
- 补充实际会话切换后重新打开 `/version`，80×24、60×16 均保持应用版本状态，逐层 Esc 退出后可继续输入。PTY 脚本需持续读取输出，避免终端输出缓冲阻塞按键处理。
- 旧 gateway 为 0.2.5、安装夹具为 0.2.6；详情同时显示两者，并明确关闭同一网关的 TUI/Web/serve 后再启动。面板/状态单元测试与现有启动顺序全量测试共同覆盖会话独立及复用关闭语义。

## Web 实际浏览器

- 使用 Playwright headed 浏览器、隔离 gateway 与本地版本控制夹具，无真实模型请求。初始 gateway/Web/page 0.2.5、latest 0.2.6。
- 复制命令成功时说明在运行 neko 的电脑上执行；模拟剪贴板拒绝时回退展示完整 `neko update`。
- 安装文件改为 0.2.6 后，仍运行的旧 gateway 提示重新启动，没有误给刷新按钮；检查关于页各组件版本与主动检查。
- 真正关闭并重新启动隔离 gateway/Web 后，运行版本变为 0.2.6，旧页面改为刷新入口，原文字草稿仍在。用浏览器资源版本夹具模拟新页面资源后，键盘触发刷新，恢复同一会话 KEEP-UPGRADE-DRAFT，提示消失且未自动提交。
- 附件未发送、提交未结算和 sessionStorage 写入失败分别阻止升级刷新，保留页面/输入；原会话不存在时不将草稿恢复到另一会话，关于页可取回；不同 serverId 的草稿不自动恢复。
- 主动检查离线显示可重试失败，普通消息仍能提交并得到 faux 回答；后台失败不反复弹窗。
- 模拟隐藏/可见页面状态，隐藏时不检查，恢复可见立即检查；延迟旧 `/api/info` 响应，后返回的旧信息不覆盖已显示的新版本。
- 关于页本身也能显示复制成功/失败反馈；初始协议不兼容给出中文 `neko update` + 重启操作，不进入业务就绪。
- 375px/1440px 下验证复制、检查与键盘刷新；布局切换稳定后无横向溢出，手机与桌面截图已检查。示例截图/运行日志验收后已清理，未加入仓库。

## 范围

- 使用 faux 回复仅验证传输、交互与任务不中断，不评价模型质量。
- 当前真机验证为 macOS，不宣称已完成 Windows 验证；支持范围仍为 macOS/Linux Bun 全局安装。
- 没有改变提示词、会话数据结构、凭据、Pi 依赖或 lockfile；安装/重启没有远程 API。开发执行不自动检查 registry 或自升级。

- 额外核对：设置 `NEKO_RELEASE_VERSION=9.9.9` 时，源码 CLI 仍显示 development，发布 CLI 仍显示 0.2.5；普通 Vite 配置使用 development，发布构建才注入根版本。
