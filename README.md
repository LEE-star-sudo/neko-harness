# neko-harness

基于 Pi 生态包（[`@earendil-works/pi-durable`](https://www.npmjs.com/package/@earendil-works/pi-durable) / `pi-ai` / `chord`）构建的极简 agent harness，同时服务终端（TUI）与浏览器（Web）两类前端。模型默认走 DeepSeek（OpenAI Chat Completions 格式，pi-ai 内置 `deepseek` provider）。

## 状态

- `packages/core`：可用。pi-durable 薄封装（SQLite 存储、内置 DeepSeek provider、CodingTools 扩展）。
- `packages/gateway` / `tui` / `web` / `cli`：本地网关、终端/Web 前端与统一 CLI 入口。

## 快速开始

要求 Bun 1.4.2。DeepSeek Key 可在 TUI `/login`、Web 设置页中保存，或使用 `DEEPSEEK_API_KEY`。

```bash
bun install --frozen-lockfile
bun run build        # tsc 构建全部包
bun run test             # Bun test（源码、文件隔离）
bun run check        # biome check + tsc --noEmit

# 真实 API 冒烟（需要 DEEPSEEK_API_KEY）
bun --conditions=neko-source packages/core/examples/chat.ts
bun --conditions=neko-source packages/core/examples/coding-tools.ts
```

## 开发与运行

固定使用 `.bun-version` / `packageManager` 指定的 Bun 1.4.2；无需 Node、npm 或 tsx。
`bun.lock` 是唯一依赖锁文件，采用 hoisted 布局，依赖安装脚本默认全部禁用（`trustedDependencies: []`）。
现有原生工具通过平台可选包提供，干净安装及构建已纳入迁移验收。

```bash
bun run neko tui
bun run neko web
bun run neko serve
# 构建后直接执行产物（不启用源码条件）
bun packages/cli/dist/main.js web
# 仅启动 Vite 开发服务
bun run --cwd packages/web dev
```

首次在无 dist 状态安装时，Bun 尚不能链接 CLI bin；构建后再次运行 `bun install --frozen-lockfile`
即可使用 `./node_modules/.bin/neko`。上面的 `bun run neko` 和直接执行产物不依赖该链接。

源码入口和测试使用 `--conditions=neko-source`，仅解析本项目 workspace 的 src；默认 exports 仍指向 dist。
`bun run test` 调用 `bun test --conditions=neko-source --isolate`，测试文件各自隔离，文件内顺序执行；
`bunfig.toml` 限定扫描 packages 并排除 dist/node_modules，不扫描 reference。筛选测试可用
`bun run test core/test/config`。直接执行 `bun test` 不会自动应用脚本里的参数。

`bun run build` 按 core → gateway → tui → web → cli 构建，保留 tsc 声明输出和 Vite 客户端构建；
`bun run check` 检查格式、根项目类型与 Web 客户端类型。TUI/Web 自动启动的 gateway 同样使用 Bun，
源码模式运行 main.ts，产物模式运行 main.js；退出时仅关闭自己启动的 gateway。

## 布局

```
packages/
  core/       # pi-durable 封装：createNekoRuntime（运行时、DeepSeek、read/write/edit/bash 工具）
  gateway/    # 会话网关（pi-server/pi-client）
  tui/        # 终端前端（pi-tui）
  web/        # 浏览器前端（React + Vite + Tailwind v4 + TanStack）
  cli/        # 单一入口 neko serve / neko tui / neko web
```

本地数据默认存于 `~/.neko/neko.sqlite`（可用 `createNekoRuntime({ storagePath })` 覆盖）。

## 设计

见 `openspec/changes/archive/2026-10-11-bootstrap-neko-harness/design.md`（D1–D7）。`reference/pi/` 为 Pi monorepo 本地浅克隆（gitignored，只读参考）。

## DeepSeek 凭据与思考配置

未配置 Key 也可启动、浏览会话；发送前通过 TUI `/login` 或 Web 设置页配置。保存值位于宿主用户的 `~/.neko/credentials.json`（权限 `0600`），所有工作区共用，重启后保留；优先于网关进程的 `DEEPSEEK_API_KEY`，移除后回退环境变量。两端只显示配置状态和生效来源，不回显已有 Key；“已配置”不代表已通过远端认证。获取 Key：https://platform.deepseek.com/api_keys 。

默认新会话使用 DeepSeek V4.1 Flash + high，显式配置和已有会话保留自身设置。TUI `/model`、`/think` 与 Web 聊天区模型面板共用 Pi 1.1.0 能力：Flash 为 off/low/high/max，Pro 为 off/high/max。Flash low 切换到 Pro 时遵循 Pi 调整为 high。变更仅作用于当前会话后续请求，标题总结仍使用非思考模式。
