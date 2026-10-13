# Proposal

## Why

neko-harness 仍锁定 Pi 1.1.0，而 Pi 1.2.0 已发布并替换了 Chord 服务运行时、移除了旧通信包，也将图片读取纳入原生 `read`。本次以 1.2 SDK 的原生写法为优先，统一升级并删除上游已经承担的包装、元数据暂存和状态管理代码，继续提供现有的持久会话与 TUI/Web 协作能力。

## What Changes

- 将根包与各 workspace 实际使用的 chord、pi-ai、pi-durable、pi-tui 精确锁定到 npm 发布的 `1.2.0`，新增精确锁定的 pi-env `1.2.0`，更新 `bun.lock`；发布后 `main` 的额外修复不纳入本次升级。
- **BREAKING** 移除 pi-client、pi-server、pi-protocol，改用 Chord 1.2 的类型化契约、host、handle 与 JSON 帧；同时替换网关、TUI 和 Web 的旧绑定 API。保留 POSIX Unix socket + WebSocket、Windows WebSocket 及现有地址发现行为。
- 直接使用 Chord handle、可选 Ctx、原生状态与资源生命周期，迁移 TUI/Web 调用；删除逐方法转发的旧客户端门面和旧 thenable 防御，不重建已删除的 binding/provider API。应用封装只保留连接、首快照等待、attachment 和业务校验。
- 利用 1.2 输入的 `entry: { kind, data }` 原子保存附件、首问和技能展示元数据；工具图片元数据使用已持久化的 `details`。删除独立图片元数据文档、hash 回查、提交前持久暂存与失败补偿，并将两端技能展示迁到结构化数据。
- 适配工具返回值 `output`、结构化输出/diagnostics 和 Session 存储失败生命周期；保留提交幂等、插话、fork、扩展热替换、用量与原生压缩。
- 以原生 LiveDoc、类型化压缩任务/摘要提交回执派生状态，删除重复持久化的 CompactionDoc 及其写回调和恢复修补；将现有后台命名迁为 durable 任务，删除自建计时、运行任务集合与重启状态修补，保留业务重试上限和用量记录。
- **BREAKING** 移除独立 `read_image` 工具及其提示词，统一使用配置上游图片处理器的原生 `read`。附件仍执行已有的严格上传校验，工具读图遵循 Pi 1.2 的格式、模型限制和非视觉占位符语义；两端继续显示路径、处理信息及持久图片预览。
- **BREAKING** 用 pi-env 的本地 listFiles 统一文件发现，移除 @ 补全的 fd/fdfind 后端、探测及安装引导；忽略行为采用 SDK 原生 Git 规则，不继承 fd 专用忽略文件。增加有界共享缓存、文件观察与过期刷新，保留模糊搜索、目录定位和工作区边界；截断与失败不能伪装成无匹配。
- **BREAKING** 旧会话均为可丢弃测试数据，本次不提供 1.1 数据库、旧协议、旧工具名或旧未完成任务的兼容；实施时定向清理旧会话测试数据，以 1.2 新数据验证重启恢复。保留凭据、配置、技能和用户工作区文件。

## Capabilities

### New Capabilities

无；沿用现有能力边界。

### Modified Capabilities

- `agent-runtime`：以 1.2 新会话为持久化基线，统一文件/图片读取与原子输入元数据，移除独立图片工具要求，明确原生工具诊断、压缩回执与存储失败行为。
- `session-gateway`：契约校验、状态首次水合和会话连接生命周期要求，保留双传输、多端同步及资源隔离。
- `model-providers`：将模型能力验收基线更新为 Pi 1.2.0，区分附件准入与原生工具读图的非视觉行为。
- `terminal-ui`：统一 `read` 图片结果展示，按 Pi 1.2 验收思考选项、光标与状态栏；补全不要求安装 fd，并展示不完整结果与辅助进程故障。
- `web-ui`：按 Pi 1.2 验收模型设置、首次状态就绪、重连与 `read` 工具图片预览；移除 fd 安装引导，展示文件发现状态和重试反馈。
- `skill-invocation`：展开时同次生成模型文本和持久展示元数据，TUI/Web 不再解析 XML 判定技能调用；保留原有准入与资源快照语义。
- `workspace-management`：补全随包可用、采用原生 Git 忽略规则，缓存有界且变化可刷新，明确枚举截断与结果限制。

## Impact

- 依赖清单：根 `package.json`、`packages/{core,gateway,tui,web}/package.json` 与 `bun.lock`。
- Core：`runtime.ts`、`web-search.ts`、`read-image.ts`、`image-metadata.ts`、`projection.ts`、`compaction.ts`、`session-metadata.ts`、`workspace-files.ts`、技能展开和提示词；新增本地环境连接与候选缓存生命周期，相关功能、刷新与恢复测试。
- Gateway：`contract.ts`、`gateway.ts`、`server-services.ts`、`session-host.ts`、`client.ts`、`ws-listener.ts`，以及新增的 Unix Link 薄适配与会话 attachment 管理。
- 前端：TUI 的 gateway 接入、编辑器/图片卡片及文件补全；Web 的契约、gateway、transport 与候选面板；发布包保留 pi-env 外部依赖及二进制安装布局，无 fd/无密钥启动检查。
- 文档：README、AGENTS.md 的 SDK 版本和使用要点。主规格在后续同步/归档流程更新，历史归档文档与 `reference/` 保持只读。
- 已复核 codemode、nested tools、tool-search、listFiles、任务所有权及缓存回收等新特性；采用能替代当前重复实现的能力。pi-env 仅引入由 gateway 按需启动和关闭的共享本地辅助进程，本次不新增 SSH 工作区、交互终端或工具产品。各项取舍见 design；不发版、不提交 git commit，本阶段只产出规划工件，不修改代码或删除数据。
