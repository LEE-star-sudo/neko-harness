# Spec Delta

## ADDED Requirements

### Requirement: 前端自动启动与跨前端复用

默认配置下，TUI 与 Web SHALL 按任意顺序启动并连接同一数据目录的同一 gateway，后启动的前端 MUST 复用活跃实例。POSIX 上自动启动的默认 gateway SHALL 同时提供 Unix socket 与 WebSocket；Windows SHALL 保持随机 WS 端口及端口文件发现。复用方关闭 MUST NOT 终止已有 gateway。

#### Scenario: TUI 先启动
- **WHEN** 默认配置下 TUI 自动启动 gateway，随后 Web 使用同一数据目录启动
- **THEN** Web 复用该 gateway，浏览器完成 WS 握手、会话列表查询及与 TUI 相同会话的 attach，TUI 保持可用

#### Scenario: Web 先启动
- **WHEN** 默认配置下 Web 自动启动 gateway，随后 TUI 使用同一数据目录启动
- **THEN** TUI 复用该 gateway，两端可以 attach 同一会话，关闭复用方不影响原前端

#### Scenario: Windows 跨前端发现
- **WHEN** Windows 上任一前端自动启动 gateway 后另一前端启动
- **THEN** 后启动的前端通过端口文件发现实际随机 WS 地址并校验身份后复用，不使用 Unix socket

### Requirement: Web 启动验证所需传输

Web SHALL 在启动成功并向浏览器发布连接地址前，对将发布的 WS 地址完成有界的握手及目标 gateway 身份验证，不得仅凭 Unix socket 存活宣称 WS 可用。已有活跃 Unix gateway 而指定 WS 不可用或身份不匹配时，Web MUST 明确失败并提供检查地址配置或重新启动双传输 gateway 的提示，不启动竞争实例、不停止已有 gateway；探测资源 MUST 释放。

#### Scenario: 旧的仅 Unix gateway
- **WHEN** 已有活跃 Unix gateway 未启用 WS，Web 尝试复用
- **THEN** Web 在有界时间内报错，不发布不可用连接地址，已有 TUI 连接与会话仍可用

#### Scenario: 自定义地址
- **WHEN** Web 使用与已有 gateway 一致的自定义 host 与端口
- **THEN** 验证该地址成功后发布该地址；地址无法连接时明确失败，不返回默认端口作为成功结果

#### Scenario: WS 身份不匹配
- **WHEN** 指定 WS 地址连接到另一 serverId 的 gateway
- **THEN** Web 拒绝该地址，不读取或修改另一 gateway 的会话，原 Unix gateway 保持可用

#### Scenario: 新网关 WS 未就绪
- **WHEN** Web 拉起的子进程已有 Unix socket，但 WS 尚未完成握手
- **THEN** Web 继续在启动期限内等待 WS 验证；超时或子进程退出时明确失败并清理自己拉起的子进程和探测连接
