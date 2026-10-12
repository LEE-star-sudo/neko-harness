# Design

## Context

动机见 proposal.md。Web 经 `NekoWorkspaceFiles.search` 调用 core 的 `searchWorkspaceFiles`；该函数请求 fd 返回文件和目录，但仅清理 `./` 与尾部 `/`，之后拒绝任何反斜杠。TUI 使用 Pi 的独立补全实现，其中先统一显示分隔符，因此无需修改 TUI。

缺少 fd 时 core 抛出普通 Error，gateway 当前未转换错误。Web 已能在候选面板呈现拒绝请求的 message。项目其他服务已使用 Chord `RemoteServiceError` 传递预期错误；已安装版本的错误码为封闭集合，不能自行添加传输错误码。

现有 core 测试验证真实 fd 搜索、忽略规则、边界、超时和数量限制；gateway 测试覆盖 socket/WS 搜索，但没有验证缺少依赖的远程提示。macOS 的只读实验已确认反斜杠输出会被过滤，尚无原生 Windows 验证结果。

## Goals / Non-Goals

**Goals:**
- 将路径输出统一在搜索进程边界，保持浏览器路径契约与安全校验一致。
- 让可恢复的缺少依赖错误通过现有 RPC 到达候选面板，不改变成功响应结构。
- 在 macOS 可执行关键回归测试，并保留原生 Windows 的明确验收步骤。

**Non-Goals:**
- 不改变 TUI 补全、依赖锁版本或其他服务错误策略。
- 不自动安装工具，不探测全部 Linux 发行版，不引入文件系统搜索降级实现。

## Decisions

### 1. 让 fd 显式输出 `/`

在 `searchWorkspaceFiles` 的参数加入 `--path-separator /`。继续保留 NUL 分隔、`./` 清理、目录尾部斜杠清理和基于 stat 的类型判定。

与全局替换反斜杠相比，这不会误把 POSIX 文件名中的字面反斜杠转换成其他路径。继续拒绝此类无法表达的路径，同时保留 realpath 越界检查、忽略规则、超时、取消和结果上限。仅删除尾部反斜杠的方案不能解决嵌套文件，故不采用。

### 2. 明确标识缺少依赖，仅转换这一种错误

core 在 `findFd()` 返回 null 时抛出专用的缺少依赖错误；gateway 在 workspace-files 服务捕获该类型，并转换成现有 `RemoteServiceError("service_not_allowed", safeMessage)`。该错误表示当前搜索能力不可用，message 为预先定义的用户指导，不使用任意底层异常内容。

不根据错误文案字符串识别类型，不把全部异常包装为安装提示；未知异常保持现有处理。成功返回的 `FileCandidates` 不变，避免新增结果联合类型影响调用方。通过真实 RPC 集成测试验证文案实际透传，而非仅断言本地 throw。

### 3. 宿主生成中文平台提示

gateway 使用 `process.platform` 选择固定文案；平台到文案的映射可通过显式参数进行测试。Web 复用现有 message 展示，无需浏览器操作系统探测，也无需额外宿主信息接口。

- win32：`winget install sharkdp.fd`。
- darwin：`brew install fd`。
- linux：标注“Debian/Ubuntu：sudo apt install fd-find”，附其他发行版官方安装文档地址。
- 其他：通用安装说明和官方文档地址。

文档地址为 https://github.com/sharkdp/fd#installation 。提示明确工具应安装在运行 neko 的电脑上，安装后重新打开终端并重启 neko。当前已支持 `fdfind`，无需别名。Linux 不将 apt 表述为全发行版通用命令。候选面板继续保留草稿、取消与过期请求保护；以纯文本显示命令与文档地址即可，不新增安装按钮。

## Risks / Trade-offs

- [macOS 模拟不能覆盖 Windows 进程与 PATH 语义] → 跨平台测试验证参数契约、候选结果与平台映射，并在 Windows 上验证真实 fd、目录继续定位与缺少依赖提示；不可用时明确记录未验证项。
- [旧 fd 版本可能不支持已有或新增参数] → 对支持的 fd 验证真实执行；执行失败保持搜索失败，不误报缺少依赖，本次不增加版本协商。
- [更改 PATH 的测试污染其他用例] → 使用隔离进程或现有文件隔离机制，始终恢复环境，不依赖开发机是否安装 fd。
- [RPC 错误码没有专门的依赖缺失值] → core 使用专用错误类型，仅在 gateway 映射到现有通用能力不可用码；通过固定 message 提供恢复方式。

## Migration Plan

无需数据或配置迁移。构建后重启 gateway 并刷新 Web。回滚时恢复本次实现文件并重新构建、重启；成功搜索响应与持久化数据均未变更。
