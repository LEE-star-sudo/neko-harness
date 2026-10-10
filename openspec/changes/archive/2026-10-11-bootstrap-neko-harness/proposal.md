# Proposal

## Why

我们需要一个自己的极简 agent harness（neko-harness），同时服务终端和 Web 两类前端。从零自研持久化、模型接入、工具执行成本高且易错；Pi 生态（pi-durable / pi-ai / pi-server / pi-client）已提供经过验证的可嵌入运行时，且 MIT 协议、源码在手（`reference/pi/`），适合作为基座。模型侧首选 DeepSeek（成本低、1M 上下文、thinking + tool use 齐全），API 格式采用 DeepSeek 原生的 OpenAI Chat Completions（理由见 design.md）。

## What Changes

- 新建 neko-harness 项目骨架（TypeScript monorepo，npm workspaces）
- 基于 `@earendil-works/pi-durable` 搭建持久化 agent 运行时：Harness + Conversation + Extension/Tool 体系，SQLite 存储
- 基于 `@earendil-works/pi-ai` 接入模型，内置 DeepSeek provider（OpenAI Chat Completions 格式，即 pi-ai 内置 `deepseek` provider，零新增 API 层代码）
- 基于 `@earendil-works/pi-server` / `@earendil-works/pi-client` 搭建本地会话网关，让终端和 Web 前端可 attach 同一批持久会话
- 实现终端 UI（TUI）和 Web UI 两个前端，共用同一网关协议
- 项目级文档与 AGENTS.md

## Capabilities

### New Capabilities

- `agent-runtime`: 基于 pi-durable 的持久化对话运行时——会话创建/fork/恢复、工具执行（read/write/edit/bash）、扩展注册、用量统计
- `model-providers`: 模型提供商接入与配置——DeepSeek 为默认 provider（Chat Completions 格式），API key 管理、模型列表与 thinking level 配置
- `session-gateway`: 本地会话网关——基于 pi-server/pi-client 的会话目录、attach/detach、服务路由，使多个前端连接同一持久会话
- `terminal-ui`: 终端前端——交互式 TUI，提交输入、steer/follow-up、流式渲染、会话导航
- `web-ui`: Web 前端——浏览器 UI（React + Vite + Tailwind CSS v4 + TanStack，二次元主题），功能与终端对等，经 WebSocket 连接网关

### Modified Capabilities

（无——全新项目）

## Impact

- **新依赖**：`@earendil-works/pi-durable`（实验性，API 可能随版本变动，需锁版本）、`@earendil-works/pi-ai`、`@earendil-works/chord`、`@earendil-works/pi-server`、`@earendil-works/pi-client`（后两者同为实验性）
- **运行环境**：Node.js ≥ 22.19（pi-durable 示例要求）；Web 前端需一个静态资源 + WebSocket 宿主
- **外部服务**：DeepSeek API（`DEEPSEEK_API_KEY`）
- **参考源码**：`reference/pi/`（已 gitignore，仅本地参考，不随项目分发）
