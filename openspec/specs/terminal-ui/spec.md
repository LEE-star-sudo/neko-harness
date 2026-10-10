# terminal-ui Specification

## Purpose

终端交互前端：在 TUI 中与持久会话对话，支持流式渲染、steer/follow-up 与会话管理。

## Requirements

### Requirement: 交互式对话

系统 SHALL 提供终端交互界面，用户可提交输入并看到流式回答、工具调用及其输出。

#### Scenario: 流式渲染

- **WHEN** 用户提交输入
- **THEN** 回答文本与工具输出随到达即时渲染，而非等待整轮结束

### Requirement: 消息插话

系统 SHALL 支持在 agent 工作中提交 steer（插入当前工具轮之后）与 follow-up（等待当前 run 结束）两类消息。

#### Scenario: steer 打断

- **WHEN** agent 执行中用户提交 steer 消息
- **THEN** 该消息在当前工具轮结束后加入进行中的工作

### Requirement: 会话管理

系统 SHALL 支持在终端中列出、切换、fork 会话，并显示当前会话的模型、用量与忙碌状态。

#### Scenario: 切换会话

- **WHEN** 用户从会话列表选择另一会话
- **THEN** 界面切换到该会话的完整记录与当前状态
