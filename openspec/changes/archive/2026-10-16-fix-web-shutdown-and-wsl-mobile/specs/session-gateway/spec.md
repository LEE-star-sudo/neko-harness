## ADDED Requirements

### Requirement: 网关关闭时释放全部移动资源

gateway 收到终止信号或被拉起方关停时 SHALL 在有界时间内关闭：断开移动连接、停止移动监听、关停 WSL Windows 侧中继、释放 WebSocket 与 Unix socket 后退出，Windows 端口文件 MUST 被清除。关闭失败或超时 MUST 以非零状态强制退出，不遗留监听端口或 Windows 侧中继。拉起方对自己拉起的 gateway SHALL 在其未按时退出时强制终止，并在 Windows 补删端口文件。

#### Scenario: 拉起方与网关同时收到信号
- **WHEN** 终端 Ctrl+C 使 web（或 TUI）与其拉起的 gateway 同时收到信号
- **THEN** gateway 完成自身清理，拉起方不重复关停也不因其已退出而报错，两进程均退出且无端口残留

#### Scenario: 网关强制关停
- **WHEN** gateway 在 3 秒宽限内未退出
- **THEN** 拉起方强制终止它；移动监听与中继随进程消失或由中继自身探测断连后退出，下次启动不被占用端口阻塞

#### Scenario: 复用方不终止网关
- **WHEN** 复用已有 gateway 的前端退出
- **THEN** 该 gateway、手机入口与中继保持不变
