## ADDED Requirements

### Requirement: web 退出可靠性

`neko web` 收到终止信号（SIGINT、SIGTERM，Windows 另含 SIGBREAK、SIGHUP）后 SHALL 在有界时间内完整退出：停止接受新连接并断开所有现有 HTTP 连接，关停自己拉起的 gateway，随后结束进程并释放静态端口。关闭流程 MUST 幂等；超过总时限仍未完成时 SHALL 强制终止子进程并退出；再次收到终止信号 SHALL 立即强制退出。启动尚未完成时收到信号也 MUST NOT 遗留 gateway 子进程。

#### Scenario: 存在未完成请求时退出
- **WHEN** 浏览器仍有进行中或空闲保持的 HTTP 连接（含手机配对状态查询），用户按 Ctrl+C
- **THEN** 连接被断开，web 与其拉起的 gateway 均退出，静态端口立即可被下次启动使用

#### Scenario: Windows 与 WSL 终端
- **WHEN** 用户在 Windows 或 WSL 终端中对 `neko web` 按 Ctrl+C（gateway 子进程可能同时收到同一信号）
- **THEN** 不出现只有 gateway 退出、web 进程残留并占用端口的情况

#### Scenario: 关闭挂起
- **WHEN** 关闭流程因对端无响应超过总时限，或用户再次按 Ctrl+C
- **THEN** 进程强制结束子进程并退出，不无限等待

#### Scenario: 复用已有 gateway
- **WHEN** web 复用的是其他前端拉起的 gateway 并收到 Ctrl+C
- **THEN** web 自身退出并释放端口，不终止已有 gateway

### Requirement: 配对管理代理调用有界

web 对 gateway 的手机配对管理代理调用 SHALL 有超时上限；超时或 gateway 不可达时 MUST 向浏览器返回明确错误并释放相关连接，不得使 HTTP 请求或退出流程无限挂起。

#### Scenario: gateway 无响应
- **WHEN** gateway 正在退出或无响应时浏览器请求手机配对状态
- **THEN** 请求在上限时间内以错误结束，页面显示不可用提示，web 的退出流程不受该请求阻塞
