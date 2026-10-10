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

### Requirement: 会话工作区
系统 SHALL 在创建会话时保存规范化的绝对工作区目录，并以此作为内置工具的默认工作目录。重启后目录 MUST 保持不变；fork SHALL 继承源会话工作区，包括空会话。工作区仅定义工作上下文，不限制工具显式访问其他目录。

#### Scenario: 显式目录与默认目录
- **WHEN** 调用方创建会话并提供目录，或省略目录
- **THEN** 系统分别使用提供的目录，或运行时启动时确定的默认目录，并在创建时持久保存绝对路径

#### Scenario: 重启与不同宿主目录
- **WHEN** 运行时从另一个目录重开存储并恢复会话
- **THEN** read、write、edit 与 bash 的默认目录仍为该会话保存的工作区

#### Scenario: 分叉继承
- **WHEN** 在不同默认工作区的宿主上 fork 有历史或空会话
- **THEN** 子会话工作区与源会话一致

#### Scenario: 无效工作区
- **WHEN** 创建时目录不存在、不是目录或无法解析
- **THEN** 系统返回可理解的错误，不创建可用会话且不退回宿主目录

#### Scenario: 显式跨目录操作
- **WHEN** 工具使用工作区之外的显式路径
- **THEN** 不因工作区归属而拒绝操作，仍按工具与操作系统原有权限执行

#### Scenario: 恢复时目录消失
- **WHEN** 已保存工作区不再可用
- **THEN** 会话保留原归属，依赖该目录的操作报告错误，不静默改用进程目录
