# agent-runtime Specification

## Purpose

neko-harness 的持久化对话运行时：管理会话生命周期、工具执行与扩展，保证进程重启后会话与未完成任务可恢复。

## Requirements

### Requirement: 持久化会话

系统 SHALL 将对话条目、文档与任务状态在展示前原子提交到本地 SQLite 存储，进程重启后重新打开同一存储 MUST 恢复全部会话。

#### Scenario: 重启恢复

- **WHEN** 进程在模型回答途中被杀掉，随后重新启动并打开同一存储文件
- **THEN** 会话记录完整存在，且未完成的 run 可被恢复继续

#### Scenario: 重复提交去重

- **WHEN** 客户端用相同 requestId 重复提交同一条输入
- **THEN** 系统返回已有 submission 而不是创建第二条

### Requirement: 内置编码工具

系统 SHALL 提供 read、write、edit、bash 四个内置工具，工具调用的意图在执行前提交，执行输出有界截断后返回模型。

#### Scenario: 崩溃后工具不重放

- **WHEN** 进程在未声明 replay: "safe" 的工具执行途中崩溃并重启
- **THEN** 模型收到 interrupted 错误结果及已提交的部分输出，该工具不被重新执行

### Requirement: 扩展机制

系统 SHALL 支持以命名扩展形式安装工具、system prompt 段落与 hooks，扩展 MUST 可在运行中替换，运行中的任务沿用其启动时的实现。

#### Scenario: 热替换扩展

- **WHEN** 用同名扩展重新 install
- **THEN** 新发起的请求使用新实现，已开始执行的工具调用在原实现下完成

### Requirement: 用量统计

系统 SHALL 按 provider/model 与工具名累计 token 与成本，包含失败与中止的尝试，并能按会话和全局查询。

#### Scenario: 查询会话用量

- **WHEN** 前端请求某会话的用量
- **THEN** 返回该会话按模型和工具分组的 token 与成本汇总
