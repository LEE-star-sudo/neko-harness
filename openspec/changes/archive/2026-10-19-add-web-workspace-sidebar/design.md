# Design

## Context

见 proposal.md「Why」。现状（均已核对源码）：

- `WorkspaceFiles`（core）已提供：一个本地 pi-env 连接、按工作区缓存的**平铺枚举**（`listFiles`，gitignore、含隐藏文件、不列 `.git`、符号链接不跟随、50k 条/4MiB/2s 上限）、工作区与 `.git` 的 watcher（变化时缓存失效）、`workspaceTarget`/`relativeQuery`（相对路径 + realpath 越界防护）。目前只经 `NekoWorkspaceFiles.search` 服务 @ 补全，结果上限 100，且只接受已登记工作区。
- 工具项里已有展示型 diff：`edit` 的上游 `details.diff`，`write` 由参数合成（有行数/字节上限）。路径在 `pi.assistant` 条目里的 `toolCall` 参数中，结果在 `pi.tool-result` 条目中，两者按 `toolCallId` 配对（`projection.ts` 已按此投影）。
- 子 agent 是独立 conversation，父会话 `SubagentsDoc` 记录其 `childId`；它们的 edit/write 不在主 transcript 里。
- Web 已有两个右侧面板（子 agent、后台任务），由 `chat-page.tsx` 管理开合；窄屏有抽屉逻辑；`highlight.ts` 仅注册 8 种语言；`diff-highlight.ts` 已能渲染两层着色 diff。
- 网关新能力一律走「可选扩展」（jobs、queue、todos/questions 的先例）：`ChatView` 增可选字段，缺省 = 旧网关；不提升 `APPLICATION_PROTOCOL`。

## Goals / Non-Goals

**Goals:**
- 一个只读、安全、有界的工作区查看入口，与现有枚举/路径防护复用，不引入新依赖。
- 「本次改动」不受聊天历史分页影响，覆盖子 agent，随回溯/分叉一致。
- 前端三块（树、查看器、改动）彼此独立降级，任何失败不影响聊天主流程。

**Non-Goals:**
- 不覆盖 bash/命令造成的改动，不做 git 视图或快照对比（改动范围明确声明为「agent 的 edit/write」）。
- 不做编辑、全文搜索、图片/二进制预览、Markdown 渲染预览、TUI 与手机端。
- 不为文件内容做服务端推送/订阅；刷新靠 revision、手动刷新与重新展开。

## Decisions

### D1：接口挂在会话上（`NekoChat`），不挂在 `NekoWorkspaceFiles`
工作区根由服务端按会话 cwd 决定（`savedWorkspace(agent.cwd)`），客户端只传相对路径。
- 否决：沿用 `NekoWorkspaceFiles` 并让客户端传 `workspaceRoot`。虽已校验必须是已登记工作区，但「改动」本来就是会话级数据，且会话 cwd 可能不同于登记根；会话级接口避免客户端选根这一类误用。
- 方法（均为 `NekoChat` 的可选扩展，命名以实现为准）：`workspaceDir({ path })`、`workspaceFile({ path })`、`changesList()`、`changeGet({ path })`。

### D2：文件树复用平铺枚举缓存，不用逐目录 `listDir`
`workspaceDir` 从该工作区的缓存枚举中取「某前缀的直接子项」（目录推导自路径前缀），目录在前、按名称排序，单目录上限（如 1000）。
- 好处：天然继承 gitignore 与「不列 `.git`」语义、watcher 失效、并发与总量上限，不增加连接。
- 代价：超大仓库（>50k 条）枚举截断，树显示「不完整」；与 @ 补全一致。
- 否决：`env.listDir` 逐目录读取——不带 gitignore，会让 `node_modules`、构建产物出现在树里，需自己再实现忽略规则。

### D3：文件读取走受限 `workspaceFile`
流程：`relativeQuery` → `workspaceTarget`（realpath + 越界检查，符号链接指向外部即拒绝）→ 凭据模式检查 → `fileInfo` → 读取至多 N 字节（初定 512 KiB）→ 前 8KB 含 NUL 视为二进制 → UTF-8 严格解码失败视为不可预览。返回 `{ content?, size, truncated, binary, protected? }`。
- 凭据模式固定且小：`.env`、`.env.*`（`.example`/`.sample`/`.template` 后缀除外）、`*.pem`、`*.key`、`id_rsa*`/`id_ed25519*`（非 `.pub`）。**这是为本变更补的假设**：agent 本身能读这些文件，但 Web 链路可能被 `--host` 暴露到非本机，浏览入口不应成为凭据泄露的新通道。命中只在树中可见、内容不下发。
- 截断按字节切，注意不切在 UTF-8 多字节中间。

### D4：改动来自会话条目的派生，不新增持久化文档
`ChangeTracker`（core）从条目重建：遍历 `pi.assistant` 的 `edit`/`write` toolCall（取 `path`、参数）与对应 `pi.tool-result`（`isError` 为假才计入；edit 取 `details.diff`，write 合成整文件新增 diff），按 `toolCallId` 配对，再并入各子 agent 会话（`SubagentsDoc.items[].childId`）。
- 缓存键为会话，值带「已处理到的条目 id」，只在被查询时增量扫描；revision 取成功 edit/write 的累计数（条目只追加，所以改动变化时它必然变化，进程重启后也一致）。网关会话宿主在投影时附加 `ChatView.changes`，并在子 agent 的 `pi.tool-result` 提交时重算投影，使子 agent 的改动也实时出现。
- 为什么不存文档：条目是唯一真相，分叉/归档自动一致；新文档需要同步分叉语义，易漂移。
- 为什么不从前端 `view.items` 汇总：被分页，且无子 agent。
- 路径归一：相对工作区、`/` 分隔；绝对路径落在工作区内则转相对，否则标记 `outside`。
- 上限：文件数（如 500）、每文件操作数（如 50）、diff 总字节（如 2 MiB），超出置 `truncated`，不静默丢弃。
- 数据模型：`changesList → { revision, files: [{ path, outside?, ops, added, removed, agents: string[], lastSeq }], truncated }`；`changeGet(path) → { ops: [{ seq, agent, tool: "edit"|"write", diff, added, removed, truncated }] }`。

### D5：`ChatView.changes` 只携带小摘要
`changes?: { revision, files, added, removed }`。大列表按需 `changesList` 拉取，避免每次投影携带全部 diff。revision 由 `ChangeTracker` 在覆盖范围内任一会话的相关条目提交时递增。
- 否决：把完整列表放进 `ChatView`——每次提交都会重发，聊天路径被拖慢。

### D6：Web 结构
- 新增 `workspace-panel.tsx`（标签 + 容器）、`file-tree.tsx`、`file-viewer.tsx`、`changes-list.tsx`、`change-detail.tsx`；与 `SubagentPanel`/`JobPanel` 同层挂在 `chat-page.tsx`，用一个「右侧位置当前持有者」状态保证互斥（现有 `jobsOpenFor` / `panels` 的收起逻辑并入同一规则）。
- 查看器：复用 `highlight.ts`，并按需补注册少量语言（css、xml/html、go、rust、java、sql、ini/toml、c/cpp）；行号用 CSS 计数器或表格列，长行容器内横向滚动。改动 diff 复用 `diff-highlight.ts`。
- 加载一律带 `AbortSignal`，会话切换/栏关闭时取消并丢弃过期结果；错误就地显示 + 重试。
- 状态按会话保存（标签、展开目录集合、当前文件），切会话重置，沿用 `jobsOpenFor` 的「绑定会话」模式。
- 桌面宽度可拖拽调整（带最小/最大值并存本地偏好），窄屏沿用 `max-width: 1023px` 抽屉逻辑。

### D7：可选扩展与能力探测
`client-session.ts` 增加类似 `queueClient`/`jobsClient` 的 `workspaceClient`（带 `WORKSPACE_UNSUPPORTED`）；`ChatView.changes` 缺省 = 旧网关，Web 据此隐藏入口。不改 `APPLICATION_PROTOCOL`，不动移动端 API。

## Risks / Trade-offs

- [bash 造成的改动不显示，用户误以为「没改」] → UI 空状态与列表底部固定说明范围；规格明确不声称等同磁盘/git 差异；git 视图留作后续变更。
- [write 覆盖已有文件时 diff 是「整文件新增」] → 标注 `write`，不假装是差异；「查看当前内容」兜底。
- [大会话重建改动索引耗时] → 仅在被查询时重建并缓存，增量处理新条目；上限保护；不在聊天投影热路径上做。
- [枚举上限 50k 使大仓库文件树不完整] → 明示「不完整」；后续如需可单独引入逐目录读取。
- [凭据模式不全] → 固定小集合加文档说明；本入口只读且默认本机；超出集合的敏感文件视为与 agent read 工具同级暴露。
- [右侧位置互斥改动已有面板的开合逻辑] → 把现有规则收敛为单一状态并补回归测试，保持既有场景（首次委派自动展开、用户关闭后不再弹出）。
- [路径防护] → 目录与文件接口共用 `relativeQuery` + `workspaceTarget`，单元测试覆盖 `..`、绝对路径、符号链接逃逸、控制字符、反斜杠。
