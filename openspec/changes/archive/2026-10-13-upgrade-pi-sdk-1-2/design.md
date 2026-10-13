# Design

## Context

动机与范围见 `proposal.md`。当前 core 使用一个 pi-durable Harness/SQLite 存储；gateway 通过 pi-server 的 SessionRouter 托管服务器级服务和会话级 provider，TUI/Web 通过 pi-client 与旧 Chord binding 访问。Web 的 `lib/contract.ts` 重复声明 gateway 契约，Unix/WS 均承载旧 CBOR 字节协议。

Pi 1.2.0 删除三个通信包及 `defineService`/provider/endpoint/binding。新 Chord 使用 TypeBox 描述的 `remote`/`local` 契约、`createHost`、handle、JSON Frame 和 `Ctx`；durable 仍使用 `Context`。`handle.ready` 只保证绑定完成，订阅状态要单独等待。原生 `read` 提供图片处理插槽，当前 neko 的尺寸和名称元数据却只由 `read_image` 写入。

以 npm 发布的 1.2.0 类型、运行时代码和 changelog 为实施依据；`reference/pi` 在 `06a4669` 之后还有未发布修复，不能将 `main` 当作已安装版本。已只读核对 chord、pi-ai、pi-durable、pi-tui、pi-codemode、pi-env 的精确 1.2.0 tarball（registry.npmjs.org），并对照 release commit 的源码，未安装或执行这些审计包。pi-env 发布包包含八种平台/架构二进制，压缩约 9 MB、展开约 18 MB；LocalExecutionEnv 继承 NodeExecutionEnv，仅 listFiles 通过共享本地 Connection 执行。pi-ai DeepSeek catalog 中 Flash 的思考选项和视觉能力、Pro 的思考选项和纯文本能力保持现有约定。

## Goals / Non-Goals

**Goals:**

- 以 1.2 原生调用和类型为主要写法；core/gateway 只封装应用业务与必需适配，不为保持旧调用形式包裹新 SDK。
- 删除可由输入 entry、工具 details、host 生命周期和 durable 任务承担的重复持久化、转发、计时和恢复逻辑，保留会话操作顺序与产品行为。
- 使用一个网关 host 和共享 durable runtime，准确区分持久任务、共享投影和连接临时资源。
- 以原生 `read` 完成文件/图片读取，保留图片内容、元数据、诊断和按需预览。
- 验证 Pi 1.2 自身的幂等、恢复、取消与错误行为。
- 文件补全随包可用，利用上游枚举/取消能力删除 fd 适配；允许为有界缓存、刷新及准确反馈增加必要代码。

**Non-Goals:**

- 无 1.1 数据/任务恢复、旧协议协商或 read_image 别名；用户已确认旧会话都是可删除测试数据。
- 不复制或修改上游源码，不建立每会话 child host/进程，不引入 Chord 插件热重载架构。
- 不新增 codemode、nested tool UI、tool-search、模型/provider 产品能力，不替换当前附件上传校验。
- pi-env 本次只用于本地环境与文件发现，不新增 SSH 工作区或交互 PTY；不保留 fd 搜索回退或复制 fd 专用忽略规则。

## Decisions

### D1. 发布包一致升级，声明直接依赖

根包与所有 workspace 实际使用的 chord、pi-ai、pi-durable、pi-tui 精确锁 `1.2.0`，core 及根发布清单增补直接运行时依赖 pi-env `1.2.0`，移除 pi-client/pi-server/pi-protocol。gateway 增补自身直接使用的 SDK 依赖，不依赖 core 带来的偶然提升。共享契约使用 `typebox` 时精确声明发布 SDK 对应的 `1.3.27`。传递包由 `bun.lock` 固定，不为尚未使用的上游功能新增直接依赖。

升级后检查依赖图中不存在旧通信包或混用的 1.1 SDK；保留现有 Bun/TS/Biome 配置。排除仅升级 durable、保留旧 binding 的做法，因为旧通信包依赖被删除的 Chord API。

### D2. 一份浏览器安全的运行时契约

在 `packages/gateway/src/contract.ts` 使用 `remote()`、`method()` 和明确的输入、响应、状态 schema，保留现有 `neko.*` 服务名称及业务分组。为该模块新增独立 `@neko-harness/gateway/contract` 导出；Web 直接复用或重新导出它，删除重复运行时契约。该入口不得导入 gateway 主模块、Node APIs 或 core runtime；core 数据类型只做 type-only 导入。

契约返回类型从 schema 推导，前端直接使用契约 handle 类型，删除手写的重复方法接口。wire 的无参数/无返回操作使用 `null` schema，调用端按新契约迁移；JSON 可选字段在发送前省略，不发送 `undefined`。所有远程参数、返回值和状态使用具体 schema，不能用宽泛 `unknown` 绕过校验。业务校验仍在服务方法中完成，错误映射为 `ChordError` 的 `invalid`、`gone`、`unavailable` 等；技能市场和缺少凭据等既有业务错误标识继续可判读，错误不得回显 Key。

替代方案是保留 Web 契约副本，但新增运行时 schema 和 contract fingerprint 后副本漂移更容易导致绑定失败，故选择共享入口。

### D3. 一个网关 host，共享投影与连接私有 attachment

`gateway.ts` 创建命名为稳定 serverId 的 host，接受连接时由宿主分配唯一 connection principal，客户端声明的身份不能作为连接隔离依据。服务器级目录、工作区和凭据来自共享数据源；连接管理服务按 principal 管理当前 attachment。

`attach(sessionId)` 返回包含服务端 attachmentId 的普通 JSON 描述。同一连接、同一会话重复 attach 返回相同标识；切换生成新标识，先使旧 attachment 不可接受新操作，再绑定新会话。`NekoChat` 的输入包含 sessionId/attachmentId，工厂和每次操作都检查 principal 对应的当前 attachment，防止持有旧 handle、重新获取旧 handle或复用其他连接标识。

共享会话投影使用 host-local 对象，按 conversationId 保持一个 durable view 观察资源。远程 Chat 按连接 principal 分离，持有该共享对象，并拥有自己的 `ImageUploads`；不在每个远程视图中复制独立会话运行时。工厂只声明 `self.get`、state、resource、listen/derive 等，异步读取和 durable watch 在资源激活阶段执行，清理在资源 close 执行。优先由原生依赖/资源释放替代手写订阅集合和全局投影缓存；durable 回调在 Chord 方法之外更新 state 时通过新的 `host.root` 获取 `Ctx`，不复用已结束调用的上下文。

durable 的 `viewState()`、`documentState()`/`watchDoc()` 是公开观察入口；应用元数据另行观察并在共享对象派生，不能假设内置 view 含有全部自定义文档。不从内部路径导入未公开导出的 `conversationViews`/`ViewObserver`，不重建旧 `RemoteServiceBinding` 或 replicatedState 门面。活跃观察才保有会话资源，无前端时释放观察而保留 durable 工作，利用 1.2 默认 `documentRetentionMs` 回收未观察文档。

```text
TUI client host -- Unix Link --+
                              +--> gateway host --> shared session projection
Web client host -- WS Link ----+          |                    |
                                         v                    v
                              per-connection attachment   durable Harness
                                      + uploads              + SQLite
```

连接断开先标记 attachment 无效；由调用计数/资源生命周期等待已受理业务调用结算后释放 uploads 和持有的投影。不要把永久运行的 durable run 纳入 Chord 方法调用的等待：submit 只等准入，后台模型任务归 runtime 管理。归档、detach、会话切换都需要相同的旧引用检查；单个 attachment 清理不能调用整个会话的 abort/close。

不保留旧 SessionRouter 的 out-of-band attachment 协议，也不新增每会话子进程。attach/detach 是 neko 业务状态，不能仅用 handle.release 代替服务器侧幂等和失效语义。

### D4. 使用 Chord JSON 帧，保留 POSIX 双传输

WebSocket 使用 `webSocketLink()`，宿主用 `acceptWebSockets()` 或等价的 `host.accept(webSocketLink(socket), ...)` 接入。浏览器端删除 ByteTransport/CBOR 逻辑。Node WebSocket 和浏览器连接均在开放前限制帧大小、待发送队列和关闭路径；沿用现有 16 MiB 慢客户端发送缓冲上限，并设置单帧上限，实际传输仍通过 `IMAGE_CHUNK_BYTES` 分块。

新增薄 Unix `Link`：只将 Chord `Frame` 序列化为 UTF-8 JSON，用 4 字节长度前缀解决 stream 半帧/粘包，解析后交给 Chord。单帧上限为 16 MiB，读取长度后、分配帧缓冲前先校验，发送排队不超过 16 MiB；超过上限关闭该连接。WS 同样限制单条 JSON 消息为 16 MiB，并验证长文字历史快照仍可正常发送；两种传输共享相同契约和业务处理，不实现 RPC、订阅、错误或握手的第二套协议。

新版客户端在有界 Link 入口校验 Chord 原生 hello.name 与发现的 serverId，匹配前不发送业务 hold/call，无须额外握手协议。保留现有 `gateway-server-id` 文件和 socket 命名；替换 pi-protocol 的 `isServerId` 为应用内的明确校验。Windows 保留随机 WS 端口和 `.port` 文件，POSIX 保留 Unix 发现、活跃占用拒绝和确认遗留 socket 后接管。单实例判断不能用自动 unlink 活跃 socket；已发布 Chord 1.2 的 processLock 在深路径 macOS 上有已知未发布修复，本次不引入它代替现有监听地址占用机制。

替代方案是全部改为 WS，但会改变已有传输规格和 POSIX 地址发现，故不采用。

### D5. 原生 handle 调用，上下文只在边界转换

gateway 客户端以及 Web connection 各拥有 client-kind Chord host，管理长生命周期 handle。普通远程方法直接调用 `handle.method(args)`：1.2 的可选 Ctx 会在缺省时自动创建 root；多个相关操作或需要取消时使用 `host.root(ctx => ..., { signal })` 并传入 Ctx。迁移 TUI/Web 的 `BACKGROUND_CONTEXT` 与旧 Context 参数，删除每个方法都转发到 host.root 的包装。durable 内部继续使用其要求的 `Context`，仅在 gateway → core 边界用 `withAbortSignal(ctx.signal, runtimeContext)` 转换需要取消的查询。提交一旦准入，模型任务继续使用 runtime 生命周期；客户端取消不能撤回已受理消息。

首次连接先订阅目录、工作区与凭据，再等各 handle.ready 和实际首个值；attach 同样先订阅 view 并等首个完整值。设置超时及取消清理，保持订阅以免无订阅时远程 readable 回到 undefined。只保留可复用的首值等待辅助和 attachment 编排，不包装每个远程方法或模拟旧 Client。

Web 保留现有 epoch/viewEpoch 和有序导航保护，断开后释放旧 handles/订阅，重建 host 与连接，重新取当前快照并按同工作区恢复。TUI 维持现有断连/启动策略。release、detach、close 幂等。发布的 1.2 handle Proxy 对 `then` 明确返回 undefined，可安全从 async 返回原生 handle；删除旧的 thenable 防御与普通对象复制转发。

### D6. 原生 read + 上游图片处理器，元数据随结果持久化

以 `createCodingTools({ images })` 安装编码工具，图片处理器使用 `createNodePhotonImages()`，按需创建 worker 并使用上游的缩放/转换诊断。移除 `ImageTools` 注册、`read-image.ts` 和 read_image 提示词；read 的文字路径、分页、工作区解析与显式跨目录行为保留上游实现，不包装或复制 execute。

新增只处理原生 read 图片结果的 `afterTool` hook，读取 `result.output` 中实际图片，以现有 sharp 元数据读取能力确定保存格式/尺寸/字节数，依据调用参数记录路径名称与实际 contentIndex。元数据合入命名空间化的 `result.details`，由 SDK 随 ToolResultMessage 原子持久化，保留上游 details、output、structuredOutput、diagnostics；不另写文档、不再次缩放或重读源文件。不能继续写死图片在 index 1，原生 read 图片位于输出的实际位置；失败结果没有图片时不创建成功预览。

附件仍使用现有 `prepareInput`/`prepareImage` 严格规则和 sharp，工具图片由原生处理器负责。放弃旧“附件和独立图片工具共用严格格式规则”的规格，明确两条入口都尊重模型限制但格式/非视觉策略不同：附件拒绝非视觉准入，read 保留图片并在模型请求中使用占位符。

`projection.ts`/工具卡按 output/model 内容、持久 details 与 ToolResultEntry.data.diagnostics 分别提取预览、描述和诊断，防止文本输出为空时失败原因消失；有结构化诊断时不再解析模型用的 `<harness>` 文本，避免重复渲染。`structuredOutput` 是程序调用通道，不能假设其保存到 transcript 或把它作为图片预览恢复源。图片本体继续经已有按需分块读取服务提供，不放入状态。

### D7. 使用 1.2 的工具结果与运行时失败语义

所有自定义工具和测试返回值从 `content` 改为 `output`；pi-ai 消息的 `content`、附件内容和外部搜索结果的 content 保持原意，不全局替换。普通 model tool 的 ToolTaskResult 按 tagged union 收窄，但本次不主动启用嵌套工具或结构化程序调用。

接入 Harness 继承的 `closed`、watch 的 `session_failed` 和 `onReport`。存储致命错误后停止接受新业务请求，经 gateway onError 报告并关闭失效连接/host，使两端退出忙碌和进入明确不可用状态；关闭路径仍清理目录、压缩、图片观察资源且保持幂等。`StorageRequestError` 只在独立读取时是单次请求失败，发生于 commit 仍属于终止运行时；不沿用旧 `StorageRejected` 重试逻辑。

原生 bash 非零退出和压缩失败保持原结果/诊断。压缩活动/重试/持久失败直接取 `LiveDoc.compactions/compactionFailure`；最新任务通过公开的 task/transaction API 读取，以 `TaskId<CompactionResult>` 的类型化回执及摘要 submission 状态派生等待应用、已应用、无需、跳过和取消。删除 `CompactionDoc` 与写回型 `CompactionManager`，改为共享投影内的只读适配，不启动全会话扫描或更新镜像文档。仅在激活视图/相关提交后读取必要回执，保持真实任务/提交时间戳。原生 compact 并不保证重复手动请求去重，保留最小会话级准入保护及等待应用检查，不借删除代码丢掉此业务语义。

### D8. 输入 entry 替代暂存文档与文本反向解析

使用自定义 kind `app.neko.input` 和明确 JSON data 类型，通过 `submit({ type: "input", content, entry: { kind, data }, ... })` 同次提交输入及接收时间、首问预览、附件元数据（实际 contentIndex）、技能展示数据。queued 阶段元数据从 `InboxDoc` item.entry 取得，placed 后从真实输入 entry 取得；不能假设 submission record 自身带有 content/data。重复 requestId 以原有提交为准，不覆盖已接受元数据；失败/撤回不留下游离数据。

删除 `ImageMetadataDoc`、`trackImageMetadata`、pending/hash 索引与提交失败补偿；需要的 ImageInfo 类型/纯工具函数可保留为薄模块。`SessionMetadataDoc` 仅保存应用目录摘要、标题和必要用量，不保留提交前 `requests` 暂存或 prepare/discard 恢复修补。关联与目录摘要只由已提交 input/inbox/receipt 推导，标题/压缩不污染最近消息时间。

技能展开从同次 SKILL.md 读取产生模型 `<skill>` 文本及 `{ name, location, body, args }` 展示数据，两端直接渲染投影的 skill 字段，删除 XML 解析器与兼容兜底。手工输入 `<skill>`、未知技能或没有结构化元数据的普通输入按原文显示。模型文本及资源快照的 placement 时机不改变；准备/活动资源快照仍需隔离，不能因为新 entry 可持久化而提前激活 queued 输入。

### D9. 用 durable 任务替代后台命名调度

现有命名请求不进入聊天记录，迁为 registry 注册的 `app.neko.name` conversation-owned background 任务；观察到首轮成功回执后，在同次 commit 中检查资格、创建任务并记录命名任务标识，防止重复任务；重开时只补建尚未登记的合格任务。使用原生 checkpoint、`runtime.sleep()`、任务取消/关闭及恢复代替手写 timer、active/jobs 集合和 `running → pending` 重启修补。模型请求仍遵循独立关闭思考、同模型、有界首问/回答、最多两次尝试、超时、并发上限和标题/用量规则；有限尝试的进度在请求前持久记录，重启不能重新获得预算。可保留一个最小并发限制器，不重建完整 scheduler。

命名任务需重启恢复，不设置 `abandonOnRestart`，也不把前端 attachment 生命周期当作所有者。归档/关闭需要停止命名时走原生任务取消，而非维护独立 AbortController 集合；子任务若确有需要才使用 1.2 的 ownedTasks/abortOwned。本迁移使用已有原生任务模型，受益于 1.2 的所有权、失败和缓存边界；不把 defineTask/sleep 宣称为 1.2 新增 API。

### D10. 新特性审计与采用边界

| 发布能力 | 本次取舍与减少的应用代码 |
| --- | --- |
| Chord host/handle、可选 Ctx、schema、资源/state 生命周期 | 采用；删除旧绑定、逐方法转发、重复契约、thenable 防御和重复订阅管理，保留必要业务准入与首值等待。 |
| durable input.entry、read/images、output/details/diagnostics | 采用；删除独立图片工具、元数据文档/暂存/hash、展示 XML 解析；结构化工具输出正确透传，不另启用程序执行工具。 |
| closed/session_failed、compactionFailure、documentRetentionMs | 采用；原生失败通知、只读压缩状态、观察释放与默认缓存回收，删除自建失败/恢复镜像和无界闲置会话缓存。 |
| abandonOnRestart、ownedTasks/abortOwned | 按所有权使用；有重启恢复义务的输入、压缩、命名不 abandon，不为使用新 API 凭空增加子任务。 |
| ExecutionEnv.listFiles / pi-env LocalExecutionEnv | 采用；共享本地辅助进程及有界缓存替代 fd 探测/执行/解析/安装提示。SDK 只枚举，应用负责匹配、刷新、越界检查与不完整状态，具体边界见 D11。 |
| codemode、nested tools、tool-search/deferred/callers | 已核对 durable 子路径与 pi-codemode 包；当前工具规模没有收益依据，启用会新增执行/沙箱和产品行为，本次不增加入口。现有工具用 tagged union 正确收窄。 |
| pi-ai 模型刷新/baseUrl 与 provider 修复 | provider 直接交给 SDK，保留 RefreshModelsContext.baseUrl，不复制 catalog、成本钳制或重试修复。当前未内置 OpenRouter，不增加凭据/设置产品；DeepSeek 选项按发布 catalog 验收。 |
| pi-tui 光标、按键和 overlay 滚轮 | 沿用新版 Editor/Input、matchesKey 和原生事件路由；适配 APC 光标标记/宽度断言，删除发现的旧补丁，保留应用排版与选择业务。 |

验收同时检查功能与结构：旧 SDK API 无运行时引用；不增加以旧 API 名义包装新实现的兼容层；以上重复实现确实删除。保留的每个适配层应能说明其应用职责。追求职责与代码减少，不承诺净行数（Unix Link 和严格 schema 可能增加必要代码）。

### D11. pi-env 本地文件发现与有界候选缓存

core 管理一个宿主级 `Connection({ command: [localDaemon()] })`，多个工作区 LocalExecutionEnv 共享，不按会话/查询启动进程，不开启 TCP 监听或注册系统服务。按需启动，runtime close/致命失败时幂等关闭。普通读写、bash 与既有 shellEnv 仍采用 LocalExecutionEnv 继承的 Node 行为；一个目录枚举失败不终止 durable 存储运行时。辅助进程丢失时采用 SDK 后续请求重连语义，当前请求失败，不重放变更操作。

保持 pi-env 为发布包外部依赖，让 `localDaemon()` 在上游 packageRoot/bin 布局中解析本机二进制；不把 ssh.ts 连同 import.meta.url 打入 neko 单文件，不另抄二进制查找逻辑。支持平台安装无需 fd、Rust 或网络下载 daemon。启动/首次 hello 单独设 5 秒截止；取消一个等待者只退出该请求，不关闭其他查询共享的启动。启动截止后由资源所有者关闭并丢弃失败 Connection，下次查询创建新连接及对应环境，不复用永久 closed 实例。已启动的扫描限制 2 秒；调用取消与 helper 故障分开反馈。

缓存是 gateway/runtime 内存资源，不写 SQLite、不按前端复制，不广播整个路径索引。key 为环境文件命名空间 id、规范化工作区根、规范化查询子目录和忽略策略版本，不含 needle。每 key 使用 listFiles 列出的相对路径/类型及 truncated 标志，同 key 并发扫描合并；每次输入只在有效快照中按 basename 做原有字符顺序模糊匹配与 smart-case，目录优先排序，最多返回 100 个候选。空 needle 仅显示当前子目录的直接子项；SDK 没有 maxDepth/query/cursor，不伪造这些参数，也不以 maxEntries=101 当作匹配数量上限。

初始上限集中定义：每扫描 50,000 entries、4 MiB 路径 payload、2 秒；全宿主最多 8 个目录 key（含正在扫描/排队/观察的 key）、200,000 entries、32 MiB 序列化索引数据，超过任一缓存上限 LRU 逐出；同时最多 2 个扫描，排队也受 key 上限约束，不能淘汰正在使用的 key 时返回可重试的繁忙错误，不建立无界等待队列。实际 JS 堆开销需在性能验证中记录。5 分钟未查询的缓存与关联 watcher 回收。文件观察先建立再加载快照，防止加载窗口漏变化；watch 事件（含 .gitignore/.git/info/exclude）合并使相关 key 失效，不在每个事件上立即扫描，后续查询按需重建。每快照最长 30 秒有效期，覆盖全局 Git ignore/观察失败等未捕获变化；观察 overflow、目录删除或 Connection 重新建立使相关缓存立即失效。LocalExecutionEnv.watch 沿用 Node 实现，不另启用 RemoteWatcher；建立失败时使用 TTL 刷新，不能把不可靠观察当作永久有效缓存。

扫描开始记录缓存 generation；变化、逐出、工作区移除或 runtime close 后迟到结果不能重置有效期或写回新 generation。查询取消按等待者隔离，仍有其他等待者时不取消共享扫描，最后等待者离开或资源释放时取消底层操作；记录中的取消/失败结果不作为成功快照缓存。返回前保留工作区 realpath/canonicalPath 边界校验，不因索引未跟随 symlink 而删除防越界验证。

沿用原生 Git ignore 行为：包含合法隐藏项，排除 .git，尊重工作树中的父级/子级 .gitignore、info/exclude 与全局 Git excludes；非 Git 目录不应用 .gitignore，不读取 .ignore/.fdignore/fd 全局配置，不默认额外排除 node_modules。删除 fd/fdfind PATH 探测、spawn 参数、NUL 输出解析、MissingFileSearchDependencyError、file-search-help 和安装说明。

FileCandidates 改为明确区分 `limited`（匹配候选超过 100）和 `incomplete`（SDK 枚举截断，含时间/条数/字节限制）。枚举不完整时，即使匹配为零也提示“范围过大，结果不完整，请指定子目录”，不能显示普通无匹配；指定子目录建立独立 key，可找到根索引截断之后的文件。TUI 使用英语、Web 使用中文，失败给可重试反馈，普通消息/草稿保持可用，旧请求不得恢复已关闭候选面板。

替代方案包括继续调用 fd、每次键入直接全树枚举、保留双后端或自建 Rust 搜索协议。用户已接受为缓存/刷新增加代码，选择单一 SDK 后端以消除安装依赖与长期双实现维护；大仓库的冷扫描、热点查询、变更刷新、缓存内存和 helper 重启仍必须实际测量，不能提前宣称比 fd 更快。

## Risks / Trade-offs

- [连接状态与持久任务生命周期不同] → 分离调用取消和已准入任务，真实双端测试覆盖断连期间提交、切换和资源清理。
- [契约 schema 严格校验暴露旧对象中的 undefined/类型漂移] → 单一共享契约、显式 null/可选字段，覆盖无效参数及发布后浏览器构建。
- [Unix Link 新增解析与缓冲代码] → 仅适配帧，测试半帧/粘包、非法长度、UTF-8、FIFO、缓冲超限、关闭一次与活跃/stale socket。
- [原生图片 worker/WASM 在 Bun 或发布包中解析失败] → 测试真实生产包中的 read 转换/缩放及 worker路径，依赖外置保留上游安装布局；仅使用上游已有 worker fallback，不复制 Photon 运行时。
- [图片元数据 hook 与原生 output 位置不同] → 测试 index 0、转换后尺寸、源文件删除、fork 和 1.2 重启后预览。
- [新输入 kind 与展示元数据改变内部数据源] → 覆盖原先硬编码 pi.user 的投影/目录逻辑，验证 queued inbox、真实 entry、幂等及 placement 快照边界，不保留旧数据解析分支。
- [后台命名任务恢复增加重复请求风险] → 原子登记任务、请求前记录尝试预算、有限并发，验证首轮回执到任务创建间崩溃、任务重启和 fork 不复制任务。
- [全树枚举截断或 watcher 丢失造成假无匹配] → 分离 incomplete/limited，子目录独立枚举、generation 防迟到写回、30 秒 TTL 兜底及 bounded LRU，覆盖忽略变化、overflow 和大目录测试。
- [辅助进程/发布布局增加运行时成本] → 共享按需 Connection、启动截止和关闭清理，发布包保持外部依赖布局，在无 fd 的真实安装及各平台验证 helper 解析/启动/重启。
- [旧测试数据被丢弃] → 仅在实施阶段停掉使用目标存储的网关后清理确认的旧会话数据库及其 WAL/SHM；不得清空整个 ~/.neko 或删除凭据/配置/技能。

## Migration Plan

1. 完成本变更工件审阅，再进入 apply；规划阶段不更改依赖或删除数据。
2. 用临时目录中的新 1.2 存储完成升级、连接层替换和功能验证。旧数据库兼容不作为验收项，不写自动启动删库逻辑。
3. 实施时解析实际启用的 storagePath（配置/CLI 可覆盖默认值），停止占用它的测试网关；定向删除用户已授权的旧测试会话 SQLite/WAL/SHM。进程退出后处理仅属于该测试实例的残留 socket/port，保留 serverId、凭据、配置和技能。不扫描并批量删除其他数据库。
4. 验证 `check`、`test`、`build`，以及 `build:release`/`test:package` 的实际安装与无 Key 启动；补充生产安装下的图片 read 和无 fd 的 pi-env 文件补全/刷新/关闭测试。记录当前平台覆盖，Windows 分支在相应 runner 验证，不能用 POSIX 结果代替。
5. README/AGENTS.md 更新当前版本和 API 要点。主规格由后续 sync/archive 更新，不改历史归档或 reference。
6. 若实施回退，恢复依赖/代码和对应 lockfile，使用新的 1.1 测试存储；不尝试打开 1.2 数据或恢复已授权删除的测试数据。本变更不包含发布或提交。
