# @neko-harness/core

pi-durable 的薄封装：打开 SQLite 存储、注册内置 DeepSeek provider、安装 CodingTools 扩展，向 TUI/Web 前端提供统一的会话运行时 API。

## API

```ts
import { createNekoRuntime } from "@neko-harness/core";

const runtime = await createNekoRuntime(); // 对话前需配置 DeepSeek Key
const submission = await runtime.submit("1+1等于几？");
const answer = await runtime.waitAnswer(submission); // { status: "done", text }
```

`createNekoRuntime(options)`：

- `storage`: `"sqlite" | "memory"`，默认 `"sqlite"`
- `storagePath`: SQLite 文件路径，默认 `~/.neko/neko.sqlite`
- `apiKey`: DeepSeek API key，仅当前运行时的显式覆盖，不写环境变量或凭据文件
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

## 系统提示词与项目上下文

内置 `neko-prompt` 扩展按五节组装系统提示词：`preamble`（角色定义）、`rules`（按本次请求启用的工具拼接的规则，去重）、`project_context`、`skills`、`cwd`。节随 pi-durable 的 `pi.system` 增量 patch 进入上下文，空节自动省略。

项目上下文注入两级 AGENTS.md：`~/.agents/AGENTS.md`（用户级，在前）与 `<workspace>/AGENTS.md`（项目级，在后），各渲染为一个 `<project_instructions path="…">` 块；不向父目录遍历，不识别其他文件名，不扫描 `.neko` 目录。

Skills 扫描 `~/.agents/skills/<name>/SKILL.md` 与 `<workspace>/.agents/skills/<name>/SKILL.md`，解析 YAML frontmatter（`name` 缺省回落目录名、`description` 必填、`disable-model-invocation` 的技能不进提示词），同名技能项目级覆盖用户级。各层目录独立按 UTF-16 码元顺序排序，再按用户级在前、项目级在后合并；同名覆盖保留已有位置，不要求合并结果全局排序。提示词只注入 name/description/location 元数据，正文由模型用 `read` 工具按需加载。

`/skill:<name> [args]` 显式调用技能：纯文本输入以 `/skill:` 开头时在提交准入层展开为 `<skill name location>` 块（正文去 frontmatter，args 追加），未知技能名原样透传，所有前端与 `disable-model-invocation` 技能同样生效。被显式调用的技能正文与元数据从同一次文件读取取得，仅暂存匹配技能的文件文本，展开后不进入长期系统快照。`runtime.listSkills(id?)`（gateway 会话级 `chat.skills()`）始终直读最新文件供补全，查询不改变会话快照。

AGENTS.md 与 skills 在新输入提交时准备快照，按会话与 requestId 隔离；系统提示词只在该输入实际进入 transcript 后激活对应版本。排队的 followUp 不提前更新当前 run，被拒绝或未放入上下文即撤回的输入不生效；steer 也按其实际 placement 激活。同批放入多个输入时，以最后一个输入的资源快照决定系统元数据，各条已展开用户消息仍保留各自正文。重复 requestId 不重新加载或展开。

没有新输入进入上下文时，工具轮、重试等请求复用活动资源，磁盘修改不产生无谓的系统节更新；工具规则仍随实际工具声明重新构建。同一次提示词各节共享一次构建。快照只存在进程内存，重启、fork 或首次没有快照时读取当前文件，不承诺恢复之前的资源版本；归档会话清理快照。不做 mtime/ctime/size 指纹或文件监听。稳定文本保留前缀复用机会，但不保证服务端缓存命中率。

缺失文件正常省略，读取或解析失败输出仅含路径与原因的诊断并跳过，不阻断请求；同一工作区持续存在的相同诊断不会重复输出。超过 64 KiB 的 AGENTS.md 提示体积风险但保留全文；历史压缩不能缩短系统指令。

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
bun --conditions=neko-source packages/core/examples/chat.ts
bun --conditions=neko-source packages/core/examples/coding-tools.ts
```

## 工作区语义

`neko tui --cwd <directory>` 使用指定目录作为工作区；省略该参数时使用启动目录。路径会解析为实际目录的绝对路径，不会将子目录提升到 Git 根目录。会话持久化保存工作区，分叉会话继承该工作区；从其他目录重启网关不会改变已有会话的工作区。read、write、edit 和 bash 默认使用保存的工作区。工作区不是沙箱：在宿主权限允许的范围内，仍可通过显式路径访问其他目录。

TUI 只列出当前工作区的会话，并恢复最近激活或提交过输入的会话。共享网关和 Web 保留全局会话目录。工作区目录不存在时会明确报错，不会回退到网关目录。不支持未保存绝对工作区路径的旧会话存储，需要使用新的存储路径；应用不会自动删除或迁移旧数据。

## 独立工作区目录

`runtime.listWorkspaces()` 列出独立持久化的工作区；`runtime.addWorkspace(path)` 校验可访问目录并按真实绝对路径去重，返回 `{ path, createdAt }`。空工作区和最后一个会话归档后的工作区都保留。启动时幂等接入已有会话（含归档会话）的保存目录，新建与分叉也自动登记。登记不创建或删除宿主目录，不清空历史，不改变已有会话的工具目录。

## 会话标题与消息时间

会话目录返回 `title`、`firstPromptPreview`、`createdAt`、`lastMessageAt`、`model` 和 `status`。列表以最近消息时间倒序排列，空会话使用创建时间，同时间按 ID 倒序；`lastUsedAt` 单独用于恢复最近访问的会话。查看会话、切换模型、生成标题不改变消息时间，重复 `requestId` 不增加消息时间。

首问成功取得最终回答后，在后台使用回答所用模型独立生成标题，禁用思考且不提供工具，不修改会话配置或聊天记录。生成期间及失败时使用首问摘要；空会话显示默认名称。标题最多 60 个 Unicode 字符，只生成一次。每次请求最长 20 秒，同时最多两个命名请求；失败等待 2 秒后重试一次，尝试次数持久化，重开不会重置。模型不支持关闭思考、首轮失败或答案为空时直接保留摘要。归档与关闭会取消在途命名，忽略迟到结果。分叉继承现有名称，之后各自独立。

命名会产生额外模型用量。`namingUsage(id?)` 可单独核对，`usage(id?)` 包含聊天与命名用量，`globalUsage()` 汇总全部会话自身用量，避免分叉继承造成重复计费。`onDirectoryChange(listener)` 通知元数据状态变化。新格式元数据随会话创建原子写入；没有该格式的旧存储明确拒绝打开，不自动迁移、回填或删除。

## DeepSeek 凭据与思考配置

未配置 Key 也可启动、浏览会话；发送前通过 TUI `/login` 或 Web 设置页配置。保存值位于宿主用户的 `~/.neko/credentials.json`（权限 `0600`），所有工作区共用，重启后保留；优先于网关进程的 `DEEPSEEK_API_KEY`，移除后回退环境变量。两端只显示配置状态和生效来源，不回显已有 Key；“已配置”不代表已通过远端认证。获取 Key：https://platform.deepseek.com/api_keys 。

默认新会话使用 DeepSeek V4.1 Flash + high，显式配置和已有会话保留自身设置。TUI `/model`、`/think` 与 Web 聊天区模型面板共用 Pi 1.1.0 能力：Flash 为 off/low/high/max，Pro 为 off/high/max。Flash low 切换到 Pro 时遵循 Pi 调整为 high。变更仅作用于当前会话后续请求，标题总结仍使用非思考模式。

编程入口可注入 `credentials: CredentialStore` 或 `credentialsPath`，测试应使用隔离存储。显式 `apiKey` 为最高优先级临时覆盖，状态显示 runtime；默认 memory runtime 使用内存凭据。

### 上下文压缩与图片

`runtime.compact(instructions?, conversationId?)` / `session.compact(instructions?)` 调用原生 pi-durable 压缩，默认策略不变：预留 16384 tokens，保留近期约 20000 tokens，提前 32768 tokens 后台压缩。摘要沿用会话模型和思考强度；历史不删除，压缩不改变最近消息排序或标题。任务结束后仍可能等待摘要写入，只有实际应用才报告成功。中止沿用会话整体语义，后台任务是否可中止由 Pi 决定。

输入支持 Pi 文字/图片内容块及仅图片。图片经统一管线验证和处理后持久化，原文件被删除不影响历史。`read_image({ path })` 独立读取工作区图片，也接受显式绝对路径，不修改 `read`。Flash 支持图片，Pro 对新图片输入明确报错；已有历史图片转换遵循 Pi。文字压缩不会重新分析旧图片，需要在对话中保留相关文字观察。

支持静态 PNG/JPEG/WebP，单图原始大小最多 20 MiB、40M 像素；每消息最多 4 张、原始总量 40 MiB、处理后总量 18 MiB。单图还受模型限制约束：Pi 的 `resize.maxBytes` 是 **base64 编码后的大小**。拒绝动画、GIF、SVG、PDF 和远程 URL，不自动上传项目其他文件。

## 工作区文件引用

`file-mentions` 提供浏览器安全的 `@` 路径识别与插入规则；普通引用保持文本，不预读正文。`workspace-files` 使用宿主 PATH 中的 `fd` 或 `fdfind` 查询路径，支持隐藏项并遵守 ignore，排除 `.git` 与工作区外的真实目标。查询限制为 2048 字符、100 项、1 MiB 输出和 2 秒；可取消，超限提示缩小范围。该范围只约束候选，不改变 agent 工具权限。
