# 实施与验证记录

日期：2026-10-13。仓库源码与生产 tarball 均使用 Pi/Chord 1.2.0；Bun 1.4.2。初次实施验证时未提交、发布、同步主规格或归档变更；后续归档决定见末尾。

## SDK 与结构

- chord、pi-ai、pi-durable、pi-tui、pi-env 全部精确锁定 1.2.0；typebox 为 1.3.27。冻结安装通过，旧 pi-client/pi-server/pi-protocol 不再存在于依赖图。
- 自定义工具返回 `output`，消息仍使用 `content`。原生 `read` 加 Photon 统一读图；删除 read_image、图片暂存文档/hash/补偿和 XML 展示反解析。
- 附件与技能展示数据以 `app.neko.input` 的 `input.entry.data` 原子持久化；输入 placement 才激活提示词资源快照。资源快照的暂存仍承担此业务边界，不是旧图片暂存层。
- `Harness.closed` / `session_failed` / `onReport` 驱动宿主清理。独立读取失败与致命存储失败按 SDK 行为区分。
- 压缩只读原生 LiveDoc 与 `TaskId<CompactionResult>` / `harness.getTask` / 摘要 submission 回执，删除压缩镜像写回；保留会话级准入去重。
- 命名使用 conversation-owned durable background task、checkpoint、runtime.sleep、原生取消和恢复；两次尝试预算持久化，并发上限为 2。删除自建命名 timer/jobs/active 与重启补偿。
- 内存凭据使用 SDK 的 `InMemoryCredentialStore`。持久凭据仍由应用的原子文件替换与跨进程锁负责。
- provider 直接交给 SDK；测试保留自定义 baseUrl、RefreshModelsContext、DeepSeek 发布能力和凭据轮换。未增加 OpenRouter 产品入口。
- 网关以单个 Chord host 托管共享资源、状态和监听；每连接 principal 拥有独立 attachment/上传资源。客户端直接返回原生 handles，业务查询/读取桥接 Ctx.signal，首值等待与连接超时有界。
- Web 与 TUI 使用同一具体 schema 契约；技能市场业务原因使用原生 `ChordError.reason`，不再解析错误消息前缀。

必要适配层：

| 适配层 | 应用职责 |
| --- | --- |
| gateway contract 声明组装 | 将具体 TypeBox schema 交给 remote/method；规避发布 SDK 未导出 MethodSpec 导致的声明文件类型不可命名，不导入 SDK 内部类型 |
| 公共客户端连接层 | serverId 校验、attachment 生命周期、等待首快照、超时与取消；不逐方法转发 |
| WS 字节限制 / Unix Link | 原生 JSON Chord Frame 的缓冲上限；Unix 仅增加长度前缀和 FIFO/拆包，不增加第二套 wire 协议 |
| 共享会话投影 | 业务图片/技能展示、原生诊断、目录元数据与压缩回执；观察资源随最后持有者释放 |
| WorkspaceFiles | 应用候选匹配、规范路径边界、容量、刷新、取消与 incomplete；枚举本身交给 pi-env |
| SessionMetadataDoc | 标题、目录摘要及命名用量；不镜像 SDK scheduler 状态 |

生产源码（packages/**/src 的 .ts/.tsx，包含新增和删除文件）从 13,619 行变为 13,937 行，净增 318 行。压缩从 123 降至 53 行、凭据从 134 降至 105 行、Node 客户端入口从 146 降至 18 行；共享连接、具体契约、Unix transport 和缓存增加必要代码。没有宣称总行数下降。

## 本机回归与生产安装

| 检查 | 结果 |
| --- | --- |
| bun install --frozen-lockfile | 通过 |
| bun run check | 通过；Biome 与根/Web 类型检查，无警告 |
| bun run test | 243 pass，0 fail，62 个文件；最后新增错误对象脱敏断言单独复验通过 |
| bun run build | 通过（最后 build:release 内重新执行） |
| bun run build:release | 通过；保留既有 Vite chunk-size 提示 |
| bun run test:package | 真实临时安装通过；darwin/arm64 |
| 原生 compaction 定向复验 | 12 pass，0 fail |
| openspec validate upgrade-pi-sdk-1-2 --strict | 通过 |

测试覆盖持久重启、requestId 幂等、replay-safe/unsafe 工具、fork、steer/follow-up、扩展替换、用量、资源 placement；原生 read 转换/缩放、index 0、源文件删除、非视觉占位、解码/上限错误；命名跨重启预算与并发；读/commit 故障、在途等待与两端不可用；契约非法参数/结果/状态、错误对象无凭据值；伪造/旧 attachment、跨连接上传和断连继续回答；Unix 分包/粘包/UTF-8、坏帧、字节上限、长 Unicode 与 WS 关闭后的迟到发送。

生产安装将 PATH 限制到临时 bun 可执行目录，无 fd/fdfind。验证正确平台的随包 localDaemon、1.2 hello/listFiles、文件变化、helper 退出；真实 createReadTool 执行 Photon PNG 缩放及 BMP 转 PNG，worker/WASM 路径存在；无 Key 的 Web 启动与静态资源可用。未使用 reference 二进制、Cargo 或运行时下载 daemon。

平台记录：

| 平台 | 实际结果 |
| --- | --- |
| macOS arm64 | 仓库全量检查与真实生产临时安装通过 |
| Linux arm64 | 官方 oven/bun:1.4.2 容器中独立安装 tarball，通过 SDK/Photon、两个独立 WS 客户端、实际应用文件查询/缓存刷新、原生首快照、无 Key 静态 Web、helper 退出 |
| Linux x64 | 官方 Bun 容器经本机架构仿真通过同一生产包检查；确认 x64 helper、两个 WS 客户端、缓存刷新、Photon、静态 Web 与退出清理 |
| Windows | 本轮未取得对应平台 runner；ws-only/port-file/helper 实机验收未完成 |

Linux 的应用运行时来自 tarball 安装；测试客户端使用同一公开 wire 契约声明，不加载开发 core/gateway 实现或 reference。容器在退出后删除；未运行远程 CI。CI 与发布 workflow 已移除 fd 安装步骤，现有 macOS/Linux matrix 可继续复验。

## 文件缓存测量

命令：`bun --conditions=neko-source scripts/benchmark-workspace-files.ts`。darwin/arm64，本仓库加 55,001 文件受控目录；并非与 fd 的比较基准。

| 项目 | 结果 |
| --- | --- |
| 仓库冷查询 | 752.45 ms，5 个候选，完整 |
| 仓库热点 10 次平均 | 1.53 ms |
| 大目录根查询 | 1542.13 ms，0 候选，incomplete=true |
| 指定 z/ 子目录 | 0.83 ms，1 个候选，完整 |
| 大索引热点匹配 | 3.84 ms |
| 文件变化到刷新可见 | 503.01 ms；最后查询 0.76 ms |
| 缓存 | 3 key，2 个共享根 watcher，50,576 entries，2,295,031 字节序列化数据 |
| 本次进程堆增量 / RSS 增量 | 57.87 / 185.13 MiB |
| 独立容量夹具 | keys=2、idle=100ms：LRU 保持 2 key/1 watcher；400ms 后 0 key/0 watcher |

生产上限：8 key、200,000 entries、32 MiB 序列化索引；每扫描 50,000 entries / 4 MiB 路径 payload / 2s，首次或重启 hello 为 5s；2 个并行扫描，排队受 key 上限约束；TTL 30s，空闲 5min 回收。

32 MiB 是序列化索引上限，不是进程堆/RSS 上限。测量包含夹具创建、Bun I/O 和原生 Node watcher 元数据；daemon 是另一个进程，不包含在此 RSS 中。根 watcher 会维护比截断 listing 更大的原生观察快照。冷热结果证明按键复用索引，不证明比 fd 快。

真实测试覆盖创建、删除、重命名、.gitignore/info/exclude、隔离用户全局 Git ignores 的 TTL 刷新、helper 丢失与重启、缓存失效；受控故障测试覆盖 overflow、观察返回失败/抛错、迟到扫描、等待者独立取消、最后等待者回收、LRU/空闲/移除/关闭。非 Git 目录不应用 .gitignore，不读取 .ignore/.fdignore；保留隐藏项，排除 .git、symlink 与越界目标。

## UI 验证及尚未完成项

Chrome 实际页面：目录、模型/思考设置、read 图片预览和源删除后 reload、失败与非视觉诊断、技能折叠/正文/参数中的 XML、手工 XML 原样显示、实际图片上传及消息提交均通过。文件面板验证加载、完整无匹配、100 候选 limited、截断零匹配 incomplete、指定子目录恢复、故障/一键重试、草稿保留、Esc/Tab、取消后迟到结果不重开、指针和独立触屏 context 选择。

真实 Unix TUI 与 WS 浏览器联调输入、状态传播和模型配置。PTY 运行最终 TUI，验证 read 信息/图片回退、技能参数、手工 XML、候选/Tab、普通发送及常驻输入/状态栏。已运行 editor/layout/login/picker 相关回归。

电脑使用工具拒绝访问 Ghostty，原文为 `Computer Use is not allowed to use the app 'com.mitchellh.ghostty' for safety reasons.` 因此不将 PTY 输出当作实体终端的图片、软/硬光标、shift 符号键及 overlay 鼠标滚轮视觉验收。任务 7.2/7.3/7.4 保留未勾选。Windows 对应平台结果也未取得，8.4/9.2 保留未勾选；已记录 macOS arm64 与 Linux 两种架构的通过结果，不以这些结果替代 Windows 安装/运行证据。

## 已授权旧测试数据清理

解析配置后，实际 storagePath 为 `/Users/kirineko/.neko/neko.sqlite`。lsof 与进程参数确认唯一持库者为 PID 87330、全局旧包网关（pi-durable 1.1.0），先 SIGTERM 并确认释放存储，再定向删除 SQLite/WAL/SHM。该实例 socket 随正常关闭清理，无遗留 port 文件；未批量清理其他存储。

serverId、credentials.json、neko.config.json 和 AGENTS.md 的存在性/内容指纹前后相同；未删除技能或工作区文件。以新 1.2 网关打开目标路径、通过真实 Unix 客户端读取新根会话，id=1、items=0，随后关闭验证网关。未加入启动自动删库逻辑。

全局安装包没有修改，仍依赖 1.1.0；本轮验证使用仓库源码和新 tarball。旧持库网关已停止，应使用新代码启动该库。

最终 diff 的当前代码/依赖图中没有旧通信包/API、图片暂存/hash、XML 展示解析、压缩镜像写回、命名自建 scheduler 或 fd 后端/安装步骤。仅当前 change 的工件有修改；主规格、历史归档和 reference 未修改。

## 用户手动验收与 TUI 目录补全修复（2026-10-13）

用户确认已完成前述手动验证，反馈仅 TUI 接受 @ 目录候选后未立即继续查询下一级，Web 无此问题。以用户实体终端反馈补齐 7.2/7.3/7.4 的验收；本轮没有取得 Windows 的具体平台安装/运行记录，8.4/9.2 的对应平台记录仍待补充。

问题来自 Pi 1.2 Editor 接受候选后关闭列表，不自动触发目录查询。BoundedEditor 在原生 applyCompletion 完成后通过公开 Tab 输入路径继续查询，仅作用于 @ 目录；插入、引号、光标、撤销、单候选自动补全和异步请求校验仍交给 Pi。应用 epoch/文本/光标检查阻止编辑或会话切换后的排队触发；Esc 也取消尚未显示面板的查询。

新增真实 BoundedEditor 键盘回归：Tab/Enter 连续两级目录、带空格路径、已有后缀、选择不提交、原生撤销，以及排队触发前 Esc、查询中 Esc/切换草稿和迟到响应不重开。TUI 回归 34 pass、0 fail；bun run check 通过。使用仓库源码启动即可加载修复，不需要 build。未重新构建发布包、提交或归档。

## 归档与延期验证决定（2026-10-13）

用户明确要求同步规格、归档并 commit，Windows 在发版后验证。按此决定以 36/38 项完成状态归档，8.4/9.2 的 Windows 平台检查保持未勾选；未声称 Windows 验证通过。发版后通过 npm 实际安装发布版本，检查随包 helper、无 fd 文件发现与刷新、WS-only/port-file 发现、双端同步及退出清理，并记录平台/架构/Bun/包版本和结果。待办同步到 `.github/RELEASING.md`，本轮不推送或发版。

归档提交前复验：`bun run check` 通过；允许本地 socket/文件观察的宿主环境中 `bun run test` 为 248 pass、0 fail（62 个文件）。默认沙箱拒绝 Unix socket listen（EPERM），该环境的失败不作为功能通过证据。7 个 delta 与主规格逐块比对，保留既有 Purpose、未涉及需求和场景；`openspec validate --specs` 为 12 pass、0 fail，仅保留既有 web-ui Purpose 过短提示；变更严格验证通过。归档目录为 `2026-10-13-upgrade-pi-sdk-1-2`，活动变更列表为空。
