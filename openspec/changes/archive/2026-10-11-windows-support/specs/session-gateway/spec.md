# Spec Delta

## MODIFIED Requirements

### Requirement: 传输支持

网关 SHALL 按平台提供本地传输：macOS/Linux 同时提供 Unix socket（供终端等本地客户端）与 WebSocket（供浏览器）；Windows 不提供 Unix socket，仅提供 WebSocket。所有平台上已启用的传输 MUST 提供完全相同的服务契约。

#### Scenario: 浏览器连接

- **WHEN** Web 前端通过 WebSocket 连接网关
- **THEN** 可完成握手、会话列表查询与会话 attach

#### Scenario: Windows 本地客户端连接

- **WHEN** TUI 在 Windows 上连接网关
- **THEN** 通过 WebSocket 完成握手与会话 attach，不尝试 Unix socket

#### Scenario: POSIX 双传输不变

- **WHEN** 网关运行于 macOS/Linux
- **THEN** Unix socket 与 WebSocket 同时可用，行为与本变更前一致

### Requirement: 有界图片传输与预览

网关 SHALL 在所有已启用的传输上提供相同的图片提交与按需读取能力；图片与文字合为一次会话输入。状态投影 SHALL 仅携带有界附件描述，图片数据按需取得，不随流式增量重复广播。图片读取 MUST 校验会话、条目和内容位置，不允许将预览请求用作任意宿主路径读取。

#### Scenario: 大图与慢客户端

- **WHEN** 用户提交多张图片或慢客户端查看图片历史
- **THEN** 传输按已公布限制分块并限制并发，不通过无限增大帧或缓冲上限规避问题，文字流和其他客户端仍可工作

#### Scenario: 未完成上传与断线

- **WHEN** 上传后尚未提交就断线，或提交确认丢失后重试
- **THEN** 未使用的临时数据可回收，已受理消息通过请求标识恢复；不出现半条消息或重复消息

#### Scenario: 非当前会话与失效引用

- **WHEN** 读取合法历史附件或请求不属于指定会话的附件
- **THEN** 前者返回原图片，后者明确失败；错误不泄露无关文件内容

## ADDED Requirements

### Requirement: Windows 网关地址发现

Windows 上网关 SHALL 以随机 WebSocket 端口启动，并将实际 ws 地址写入 `<数据目录>/<serverId>.port` 端口文件，供本机前端发现连接；端口文件 MUST 与 serverId 文件同属数据目录并随网关关闭清理。macOS/Linux MUST NOT 产生端口文件，地址发现机制保持现状。

#### Scenario: Windows 启动与发现

- **WHEN** 网关或前端在 Windows 上拉起新网关
- **THEN** 网关监听随机端口、写出端口文件，前端读文件后以 ws 地址连接

#### Scenario: 端口文件清理

- **WHEN** Windows 上的网关正常关闭
- **THEN** 对应端口文件被移除；残留的过期端口文件连接失败时按无活跃网关处理

#### Scenario: POSIX 无端口文件

- **WHEN** 网关运行于 macOS/Linux
- **THEN** 数据目录中不出现端口文件，前端沿用 Unix socket 发现
