# Design

## Context

动机与范围见 proposal.md。本变更跨 core、gateway、TUI/Web，涉及二进制传输、持久化和任务结果关联，因此需要完整设计。

已核实安装包 1.1.0：

- pi-durable 的 `Conversation.compact(instructions, context)` 返回 TaskId；任务结果可能含 entryId 或 submissionId，任务完成与摘要应用是两个阶段。`LiveState.compactions` 提供 reason、blocking、attempt、retry。
- 默认策略为 enabled=true、reserveTokens=16384、keepRecentTokens=20000、backgroundTokens=32768。摘要沿用当前模型和思考强度，序列化只保留文字，旧历史不删除。
- `SubmissionDraft.content` 为 pi-ai UserInput，可包含 ImageContent；工具结果使用 `content`。内置 read 明确拒绝图片。
- Flash 的 input 为 text/image、Pro 为 text；Flash 图片 resize 上限 2000x2000、4718592 bytes、JPEG quality 80。目录参数不代表调用库已执行图片处理。
- 当前 Harness 的 submit 和 gateway 协议只收字符串，projection 只取文字，压缩只显示完成标记；Web composer 在 busy 时拒绝普通发送。
- 当前 WS 有 16 MiB 慢客户端积压限制，不能将多图 base64 直接复制到每次状态投影。
- reference/pi coding-agent 的 Ctrl+V 将图片保存临时文件并插入路径，不等价于直接附件。其专用 abortCompaction 和前端压缩排队不能视为 pi-durable 接口；已安装 pi-tui 有终端图片渲染接口，但没有参考源码全部原生剪贴板接口。

证据位置：node_modules/@earendil-works/pi-durable/dist/harness/{types.d.ts,agent.js,compaction.js,generation.js}、tools/read.js；pi-ai/dist/{types.d.ts,api/transform-messages.js,providers/data/deepseek.json}；reference/pi/packages/coding-agent/src/modes/interactive/interactive-mode.ts 及 core/keybindings.ts。reference 只提供交互参考，不替代安装包能力核验。

## Goals / Non-Goals

**Goals:** 用薄封装暴露原生能力；多客户端共享任务与消息事实；图片输入、读取、历史显示使用统一内容语义；操作失败不丢草稿。

**Non-Goals:** 不另建压缩引擎或视觉摘要，不修改默认策略，不添加仅取消压缩的新运行时能力；不照搬完整 coding-agent，不把工作区变成权限沙箱，不实现 PDF、音视频、远程 URL 或跨版本协议适配。

## Decisions

### D1. 决策顺序和原生压缩

优先遵循已安装 pi-durable 的任务、提交、持久化和中止语义；其次沿用 Pi 模型目录和 TUI 交互；缺失能力才在 Harness 增加小范围设计。保持 Pi 精确锁定 1.1.0，不更改 reference 或 node_modules。

不传自定义 compaction settings，不注册重写摘要的 beforeCompact hook。1M 窗口按默认公式在估算超过 950848 时后台压缩、超过 983616 时阻塞，并要求存在有效切分点。该数字仅解释行为，不在前端写死。保留原生摘要用量，不能将压缩标记作为新回答更新最近消息时间。

替代方案：为统一 UI 实现额外压缩队列或调整阈值。拒绝，因为会改变优先级最高的运行语义。

### D2. 压缩操作和结果投影

core 增加会话级 compact 操作，gateway 通过现有会话服务暴露。受理前检查当前会话可用、模型和凭据；按会话序列化操作受理，并检查原生 live compactions，已有任务时返回其状态而非重复启动。自动压缩仍完全由原生引擎控制。

状态投影独立于回答 busy：活动任务包含原因、阻塞性、重试次数/退避；最近结果包含 applied、nothing、skipped、cancelled、failed，运行阶段包括 summarizing 和 waiting-to-apply。不要公开内部 ID 为产品标签。

以 TaskId 跟踪 waitForTask 结果；有 submissionId 时继续等待写入结果，stale 显示 skipped，空结果显示 nothing。只在实际摘要条目应用后显示 applied；compaction_end 仅作重新读取状态的触发。使用宿主文档关联手动操作和最近终态，先保存关联再向前端确认；重启恢复时结合原生任务、条目及 live 状态协调，不依赖仅内存监听器。此文档不复制或驱动 Pi 任务状态机。

前端切换只改变订阅，不取消原会话任务；使用会话标识及连接代次过滤迟到结果。Esc/停止复用 Conversation.abort 的实际范围，并提示 Stop 而非宣称仅取消压缩；命令/预览弹层优先消费 Esc。

### D3. 命令路由

两端精确识别 `/compact` 或其后空白加附加要求，不将 `/compactly` 识别为命令。命令在普通消息 busy 分支之前路由，不进入消息历史、命名或 recency。Web 以可扩展的轻量命令描述表提供本次唯一命令，键盘/触屏一致，保留 IME 行为。

操作受理后仅清除原会话、原草稿版本的命令文本。草稿已有图片时，压缩操作不消费附件，命令不能被误提交为带图消息。压缩期间编辑器可用；普通输入沿用既有发送/steer/follow-up 行为，不建立 coding-agent 风格第二套排队。Web 原有忙碌发送限制不在本次扩展为完整插话改造。

### D4. 图片内容和传输

core 内部使用 Pi UserInput，保留纯字符串输入；消息及工具结果直接持久保存处理后的 ImageContent，不引入替代 Pi 历史的永久附件数据库。元数据在宿主条目映射中保存显示名称、格式、尺寸和字节数，不依赖原路径恢复图片。

gateway 提供会话绑定的临时上传：begin、按序 append、finish、release；submit 引用完成的上传标识并和文字一起转换为原生内容块。图片 bytes 通过现有 Unix/WS 服务分块传输，建议每块 256 KiB、每连接最多 2 个并发，不能通过提高无限缓冲解决问题。上传只表示准备好附件，不创建消息。提交成功后回收临时数据；相同 requestId 必须先查询已受理结果，再解析可能已被回收的上传标识。

上传标识使用不可猜测标识，绑定会话和上传连接；同一连接内复用，重连未提交附件由客户端保留内容重新上传。未完成/未引用上传 TTL 15 分钟；每连接最多两个消息批次的临时总量。实现使用有界内存暂存，断连/退出释放本服务拥有的内存，无需创建或扫描临时目录，绝不删除用户图片。图片 bytes 和路径不进入日志。

投影只发送附件描述与基于 conversation/entry/contentIndex 的引用。getImage 以分块按需读取持久内容，先核对条目属于会话的可见历史（含合法 fork 继承），再返回图片块；不接受宿主路径。Web Blob URL 在移除、关闭/离开后释放，TUI 仅为可见预览获取数据，缓存有界。

替代方案：整段 base64 放进 replicated state 或永久文件存储。前者重复传输且易触发积压限制，后者增加双存储事务与回收复杂度，因此不采用。

### D5. 统一图片管线和独立工具

新增 core 图片处理模块，由已锁定 Pi 的 input/inputLimits 驱动。首期 PNG/JPEG/WebP 静态图片；检查文件魔数和解码内容，拒绝动画、SVG、GIF、PDF 及 URL。宿主资源上限作为明确产品限制而非冒称 Pi 限制：原图每张 20 MiB、40M 像素、每消息最多 4 张、原始总量 40 MiB；处理后总量最多 18 MiB，单图同时受模型 maxBytes 限制。所有入口使用同一配置和错误。

按模型尺寸保持比例缩小、不放大；先尽量保留原格式与透明度，必要时编码压缩，无法满足时明确失败，不截断。实施时先验证 Pi 公开可复用接口；缺失时选用单一 Bun 兼容图片处理依赖并精确锁版本，不引入 pi-coding-agent 整包。实施选定 sharp 0.35.5（精确锁版本），已验证 Bun 1.4.2 / macOS arm64 的安装、解码及构建。Pi 的 resize.maxBytes 按 base64 编码大小检查。具体依赖选择不改变上述契约。

`read_image({path})` 作为命名扩展安装在 CodingTools 后，不覆盖 read。通过 ToolExecutionApi.env 的二进制读接口及会话 cwd 解析，读取前后检查文件变化并使用有界读取；执行时检查实际模型 input。返回 `content: [text, image]` 及非敏感结构化展示元数据，遵循工具提交与崩溃行为，不绕开原生任务执行。工具说明要求在回答中记录任务相关观察，但不强制额外模型调用。

### D6. TUI 交互

复用现有 Pi 编辑器、补全和图像渲染公开接口。macOS/Linux Ctrl+V、Windows Alt+V；剪贴板适配按平台调用有超时的系统能力，不在无权限时自动安装软件。macOS 优先文件路径、其次位图、最后文字；失败提供路径方式。其他平台使用可用后端，缺失时明确回退。

图片引用的识别边界：剪贴板图片/文件和独立拖入的有效路径可生成有编号的编辑器图片引用；手动输入通过路径补全显式选择图片时生成引用。普通句子中提及路径不自动读取。带空格、引号及 shell 转义的拖入路径有专门解析，不执行 shell。删除引用移除附件，路径补全仍服务普通文字输入；不以新增 /attach 作为主要入口。

草稿按会话保存引用与图片内容，送出前同步验证引用存在及顺序，支持仅图片。剪贴板内容直接保存为应用拥有的内存数据，不生成临时文件。草稿引用可删除/撤销，受理后释放不再使用的引用，退出释放剩余草稿；用户文件从不删除。原生图片协议可用时限高预览，否则文件名/尺寸回退，不能破坏输入和 footer 布局。

### D7. Web 交互

输入框左侧加号选择多图；拖入显示落点，粘贴仅在编辑区接收图片；添加不发送。缩略图显示处理中、就绪、失败和移除，失败项未处理时阻止整批发送。支持仅图片、键盘移除和触屏，图片历史按需放大，焦点约束及 Escape 返回触发项。

命令菜单靠近输入框、有最大高度，可发现菜单同时提供压缩入口；有图片草稿时压缩不清空附件。独立状态行显示后台/阻塞/重试，没有真实进度就不用百分比。保留聊天区蓝粉白与导航中性色。

### D8. 能力切换、命名与压缩后的图片

投影扩充模型 input 和图片限制。客户端在 Pro 下阻止新图片发送并保留附件，服务端再次验证实际模型；纯文字消息仍允许，历史图片按 Pi transformMessages 降级为占位，不修改存储。界面提示当前模型无法读取历史原图，不阻止历史预览。

仅图片首问使用稳定图片消息占位与数量，作为 firstPromptPreview；标题输入为首问文字或占位加最终回答，保持 off，不传图片、临时路径或新增视觉总结。新增消息按既有 recency 更新，上传/预览/压缩不更新。

被压缩的图片不加入文字摘要请求，历史仍可查看。read_image 重读文件可能看到新版本，不能称其恢复原图；用户可从历史图片重新添加为新附件以再次提供原图，首期通过预览保存后再添加完成，不新增独立历史重发入口。

## Risks / Trade-offs

- 图片使 SQLite 和消息变大 → 限制图片数量/大小，持久化单份模型内容，投影不复制 base64；本次不做存储去重。
- 摘要结束但写入尚未完成 → 关联原生任务与 submission，等待真实应用，覆盖 stale/no-op/失败恢复。
- 多客户端切换模型或会话 → 服务端能力复核、请求幂等、前端会话和草稿版本隔离。
- 终端剪贴板/渲染差异 → 平台探测与文字回退；macOS/Ghostty 实测，其余以模拟和可用后端测试明确记录覆盖范围。
- 图像解码资源消耗及临时文件泄漏 → 解码前大小/像素边界、有限并发与 TTL，只回收自有文件。
- 压缩丢失未文字化的视觉细节 → 如实说明原生文字摘要边界，不承诺永久视觉记忆。

## Migration Plan

按 core、gateway、TUI/Web 顺序实施并同步发布；继续读取既有纯文本消息，不删除用户历史、不改变 Pi 存储格式。新宿主元数据使用可缺省字段，不要求回填旧会话。发布前备份测试存储并验证重启/fork；回退旧版本前备份数据库，旧 UI 不保证显示图片，不能将回退描述为删除或转换数据。验收使用假 Key、模拟模型和隔离存储，测试截图、临时图片与日志清理后仅保留文字记录。

## Open Questions

- 图片解码库和剪贴板后端的具体实现：在既定格式、限制及交互契约内，优先验证 Pi 公共接口，否则采用单一精确锁版本依赖；验收记录说明平台覆盖，不改变上游包。
