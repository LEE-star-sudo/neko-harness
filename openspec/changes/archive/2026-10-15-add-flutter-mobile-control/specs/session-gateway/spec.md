# Spec Delta

## MODIFIED Requirements

### Requirement: 传输支持

网关 SHALL 按平台提供本地 Chord 传输：macOS/Linux 同时提供 Unix socket（供终端等本地客户端）与 WebSocket（供浏览器）；Windows 不提供 Unix socket，仅提供 WebSocket。所有平台上已启用的本地 Chord 传输 MUST 提供完全相同的服务契约、输入输出校验和取消语义。新版客户端 SHALL 校验目标网关身份，不支持旧版协议回退；无效帧与超限缓冲 MUST 有界处理而不影响其他连接。可选移动入口 SHALL 使用独立认证与版本化 API，不直接公开本地 Chord 服务，其开放业务保持相同的持久会话语义。

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

#### Scenario: 独立移动连接

- **WHEN** 用户开启局域网移动入口
- **THEN** 手机只经认证的移动 API 访问已开放业务，本地 Chord 地址与现有客户端契约保持不变

### Requirement: 有界图片传输与预览

网关 SHALL 在所有已启用的本地 Chord 传输上提供相同的图片提交与按需读取能力；图片与文字合为一次会话输入。状态投影 SHALL 仅携带有界附件描述，图片数据按需取得，不随流式增量重复广播。图片读取 MUST 校验会话、条目和内容位置，不允许将预览请求用作任意宿主路径读取。移动 API SHALL 独立声明媒体能力，首版提供历史图片读取而不开放手机上传。

#### Scenario: 大图与慢客户端

- **WHEN** 用户提交多张图片或慢客户端查看图片历史
- **THEN** 传输按已公布限制分块并限制并发，不通过无限增大帧或缓冲上限规避问题，文字流和其他客户端仍可工作

#### Scenario: 未完成上传与断线

- **WHEN** 上传后尚未提交就断线，或提交确认丢失后重试
- **THEN** 未使用的临时数据可回收，已受理消息通过请求标识恢复；不出现半条消息或重复消息

#### Scenario: 非当前会话与失效引用

- **WHEN** 读取合法历史附件或请求不属于指定会话的附件
- **THEN** 前者返回原图片，后者明确失败；错误不泄露无关文件内容

#### Scenario: 手机媒体能力

- **WHEN** 手机读取历史图片或尝试调用上传
- **THEN** 合法历史图片可有界读取，上传明确不支持，不改变 TUI/Web 已有图片提交能力

## ADDED Requirements

### Requirement: 移动入口共用持久运行时

移动入口 SHALL 由当前 gateway 管理并共用同一个持久运行时与会话目录，支持在 TUI、Web 或独立 serve 启动的 gateway 上按需启停，不重启或另开存储。多个前端对同一会话 SHALL 观察同一输入、回答、委派、用量与审批结果；移动资源释放不导致已受理业务终止。

#### Scenario: 复用 TUI 网关
- **WHEN** 先启动 TUI，后启动 Web 并在设置中开启手机访问
- **THEN** 手机连接同一 gateway，已有主/子会话和用量一致，不出现第二个 Harness 或存储占用错误

#### Scenario: 前端和入口关闭
- **WHEN** 复用已有 gateway 的 Web 页面或手机关闭，或手机入口被关闭
- **THEN** gateway 继续持有会话；只释放对应客户端/移动监听资源，不终止 TUI、独立 serve 或已受理任务

#### Scenario: 拉起 gateway 的前端退出
- **WHEN** 手机入口所在的 gateway 由某个前端进程拉起，该前端退出导致 gateway 停止
- **THEN** 手机连接断开并显示电脑不可达；之后任一前端或 serve 再次启动 gateway 时按已保存配置恢复手机入口，已配对设备无需重新扫码
