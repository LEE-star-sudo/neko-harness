# @neko-harness/core

pi-durable 的薄封装：打开 SQLite 存储、注册内置 DeepSeek provider、安装 CodingTools 扩展，向 TUI/Web 前端提供统一的会话运行时 API。

## API

```ts
import { createNekoRuntime } from "@neko-harness/core";

const runtime = await createNekoRuntime(); // 需要 DEEPSEEK_API_KEY
const submission = await runtime.submit("1+1等于几？");
const answer = await runtime.waitAnswer(submission); // { status: "done", text }
```

`createNekoRuntime(options)`：

- `storage`: `"sqlite" | "memory"`，默认 `"sqlite"`
- `storagePath`: SQLite 文件路径，默认 `~/.neko/neko.sqlite`
- `apiKey`: DeepSeek API key，默认读 `DEEPSEEK_API_KEY` 环境变量（缺失时抛出清晰错误）
- `model`: 默认 `{ provider: "deepseek", modelId: "deepseek-flash" }`（目录内另有 `deepseek-v4-pro`）
- `thinkingLevel`: pi-ai `ModelThinkingLevel`
- `cwd`: 会话工作目录，默认 `process.cwd()`
- `providers`: 额外注册的 pi-ai provider（扩展点，测试注入 faux provider 用）
- `extensions`: 额外安装的 pi-durable 扩展（自定义工具等）

runtime 暴露（根会话便捷方法 + 会话管理）：

- `submit(content, opts?)` → `Submission`（pi-durable），`whenBusy` 默认 `"followUp"`；`waitAnswer(submission)` 等待回答并提取文本
- `viewState(id?)` / `watch(id?)` → 会话视图状态（前端流式渲染的数据源）
- `events(id?)` → coding-agent 风格 agent events 流
- `usage(id?)` → 会话用量（pi.usage，models 按 provider/modelId、tools 按工具名分组）
- `abort(id?)` → 中止当前 run；`close()` → 关闭运行时
- `root` → 根会话 `NekoSession`（id + conversation + 上述按会话操作打包）
- `listConversations()` → 会话目录（不含已归档）；`createConversation(opts?)` → 新 `NekoSession`；`getConversation(id)` → 按 id 获取（未知或已归档返回 undefined）；`archiveConversation(id)` → 软删除（pi-durable 1.1.0 无删除能力，写 `app.neko.conversation` 文档标记）

## 配置层

```ts
import { loadNekoConfig, mergeNekoConfig, DEFAULT_NEKO_CONFIG } from "@neko-harness/core";

const file = loadNekoConfig(); // 从 cwd 向上找 neko.config.json，兜底 ~/.neko/neko.config.json；无文件返回 {}
const config = mergeNekoConfig(mergeNekoConfig(DEFAULT_NEKO_CONFIG, file), cliOverrides); // CLI > 配置文件 > 默认
```

配置文件字段：`defaultModel`（`{provider, modelId}`）、`thinkingLevel`、`storagePath`、`gateway`（`host`/`port`/`socketPath`，gateway 组预留）、`theme`（`light|dark|auto`）。字符串值支持 `$ENV` 与 `${ENV}` 插值，引用未定义变量报错；坏 JSON / 字段类型错误会抛出含文件路径的清晰错误。

## 示例

需要 `DEEPSEEK_API_KEY`：

```bash
npx tsx packages/core/examples/chat.ts
npx tsx packages/core/examples/coding-tools.ts
```
