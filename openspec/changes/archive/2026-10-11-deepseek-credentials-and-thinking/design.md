# Design

## Context

动机见 proposal.md。当前 runtime 在无环境变量时抛错，且通过修改 process.env 传递编程入口的 apiKey；Web settings-page 为占位页，model-picker 仅提交模型。TUI 已有 /think 参数命令但固定接受全部档位。网关已有会话 configure 和模型目录服务，可扩展而无需改动 Pi。

本地 Pi 1.1.0 提供 CredentialStore、createModels({ credentials })、getSupportedThinkingLevels 和 clampThinkingLevel。已执行验证：Flash 返回 off/low/high/max，Pro 返回 off/high/max；Pro low 调整为 high，xhigh 调整为 max。外部目录虽有不同能力，本变更以安装版本为准。

## Goals / Non-Goals

**Goals:** 复用 Pi 的认证解析与强度语义；网关集中管理用户级秘密，前端只持有输入时的短期明文；配置状态与实际请求一致。

**Non-Goals:** 升级或修改 Pi、覆盖模型目录、引入新认证协议、验证余额/付费推理测试、将凭据绑定工作区、修改历史会话或标题命名规则。

## Decisions

### D1. 独立用户级 CredentialStore

默认使用 `~/.neko/credentials.json`，provider ID 为键，保存 Pi `api_key` 凭据形状；由宿主适配 CredentialStore，注入 createModels。用户明确同意独立文件持久化，因此不采用浏览器 localStorage、项目配置或仅内存保存。文件权限 0600，创建目录采用 0700；同目录临时文件加原子替换，写成功后才发布状态。读写失败不覆盖原文件、不静默回退为空凭据。写入和删除串行化，多进程共享文件时使用锁保护并重新读取，避免丢失更新；请求读取当前存储，前端重连刷新状态。

测试注入临时存储或内存 CredentialStore，不读写真实用户文件。保留编程入口 apiKey 的显式临时覆盖语义，但通过注入认证上下文/凭据适配实现，不写 process.env、不自动落盘；正常 CLI 网关不设置该覆盖。若嵌入式运行时显式覆盖存在，状态来源单独标记为 runtime，优先于保存值，避免状态谎报。

### D2. 无 Key 启动与请求边界

移除启动时必需凭据检查，在接受 DeepSeek 新输入前检查 Pi 认证是否配置；失败返回可识别的缺少凭据错误，前端导向 /login 或设置，不写消息和 recency。模型目录使用完整目录而非仅已认证列表，确保首次配置可见模型。检查只判断存在性，不发付费请求、不宣称 Key 有效；真正的认证失败由模型请求反馈，不能自动删除用户保存的 Key。

凭据按每次模型请求解析，进行中的 HTTP 请求继续，下一次请求（包括工具轮后的请求和后台命名请求）使用最新值。保留 Pi 的执行与恢复语义，不因更换 Key 主动重启运行。自动标题仍使用 off，不能随会话 high 改变。

### D3. 网关集中配置服务

增加服务器级 `neko.credentials` 状态订阅及 save/remove 操作，范围仅 DeepSeek。状态含 revision、savedConfigured、environmentConfigured、source（saved/environment/none，嵌入式可为 runtime），不含 Key 或末尾片段。save 拒绝 trim 后空值，remove 为明确操作；错误去除敏感内容。沿用现有受信任本地网关连接，不建立新账户体系。TUI Unix 和 Web WS 共用服务；同一网关的操作串行发布。客户端断线/迟到响应按 revision 处理。

### D4. Pi 为唯一模型能力来源

扩展 NekoModelInfo 和浏览器镜像契约，传递 Pi 计算的 supportedThinkingLevels 及切换时所需的有效默认值。不要在两个前端分别硬编码 Flash/Pro 表，也不要把官方新增 Pro low 写进 provider。服务端配置时按目标模型调用 clampThinkingLevel；模型及调整后强度同次 configure。前端预览共用纯函数/共享模块，并以服务端投影为最终值。直接 /think 参数不在支持列表时给出可用选项，不静默显示成功。

无显式覆盖的新会话使用 deepseek-flash/high；配置文件、调用参数和恢复会话遵循原优先级。两端切换模型保留支持的当前强度，不支持则按 Pi 调整（Flash low -> Pro high）。不自行使用其他档位作为别名。价格等原目录字段保持来源，不顺带更新外部价格。

### D5. 前端交互

TUI /login 使用单独遮罩输入组件，不能复用聊天输入或命令参数收集秘密；布局遵循现有面板尺寸、焦点与过期响应约束，语言英语。无参数 /think 打开现有统一 picker，带参数路径保留并增加能力校验。保存、移除、取消各自明确；获取 Key 显示可访问链接。

Web settings-page 以单张卡为主体，白色表面、浅蓝状态、粉色主按钮，中文产品标签；不改导航中性色。呈现来源与环境变量状态、空密码框、保存、移除和获取 Key 链接；简短连接状态代替 serverId/socket 技术块。密码不回填，不持久化草稿，保存、取消/离开后清空。已配置不标为认证成功。

聊天区 model-picker 改为模型+强度草稿面板，确认一次提交，取消保持配置。会话切换关闭面板并丢弃旧配置草稿，异步响应绑定会话身份；状态栏使用实际 agent.thinkingLevel。复用现有弹层定位和焦点机制，避免固定宽度在移动端越界。

## Risks / Trade-offs

- 本地文件保存明文秘密 → 0600 权限、独立目录、禁止日志/前端回读；不声称加密存储。
- 网关继承的环境变量与用户新开的终端不同 → 明确展示的是网关环境，保存覆盖无需重启；改变 shell 环境本身不会更新已运行网关。
- Pi 目录落后于服务商 → 本次明确遵循锁定版本，能力变化留待显式上游升级，不补丁式绕过。
- 凭据在运行期间被移除 → 已发请求继续，后续请求可能认证失败，正常报告而不销毁会话。
- 嵌入式临时 apiKey 与 UI 保存值同时存在 → 明确 runtime 来源与优先级，不改变既有显式参数语义。

## Migration Plan

只新增凭据文件与服务协议字段，同步构建/发布 gateway、TUI、Web。无需会话数据库迁移或历史清理；旧环境变量配置继续有效。用户主动保存才创建持久凭据。回滚旧版本时使用环境变量，凭据文件保留但旧版忽略；不自动转换或删除文件。
