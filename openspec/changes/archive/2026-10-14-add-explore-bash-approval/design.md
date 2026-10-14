# Design

## Context

动机见 proposal.md。当前 `packages/core/src/subagents.ts` 用持久角色文档及工具集合限制 explore/plan；二者共用 READ_TOOLS，角色提示明确禁止命令。gateway 的子任务详情只开放观察、历史、图片和停止；TUI/Web 已有完整子任务流程、滚动及主视图入口。

已核实安装的 Pi Durable 1.2.0：`ToolHooks.beforeTool` 支持异步决定，位于执行意图提交前；`HookApi` 公开持久读与 memo，不公开 commit/watch。工具意图提交之后才进入 execute，原生 Bash 未声明 replay safe。`createBashTool({ prepare })` 位于 execute 内部，不能作为本方案的审批等待点。

官方参考：https://earendil.com/posts/pi-durable/ 的 Approval 示例通过 beforeTool 等待宿主审批并 memo 决定。本地依据为安装包 `dist/harness/types.d.ts`、`dist/harness/tool.js`、`dist/tools/bash.js`；reference 只作参考，不改动或升级上游。

## Goals / Non-Goals

**Goals:** 审批等待可恢复；决定只影响一个确定调用；保留原生 Bash 输出、超时、取消、失败和不安全重放语义；同一持久事实驱动两端。

**Non-Goals:** 通用权限配置、命令白名单、永久授权、批量允许、自由对话式询问、操作系统沙箱、plan Bash、修改 coder/主 agent 权限、自定义 agent、增加 Windows CI。

## Decisions

### D1. 以角色为依据保护原生 Bash

为 explore 工具集合增加原生 bash，保留直接 write/edit 不可用、无递归委派。注册稳定命名的审批扩展，用 SubagentDoc 识别 explore，只拦截它的 bash，包括 nested tool call；不要仅靠模型可见工具列表或提示词。plan 继续 READ_TOOLS，coder 和主会话不受此 Hook 的审批策略影响。主 agent 不能替用户批准。

角色提示改为默认读取/搜索，必要时申请命令；用户约束继续有效，拒绝后换方法或说明限制。沿用原工具名称、参数及执行器，不增加另一套 shell 工具或允许模型调用的审批工具。代替白名单，审批允许用户检查任何具体命令，但不构成只读保证。

### D2. 宿主持久审批服务加异步 beforeTool

core 新增审批模块，由 runtime 注入宿主服务到扩展闭包。Hook 仅用公开 HookApi，不通过类型断言调用内部 runtime 方法。服务经 Harness 的公开 commit、文档读取/订阅处理持久状态，Hook 在事务外等待；禁止持有 commit 事务等待用户，避免阻塞其他会话。

以 session 内原生 tool taskId 为请求身份，保存 parentId、delegationTaskId、childId、callId、tool name、经验证参数、工作目录、操作版本及创建/决定时间。使用 conversation-scoped latest 文档保存请求，fork initial；运行中的 request 和决定持久化，任务结束后保留审计状态。取消记录通过任务状态协调，不依赖前端仍在线。内部允许状态不等价于执行成功。

`ensureRequest` 对相同调用幂等，对操作内容不一致不复用授权。decision 通过事务比较 pending、归属、操作版本和任务有效性，第一次有效决定胜出；同决定重试返回原状态，冲突或过期返回明确的已结算/失效结果。审批 API 只接收请求身份、版本和 allowed/denied，不接收替换命令。

Hook 等待持久决定，并遵守传入 Context 的取消信号，清理监听。允许后可使用 api.memo 保存绑定操作版本的决定；请求文档为事实来源，崩溃在文档决定与 memo 之间也可恢复。拒绝返回 block，Pi 产出模型可见工具错误；不是把整个委派标记失败。没有前端时保持等待，不设自动批准或隐式拒绝；用户可重连或停止。

### D3. 审批绑定最终操作，执行器保持不安全重放

审批 Hook 位于 neko 参数改写 Hook 之后，不添加批准后的命令改写。审批内容包含规范化 cwd、最终 command 和 timeout。原生执行 env 创建时以当前实际 cwd/操作与获批记录核对；如需要用 Bash prepare 作一致性断言，它只校验并拒绝变化，不等待审批、不改写命令。出现修改必须失效或重新审批，不能沿用旧批准。扩展热替换也不能越过这个边界。

等待发生在执行意图之前，所以重启可重新进入 Hook 并接回相同请求。进入 execute checkpoint 之后发生重启，包括意图已提交但进程尚未真正启动的窗口，沿 Pi unsafe 策略报告 interrupted；不追求无法保证的 exactly-once，不标记 replay safe，不自行重跑。后续模型重试是新调用，必须新审批。Bash timeout 仅用于实际执行，不计算用户审批等待时间。

### D4. 生命周期与任务状态分开

审批状态 pending → allowed / denied / cancelled；命令的执行中、成功、失败、中断仍来自原生工具记录。只将 pending 计入主视图待审批摘要，不扩展 Pi task state，也不把等待用户伪装成任务完成。

停止主任务、子任务及归档沿原生取消链，未决请求协调为 cancelled；迟到批准校验任务取消标记和终态。批准先提交但取消随后生效时，Hook 返回与 Pi 后续意图提交仍接受原生取消检查；不能创建脱离原任务的 shell。已开始命令按原生取消停止，不保证回滚。前端断开不取消。

等待占用现有子任务并发名额，兄弟任务仍可运行；不新增独立调度器。获批 explore 命令可能修改与 coder 相同的工作区，现有单 coder 名额不是全工作区写锁；本变更不把批准解释为独占工作区或自动回滚承诺。

### D5. Gateway 提供窄控制面

复用绑定主会话的子任务服务，增加审批摘要和详情/决定方法。摘要只含待审批数和定位身份，完整命令走按需有界读取，沿现有 chunk/revision 模式避免单帧超限。新增文档变化触发主视图与详情订阅，沿现有 client epoch、释放和重连规则。

服务端验证 Owner、主子归属、原始委派身份和原生工具状态；历史分叉 watermark 视图禁止决定且不订阅原任务后续审批。既有只读历史可继续展示原工具内容，但不复制有效批准、不把原 pending 当作分叉的新请求。不开放任意子输入或配置。应用协议版本递增，沿既有不匹配处理拒绝旧客户端操作。

### D6. 会话级临时审批区

两端复用 gateway 子任务有界读取，在当前主会话范围内聚合待审批请求；订阅独立于子详情，仅为有 pending 摘要的任务建立 reader，结算、切会话或卸载释放。持久审批记录仍用于恢复和审计，UI 审批区只包含 pending，终态结果附在对应 callId 的工具调用旁，不保留独立审批卡。

TUI 在输入框上方显示自动聚焦的 Pi SelectList 审批选项。无需 Ctrl+Y；上下键选择 Allow once / Deny，Enter 明确确认，翻页与滚轮查看完整命令，[/] 逐项切换请求。普通字母、Esc 或左右导航不决定；请求结算后移除并恢复原编辑/浏览交互。新请求重置选项，至少渲染一次后才接受确认，提交中禁止重复操作。/help 同步说明。


Web 在输入框上方展示紧凑待审批卡，短命令单行，长命令可完整滚动。窄屏子详情占满屏幕时，同一个会话审批区移到该屏幕底部，始终只有一个可见审批入口；不依赖用户主动打开子任务。请求展示任务名称、命令、cwd、timeout，提交中禁重复操作。保持草稿、附件与侧栏开关，不自动批准、不反复展示已处理请求。

## Risks / Trade-offs

- [获批 Bash 可写文件或访问网络] → 明确默认只读而非强只读，显示完整操作，逐次授权，不承诺沙箱隔离。
- [Hook 等待被取消或重启遗留监听] → 使用调用 Context，监听明确释放；重启从文档接回，不保存仅内存 Promise 为事实来源。
- [参数改写和 cwd 漂移] → 绑定操作版本，执行前一致性断言；变化拒绝而非扩大权限。
- [双端决定与停止竞争] → 单事务 CAS 决定，核对原生任务状态，并依赖意图提交/执行取消检查。
- [命令内控制字符伪装展示] → 用现有安全文本/代码渲染，转义不可见控制字符的展示，不执行终端转义；保留原始命令作为比较依据。
- [等待审批增加延迟、占据并发槽] → 主视图可见提示并可停止；首版不增加后台模式或自动超时策略。

## Migration Plan

1. 注册审批文档与稳定扩展，审批能力准备好后才开放 explore Bash。对已有 explore 子会话按持久角色检查/协调工具与扩展配置，在开始调度前完成；plan 不增权，不能全局添加 Bash。
2. 更新 gateway 协议版本、两端契约和版本测试；使用现有更新/重启提示处理前后端版本差异。
3. 用 faux provider 和 Memory/SQLite 存储验证审批、拒绝、重启和取消，执行临时目录内可观测命令；不使用真实 API key。再进行 Web 和 TUI 交互验收。
4. 回退应先停止含审批的新任务再回退程序；旧程序不理解审批协议，不能依赖降级继续未决调用。不删除审批审计数据，不声称旧版本支持新持久记录恢复。
