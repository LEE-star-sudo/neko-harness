# Tasks

归档决定（2026-10-13）：用户明确要求归档并提交，Windows 验证延后至发版后。当前完成 36/38 项；8.4 和 9.2 的 Windows 平台部分保留未完成，不以 macOS/Linux 或用户终端验收替代。发版后的具体检查见 `.github/RELEASING.md`。

## 1. 发布 SDK 与依赖图

- [x] 1.1 将根与各 workspace 实际使用的 chord、pi-ai、pi-durable、pi-tui 精确升级至 1.2.0，core/根新增 pi-env 1.2.0，移除三个旧通信包，补齐 gateway 直接依赖与 typebox 1.3.27；更新 bun.lock，验证 bun install --frozen-lockfile 成功、安装图无旧包/1.1 SDK 且包含本机 pi-env 二进制。
- [x] 1.2 依据已安装 1.2.0 类型更新 README/AGENTS.md 的版本和 SDK 使用要点，区分消息 content 与工具 output、Ctx 与 Context；验证文档不再把旧 API 描述为当前行为，历史归档和 reference 无修改。

## 2. Core 结果与失败生命周期

- [x] 2.1 适配 web-search 等自定义工具、示例与测试的 output 返回值及必要 tagged union 收窄；运行 core 的 web-search、usage、reload 与 prompt 测试，确认工具文本、失败输出及用量未丢失，消息 content 未被误改。
- [x] 2.2 接入 Harness.closed、session_failed 和 onReport，完善 runtime 幂等清理与宿主失败通知；添加故障存储测试，覆盖读取失败、commit 失败、等待拒绝、后续调用拒绝及独立读取 StorageRequestError 的非致命路径。
- [x] 2.3 保持原生 bash 非零退出与压缩失败信息，以 LiveDoc、类型化 CompactionResult 和摘要 submission 回执派生只读压缩状态，删除 CompactionDoc/写回型 CompactionManager，保留最小准入去重；用 faux provider/故障环境测试验证等待应用、跳过、无需、取消、重启后失败可见、重复触发不增任务，以及压缩不更新标题/最近消息时间。
- [x] 2.4 将现有后台命名迁为 conversation-owned durable background 任务，以 checkpoint/runtime.sleep 和原生取消/恢复删除 timer、active/jobs 与重启修补；运行命名测试，覆盖同模型关闭思考、两次尝试预算（跨重启）、超时与并发上限、幂等任务创建、全部前端断开/归档/fork 和用量，确认命名任务不 abandonOnRestart 且不改变主对话结果。
- [x] 2.5 复核 pi-ai provider 直接委托与模型刷新上下文，移除遇到的重复能力/重试补丁，保留自定义 baseUrl；运行模型/provider 测试验证 DeepSeek 发布能力和既有凭据路径，不新增 OpenRouter 产品入口。

## 3. 统一 read 图片入口

- [x] 3.1 使用 createCodingTools({ images }) 和上游 createNodePhotonImages，移除 read-image.ts、ImageTools 注册和旧提示词；更新图片/提示词测试，验证工具列表无 read_image，read 的文字分页、各会话工作区和绝对路径行为保持正确。
- [x] 3.2 增加 afterTool 图片元数据到命名空间化 details，读取实际 output/contentIndex，不改写或二次缩放图片，保留上游 details/diagnostics/structuredOutput；测试 index 0、转换/缩放后尺寸及字节数、持久 ToolResultMessage.details 和源文件删除后的结果，不依赖未持久化的 structuredOutput 恢复。
- [x] 3.3 更新图片投影与结构化诊断提取，保留附件严格校验；运行 core 图片测试，覆盖 read 非视觉占位符、解码失败/处理超限、附件非视觉准入拒绝、重启/fork 元数据一致和无重复 harness 诊断。
- [x] 3.4 用 app.neko.input 的 input.entry.data 原子提交附件、接收时间、首问与技能展示数据，更新 queued InboxDoc/placed entry 读取及 pi.user 假设；删除 ImageMetadataDoc、trackImageMetadata、hash/pending 与 SessionMetadata prepare/discard/requests 暂存。运行输入/图片/命名/资源快照测试，覆盖失败无游离数据、重复 requestId 不覆盖、排队/撤回/重启/fork 和 placement 才激活资源。
- [x] 3.5 技能展开同次产出模型 XML 与结构化展示元数据，扩展 ChatItem/schema 的 skill 字段并删除 XML 展示解析器；运行 skill-invocation 与投影测试，覆盖同次文件读取、参数/正文含 XML、未知/混合输入原样保留和持久恢复。

## 4. 共享 Chord 契约

- [x] 4.1 用 remote/method 和具体 schema 重建 neko 服务契约，定义 attachment 描述、Chat 输入与 null/可选字段规则，添加浏览器安全的 gateway/contract 导出并去除 Web 契约副本；用契约测试和 Web 类型检查验证 schema 推导、类型一致与无 Node/runtime 导入。
- [x] 4.2 用新 Chord 错误替换 RemoteServiceError/ServerError，保留技能市场、缺少凭据与文件查询的业务标识；添加远程边界测试，验证非法参数在副作用前拒绝、有效请求可继续、返回/状态受校验且 Key 不出现在响应或错误中。

## 5. Chord Link 与网关监听

- [x] 5.1 将 Node/浏览器 WebSocket 切换到 webSocketLink，删除旧 ByteTransport/CBOR；加入有界帧和待发送缓冲以及原生 hello 身份检查，测试开放前发送、serverId 不匹配、非法消息、慢客户端、关闭与长文字快照。
- [x] 5.2 实现仅承载 Chord Frame 的 Unix Link/listener/client，加入长度前缀、16 MiB 帧/队列上限和错误清理；测试分包/粘包、UTF-8、FIFO、长度超限、无效 JSON、缓冲超限及 close/onClose 只结算一次。
- [x] 5.3 替换旧 Server 与 isServerId 接入，保留配置优先级、POSIX 活跃/stale socket、Windows 随机 WS 端口和 port 文件；更新 startup/disconnect/port-file 测试并验证无 Key 可启动，README 启动/发现说明与行为一致。

## 6. 服务端共享状态与 attachment

- [x] 6.1 用单 host 的 self.state/resources/listen/derive 托管共享状态，以公开 viewState/documentState/watchDoc 观察 durable，删除重复订阅集合/闲置投影缓存并释放资源；更新目录、工作区、凭据和技能市场测试，验证实时广播、两连接同一投影、最后观察释放但后台运行继续，不导入 conversationViews 等内部 API。
- [x] 6.2 重建共享会话投影、按 principal 隔离的 Chat 与幂等 attachment 管理；更新 attach/model-switching 测试，验证相同连接重复 attach 标识稳定、两个连接共享同一投影、旧/归档/其他连接的 attachment 操作被拒绝。
- [x] 6.3 保留独立 ImageUploads 和按需分块图片读取，将查询/读取 Ctx.signal 桥接到 durable Context；更新 images/workspace-files/disconnect 测试，覆盖上传跨连接拒绝、取消查询、断连后未用上传清理和已准入回答持续运行。
- [x] 6.4 将 core 的致命关闭反馈接到 gateway 错误和不可用状态，清理 host/监听/观察资源；通过故障存储的 gateway 测试验证两端退出忙碌、后续操作失败且关闭无未处理拒绝。
- [x] 6.5 用共享、按需启动的 pi-env Connection/LocalExecutionEnv 替代 core Node 环境实例与 fd 文件发现后端；移除 findFd、MissingFileSearchDependencyError、file-search-help 及 fd 依赖测试，保留 shellEnv/越界校验；测试无 fd PATH、多个工作区共享 helper、启动 5 秒截止、失败 Connection 替换、取消等待者隔离、helper 丢失后重试及 runtime close 不留进程，普通聊天不因枚举失败停止。
- [x] 6.6 实现按规范根/子目录隔离的候选缓存、同 key 扫描合并、模糊匹配/smart-case/空查询一层及独立 limited/incomplete；加入 D11 扫描并发/排队与全局 LRU/空闲上限。测试 basename 匹配、Git/非 Git 忽略规则、隐藏项、无 fd 专用规则、根截断后子目录可找到目标、零匹配截断不冒充完整结果、多客户端、过载与容量淘汰；更新 FileCandidates 与共享契约具体 schema。
- [x] 6.7 用原生 env.watch 建立后加载缓存，事件失效、30 秒 TTL 兜底和 generation 防迟到写回；测试创建/删除/重命名、.gitignore/info/exclude/全局忽略变化、观察失败/overflow、扫描期间变更、逐出/移除/关闭及查询取消，验证等待者取消不破坏共同扫描、最后等待者离开回收，观察和缓存不会无界保留。
- [x] 6.8 更新 README/AGENTS.md 的随包文件发现、原生 Git 忽略语义和候选缓存说明，删除 fd 安装要求；用实际仓库及超过单次索引上限的可控目录测量冷扫描、热点匹配、刷新、截断、LRU/空闲回收及内存，记录结果与采用的上限，验证不对每个按键重新枚举，明确不承诺比 fd 更快。

## 7. 客户端与终端

- [x] 7.1 connectNekoGateway 返回原生契约 handles，仅保留连接/attachment/首快照编排，删除逐方法门面、旧 Client 形状和 thenable 防御，迁移调用点的旧 Context；测试 async 返回 handle、缺省 Ctx 自动 root、显式 root 取消、快照迟到、超时、幂等 detach/close 和旧 attachment 拒绝。
- [x] 7.2 适配 TUI 原生 handle 调用、read 卡片/diagnostics 及结构化技能展示；运行 TUI 测试，在实际终端验证图片或文字回退、技能行/参数、手工 XML 原样显示、输入/状态栏持续可见和切换不串会话。
- [x] 7.3 沿用 Pi 1.2 Editor/Input、matchesKey 和 overlay 滚轮路由，适配 APC 光标标记/文字宽度断言，删除遇到的旧补丁；运行 editor/layout/login/picker 测试，检查软/硬光标、shift 符号键及 overlay 滚轮，验证无双光标/标记泄露，弹层滚轮不误滚底层历史。
- [x] 7.4 更新 TUI @ 候选的 incomplete/limited/故障英文反馈，删除 fd 安装提示；运行补全测试及实际终端检查，覆盖无 fd、截断零匹配、重试、Esc/Enter/Tab、不阻塞普通消息、小窗口/图片及切换后迟到反馈不重开面板。

## 8. Web 连接、展示与生产打包

- [x] 8.1 Web GatewayConnection 使用原生 host/handle 状态及调用，移除旧 Context/手写转发，保留 epoch/viewEpoch、有序导航和重连回退；更新 connection/workspaces 测试，验证首个状态未到达不就绪、迟到响应不覆盖新连接、取消和归档后仅在原工作区回退。
- [x] 8.2 适配共享契约、read 图片预览/diagnostics 和结构化技能卡片；运行 Web 类型检查/相关测试，浏览器验证目录、模型/思考设置、read 图预览、源文件删除后重连、失败/能力诊断、技能折叠/正文/参数和手工 XML，保留键盘/触屏操作。
- [x] 8.3 更新 Web @ 候选的加载、完整无匹配、limited/incomplete 和可重试故障反馈，删除平台 fd 安装引导；类型检查和面板测试覆盖截断零匹配、指定子目录恢复、helper 故障/重试、草稿保留及取消/工作区切换，浏览器验证键盘与触屏可操作。
- [ ] 8.4 发布构建保持 pi-env 外部依赖及 packageRoot/bin 布局，补齐生产包测试并更新安装说明；真实临时安装下在无 fd 的 PATH 中验证 localDaemon 解析/可执行权限、首次查询/缓存刷新/关闭清理，不使用开发 reference 二进制、Cargo 或安装后网络下载；记录各支持平台的对应运行结果。

## 9. 集成、测试数据与生产安装

- [x] 9.1 在新的 1.2 临时 SQLite 存储中验证重启恢复、重复 requestId、replay-safe/unsafe 工具、fork、steer/follow-up、扩展热替换、用量和资源快照；运行 core 与 gateway 对应测试，不添加 1.1 迁移或旧工具恢复用例。
- [ ] 9.2 用真实 Unix/WS 客户端与浏览器联调双端输入、流式输出、模型配置、图片上传/预览、文件候选并发/变化刷新、会话切换和断连持续运行；验证无 fd、帧/缓冲有界、状态不广播 base64/全路径索引且单端取消不影响另一端，记录平台覆盖，Windows ws-only/port-file/helper 分支需对应平台结果。
- [x] 9.3 升级验证通过后，解析并记录当前测试实例实际 storagePath，停止持有该存储的网关，定向清理已授权的旧测试 SQLite/WAL/SHM 及该实例遗留 socket/port；验证新启动创建 1.2 会话，凭据、配置、serverId、技能与工作区文件均未删除，不加入启动自动删库逻辑。
- [x] 9.4 运行 bun run check、bun run test、bun run build，并运行 bun run build:release 与 bun run test:package；在生产包测试中覆盖真实 read 转换/缩放和 Photon worker/WASM 解析，验证安装后无 Key 启动与静态 Web 资源可用。
- [x] 9.5 检查最终 diff/依赖图及 D10/D11 清单，确认旧通信包/API、逐方法门面、thenable 防御、read_image、图片暂存文档/hash、XML 展示解析器、压缩镜像写回、命名自建 scheduler 和 fd 后端/安装引导均已移除；记录必要适配层职责及代码变化，主规格/历史归档/reference 无修改；运行 openspec validate upgrade-pi-sdk-1-2 --strict，记录结果，不执行 commit 或发布。

## Workflow follow-up

- 用户确认完成后，再通过 sync/archive 工作流将 delta specs 合入主规格并归档；不属于本次 proposal 或实现任务。
