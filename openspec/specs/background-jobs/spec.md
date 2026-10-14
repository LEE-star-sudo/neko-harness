# background-jobs Specification

## Purpose
为 agent 提供会话级后台命令能力：让开发服务、watcher 与长任务在不阻塞对话轮次的前提下运行，可查看输出、可停止，并在结束时通知所属会话；同时明确进程在重启、归档与关闭时的边界，避免孤儿进程与重复执行。

## Requirements

### Requirement: 非阻塞启动与工具动作
系统 SHALL 向主会话 agent 提供 `job` 工具，支持 `start`（`command`，可选 `title`、`timeout` 秒）、`output`、`stop`、`list`。`start` MUST 立即返回稳定 `jobId`、状态及启动后最多 2 秒内已产生的输出，不等待进程结束；命令在会话当前工作目录通过环境 shell 执行，且无 stdin（不支持交互输入）。未设置 `timeout` 的 job SHALL 不因时间自动结束。

#### Scenario: 启动长期服务
- **WHEN** 模型用 `job start` 执行 `npm run dev`
- **THEN** 工具调用立即返回 jobId 与状态 running，当前轮次继续，模型可随后读取或编辑文件

#### Scenario: 启动即失败
- **WHEN** 命令在启动后 2 秒内退出（如端口占用或命令不存在）
- **THEN** 结果直接给出退出状态、退出码与输出，job 状态为 exited 或 failed，且不再产生完成回报

#### Scenario: 无效参数
- **WHEN** `start` 缺少 `command`、`timeout` 非正数，或其他动作缺少 `jobId`
- **THEN** 工具返回明确的参数错误，不启动进程

### Requirement: job 身份与状态
每个 job SHALL 有会话内唯一且不复用的 `jobId`，持久记录命令、标题、工作目录、启动时间、状态、结束时间与退出码。状态 SHALL 为 running、exited（退出码 0）、failed（非零退出、启动失败或超时）、stopped（被停止）、lost（运行中遇到重启或进程丢失）。终态 MUST 不再变化。

#### Scenario: 正常与异常退出
- **WHEN** 一个 job 退出码为 0，另一个非零
- **THEN** 前者为 exited，后者为 failed 并记录退出码

#### Scenario: 超时
- **WHEN** 设置了 `timeout` 的 job 到期仍在运行
- **THEN** 系统终止该进程，状态为 failed，原因标注为超时

#### Scenario: 终态不可变
- **WHEN** 已 stopped 的 job 随后其进程才真正退出并产生退出码
- **THEN** 状态保持 stopped，不被改写

### Requirement: 有界输出保留与读取
系统 SHALL 为运行中 job 在内存保留合并后的 stdout/stderr 尾部（至多 64 KiB 且不超过 1000 行），记录累计字节偏移与是否被截断；`output` SHALL 支持读取尾部，或从调用方给出的偏移之后读取增量，并返回新偏移。终止时 SHALL 持久保存同一上限内的最终尾部。输出 MUST NOT 无界进入 transcript 或文档。

#### Scenario: 增量读取
- **WHEN** 模型先读取输出得到偏移 N，稍后以 N 再次读取
- **THEN** 只返回 N 之后的新内容及新偏移，不重复已读内容

#### Scenario: 输出超限
- **WHEN** 进程持续产生远超上限的输出
- **THEN** 内存与持久化的尾部保持有界，结果标明早期输出已被丢弃，job 继续运行

#### Scenario: 终止后读取
- **WHEN** 已终止的 job 被读取输出
- **THEN** 返回其持久保存的最终尾部、状态与退出码

### Requirement: 停止语义
`stop` SHALL 终止指定 running job 的整个进程树，并使其状态为 stopped；对已终止的 job MUST 返回其现有状态而不报错，对不属于本会话或不存在的 `jobId` MUST 报错且不影响其他 job。停止 MUST 只针对该 `jobId` 对应的那次运行。

#### Scenario: 停止开发服务
- **WHEN** 模型或用户停止一个由 `npm run dev` 启动的 job
- **THEN** shell 及其子孙进程均被终止，状态变为 stopped

#### Scenario: 重复与越界停止
- **WHEN** 对已结束 job 再次停止，或使用其他会话的 jobId
- **THEN** 前者返回已结束状态，后者被拒绝，两者均不终止任何进程

### Requirement: 完成回报
job 到达终态后，系统 SHALL 向所属会话投递一条带 job 标记的 followUp 输入，包含 jobId、标题、状态、退出码与至多 40 行且不超过 4 KiB 的输出尾部，并提示可用 `output` 读取更多；会话空闲时它开启新一轮，忙时排队到当前回答之后。每个 job 的回报 MUST 至多投递一次（含重启后）。由模型自身 `stop` 的 job 与启动窗口内已结束的 job MUST NOT 产生回报；用户通过面板停止的 job SHALL 回报。

#### Scenario: 服务崩溃通知
- **WHEN** 主会话空闲时后台服务异常退出
- **THEN** 会话收到一条回报并自动开启新一轮，模型据此查看输出或修复

#### Scenario: 忙时排队与不重复
- **WHEN** 主会话正在回答时 job 退出，随后进程重启
- **THEN** 回报排在当前回答之后，且同一 job 不会重复投递

#### Scenario: 模型自行停止
- **WHEN** 模型调用 `stop` 终止某 job
- **THEN** 工具结果已告知状态，不再产生额外回报与新一轮

### Requirement: 重启与进程丢失
进程不会跨 gateway 重启存活，系统 MUST NOT 在重启后重新执行任何 job 命令。重启后仍标记 running 的 job SHALL 被结算为 lost（保留最后持久信息）并回报一次。

#### Scenario: gateway 重启
- **WHEN** 存在 running job 时 gateway 被重启
- **THEN** 重启后该 job 状态为 lost，命令不被重新启动，会话收到一次回报

#### Scenario: 重启与停止竞争
- **WHEN** 用户停止请求与重启几乎同时发生
- **THEN** job 最终只有一个终态，且命令不被重新执行

### Requirement: 并发上限与资源清理
每个会话 SHALL 最多同时运行 4 个 job，超出时 `start` 返回明确错误并提示先停止某个 job；列表 SHALL 保留最近 20 个已终止 job 的摘要。会话归档时 SHALL 停止其全部 running job；gateway 关闭时 MUST 终止所有仍在运行的 job 进程，不遗留孤儿进程。分叉或导出会话 MUST NOT 复制 running job。

#### Scenario: 达到上限
- **WHEN** 会话已有 4 个 running job，模型再启动第五个
- **THEN** 启动被拒绝并说明上限，已运行 job 不受影响

#### Scenario: 归档与关闭
- **WHEN** 用户归档会话，或停止 gateway
- **THEN** 相关 running job 进程被终止，不遗留后台进程

### Requirement: 工具边界
`job` 工具 MUST 只提供给主会话 agent，子 agent（包括 coder）MUST NOT 获得该工具。主会话 agent 的 `job start` 与其 `bash` 一样不经用户逐次审批；不得借 job 让 explore 子 agent 绕过其 Bash 审批。

#### Scenario: 子 agent 工具集
- **WHEN** 创建 explore、plan 或 coder 子 agent
- **THEN** 其可用工具中均不含 `job`

#### Scenario: 主 agent 启动
- **WHEN** 主会话 agent 调用 `job start`
- **THEN** 不出现审批请求，行为与主 agent 调用 bash 的授权边界一致
