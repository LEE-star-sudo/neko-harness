# web-search Specification

## Purpose

为 agent 提供联网能力：以 Tavily 为后端的搜索与网页抽取工具，默认免配置（keyless）可用，保存或环境变量提供 API key 后无缝升级。

## Requirements

### Requirement: 内置联网工具

系统 SHALL 为所有会话默认提供 web_search 与 web_extract 两个工具。web_search 按查询返回排序的来源列表（标题、URL、相关内容和相关性评分）；web_extract 抽取给定 URL 的正文内容，单个 URL 失败 MUST NOT 导致整个调用失败。工具输出 SHALL 有界截断后返回模型。

#### Scenario: 搜索实时信息

- **WHEN** agent 需要当前网络信息并调用 web_search
- **THEN** 返回按相关性排序的来源列表，每项含标题、URL 与内容摘要，输出超长时被有界截断

#### Scenario: 抽取部分失败

- **WHEN** web_extract 的 URL 列表中部分不可访问
- **THEN** 可用 URL 的正文正常返回，失败 URL 以逐项错误标注，调用整体不失败

### Requirement: Tavily 凭据解析

系统 SHALL 按优先级解析 Tavily 凭据：运行时覆盖高于 UI 保存值，保存值高于 TAVILY_API_KEY 环境变量；三者均无时使用 keyless 模式（免 key、限流，仅搜索与抽取可用）。keyless SHALL 作为独立的生效来源展示，而非"未配置"；保存或环境变量提供 key 后下一次调用即升级，无需重启。

#### Scenario: 零配置可用

- **WHEN** 未配置任何 Tavily key 的会话调用 web_search
- **THEN** 请求以 keyless 模式发出并返回真实结果，前端生效来源显示为 keyless 受限

#### Scenario: 保存后升级与移除回退

- **WHEN** 已有环境变量时保存另一个 key，调用一次工具后移除保存值
- **THEN** 保存后使用保存值，移除后回退环境变量；两者皆无时回退 keyless

### Requirement: 限流与错误反馈

keyless 限流或 Tavily 返回错误时，系统 SHALL 以工具错误结果告知模型，内容包含可操作的后续指引（如配置 API key），MUST NOT 中断当前 run 或泄露密钥。网络失败 SHALL 以可理解错误呈现且可重试。

#### Scenario: keyless 撞限流

- **WHEN** keyless 配额耗尽时调用 web_search
- **THEN** 工具返回错误结果，说明限流并引导配置 API key，run 继续而不崩溃

#### Scenario: 网络错误

- **WHEN** 请求因网络失败
- **THEN** 模型收到可理解的错误结果，用户可重试，错误不含密钥

### Requirement: 联网凭据保密

系统 MUST 仅向前端返回 Tavily 的保存状态、环境变量是否配置及当前生效来源（含 keyless），不返回已有密钥。密钥 MUST NOT 写入会话、日志、项目配置或浏览器持久存储。

#### Scenario: 查看状态

- **WHEN** 任一前端读取 Tavily 凭据状态
- **THEN** 仅见是否已保存、环境变量是否配置与生效来源，无任何密钥内容
