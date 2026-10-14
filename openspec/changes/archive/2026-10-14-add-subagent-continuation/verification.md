# Verification

验证日期：2026-10-14。所有模型调用使用 faux provider，使用 MemoryStorage 或独立临时 SQLite；未使用真实 API key，未写入用户本机会话数据库，未更改依赖版本或 Windows CI。

## 自动验证

- `bun run test`：最终 387 pass / 0 fail，94 个文件，2522 个断言（包含同时进行的登录变更测试）。
- 最终相关回归：`bun test --conditions=neko-source --isolate packages/core/test/subagents.test.ts packages/core/test/subagent-continuation.test.ts packages/core/test/subagent-usage.test.ts packages/gateway/test/subagents.test.ts packages/tui/test/subagents-ui.test.ts`：34 pass / 0 fail，303 个断言。
- `bun run check`：本变更完整检查曾通过。最终复查时，工作区同时新增的 `improve-tui-login-ux` 在 `packages/tui/test/login.test.ts` 的状态 fixture 中将 `source` 推断为 string，产生 TS2345。保留该并行变更；仅排除该测试文件后的根类型检查、全目录 Biome 和 Web 客户端类型检查通过。现有 theme-syntax 测试有一条非失败级 Biome 提示。
- `bun run build`、`bun run build:release` 和 `bun run test:package` 通过；打包 SDK 冒烟覆盖 darwin/arm64，npm 包安装/启动冒烟通过。
- `openspec validate add-subagent-continuation --strict --no-interactive` 和 `git diff --check` 通过。

## 生命周期、审批和用量

- 两次工具委派返回相同 agentId/childId；模型第二轮请求中存在第一轮证据，主会话保存独立轮次报告。list 可发现稳定身份；同时接续只接受一次，busy 调用没有额外 input。
- Memory/SQLite 覆盖原生 RoundTask 的 admission、deliver、settle、已写入 answer 以及持久取消标记后的关闭/重开，复用原 submission/driver，输入不重复，取消后可接续。沿既有 unsafe Bash 恢复机制，不重跑已开始执行的 shell。
- 固定角色/cwd/model/thinking；新输入刷新项目资源。跨主会话和分叉身份不能接续；子 agent 工具权限保持原角色限制。
- 两轮相同 Bash 命令分别审批；第二轮请求绑定第二轮委派；审批等待中重开保持版本与基线，迟到旧决定不能作用到新轮。
- 实际停止第二轮终止子执行，第三轮仍能复用第一轮上下文；旧轮 stop 不会停止新轮，兄弟任务继续运行。
- 原生 UsageState 差值覆盖 token、缓存、成本与可选计数字段；未提交即取消为零，取消/失败保留已产生用量。主会话按唯一 child 聚合，0.10 + 0.03 + 0.02 + 0.04 = 0.19；轮次重复引用不重复计费。
- 主分叉按唯一 child 冻结历史 watermark 和累计用量，不继承可控制身份；原会话后续内容、审批和费用不会进入分叉。

## Web / TUI 实际交互

独立 faux gateway 与 Web 页面运行于本机临时端口，TUI 连接同一测试 socket。

- Web 创建首轮（55 次工具调用以产生分页历史），关闭子面板后由主会话接续第二轮。列表保持一个身份，主卡片保持两条轮次；接续不会强制打开已关闭面板，输入草稿保留。
- 点击首轮卡片自动分页到首轮输入；任务分隔可用键盘 Enter 展开本轮用量，主卡片可用键盘定位。子详情累计用量与各轮增量分别展示；耗时指向当前或最近轮次，空闲后停止累加。
- 第二轮 Bash 审批在输入区出现；TUI 使用原 Pi SelectList Enter 批准，然后在 TUI 单独停止第二轮。Web 同步为空闲并移除待审批项；Web 第三轮继续使用相同身份和原上下文，一身份三轮。
- TUI 真实 PTY：80x24 dark、60x16 light，验证列表/详情往返、轮次、PgUp/PgDn/鼠标滚动、累计/本轮用量、审批和停止。长历史滚到顶部可看到累计用量；现有英文主题和快捷键样式保持。
- Web 375/768/1440/1920，浅深色均无横向溢出；窄屏子详情和输入区审批可用，长命令显示正常。保持子面板打开往返切换会话三次，无 Something went wrong，浏览器控制台无错误。
- 等待中重启由 SQLite 集成用例覆盖；浏览器与 PTY 联动覆盖同一身份第二轮审批/停止和第三轮接续。

## 最小人工验收

1. 重新启动 gateway 和 Web/TUI（应用协议已从 3 升为 4）。向主 agent 输入：`请派一个 explore 子智能体调查 README 的安装方式，返回 agentId。`
2. 首轮结束后输入：`继续使用刚才相同 agentId 的子智能体，补充升级方式；沿用之前上下文，不要创建新的子智能体。` 确认列表仍是一个身份，主会话有两张任务卡，子详情包含两轮输入和工具过程，点击第一张卡定位首轮。
3. 输入：`继续使用这个子智能体，执行 git status --short，需要审批；然后继续调查。` 确认主界面或子详情均可审批；停止活动任务后再要求相同身份继续，旧上下文仍可用。
4. 子详情保持打开，切到另一个会话再回来；确认页面正常、滚动/草稿保留。累计用量不因多张任务卡成倍增加，本轮用量分别展示。

归档前实施任务 24/24 已完成。本次提交范围已在独立临时副本完成全量检查；原工作区的独立登录变更保留，不包含在本次提交中。

## 普通输入 400 的修复回归

用户真实服务端报错显示 subagent schema 的根类型为空。本次引入的顶层 Type.Union 只生成 anyOf，没有根 type: object，因此模型在任何普通输入的工具声明校验阶段即拒绝请求。改为 provider 侧普通对象 schema，执行入口内部 TypeBox 分支校验；非法分支字段在任何准入事务前返回工具错误。

- 新增 `packages/core/test/subagent-schema.test.ts`：已安装 Pi DeepSeek 适配器执行两次普通消息，注入离线 fetch 模拟服务端对象 schema 校验及 SSE 响应，确认实际 wire 工具参数含 type: object/properties，没有顶层 anyOf。六类缺少必填或混用字段的调用不会产生子会话身份/轮次；7 pass / 0 fail，31 个断言。
- 修复相关回归（schema、continuation、subagents）：25 pass / 0 fail；最终全量 387 pass / 0 fail。
- 最终 build:release 与 test:package 通过。修复文件 Biome、排除并行 login.test.ts 后的根类型检查和 Web 类型检查通过；完整 check 仍仅被该并行登录测试的 source 字面量类型错误阻塞。
- 未调用真实模型服务、未使用真实密钥、未自动重启用户 gateway。人工验证需重启 gateway 后重新发送 hi；仅刷新 Web 不会替换正在运行的 gateway 工具定义。

## Web 列表精简

按人工验收反馈，将列表项改为单行角色、稳定名称和轮数；移除最近任务摘要与状态行。名称过长时省略，轮数保持可见；详情保留状态与审批入口。修改文件 Biome、Web 类型检查与 Web 构建通过。

## 归档前提交范围验证

用户完成手工验收，包括普通输入、同身份接续与精简 Web 列表，并授权清理、归档和 commit。

为完整验证本次提交，创建独立临时副本：包含全部 tracked 项目的当前内容与本变更新增的 core 文件，仅将独立登录变更的 login.ts / login.test.ts 使用 HEAD 版本；重新连接 workspace 本地依赖并构建，不修改原工作区的登录文件。

- `bun run build:release`（含 `bun run build`）：通过。
- `bun run check`：完整通过；既有 theme-syntax 只有非失败级 Biome 提示。
- `bun run test`：382 pass / 0 fail，94 文件、2492 断言。
- `bun run test:package`：生产 SDK darwin/arm64 与 npm 包冒烟通过。
- 变更严格校验通过；主规格常规校验 17 pass / 0 fail。主规格全局 strict 有既有 Web Purpose 长度警告；本次按同步约定保留原 Purpose。
- 临时副本自动移除；清理 repo 内 artifacts、根和 workspace dist、浏览器测试快照及本次临时日志，不删除 node_modules、reference 或用户本机会话数据。
