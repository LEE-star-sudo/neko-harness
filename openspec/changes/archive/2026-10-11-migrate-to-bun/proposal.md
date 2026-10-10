# Proposal

## Why

项目当前依赖 npm、Node 与 tsx，前端自动启动 gateway 的两条路径还各自绑定不同的执行方式。统一到 Bun 的包管理、测试与运行时，减少开发和启动依赖，同时保留已兼容的工具及 Pi 生态实现。

## What Changes

- **BREAKING**：项目支持的开发和应用执行入口切换到精确锁定的 Bun；不再要求安装 Node/npm/tsx，也不承诺本次变更后仍支持 Node 运行。
- 使用 Bun workspaces 与 `bun.lock`，替换 npm 锁文件；保留 Pi 依赖 1.1.0，不借迁移升级业务依赖。
- CLI、TUI、Web 及自动拉起的 gateway 全部通过 Bun 执行，覆盖源码和构建产物入口。
- Vitest 迁移到 `bun test`，保留源码测试、发现范围和隔离语义。
- 保留 TypeScript、Biome、Vite、React/Tailwind 插件、兼容的 `node:*` API、ws 和 pi-durable SQLite 适配器；由 Bun 驱动现有工具。
- 更新开发命令与文档，验证全新安装、构建、持久化恢复和前端启动链。

## Capabilities

### New Capabilities

无。此变更是工具链和执行环境迁移，不增加产品能力；以 `skip_specs: true` 显式跳过 delta specs。

### Modified Capabilities

无。agent-runtime、session-gateway、terminal-ui、web-ui 的行为要求保持不变，作为回归验收依据。

## Impact

- 根及各 workspace 的 package.json、锁文件、运行时版本标记、TypeScript/Bun 测试配置、现有测试导入。
- CLI/gateway shebang，TUI/Web gateway 子进程启动逻辑，必要的共享启动辅助模块。
- 根与各包 README、示例启动注释、AGENTS.md 开发命令。
- 不替换 Vite 为 Bun bundler，不重写存储/网络适配层，不修改数据库 schema，不升级 Pi，不引入新平台支持。
- 已发现 web-ui 的静态托管 spec 与当前独立 Web HTTP 进程实现不一致；本次保持现有拓扑，不顺带改变该产品行为，后续单独处理。
