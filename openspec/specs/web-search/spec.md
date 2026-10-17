# web-search Specification

## Purpose

为 agent 提供联网能力：以 Tavily 为后端的搜索与网页抽取工具，默认免配置（keyless）可用，保存或环境变量提供 API key 后无缝升级。

## Requirements

### Requirement: 内置联网工具

系统 SHALL 为所有会话默认提供 web_search 与 web_extract 两个工具，其名称、参数与输出格式不因 provider 而变化。web_search 按查询返回排序的来源列表（标题、URL、相关内容）；web_extract 抽取给定 URL 的正文内容，单个 URL 失败 MUST NOT 导致整个调用失败。工具输出 SHALL 有界截断后返回模型。

#### Scenario: 搜索实时信息

- **WHEN** agent 需要当前网络信息并调用 web_search
- **THEN** 返回按相关性排序的来源列表，每项含标题、URL 与内容摘要，输出超长时被有界截断

#### Scenario: 抽取部分失败

- **WHEN** web_extract 的 URL 列表中部分不可访问
- **THEN** 可用 URL 的正文正常返回，失败 URL 以逐项错误标注，调用整体不失败

#### Scenario: provider 切换对模型透明

- **WHEN** 用户在会话期间切换搜索 provider
- **THEN** 后续调用仍使用同一对工具，历史工具结果保持原样

### Requirement: Tavily 凭据解析

系统 SHALL 在所选 provider 为 tavily 时按优先级解析 Tavily 凭据：运行时覆盖高于 UI 保存值，保存值高于 TAVILY_API_KEY 环境变量；三者均无时使用 keyless 模式（免 key、限流，仅搜索与抽取可用）。keyless SHALL 作为独立的生效来源展示，而非"未配置"；保存或环境变量提供 key 后下一次调用即升级，无需重启。

#### Scenario: 零配置可用

- **WHEN** 未配置任何 Tavily key 且选择为 tavily 的会话调用 web_search
- **THEN** 请求以 keyless 模式发出并返回真实结果，前端凭据来源显示为 keyless 受限

#### Scenario: 保存后升级与移除回退

- **WHEN** 已有环境变量时保存另一个 key，调用一次工具后移除保存值
- **THEN** 保存后使用保存值，移除后回退环境变量；两者皆无时回退 keyless

### Requirement: 限流与错误反馈

任一 provider 限流或返回错误时，系统 SHALL 以工具错误结果告知模型，内容包含可操作的后续指引（如配置 API key、充值或切换 provider），MUST NOT 中断当前 run 或泄露密钥。网络失败与超时 SHALL 以可理解错误呈现且可重试。

#### Scenario: keyless 撞限流

- **WHEN** keyless 配额耗尽时调用 web_search
- **THEN** 工具返回错误结果，说明限流并引导配置 API key，run 继续而不崩溃

#### Scenario: 网络错误

- **WHEN** 请求因网络失败
- **THEN** 模型收到可理解的错误结果，用户可重试，错误不含密钥

#### Scenario: DeepSeek 错误不泄露密钥

- **WHEN** DeepSeek 返回错误响应，且响应或底层异常中带有请求使用的 Key
- **THEN** 工具错误中的 Key 已被遮蔽，run 继续

### Requirement: 联网凭据保密

系统 MUST 仅向前端返回各搜索相关凭据（DeepSeek、Tavily）的保存状态、环境变量是否配置及当前生效来源（Tavily 含 keyless），以及搜索 provider 的选择，不返回已有密钥。密钥 MUST NOT 写入会话、日志、项目配置或浏览器持久存储。

#### Scenario: 查看状态

- **WHEN** 任一前端读取联网相关状态
- **THEN** 仅见是否已保存、环境变量是否配置、生效来源与搜索 provider 选择，无任何密钥内容

### Requirement: 搜索 provider 选择

系统 SHALL 支持用户级搜索 provider 选择，取值为 tavily、deepseek，默认 tavily；MUST NOT 提供自动选择。选择 SHALL 持久保存、所有工作区与会话共用，重启后保留；优先级为已保存选择高于配置文件 `webSearch.provider`，后者高于默认 tavily。变更后的下一次工具调用 SHALL 使用新选择，已发出的请求不被中断。凭据的保存或移除 MUST NOT 改变选择。

#### Scenario: 默认选择

- **WHEN** 从未保存选择且配置文件未设置 `webSearch.provider`，即便已配置 DeepSeek Key
- **THEN** 选择为 tavily，web_search 与 web_extract 使用 Tavily

#### Scenario: 保存后跨重启保留

- **WHEN** 用户选择 deepseek 并重启网关
- **THEN** 选择仍为 deepseek，所有会话的下一次调用使用 DeepSeek

#### Scenario: 配置文件提供初始值

- **WHEN** 未保存选择且配置文件设置 `webSearch.provider` 为 deepseek
- **THEN** 选择为 deepseek；用户保存其他选择后以保存值为准

#### Scenario: 无效取值

- **WHEN** 配置文件的 `webSearch.provider` 不是 tavily、deepseek 之一（包括已取消的 auto），或客户端提交未知取值
- **THEN** 配置加载报出明确错误，客户端提交被拒绝且保留原选择

#### Scenario: 凭据变化不改变选择

- **WHEN** 选择为 tavily，用户保存 DeepSeek Key 后 agent 调用 web_search
- **THEN** 请求仍发往 Tavily

### Requirement: 选择不静默回退

系统 MUST 仅使用所选 provider；该 provider 不可用或失败时 SHALL 返回工具错误，说明失败原因及可操作指引（配置对应 Key 或切换 provider），MUST NOT 改用另一 provider。

#### Scenario: 选择 deepseek 但无 Key

- **WHEN** 选择为 deepseek 且未配置 DeepSeek Key，agent 调用 web_search
- **THEN** 不发出任何网络请求，工具返回错误并指引配置 DeepSeek Key 或切换 provider，run 继续

#### Scenario: 选择 tavily 无 Key

- **WHEN** 选择为 tavily 且未配置 Tavily Key，即便已配置 DeepSeek Key
- **THEN** 请求以 Tavily keyless 模式发出，不使用 DeepSeek

### Requirement: DeepSeek 搜索

deepseek provider SHALL 使用 DeepSeek 官方 Search 接口，鉴权使用与模型相同的 DeepSeek 凭据。每个来源 SHALL 包含标题、URL 与面向模型的长摘要，并在存在时附带发布时间；输出 SHALL 有界截断。query 超过 128 个字符 SHALL 在发出请求前被拒绝并提示缩短，空白 query 同样被拒绝。结果数量 SHALL 遵循工具的 1-10 范围。

#### Scenario: 正常搜索

- **WHEN** deepseek provider 处理 web_search 并收到结果
- **THEN** 返回按服务端顺序排列的来源，每项含标题、URL、摘要，已知时含发布时间，超长内容被截断

#### Scenario: query 过长

- **WHEN** query 超过 128 个字符
- **THEN** 工具返回说明字符上限并要求缩短的错误，且不发出请求

#### Scenario: 无结果

- **WHEN** DeepSeek 返回空结果数组
- **THEN** 工具输出 No results.，不视为错误

### Requirement: DeepSeek 抓取

deepseek provider SHALL 使用 DeepSeek 官方 Fetch 接口实现 web_extract。该接口一次仅抓取一个 URL，系统 SHALL 以受限并发处理多 URL，并对每个 URL 给出成功或失败条目；单个 URL 失败 MUST NOT 使整个调用失败。遇到限流（HTTP 429）或临时错误（408、5xx）SHALL 有限次退避重试，其余 4xx 不重试。

#### Scenario: 多 URL 部分失败

- **WHEN** web_extract 的 URL 中有的无法抓取（404、403）
- **THEN** 其余 URL 的正文正常返回，失败项逐项标注原因，调用整体不失败

#### Scenario: 限流重试

- **WHEN** 某个 URL 的抓取收到 429
- **THEN** 系统在有限次数内退避重试，仍失败则该 URL 标注限流错误，其他 URL 不受影响

#### Scenario: 余额或鉴权错误

- **WHEN** DeepSeek 返回 401 或 402
- **THEN** 工具返回错误，分别指引检查 Key 或充值，且不重试，错误不含密钥
