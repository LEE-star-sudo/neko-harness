# neko-harness

基于 Pi 生态包（[`@earendil-works/pi-durable`](https://www.npmjs.com/package/@earendil-works/pi-durable) / `pi-ai` / `chord`）构建的极简 agent harness，同时服务终端（TUI）与浏览器（Web）两类前端。模型默认走 DeepSeek（OpenAI Chat Completions 格式，pi-ai 内置 `deepseek` provider）。

## 状态

- `packages/core`：可用。pi-durable 薄封装（SQLite 存储、内置 DeepSeek provider、CodingTools 扩展）。
- `packages/gateway` / `tui` / `web` / `cli`：占位骨架，后续变更实现（见 `openspec/changes/`）。

## 快速开始

要求 Node.js ≥ 22.19，以及 `DEEPSEEK_API_KEY`。

```bash
npm install
npm run build        # tsc 构建全部包
npm test             # vitest
npm run check        # biome check + tsc --noEmit

# 真实 API 冒烟（需要 DEEPSEEK_API_KEY）
npx tsx packages/core/examples/chat.ts
npx tsx packages/core/examples/coding-tools.ts
```

## 布局

```
packages/
  core/       # pi-durable 封装：createNekoRuntime（运行时、DeepSeek、read/write/edit/bash 工具）
  gateway/    # 占位：会话网关（pi-server/pi-client）
  tui/        # 占位：终端前端（pi-tui）
  web/        # 占位：浏览器前端（React + Vite + Tailwind v4 + TanStack）
  cli/        # 占位：单一入口 neko serve / neko tui / neko -p "..."
```

本地数据默认存于 `~/.neko/neko.sqlite`（可用 `createNekoRuntime({ storagePath })` 覆盖）。

## 设计

见 `openspec/changes/bootstrap-neko-harness/design.md`（D1–D7）。`reference/pi/` 为 Pi monorepo 本地浅克隆（gitignored，只读参考）。
