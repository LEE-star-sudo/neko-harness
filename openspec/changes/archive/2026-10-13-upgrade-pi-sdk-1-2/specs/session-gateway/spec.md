# Spec Delta

## MODIFIED Requirements

### Requirement: 多前端 attach

系统 SHALL 允许多个前端同时 attach 同一会话，每个 attachment 有服务端分配的标识；重复 attach MUST 幂等。attach 成功 SHALL 表示当前会话首个完整视图已可用；切换或 detach 后旧 attachment MUST 不再接受新会话操作。连接私有的未提交图片与请求资源 MUST 与其他 attachment 隔离，共享会话运行不随前端释放而终止。

#### Scenario: 双前端同步

- **WHEN** 终端和 Web 同时 attach 同一会话，终端提交一条输入
- **THEN** 两个前端都收到该输入及后续的流式回答

#### Scenario: 断连释放

- **WHEN** 某前端连接断开
- **THEN** 其 attachment 在已受理调用结算后释放，会话本身与其他 attachment 不受影响；未使用图片资源被回收，可取消的查询停止

#### Scenario: 首次状态与重复 attach

- **WHEN** 客户端 attach 到一个会话，或在同一连接重复 attach 同一会话
- **THEN** 成功返回时首个视图已可读取；重复 attach 保持相同 attachment 标识，不重复创建共享会话观察资源

#### Scenario: 旧会话引用失效

- **WHEN** 客户端切换会话、detach，或原会话已归档后仍使用旧引用提交输入、修改配置或操作图片
- **THEN** 操作明确失败，不发送到旧会话或新会话，迟到状态不覆盖新选择

#### Scenario: 上传隔离

- **WHEN** 两个客户端 attach 同一会话，一端尝试使用另一端尚未提交的图片上传引用
- **THEN** 引用被拒绝；关闭或切换其中一端不会回收另一端的上传或停止共享会话回答

### Requirement: 传输支持

网关 SHALL 按平台提供本地传输：macOS/Linux 同时提供 Unix socket（供终端等本地客户端）与 WebSocket（供浏览器）；Windows 不提供 Unix socket，仅提供 WebSocket。所有平台上已启用的传输 MUST 提供完全相同的服务契约、输入输出校验和取消语义。新版客户端 SHALL 校验目标网关身份，不支持旧版协议回退；无效帧与超限缓冲 MUST 有界处理而不影响其他连接。

#### Scenario: 浏览器连接

- **WHEN** Web 前端通过 WebSocket 连接网关
- **THEN** 可完成握手、会话列表查询与会话 attach

#### Scenario: Windows 本地客户端连接

- **WHEN** TUI 在 Windows 上连接网关
- **THEN** 通过 WebSocket 完成握手与会话 attach，不尝试 Unix socket

#### Scenario: POSIX 双传输不变

- **WHEN** 网关运行于 macOS/Linux
- **THEN** Unix socket 与 WebSocket 同时可用，已有客户端业务操作保持一致

#### Scenario: 网关身份不匹配

- **WHEN** 客户端连接到身份与发现结果不同的网关
- **THEN** 连接被明确拒绝，不读取或提交该网关的会话内容

#### Scenario: 无效帧与慢连接

- **WHEN** 某连接发送无法解析的帧、超过单帧限制，或发送缓冲超过上限
- **THEN** 只关闭该连接并释放相关资源，不无限累积字节或阻塞其他客户端

#### Scenario: 活跃实例与遗留 socket

- **WHEN** 新网关尝试使用已占用的 Unix socket 或端口，或遇到已无监听者的遗留 socket
- **THEN** 活跃实例占用时拒绝启动并给出可操作提示，仅对确认已无监听者的遗留 socket 接管

## ADDED Requirements

### Requirement: 服务边界校验与就绪

网关 SHALL 在远程服务边界校验请求参数、响应和订阅状态，并向 TUI/Web 提供一致的错误语义。服务器级目录、工作区与凭据的初始状态未到达前，客户端 MUST NOT 宣称管理操作已就绪；无效输入 SHALL 在执行业务修改之前拒绝。凭据及工具内部数据 MUST NOT 因错误或状态校验泄露到客户端。

#### Scenario: 无效参数

- **WHEN** 客户端向创建、配置、图片上传或文件查询方法发送类型错误的参数
- **THEN** 请求被明确拒绝，不创建会话、不修改配置、不留下部分上传，连接仍能处理后续有效请求

#### Scenario: 首个订阅状态迟到

- **WHEN** 服务连接建立成功，但目录、工作区或凭据快照仍未到达
- **THEN** 客户端保持加载状态并等待实际快照；超时或断连返回明确错误，不把未到达状态当成空目录或无凭据
