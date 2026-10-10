# Tasks

## 1. 迁移基线与依赖管理

- [x] 1.1 运行现有 Node/Vitest 基线并记录结果；在临时目录生成包含会话与 requestId 的旧 SQLite fixture，确认可由迁移前代码重开，不使用真实用户数据。
- [x] 1.2 固定 Bun 1.4.2 的 packageManager、版本文件和 engines，迁移 npm lock 到 bun.lock，显式设置安装布局及必要脚本信任；核对 Pi 全部仍为 1.1.0、业务依赖无意外升级，冻结安装通过后移除 package-lock。
- [x] 1.3 更新根 README 和 AGENTS.md 的运行时、安装、冻结安装说明；在隔离目录按文档执行安装，确认版本与锁文件一致。

## 2. 源码解析、构建与检查

- [x] 2.1 为内部 workspace 增加专用源码 export 条件与独立开发/测试解析配置，保持默认 dist 导出和构建 rootDir 边界；在无 dist 的隔离副本确认源码可解析，默认条件仍指向产物。
- [x] 2.2 将根/workspace 工具脚本改为 Bun 驱动，按 core、gateway、tui/web、cli 拓扑构建，保留 tsc、Biome、Vite；根 check 覆盖 Web 客户端，从无 dist 状态完成构建和类型/格式检查。
- [x] 2.3 更新根及 Web README 的开发、检查、构建命令和源码条件说明；逐条执行文档命令，确认 Vite 静态资源与各包声明/JS 产物生成正确。

## 3. Bun 测试与持久化兼容

- [x] 3.1 将既有测试导入迁到 bun:test，锁定必要 Bun 类型依赖并移除 Vitest 配置/依赖；设置源码条件、发现范围、隔离与超时，确认所有原有用例均被发现且不扫描 reference/dist。
- [x] 3.2 运行完整 core/gateway 测试并修复迁移引起的兼容问题，保持既有断言；确认 requestId 幂等、SQLite 重开、任务恢复、工具中断、扩展热替换、模型切换、Unix/WS 和断连用例通过且进程正常退出。
- [x] 3.3 使用 Bun 打开 1.1 的旧数据库 fixture，检查历史会话、幂等提交和后续写入/重开；再用迁移前 Node 基线读取该临时数据库验证回退兼容，记录结果。
- [x] 3.4 更新根/相关包测试说明与开发约定，记录 bun test 的实际配置及隔离策略；在无 dist 副本执行约定测试入口并确认全部用例通过。

## 4. CLI 与前端 gateway 启动链

- [x] 4.1 修改 CLI/gateway shebang 和根 neko 入口为 Bun，移除 tsx 依赖与源码注释中的旧命令；验证源码与产物的 help/参数转发行为，并确认无需 tsx。
- [x] 4.2 统一 TUI/Web 的 Bun gateway 子进程命令构造，分别选择源码或产物入口并传递必要源码条件；增加覆盖真实启动、复用、失败清理的集成检查，确认参数不丢失且子进程 executable 为 Bun。
- [x] 4.3 验证前端关闭会清理自建 gateway、复用已有 gateway 时不误杀，检查超时/启动失败路径无进程或 socket 泄漏；相关测试通过。
- [x] 4.4 更新 CLI/TUI/Web/gateway/core 文档及示例注释中的启动方式；扫描活动代码与文档确认无依赖 npm/npx/tsx/Node 的遗留启动命令，历史归档不改写。

## 5. 整体兼容性验收

- [x] 5.1 在不含 Node/npm/tsx 可执行文件的受控环境，使用固定 Bun 完成冻结安装、源码测试、检查和冷构建；记录命令与结果，确认锁文件不变化。
- [x] 5.2 分别验收源码与仅产物形态的 serve/tui/web 启动；确认 Unix socket 与 WebSocket 握手、网关复用、Web 静态资源、会话同步和重连正常，产物形态不依赖 src 或开发加载器。
- [x] 5.3 在真实 TTY 验证 TUI 输入、流式更新、窗口缩放、Ctrl-C 与退出后 raw mode 恢复；使用 faux provider/隔离数据完成自动化场景，若真实模型验证可用则仅从环境读取 API key，记录未能执行的检查。
- [x] 5.4 审查最终 diff 与验收记录：仅目标配置/启动链/测试/文档发生变化，Pi 版本及数据库 schema 保持不变；确认未改动 reference、历史 OpenSpec 归档或真实用户数据，明确报告任何阻塞项。
