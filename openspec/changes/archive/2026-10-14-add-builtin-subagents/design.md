# Design

## Context

动机见 proposal.md。当前 core/runtime.ts 安装 Pi coding tools、web search 与五节 neko-prompt；会话目录扫描所有 conversation，仅过滤归档项。gateway/session-host.ts 按会话共享投影资源，ChatView 尚无主子关联。Web MessageList 与 TUI 消息组件已经支持文字、思考、工具、图片及流式显示，但读取图片、滚动和部分操作绑定当前主会话，需要显式抽离读取目标。

依据已安装 @earendil-works/pi-durable 1.2.0 的 README、dist/harness/types.d.ts 与实现；reference/pi/packages/durable/test/examples/22-subagent-foreground.ts 提供前台模式参考，参考目录不作为未发布 API 的依据。23-subagent-background.ts 不在首版采用。Kimi/Claude 仅用于角色和交互参考：
- https://moonshotai.github.io/kimi-code/zh/customization/agents.html
- https://code.claude.com/docs/en/sub-agents

## Goals / Non-Goals

**Goals:** Pi 持有执行与恢复真相；neko 只负责角色、输入资源、展示元数据及服务投影。子 agent 可用实际工具独立完成任务；完整流程在 UI 可查而不灌入主模型上下文。

**Non-Goals:** 见 proposal.md；本变更不引入 OS 沙箱或任意 shell 的只读判定器，不改变当前工作目录不构成安全沙箱的语义，不承诺模型一定委派或固定次数委派。

## Decisions

### D1. 前台工具拥有子 conversation

新增命名扩展，使用 defineTool 定义 subagent({type: explore|plan|coder, title, task})；title 限 80 字符，task 非空且限 32 KiB，拒绝无效参数。工具描述明确角色差异和自包含输入。每次调用创建新实例，首版无 resume/send/background 参数。

遵循示例：api.commit 内先 scanConversations({ownerTaskId: api.taskId})，无则 tx.createConversation({ownership:{kind:'task',taskId:api.taskId}})，同次配置角色与持久关联；api.details 发布 conversationId/角色/标题，再经 api.conversation(child).submit(...).wait() 等待，读取 settled.answer 对应最终助手文本回传。异常、unanswered、取消、空文本分别处理；正常空文本标记无文字交付，不能编造报告。单个子任务业务失败形成工具错误结果，不主动抛成全局运行时致命错误。

委派工具 replay:safe 仅因子会话查找和 requestId（由委派 taskId 派生）幂等；子任务工具保留各自 replay 策略。重启不会把不安全 bash 改成安全。不要另起 Harness/进程，不用后台 anchor/reporter 或把结果当新用户消息回注。

### D2. 角色工具集合与五节提示词

子会话继承派发时 agent 配置，明确选择角色允许的工具和扩展，并移除 subagent 扩展。explore/plan 允许 read、find_files、search_text 及现有 web_search/web_extract；coder 保留编码工具与查询工具。使用 tools 实际集合限制，不只使用 modelTools；禁用递归和未知角色在执行端再次验证。采用显式允许集，未来安装新扩展不会自动扩大只读角色能力。

neko-prompt 保持五节，把角色职责放进 preamble、按工具生成 rules。主 agent 规则包括：简单任务直接做；独立任务才委派；提供必要材料与约束；同一文件不要与 coder 同时修改；结果需核验整合。子角色说明最后回答就是给调用者的交付，需要证据/修改/验证/限制。plan 与 explore 工具相同、交付目标不同。

复用输入资源准备与 placement 激活逻辑，抽取不含普通会话命名/目录活动副作用的内部任务提交路径。不能直接照抄示例裸 submit 后遗漏资源快照。子任务不做自动标题生成；标题来自派发。技能正文按现有 read 渐进读取，不授予额外权限。

### D3. 补齐只读工具而不替换原生工具

find_files({path?,query?,limit?})：path 默认 '.'，query 为字面名称/相对路径筛选，复用 pi-env LocalExecutionEnv.listFiles 与现有有界文件发现逻辑，不复用前端模糊候选排名作为完整文件清单。

search_text({pattern,path?,filePattern?,caseSensitive?,contextLines?,limit?})：首版 pattern 字面匹配，filePattern 为字面路径筛选，不提供正则/shell 表达式；按目录文件清单读取文本，输出路径、1-based 行号和上下文。原生 read 保持不变。经用户确认，枚举沿用 Pi 跳过不可读目录项的语义，结果固定说明该限制；complete 仅表示返回的枚举范围内无预算截断或已知读取失败，不承诺全目录无遗漏。默认遵循忽略规则、不递归跟随目录符号链接；显式绝对路径沿用执行环境已有能力，不把工作区工具包装成权限沙箱。

两个工具用 defineTool/TypeBox 注册，从 api.env 使用实际会话环境，并传递 Context。搜索引擎不运行模型提供的命令，不额外要求 fd/rg。初始有界参数：文件发现最多 10,000 项；扫描总量 32 MiB、单文件 2 MiB；结果默认 100、最多 500；上下文最多 5 行；模型输出最多 32 KiB；调用期限 10 秒。任何内部枚举上限同样影响 complete 标记，不能因缓存仅有部分条目而声称搜索完整。UTF-8 文本和 CRLF 行号正确，二进制/不可解码/大文件跳过计数，部分读取失败明确报告。预算值为内部常量，可在不削弱有界和准确反馈的前提下调整。

output 给模型足够的路径/行号/证据及完整性反馈；details 用于 UI 展示统计。只有需要程序调用时才声明 structuredOutputSchema，不依赖 structuredOutput 恢复历史（原生只保存 output/details）。只读调用可安全重试但数据可能变化，不承诺文件快照。实现先验证已安装 API 类型；不引入参考 main 才有的接口。

### D4. 持久关系和真实状态

新增 typed document 保存稳定关系：主 conversationId、委派 taskId/callId、childId、role/title、派发时间和结算时间/结果引用。与子会话创建原子提交。动态状态从原生 task/submission/live 派生，终态从原生持久 outcome/answer 恢复；用展示文档保存所需索引和最终回执，不创建第二套执行状态机。父工具取消、失败来不及写最终 details 时也要通过原生结算收敛。

taskGraph 仅用于活跃状态提示，不是历史目录。UI 中 queued/running/completed/failed/cancelled 与内部 task pending/waiting/completing 分离；内部一次工具失败不等于子任务失败。关闭浏览不会取消任务。

### D5. 有界并发与停止

沿用原生并行工具轮。宿主准入仅限制每主会话 3 个活跃子 agent，以及规范化工作区 1 个 coder；这些是首版默认值，不开放配置面板。等待者仍是原生委派工具任务，支持 Context 取消；配额以原生 taskId 去重，并持久保存准入凭据，确保重启时原生子任务恢复也不会绕过容量限制；凭据仅关联原生任务，不保存另一套执行队列或任务状态。每次准入按原生终态回收凭据，取消等待使用 Context。

单独停止以主子归属校验后的子会话 abort 为基础，排队未启动的委派也必须取消对应拥有任务，防止稍后启动。停止主会话直接用原生级联取消。工具错误转换为该调用结果，兄弟任务继续。关闭 gateway 遵循 Harness.close 恢复语义，不将其当用户取消。

同工作区写并发限制不隔离另一个主会话或外部编辑器；这是共享目录的现有性质，通过任务划分提示与明确修改报告降低冲突，不宣称独占整个目录。

### D6. 目录、用量、归档与分叉

普通目录仅列顶层用户会话，过滤 owned 子会话且保留用户 ownerless fork。内部查询仍能读取子会话，但 gateway 不允许将其作为普通可写会话 attach。主会话自身用量沿用原指标，另给 taskUsage=自身+所属子用量；全局按实际 conversation 去重累计，主上下文 gauge 不叠加子用量。

归档主会话先取消所属工作再隐藏入口。分叉不复制活跃委派或继承控制权：保留历史卡的只读引用，在创建分叉事务中记录所引用子历史的最大 entryId 与终态快照；详情仅读取该水位以内历史、不订阅原任务未来流。只有分叉点前已出现的卡片可关联，使用稳定 task/call 身份避免碰撞。原任务后续费用不归新分叉。普通历史不存在此文档时按空委派处理。

### D7. Gateway 只读子会话服务

主 attachment 暴露委派摘要和打开详情/停止方法；详情使用只读 Chord 服务，包含 ChatView 同类结构、历史分页、图片读取，不含 submit/configure/compact。服务端每次校验主 attachment 仍有效和 child 归属；分叉历史只读授权独立于执行归属。

复用共享 Projection 的观察思路，按需打开子会话，多个前端共享同一子观察资源，关闭最后一个订阅即释放，不停止执行。主列表不嵌套全部 transcript。子历史采用分页（默认 100 条原生 entry，页边界向前包含完整工具轮），主状态只推送 revision，详情经 Chord RPC 分块读取同一版本的 ChatView；每块最多 32768 个 UTF-16 单元，序列化后仍远低于帧上限，不裁掉可见内容。短期缓存最多四个窗口/历史页版本，慢客户端若读到过期版本重新加载。详情实时展示有界当前窗口，用户向前加载完整已持久历史，图片继续分块按需取。先订阅再合并历史或使用原生精确帧语义，按 entryId/callId 去重，保证交界处无遗漏。慢客户端继续遵循现有缓冲边界。

契约与应用协议版本按兼容性规则同步更新，新旧前端不得静默解释错误状态。切换与断连释放本地资源、拒绝旧操作，不影响执行。

### D8. 两端共享内容语义，沿用现有视觉

“完整流程”指与主 agent 一致的全部可见记录，不是暴露内部 system prompt、未返回的推理或绕过原生输出截断。包括派发输入、每轮助手文字/返回的 thinking、所有工具参数/输出/结果、图片、错误、中止/压缩等现有系统行和最终报告。保留现有折叠、语法高亮、Markdown、图片预览；截断显式标记。必要时抽取 transcript renderer 和 image reader 接口，不能通过全局切换 currentSession 来复用组件。

Web：主流委派卡 + 右侧列表/详情，延续蓝粉白 tokens；首次派发展开，手动关闭意图按主会话保留。移动端抽屉/全屏详情；只读，没有子输入框。每个 child 独立 scroll/expanded 状态，主 composer 不卸载。键盘焦点、关闭返回、停止名称及触屏尺寸沿现有规范。

TUI：主卡片、活动摘要、面板列表、面板详情；点击卡片或 /agents 打开列表，方向键选择、Enter 进入、Esc 返回，停止为显式菜单操作，避免单键与编辑输入冲突。/agents 只用于查看任务，不创建或定制角色。复用 picker/ScrollView/消息组件，详情占现有主面板区，不默认横向分屏。保留主 editor 实例、草稿/附件/光标和 transcript 滚动，各子详情独立保存滚动/展开；运行流仅在贴底时跟随。主题切换复用现有动态主题更新。

## Risks / Trade-offs

- [只读搜索能力不足] → 从未知路径开始的真实工具链测试，检查完整性和可读行号，不仅测试单个工具返回形状。
- [并发增加成本] → 默认容量限制，明确主/子/任务用量，提示模型仅在有益时委派。
- [父工具中断后展示停留运行] → 从原生持久回执恢复终态，测试创建、提交、返回各边界中断。
- [详情复用误读主会话图片或误改输入] → 显式只读数据源，跨主子/跨会话权限及迟到响应测试。
- [长历史撑大状态] → 摘要与详情分离，分页、限帧、观察资源复用及慢客户端测试。
- [只读角色不能跑测试] → 明确交付限制，主 agent 或 coder 负责执行验证；不悄悄开放 bash。

## Migration Plan

以新增可默认初始化的文档和工具扩展接入，无既有会话数据重写；旧会话下次请求获得工具与角色规则。先完成 core 及模拟模型恢复测试，再接 gateway 与两端。保持 Pi 1.2.0 和现有 CI 平台集合。构建、check、完整测试及两端交互验证通过后再归档/发布，当前阶段不执行。

回退代码前应结束所有活跃委派并停止 gateway；旧版本不能解析新任务定义时不承诺继续恢复，保留数据库用于重新升级恢复，不删除任务或历史来伪装回退成功。

验收补充：TUI 详情通过 Pi 组件 handleMouse 接收原生 wheelDelta，翻页步长使用可见页高；空编辑器右键打开列表、列表右键进入、左键返回主视图，非空草稿保留编辑方向键。状态栏显示可点击的子任务数及快捷键，已完成记录同样保留入口。

文案与浏览验收补充：TUI 产品文案保持英文，菜单快捷键统一为 accent 键名、dim 动作、居中点分隔，单字母键大写。状态栏避免重复面板快捷键，窄屏优先上下文占用、费用和 Agents 入口。两端移除手动历史加载入口，向上滚动至顶部按需补齐早期记录，保留完整可见流程和滚动位置。

帮助与技能预览补充：新增 /help 只读滚动详情，按上下文分组说明宿主快捷键，从 Pi 当前绑定读取编辑及主转录键位，并列出命令目录。技能预览实现与子详情同一 scroll 接口；原生翻页转发扩展至所有打开的面板详情。技能安装恢复明确 Install 文案，面板底部提示按可用宽度换行，帮助 Esc 直接关闭面板。
