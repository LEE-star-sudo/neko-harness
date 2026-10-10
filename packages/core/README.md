# @neko-harness/core

pi-durable 的薄封装：打开 SQLite 存储、注册内置 DeepSeek provider、安装 CodingTools 扩展，向 TUI/Web 前端提供统一的会话运行时 API。

## API

```ts
import { createNekoRuntime } from "@neko-harness/core";

const runtime = await createNekoRuntime(); // 需要 DEEPSEEK_API_KEY
const submission = await runtime.submit("1+1等于几？");
const settled = await submission.wait(runtime.context);
```

`createNekoRuntime(options)`：

- `storage`: `"sqlite" | "memory"`，默认 `"sqlite"`
- `storagePath`: SQLite 文件路径，默认 `~/.neko/neko.sqlite`
- `apiKey`: DeepSeek API key，默认读 `DEEPSEEK_API_KEY` 环境变量（缺失时抛出清晰错误）
- `model`: 默认 `{ provider: "deepseek", modelId: "deepseek-flash" }`（目录内另有 `deepseek-v4-pro`）
- `thinkingLevel`: pi-ai `ModelThinkingLevel`
- `cwd`: 会话工作目录，默认 `process.cwd()`
- `providers`: 额外注册的 pi-ai provider（扩展点）

runtime 暴露：

- `submit(content, opts?)` → `Submission`（pi-durable），`whenBusy` 默认 `"followUp"`
- `waitAnswer(submission)` → 等待回答并提取文本
- `viewState()` / `watch()` → 会话视图状态（前端流式渲染的数据源）
- `events()` → coding-agent 风格 agent events 流
- `usage()` → 会话用量（pi.usage）
- `abort()` → 中止当前 run
- `close()` → 关闭运行时

## 示例

需要 `DEEPSEEK_API_KEY`：

```bash
npx tsx packages/core/examples/chat.ts
npx tsx packages/core/examples/coding-tools.ts
```
