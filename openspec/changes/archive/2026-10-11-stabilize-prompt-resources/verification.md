# Verification

## 实际 DeepSeek harness 冒烟

使用环境变量 `DEEPSEEK_API_KEY`，运行 Bun throwaway 脚本调用真实 `createNekoRuntime`（memory storage、MemoryCredentialStore、隔离的临时工作区与 promptHome、`deepseek-flash`、thinking off）。脚本及临时工作区不保留，不打印或保存 API key。未启动 TUI：本次修改的表面是 core 资源加载和请求构建，验证直接覆盖实际 harness/provider 路径。

主会话只提供真实自定义工具 `mutate_context`：工具将临时 AGENTS.md 的版本标记从 v1 改为 v2，返回后模型继续完成回答。通过 generation beforeRequest/afterResponse hooks 记录系统文本、原始 system 消息数量和 pi-ai usage；不是 faux 响应。

已观察并断言：

- 工具实际执行一次并改写文件；首条输入产生两个模型请求，二者系统文本逐字节相同、system 消息数量均为 1，工具后的请求仍包含 v1 而不包含 v2。
- 再提交一条用户输入，第三次请求包含 v2 而不包含 v1；原始 transcript 的 system 消息数量为 2（产生资源更新 patch）。
- 基于安装的 `CodingTools.edit.parameters` 检查 `edits[].oldText` 参数，再实际渲染规则节，确认包含对应参数形状及不得重叠的指引。

以下仅统计主会话 generation hooks 捕获的三次响应，不含自动命名调用。字段是 pi-ai usage 的原值：

| 请求 | usage.input | usage.cacheRead | usage.cacheWrite | usage.output | stopReason |
| --- | ---: | ---: | ---: | ---: | --- |
| 初始输入，调用工具 | 1886 | 0 | 0 | 22 | toolUse |
| 工具完成，回答 | 148 | 1792 | 0 | 5 | stop |
| 下一输入，采用 v2 | 682 | 1280 | 0 | 6 | stop |

## 回归范围

新增确定性 gated runtime 回归覆盖：run 内文件修改后系统资源不变、下一输入刷新、同工作区的会话隔离、实时技能查询不污染当前 run、两个 followUp 分别保留正文与元数据版本、取消和 busy reject 隔离、steer 在 postTools placement 生效、同一 final boundary 多输入以最后一个 EntryId 的快照为准、重复 requestId 不重新加载或展开。

资源回归覆盖扫描后展开前文件修改不会混合版本、项目级隐藏技能的胜出文件文本、未调用/未知技能不保留 invocation 文本、各层 UTF-16 排序与覆盖位置稳定。

## 限制

- cacheRead 是本次真实请求的观测值，不是命中保证或性能基准；没有进行旧实现与新实现的受控 A/B 比较。
- 系统文本相同不等于 provider 必然命中缓存。DeepSeek 缓存为 best-effort，构建/保留及匹配单元取决于服务端：https://api-docs.deepseek.com/guides/kv_cache。
- 资源快照只在内存中，重启或 fork 没有快照时读取当前磁盘版本，不保证恢复旧的资源文本。

## 最终检查

- `bun run check`：通过（Biome、根 TypeScript、Web 客户端 TypeScript）。
- `bun run test`：168 pass、0 fail，974 个 expect 调用，47 个文件；源码条件与文件隔离开启。
- `openspec validate stabilize-prompt-resources --strict`：通过。
- 初次 check 的两处可选路径断言类型错误已移除；修改后重新运行上述全量 check/test 均通过。
