# workspace-open-external Specification

## Purpose

让用户在 Web 中一键用本机 VS Code 或文件管理器打开会话的工作区目录，在不改变工作区浏览只读性质的前提下衔接本地编辑与文件定位。

## Requirements

### Requirement: 打开目标与平台适配
系统 SHALL 支持用「VS Code」与「文件管理器」两种方式打开工作区根目录。文件管理器 SHALL 按平台使用系统默认实现并显示对应名称：macOS 为 Finder，Windows 为资源管理器，Linux 为文件管理器；WSL 按 Windows 处理，显示资源管理器并经 Windows 互操作拉起。系统 SHALL 在服务端探测各目标是否可用，并随应用信息下发给前端。

#### Scenario: macOS
- **WHEN** 用户在 macOS 上选择文件管理器
- **THEN** 工作区目录在 Finder 中打开，菜单项名称为「Finder」

#### Scenario: WSL
- **WHEN** 用户在 WSL 中运行本地 neko 并选择文件管理器
- **THEN** 菜单项名称为「资源管理器」，Windows 资源管理器打开该工作区目录

#### Scenario: VS Code 不可用
- **WHEN** 本机探测不到可用的 VS Code 启动方式
- **THEN** 「VS Code」选项置灰并说明原因，文件管理器选项仍可用

### Requirement: 打开接口的安全边界
打开请求 MUST 只被本机浏览器的同源页面接受：对端地址必须是回环地址，Host 与 Origin 必须在允许集合内，跨站请求被拒绝，且 MUST 携带页面获取的 CSRF 令牌，全部校验在产生任何副作用之前完成。请求体 SHALL 有字节上限，目标仅允许 `vscode` 与 `file-manager`，路径 MUST 是已存在的绝对目录，含控制字符或相对路径的请求被拒绝。外部程序 MUST NOT 经 shell 启动，路径只作为参数传递。

#### Scenario: 非回环或跨站请求
- **WHEN** 请求来自非回环对端，或带有跨站 Origin，或缺少、错误的 CSRF 令牌
- **THEN** 服务端返回 403，不启动任何外部程序

#### Scenario: 非法路径
- **WHEN** 请求的路径是相对路径、不存在，或不是目录
- **THEN** 服务端返回明确的 400 类错误，不启动任何外部程序

#### Scenario: 路径含特殊字符
- **WHEN** 工作区路径含空格、引号或 shell 元字符
- **THEN** 路径原样作为单个参数传递，不被解释或拆分

### Requirement: 仅在本机可用时提供
系统 SHALL 仅在请求来自本机回环对端且 Host 在允许集合内时提供打开入口；其余情况（含经局域网地址或转发访问）MUST 隐藏入口，避免在远端机器上弹出窗口。

#### Scenario: 远程访问
- **WHEN** Web 以 `--host 0.0.0.0` 启动，另一台机器的浏览器经局域网地址访问
- **THEN** 不显示打开入口，`/api/open` 拒绝该请求

#### Scenario: 本机访问非回环绑定
- **WHEN** Web 以 `--host 0.0.0.0` 启动，用户在本机经 `127.0.0.1` 访问
- **THEN** 显示打开入口并可正常使用

### Requirement: 打开结果反馈与记忆
打开成功 SHALL 无需额外确认；启动失败或超时 SHALL 以页内错误提示呈现原因，聊天、输入草稿与右侧栏状态 MUST NOT 受影响。系统 SHALL 在浏览器本地记住用户上次选择的打开方式，缺省 VS Code；记住的目标已不可用时回退到可用目标。

#### Scenario: 启动失败
- **WHEN** 拉起 VS Code 因命令不存在或超时失败
- **THEN** 顶栏下方出现错误提示，聊天流与输入框不受影响，用户可改选另一目标

#### Scenario: 记住上次选择
- **WHEN** 用户从下拉选择「文件管理器」并打开后刷新页面
- **THEN** 主按钮仍指向文件管理器，缺省首次使用指向 VS Code
