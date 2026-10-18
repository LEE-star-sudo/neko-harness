# Tasks

## 1. core：安全的目录子项与文件读取

- [x] 1.1 在 `WorkspaceFiles` 增加「基于既有枚举缓存的直接子项查询」（目录在前、名称排序、单目录上限、截断标记），验证：新增单元测试覆盖忽略规则、`.git` 不出现、符号链接标记、子项过多与枚举截断
- [x] 1.2 增加受限文件读取（`relativeQuery` + `workspaceTarget` + 凭据模式拒绝 + 字节上限 + 二进制/解码失败判定，截断不切断 UTF-8 字符），验证：单元测试覆盖 `..`、绝对路径、控制字符、反斜杠、符号链接逃逸、`.env`/`.env.example`/私钥、大文件、二进制、文件消失
- [x] 1.3 经 runtime 暴露会话级 `workspaceDir`/`workspaceFile`（工作区取自会话 cwd），验证：测试证明请求落在会话工作区而非进程 cwd，且请求可取消

## 2. core：会话改动跟踪

- [x] 2.1 新增 `ChangeTracker`：从 `pi.assistant` 的 edit/write toolCall 与 `pi.tool-result` 配对派生，排除失败调用，路径归一（工作区内相对化、`outside` 标记），带文件数/操作数/字节上限，验证：单元测试覆盖多次 edit、失败排除、write 合成 diff、工作区外路径、超限截断
- [x] 2.2 并入子 agent 会话的改动并标注执行者，惰性、增量地从条目重建；revision 取自成功 edit/write 的累计数，因此无需监听提交也随改动变化，验证：测试覆盖子 agent 改动、重启后重建、分叉后与可见条目一致、会话间互不串扰
- [x] 2.3 经 runtime 暴露 `changesList`/`changeGet`，并由网关会话宿主在 `ChatView` 上附加可选 `changes` 摘要（缺省 = 旧网关，空摘要 = 无改动；摘要需要跟踪器，故不放进纯函数 `projectChatView`），验证：`file-changes` 测试与 `bun run test` 中 core 相关用例通过

## 3. gateway：接口与兼容

- [x] 3.1 `contract.ts` 新增 schema 与 `NekoChat` 可选方法（目录、文件、改动列表、改动详情）及 `ChatView.changes`，`session-host.ts` 实现，验证：契约/类型检查通过，应用协议版本未改变
- [x] 3.2 `client-session.ts` 增加 `workspaceClient` 与 `WORKSPACE_UNSUPPORTED` 探测（沿用 jobs/queue 模式），验证：对旧网关返回不支持而非抛错的测试通过
- [x] 3.3 网关端到端测试：真实 runtime 下 agent 执行 edit/write（含子 agent）后列表与 revision 变化，越界与凭据请求被拒，验证：新增 e2e 用例通过
- [x] 3.4 更新 AGENTS.md 中与此相关的约定（工作区浏览与改动范围说明），验证：文档与实际接口名称一致

## 4. Web：右侧工作区栏

- [x] 4.1 右侧位置持有者状态：把子 agent 面板、后台任务面板与新栏收敛为互斥规则（工作区栏打开时首次委派不抢占），验证：保持既有子 agent/任务面板测试通过，并新增互斥与委派不抢占测试
- [x] 4.2 `workspace-panel`（标签、按会话保存状态、顶栏入口与改动数、旧网关隐藏、窄屏抽屉、桌面宽度可调），验证：组件测试覆盖开合保留状态、不自动打开、旧网关隐藏、草稿与附件不受影响
- [x] 4.3 文件树（懒加载、不完整提示、键盘导航、刷新、请求取消、错误重试），验证：组件测试覆盖展开/收起、键盘操作、切会话取消、失败重试
- [x] 4.4 文件查看器（行号、语法高亮、补注册常见语言、截断/二进制/受保护/不存在状态、手动刷新、长行容器内滚动），验证：测试覆盖各状态；`bun run build` 后检查 bundle 增量可接受
- [x] 4.5 改动列表与详情（实时更新、空状态说明范围、逐次 diff 复用既有着色、write 标注、工作区外标注、「查看当前内容」跳转），验证：组件测试覆盖实时刷新、多次改动顺序、write 表述、跳转到查看器
- [x] 4.6 响应式与可访问性检查（375/768/1440/1920 宽度无横向溢出、焦点返回顶栏入口），验证：布局测试通过，并用浏览器截图人工核对 375 与 1440 两档

## 5. 整体验证

- [x] 5.1 `bun run build`、`bun run test`、根与 Web 客户端类型检查通过；`bun run check` 中本变更文件无新增错误（既有 TUI 文件的 biome 错误除外）
- [x] 5.2 本地启动 `bun run neko web`，让 agent 实际 edit/write 若干文件并委派一个 coder 子 agent，确认文件树、查看器、改动列表与 diff 表现符合规格，并记录结果
