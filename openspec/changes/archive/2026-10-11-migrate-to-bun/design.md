# Design

## Context

动机见 proposal.md。当前五个 workspace 的 exports 指向 dist，Vitest 通过别名测试 src；根构建使用 npm workspace 顺序执行。TUI 源码模式经 tsx 启动 gateway，Web 无论源码/产物都固定调用根目录 tsx 和 gateway 源码。core 使用 Pi 1.1.0 的 node:sqlite 适配器。

探索在本机 Bun 1.4.2 上已确认：根和 Web 客户端类型检查、Biome、依赖导入、Vite 配置解析、CLI help，以及 faux provider 在 Memory/SQLite :memory: 上的问答通过。尚未验证冻结安装、完整构建、磁盘恢复、网络协议和真实终端；不能把上述探针视为完整兼容性结论。

## Goals / Non-Goals

**Goals:**
- 安装、检查、测试、构建及应用父子进程均可在不安装 Node/npm/tsx 的环境运行。
- 源码开发不依赖残留 dist；构建产物执行不依赖源码入口或开发加载器。
- 保存 Pi 协议、会话和数据库语义，能继续打开原有数据库。

**Non-Goals:**
- 不保证 Node 双运行时兼容，不更换 Vite，不将所有 node:* 调用机械替换为 Bun API。
- 不改变 Web HTTP 与 gateway 的现有进程拓扑。web-ui 静态托管 spec 与实现的历史差异不在此次解决，也不能将本次回归写成该 spec 已全部满足。
- 不重写 Pi 依赖，不扩展平台矩阵，不对真实用户数据做验证。

## Decisions

### D1：固定 Bun 1.4.2，单一锁文件

以已做探针的 1.4.2 为实施基线，通过 packageManager 和版本文件记录精确版本，engines 表达 Bun 要求，移除根 Node 要求。从现有 package-lock 迁移到 bun.lock，比较业务依赖和所有 Pi 包解析结果后删除 package-lock；不直接重新解析并升级所有依赖。新增 Bun 类型依赖也锁精确版本。

先保留 hoisted 安装布局以减少与 npm 现有布局的差异；安装策略显式记录。逐项核实 hasInstallScript 依赖的需要，使用最小 trustedDependencies，不批量信任。验收使用冻结锁文件的干净安装。

备选：追随 latest 或同时保留两个锁文件。均不采用，避免运行时与依赖树漂移。如果 1.4.2 出现无法兼容的问题，先记录最小复现并报告，再决定版本调整，不暗中升级 Pi。

### D2：保留 tsc/Biome/Vite，显式用 Bun 执行

开发入口直接执行 TypeScript，删除 tsx。保留 tsc 类型检查及声明/JS 产物、Vite 客户端构建、Biome 原生可执行文件；JS 工具入口明确使用 Bun（例如 bun --bun run / bunx --bun 的本地工具执行方式），避免 node shebang 回落到 Node。根 check 同时包含现有根检查和 Web 客户端检查。

构建按依赖拓扑执行：core → gateway → tui 与 web → cli。可使用 Bun workspace 调度，但必须确认依赖排序；否则使用显式顺序脚本，不沿用包名字母顺序。验收从无 dist 开始。

备选：全部改为 Bun.build。放弃，因为会扩大 Vite 插件、声明生成和前端资源语义的变更范围。

### D3：明确区分源码与构建产物解析

默认 package exports 保留 dist 及声明；为内部 workspace 提供独立的开发源码条件（如 neko-source），指向 src/index.ts，源码执行和测试显式启用。条件只对项目包定义，避免激活上游 Pi 的 source 条件；条件顺序必须保证开发入口先于默认 dist/types 命中。

不把全局 tsconfig paths 指向 src：这可能使各包 rootDir 构建跨入其他 workspace。为测试/开发的类型解析设置单独配置或条件，构建配置继续解析产物。Vite 浏览器构建维持现有行为。对源码测试进行无 dist 验证，对构建产物单独做不启用源码条件的启动验证。

备选：测试前总是构建。放弃，因为会让测试依赖旧产物并拖慢开发；不以源码别名掩盖产物缺失问题。

### D4：Bun 启动贯穿 CLI 和 gateway

CLI/gateway shebang 改为 Bun。TUI/Web 以当前 Bun 的 process.execPath 启动 gateway；源码形态传递 TypeScript 入口及开发条件，产物形态传递 dist/main.js。删除 createRequire(tsx/cli) 与 node_modules/.bin/tsx 路径假设。

保持各前端的端口、socket、model、storage、cwd 参数和网关复用行为；源码/产物路径选择及命令构造可以放入 gateway 包的轻量辅助模块，避免重复策略。共享模块不能引入启动副作用。保留 child_process 的兼容接口和信号管理，验证自己创建的子进程会被正确清理，复用的外部网关不会被误杀。

备选：只替换根 neko 脚本。放弃，因为不能保证子进程运行时和产物部署行为。

### D5：Bun 原生测试，保留隔离与范围

将现有 vitest 导入转换为 bun:test，删除 Vitest 依赖/配置，增加必要的 Bun 类型与测试配置。测试仅发现项目 packages 下的目标测试，排除 reference、node_modules 和构建产物。显式启用 D3 的源码条件。

现有测试有环境变量修改、faux provider 注册、计时器和并发会话状态；选择并验证 Bun 1.4.2 支持的文件隔离方式，默认不启用未经验证的测试内并发。保留原有超时和资源清理，不能通过减少断言或全局增加超时掩盖兼容性问题。

备选：Bun 驱动 Vitest。用户已确认迁移 bun test，因此不保留另一套 runner。

### D6：存储与网络保持适配层

继续调用 openNodeSqliteStorage，保留 NodeEnvironment、ws、Unix socket 与 HTTP API。内存探针已经证明可加载及执行；正式验收覆盖磁盘 SQLite WAL、关闭/重开、requestId 幂等、任务恢复、工具中断、单实例锁和网络断连。

旧数据库兼容验证在临时目录使用迁移前 Node 基线生成的 fixture 或其副本，随后用 Bun 打开并检查会话与幂等行为；Node 只属于一次性迁移基线验证，不是最终工具链要求。不触碰 ~/.neko 的真实数据。暂不新增 bun:sqlite 适配器，因为 Pi 1.1.0 没有现成该导出且当前接口可用。

## Risks / Trade-offs

- [工具命令表面由 Bun 启动，实际 shebang/子进程仍调用 Node] → 无 Node/npm/tsx 的受控 PATH 验收，并检查父子进程 executable。
- [现有 node_modules 掩盖安装脚本或原生依赖问题] → 冻结锁文件干净安装，完整 Vite/tsc 构建。
- [源码条件污染发布产物或测试读旧 dist] → 开发条件与默认 exports 分离，双形态分别验证。
- [Bun 文件隔离及事件循环与 Vitest/Node 有差异] → 运行完整既有测试，重点检查状态泄漏、关闭挂起、取消和信号。
- [node:sqlite 在 macOS 使用的 SQLite 实现与 Node 有差异] → 磁盘持久化与旧 fixture 验收，兼容失败即阻断迁移完成。
- [没有现有 CLI/TUI/Web 测试目录] → 增加关键启动集成检查，并在真实 TTY 验证输入、缩放、退出后的 raw mode 恢复。

## Migration Plan

1. 记录现有 Node 测试基线，在隔离目录保留用于兼容验证的数据库 fixture。
2. 迁移包管理、源码解析、工具驱动与测试配置，保持业务依赖版本。
3. 修改 CLI 与两条 gateway 启动链，更新示例和文档。
4. 完成干净安装/冷构建、全套测试、数据库兼容、源码/产物启动、TTY 与 Web 验收；标注所有未能执行的检查，不将其当作通过。
5. 验收通过后以 bun.lock 为唯一锁文件交付。回退时恢复变更前的 manifests、package-lock、脚本及源码并重新安装；数据库 schema 不变，仍需通过旧数据库兼容检查确认回退可用。
