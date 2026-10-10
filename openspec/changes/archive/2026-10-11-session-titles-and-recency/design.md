# Design

## Context

当前 core 的 ActivityDoc 只有 lastUsedAt，创建、激活和输入都会更新；两端 workspaceSessions 同时被列表排序和最近会话恢复使用。gateway 的会话目录只有 id/workspaceRoot/lastUsedAt，主要在管理操作与 submit 后刷新，回答完成不触发目录刷新。TUI PickerPanel 载入静态条目并按下标选中，选中项描述区最多两行。Web 展示数字 ID。

已安装 pi-ai 1.1.0 提供 Models.completeSimple、模型能力与 thinking 映射；core 可以复用其认证与 provider，不需要额外 SDK。此变更涉及持久状态、异步生命周期及多个前端，需独立设计。动机与范围见 proposal.md。

## Goals / Non-Goals

**Goals:** 将命名与消息活动作为服务端权威元数据；无需前端等待或 attach 也能完成；区分消息排序与访问恢复；测试使用 faux provider 与临时 SQLite。

**Non-Goals:** 手动重命名、持续总结、标题专用模型配置、旧数据迁移、启动时回填、依赖升级和新权限体系。

## Decisions

### 1. 会话元数据和两个时间语义

新增会话 metadata 文档，保存 createdAt、lastMessageAt（无消息为 null）、firstPromptPreview、title、命名状态及关联输入/最终回答 ID。保留 lastUsedAt 供工作区进入和启动恢复使用。拆开列表排序函数与恢复选择函数，避免改排序时顺带改变恢复行为。

消息列表按 `(lastMessageAt ?? createdAt) desc, numeric id desc` 排列。新输入被持久接受及最终成功回答提交各更新一次；以条目 ID 去重，相同 requestId 不重复更新时间。流式 token、工具结果、中止、失败、配置修改和命名不更新。用持久事件时间恢复，不能将启动扫描时间当作新消息时间。

有历史的 fork 创建新的 createdAt，消息时间从空值开始，名称复制为独立结果；不因继承历史而调用标题模型。空 fork 按新会话处理。放弃复用 lastUsedAt，因为打开旧会话会错误改变相对时间和列表顺序。

### 2. 首轮命名状态机归 core 管理

以首个被接受的用户输入为锚点，绑定它的 submission 和最终 answer，不能靠投影中最后一条文本猜测关联。只读最终 answer 的 text，忽略 thinking、工具调用和工具输出；首轮失败、中止或空正文则终止该会话自动命名，保留首问摘要，不换用后续问题。

状态采用 waiting / pending / running / ready / fallback，保存 source IDs、回答所用 model、attempts 与结果。首次输入先保存有界摘要；首轮成功后保存命名任务。模型取最终回答的 provider/model，不取请求排队后可能改变的会话配置。

core 统一观察持久提交和输入结算，启动时恢复本版本未完成任务；不得仅在 session.waitAnswer 或 gateway attach 视图订阅中触发，因为调用方可以不等待、前端也会离线。运行期使用去重队列，每次请求前持久增加 attempts，提交结果检查任务标识和状态，避免迟到结果覆盖。

默认并发 2、单次超时 20 秒、最多 2 次尝试（首次失败后延迟 2 秒重试）；不支持 off 直接 fallback。重启恢复 running 时计入已消耗尝试，不因重连重置预算。远端调用与本地提交无法实现跨系统 exactly-once：崩溃可能消耗一次额外请求，但预算有限且只有一个结果生效。归档取消待处理任务并拒绝迟到写入；runtime.close 停止调度并取消在途请求。

### 3. 独立非思考请求与输出约束

复用 core 的 Models 和同一 provider 认证；核对已安装能力映射确实允许 off，使用该版本 API 对应的非思考参数，并以请求捕获测试验证 DeepSeek 发出 disabled。不能依赖默认级别、不能先 configure 会话再恢复，也不能把请求伪装成会话消息。

系统提示只要求总结名称，将首问和回答作为分隔的数据，不执行其中指令；不传工具。首问最多 4000 Unicode 码点，回答最多 8000，保留首尾并标明截断，另按模型上下文上限进一步收缩。输出 token 上限 128，提示中文约 12–20 字、其他语言约 3–8 词；规范化空白、去除包裹引号与 Markdown，最终最多 60 个码点，不允许控制符。空白或无有效文本视为失败。首问摘要最多 60 个码点；展示层按可用宽度再截断。

命名请求的 usage 存入独立 metadata 记录，按 provider/model 和用途汇总；对会话与全局总量聚合时只加一次，不向上游主对话 UsageDoc 伪造对话条目。失败时只记录 provider 实际返回的用量，不猜测费用。保持现有总用量契约，另提供可核对的命名明细。

### 4. 目录广播与性能

扩展 NekoSessionSummary 及 Web 镜像为统一字段：title、firstPromptPreview、createdAt、lastMessageAt、lastUsedAt、model、status（idle/running/error），并保留 id/workspaceRoot。模型和运行状态来自持久会话状态，命名 pending 不算主对话 running。

core 暴露元数据变更通知，gateway 订阅后串行刷新目录。按状态边界和最终条目刷新，不按 token 广播；列表请求不逐个 attach 或加载完整历史。首次快照必须已含持久元数据，旧契约客户端不兼容。关闭服务时释放订阅。

### 5. Web 两行导航与时间显示

第一行标题，第二行相对时间和必要状态。标题优先 title → firstPromptPreview → “新会话”；顶栏和归档确认共享展示规则，不展示内部会话 ID，通过准确时间辅助辨认同名会话。搜索匹配三种数据而不局限于当前显示的截断文本。

相对时间使用消息时间或创建时间：刚刚、N 分钟前、N 小时前、N 天前；超过 30 天显示短日期。使用共享定时源每分钟刷新，重新聚焦页面立即更新；负时差钳为零。准确时间及完整标题通过鼠标和键盘均可访问的提示展示。保留现有中性导航、粉蓝聊天和移动抽屉。

### 6. TUI 稳定选中与信息优先级

行内标题占剩余宽度，右侧显示 `now / 3m / 2h / 5d`，当前会话标记与键盘选中标记独立。公共头部说明工作区；选中项详情显示 `provider/model | Idle/Running/Error` 和完整时间，空间不足时优先隐藏次要详情。

会话面板订阅目录更新，按 ID 而非数组下标保存选中项；刷新后重新定位并保持可见。若项被移除则选择相邻有效项，新建入口保持独立。搜索文本不因更新清空；每分钟更新相对时间，关闭时清理订阅和定时器；原有 Kitty release 过滤保持不变。

## Risks / Trade-offs

- 额外模型延迟和费用 → 后台处理、严格输入/输出上限、有限重试，失败保持摘要。
- 非思考映射可能由 provider 钳制 → 检查实际锁定版本能力并捕获请求验证，不支持时不偷偷改模型。
- 并发提交、steer 和 follow-up 可能混淆首轮 → 使用 submission/answer 关联测试，不以消息数组位置配对。
- 新元数据被高频刷新 → 只在条目和状态边界广播，目录使用摘要，禁止逐项加载完整历史。
- 列表重排导致误选 → TUI 按 ID 维护选择，Web 不因目录顺序切换当前会话或清除输入。

## Migration Plan

用户已在本次讨论中授权并完成一次历史 SQLite 清空。实施和测试使用新存储，不编写历史回填或兼容分支；应用检测到不支持的旧格式时明确报错，不自动清库。若实施期间又产生旧格式数据，不能复用先前删除授权再次静默删除，应使用新的隔离测试存储。

core/gateway/Web/TUI 一起发布契约。回滚时使用独立空存储启动旧版本，不承诺读取新元数据；所有 README 说明保持中文，规格保留当前英文结构关键词与中文正文。
