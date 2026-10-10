# @neko-harness/tui

终端交互前端（pi-tui，见 design.md D6）。对话 + 内置工具调用展示，数据源为 `@neko-harness/core` 的 viewState（design D4：只消费提交后的状态）。

## 运行

```bash
# 需要 DEEPSEEK_API_KEY
npx tsx packages/tui/src/main.ts [--cwd <dir>] [--model provider/modelId] [--storage <sqlite路径>]
```

## 用法

- 底部输入框 Enter 提交；忙碌时按 pi-durable 默认行为排队
- Esc：中止当前运行；Ctrl+C：忙碌时中止、空闲时退出；`/exit`（或 `/quit`）退出
- thinking 内容默认折叠为一行，点击展开/收起
- 工具卡片显示工具名 + 参数摘要 + 状态；结果默认预览 8 行，点击展开完整输出
- 状态栏：模型 · 运行状态 · 用量（↑input ↓output 缓存 $成本）· 工作目录

## API

```ts
import { runTui } from "@neko-harness/tui";

await runTui({ cwd: process.cwd(), storagePath: "~/.neko/neko.sqlite", model: { provider: "deepseek", modelId: "deepseek-flash" } });
```

## 后续（v1 未做）

- steer / follow-up 区分提交（spec：消息插话）
- 多会话列表 / 切换 / fork（spec：会话管理）
