# session-gateway Specification

## Purpose

本地会话网关：托管持久会话并向多个前端提供统一的连接、attach 与服务路由，使终端和 Web 可同时对同一会话工作。

## Requirements

### Requirement: 会话目录

系统 SHALL 维护会话目录（创建、列出、删除会话），目录变化 MUST 实时推送给已连接的前端。

#### Scenario: 新会话广播

- **WHEN** 任一前端创建会话
- **THEN** 所有已连接前端在目录更新中收到该会话

### Requirement: 多前端 attach

系统 SHALL 允许多个前端同时 attach 同一会话，每个 attachment 有服务端分配的标识；重复 attach MUST 幂等。

#### Scenario: 双前端同步

- **WHEN** 终端和 Web 同时 attach 同一会话，终端提交一条输入
- **THEN** 两个前端都收到该输入及后续的流式回答

#### Scenario: 断连释放

- **WHEN** 某前端连接断开
- **THEN** 其 attachment 在已受理调用结算后释放，会话本身与其他 attachment 不受影响

### Requirement: 传输支持

网关 SHALL 同时提供 Unix socket（供终端等本地客户端）与 WebSocket（供浏览器）两种传输。

#### Scenario: 浏览器连接

- **WHEN** Web 前端通过 WebSocket 连接网关
- **THEN** 可完成握手、会话列表查询与会话 attach
