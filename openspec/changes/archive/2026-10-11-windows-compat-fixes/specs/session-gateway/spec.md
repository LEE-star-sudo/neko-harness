# Spec Delta

## MODIFIED Requirements

### Requirement: Windows 网关地址发现

Windows 上网关 SHALL 以随机 WebSocket 端口启动，并将实际 ws 地址写入 `<数据目录>/<serverId>.port` 端口文件，供本机前端发现连接；端口文件 MUST 与 serverId 文件同属数据目录并随网关关闭清理。macOS/Linux MUST NOT 产生端口文件，地址发现机制保持现状。

#### Scenario: Windows 启动与发现

- **WHEN** 网关或前端在 Windows 上拉起新网关
- **THEN** 网关监听随机端口、写出端口文件，前端读文件后以 ws 地址连接

#### Scenario: 端口文件清理

- **WHEN** Windows 上的网关正常关闭，或被强杀导致其清理逻辑未执行
- **THEN** 正常关闭时端口文件被移除；强杀残留由拉起方在终止网关进程后补删，仍残留的过期文件以前端连接失败按无活跃网关兜底

#### Scenario: POSIX 无端口文件

- **WHEN** 网关运行于 macOS/Linux
- **THEN** 数据目录中不出现端口文件，前端沿用 Unix socket 发现
