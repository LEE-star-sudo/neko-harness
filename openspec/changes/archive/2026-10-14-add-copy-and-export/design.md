# Design

## Context

动机与范围见 `proposal.md`，行为契约见 `specs/`。当前事实：

- 主会话的 `ChatView.items` 是完整已提交转录（只有子 agent 视图分页）。条目已把 `thinking` 与 `text` 分开；工具条目只有 `summary / detail / result / isError / durationMs`，没有原始参数；图片只有描述符（`ChatImage`，字节经 `getImage` 分块取回，`downloadImage` 已封装）；条目无时间戳。
- Web 与 TUI 都是 gateway 客户端，且已共享 `core` 的浏览器安全子路径模块（`image-transfer`、`transcript-items`、`file-mentions`）。
- TUI 的斜杠命令在 `tui.ts: submit()` 里逐个分支处理，命令表在 `labels.ts`。neko 内只有剪贴板**读取**（`image-input.ts`），没有写入。TUI 的 `#terminal`（`ProcessTerminal`）可直接 `write` 转义序列。
- pi-tui 的注释指出：裸 OSC 52 写入可能在 macOS Terminal.app、未放行的 tmux 等环境里"显示成功但剪贴板未变"，所以原生写入必须优先，OSC 52 只能作为降级。
- Web 的 Markdown 渲染用 `marked`（`marked.use` 在 `markdown.tsx` 里改了全局实例）+ DOMPurify；TUI/Bun 端没有 DOM，无法使用 DOMPurify。
- 仓库规则：上游 pi 依赖不裹代码；相对导入带 `.ts`；Biome 风格；测试用 `bun test`。

## Goals / Non-Goals

**Goals:**
- Web 与 TUI 对"可复制文本""最后一条回答""导出内容"得到逐字相同的结果（单一实现）。
- 不改 gateway 协议、存储与 pi 依赖。
- 导出的 HTML 在任何模型输出下都不可执行脚本、不发起网络请求。

**Non-Goals:**
- 不导出原始会话 entries（工具原始参数、system prompt、时间戳、用量）；这需要新的 gateway RPC，另开变更。
- 不做 `/import`、分享链接、子 agent 记录导出。
- 不改 TUI 鼠标选区复制路径（`TuiAltScreen.copySelection` 仍走 pi-tui 默认 OSC 52）。把新的剪贴板写入器接到该钩子上是合理的后续，但不在本次范围。
- HTML 不做代码语法高亮、不做主题切换。

## Decisions

### D1. 导出算在客户端，作为 `core` 的纯函数

新增 `packages/core/src/conversation-export.ts`（及内部 `conversation-export-html.ts`），在 `package.json` 增加 `./conversation-export` 子路径，导出：

```
copyText(item)                      // 可复制文本规则
lastAnswerText(items)               // 最后一条回答，无则 null
exportFormatFromPath(path)          // .md/.html/.json -> ExportFormat | null
exportFileName(title, format, at)   // 默认文件名
exportConversation(format, source, options) -> Promise<{ content, mimeType, extension, skippedImages }>
```

`source = { sessionId, title, model, cwd, exportedAt, items }`；`options = { includeThinking, loadImage? }`。模块不得 import node 内置模块或 `ChatView` 之外的运行时，使 Web 能直接打包。

备选：服务端 RPC `neko.chat.export`。优点是能读完整 entries；代价是改 wire 契约、触发应用协议兼容检查、大内容要分块。当前需求只要"看得见的对话记录"，客户端方案够用且不扩大协议面。

### D2. 内容映射规则（三种格式共用同一中间遍历）

- 用户条目：`copyText`（技能调用还原为 `/skill:name args`）；`defaultImagePrompt` 不导出（本来就不在 `item.text` 里）。
- assistant：`text`；`includeThinking` 时在正文前输出 `thinking`；`note`（中止/出错提示）作为条目的附注保留，因为它是回答状态的一部分。
- 工具：名称、`summary`、`detail`、`result`（`phase !== "done"` 时标注"未完成"并用 `output` 兜底）、`isError`、`durationMs`、`note`。
- 系统条目（`[context compacted]` / `[new context]`）：作为分隔行保留。
- 图片：描述符的 `name / mimeType / width / height / bytes`。

**Markdown**：
- 头部为标题、模型、工作区、导出时间（用 `source.exportedAt`，函数本身不读时钟，便于测试）。
- 其后按 `## User` / `## Assistant` 分节；工具用 `<details><summary>`，其中参数与结果放围栏。
- 围栏长度 = 内容最长连续反引号数 + 1，且至少 3。
- thinking 放进带标题的 `<details>`。
- 用户文本与 assistant 正文按原样输出，不转义。

**JSON**：
```
{ "format": "neko-conversation", "version": 1,
  "session": { "id", "title", "model", "cwd", "exportedAt" },
  "items": [ { "type": "user"|"assistant"|"tool"|"system", ... } ] }
```
- 不含 `key / id / order` 等内部字段。
- `thinking` 仅在 `includeThinking` 时出现。
- 图片只含元数据。

### D3. HTML：静态页面 + 自有 `Marked` 实例 + 严格转义

- 用 `new Marked()` 创建**独立实例**，不碰 `marked` 全局，避免被 `markdown.tsx` 的 `marked.use`（会注入未消毒的高亮 HTML）影响。
- `renderer.html` 覆盖为输出转义文本，让原始 HTML 不执行。
- `renderer.link / image` 覆盖：只放行 `http: https: mailto:`，其余只输出链接文字；Markdown 图片不生成 `<img>`，退化为 alt 文字加链接文字。
- 页面带 `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">`，并且页面不含任何 `<script>`。这是第二道防线：即使转义有疏漏，脚本与外联请求也被浏览器拦下。
- 折叠用原生 `<details>`，样式内联在 `<style>`，无外部资源。
- 不做语法高亮（`<pre><code>` 纯文本）。
- 用户文本同样转义后按 `white-space: pre-wrap` 显示。
- `marked` 作为 `core` 的新依赖，精确锁 `18.1.0`（与 web 现有版本一致）。
- 不用 DOMPurify：它需要 DOM，TUI/Bun 下没有；而"转义优先、白名单链接 + CSP"本身不依赖消毒器。

备选 1：HTML 只把正文放 `<pre>`，不渲染 Markdown。零依赖但可读性差，离线分享的主要价值丢失。
备选 2：照搬 pi 的 template.html + JS 渲染。要内置 marked/highlight 的压缩包，并且页面带脚本，与"零脚本"目标冲突。

### D4. 图片：调用方提供加载器，描述符预检预算

`options.loadImage(image: ChatImage) => Promise<ImageFile>` 由调用方提供，复用既有读取链路：
- Web：`appActions.image(entryId, contentIndex, sessionId)`。
- TUI：`downloadImage((offset) => chat.getImage({...}))`。

仅 HTML 格式调用加载器，按转录顺序串行读取，以限制内存峰值。

预算 `MAX_EMBEDDED_IMAGE_BYTES = 32 MiB`：用描述符里的 `bytes` 预检，超出的图片不下载，直接输出占位。单张失败（加载器抛错）输出"图片不可用"占位，计入 `skippedImages`，不使导出失败。内嵌为 `data:` URI，字节转 base64 复用 `image-transfer` 的 `encodeChunk`，按 3 的倍数分片拼接。

### D5. 文件名与扩展名

`exportFileName(title, format, at)` 返回 `<安全标题>-<YYYYMMDD-HHmmss>.<ext>`。安全标题的处理：
- 把 `\ / : * ? " < > |` 与控制字符替换为 `-`。
- 合并连续空白，去掉首尾空白与点。
- 截断到 60 个字符。
- 为空时使用 `neko-session`。

时间用调用方传入的 `Date`（本地时区），以便测试可复现。`exportFormatFromPath` 以扩展名（不区分大小写）判定，其余返回 `null`，由调用方报错。

### D6. TUI 命令

在 `submit()` 中加入 `/copy`、`/export`（与现有 `/fork`、`/archive` 同构），命令表与帮助同步（`labels.ts` 与 `help-ui.ts` 的命令列表由 `commands` 生成，补条目即可）。

- 命令在"忙碌拦截"之前解析，不进入 `sendImages`，不动草稿。
- `/export` 参数用小型分词：支持 `"` `'` 引号，遇到 `--thinking` 标志置位，其余第一个词为路径，多余位置参数报用法错误。
- 路径解析：`~/` 展开为家目录，相对路径相对 `options.cwd ?? process.cwd()`（TUI 工作区目录）。
- 缺省路径 = 工作区目录 + `exportFileName(...)`（Markdown）。标题取自目录状态里的会话摘要，经 `sessionName`。
- 写文件用 `writeFile(path, content, { flag: "wx" })`：已存在则 `EEXIST`，提示换路径；写入中途失败则尽力 `unlink` 刚创建的文件。内容先完整在内存生成，所以不会出现"生成一半"的文件。
- 发起时**快照** `view.items`、会话 id、标题与捕获的 `chat` 句柄。TUI 的旧 `chat` 句柄在切换会话后仍可用（`HistoryImage` 已依赖这一点），因此图片读取与文件写入可继续完成，完成提示里带会话名。
- 执行为 fire-and-forget（`void this.#export(...)`），失败走 `addNotice(..., "error")`。

### D7. TUI 剪贴板写入模块

新增 `packages/tui/src/clipboard-write.ts`，导出 `copyToClipboard(text, deps?)`，`deps` 注入 `platform / env / run / native / writeOsc52`（沿用 `image-input.ts` 里 `options.command` 的可测试做法）。顺序：

1. 非 Linux：`getNativeClipboard()?.setText`（pi-tui 提供）。
2. 平台命令：
   - macOS：`pbcopy`。
   - Windows：`powershell.exe -NoProfile -Command "Set-Clipboard"`，stdin 设为 UTF-8。不用 `clip.exe`，它按控制台代码页解码，会破坏中文。
   - Linux：`wl-copy`（有 `WAYLAND_DISPLAY`），`xclip -selection clipboard` / `xsel --clipboard --input`（有 `DISPLAY`）。
3. OSC 52（`#terminal.write`）：以上都失败时使用；远程会话（`SSH_CONNECTION / SSH_CLIENT / MOSH_CONNECTION`）即使 1/2 成功也额外发出，因为本机剪贴板不是用户所在的那一端。
4. base64 长度上限 100 000：超出则不发 OSC 52；若此时其他方式也都失败，抛出带原因的错误。

返回 `{ method: "native" | "command" | "osc52" }`。通知文案区分：

- 原生与命令写入：`Copied last response (N chars)`。
- 仅 OSC 52：`Sent to terminal clipboard via OSC 52 (N chars); your terminal must allow it`。这是据 pi-tui 注释对"无法验证"的诚实表述，不声称已复制。

### D8. Web 复制

- 在 `web/src/client/lib/` 新增 `clipboard.ts`：`copyText(text)` 先 `navigator.clipboard.writeText`；缺失或被拒则用隐藏 `textarea` + `document.execCommand("copy")`，并在 `finally` 里恢复原焦点与选区；两者都失败则抛错。
- 新增 `CopyButton` 组件：
  - 位置在气泡**下方**一条小操作行，用户气泡靠右，assistant 靠左。放在气泡外，不遮挡文字，对含技能卡片、图片、`details` 的复合气泡也适用。
  - 桌面悬停或 `:focus-within` 时显示，`(hover: none)` 下常显。
  - 按钮的 aria-label 为"复制"/"复制回答"，成功后 1.5s 内文字变"已复制"，并经 `aria-live="polite"` 通知；失败显示"复制失败"。
  - 点击区域不小于 32px。
- 只接入 `UserRow` 与 `AssistantRow`，不接入 `StreamingRow`。无可复制文本（`copyText` 为空）时不渲染按钮，如只有 thinking 的 assistant 条目。
- 图标新增 `copy`（`primitives.tsx` 的 `Icon` 联合类型）。

### D9. Web 导出入口

- 在 `TopBar` 右侧加"导出"图标按钮（复用 `download` 图标），用现有 `Popover` 展开：三个格式项和一个"包含思考过程"复选框（默认关、不持久化）。窄屏仅显示图标。
- 点击格式项时快照 `view.items`、`currentSessionId`、会话标题（`sessionName`）、模型与 `view.cwd`。
- HTML 的 `loadImage` 复用 `appActions.image(entryId, contentIndex, sessionId)`。
- 若导出期间 `currentSessionId` 变化，`appActions.image` 会因会话不匹配抛错。导出据此**取消**并提示"会话已切换，导出已取消"，不下载半成品。这与 TUI 不同：Web 的网关外观只持有当前会话句柄，TUI 的旧句柄仍有效。
- 下载用 `Blob` + 临时 `<a download>`，点击后 `URL.revokeObjectURL`。
- 进行中按钮禁用并显示"导出中…"，完成与失败用现有 notice 机制反馈。`view` 为空或 `items` 为空时按钮禁用并带 title 说明。

### D10. 测试与文档

- `core/test/conversation-export.test.ts`：文本规则、最后回答、三种格式、围栏长度、HTML 转义与链接白名单（含 `<script>`、`javascript:`、事件属性）、图片预算与失败占位、文件名清洗、JSON 往返解析。
- `tui/test/`：分词与格式判定、`/export` 的写入与 `wx` 冲突、剪贴板写入的方法优先级与降级（注入 deps）、命令表条目。
- `web/test/`：复制降级（模拟 `navigator.clipboard` 缺失）、导出菜单触发逻辑如不涉 DOM 则测纯函数。
- README「日常操作」增加复制与导出条目。

## Risks / Trade-offs

- [导出内容有损：无原始工具参数、时间戳、system prompt] → 在 README 说明导出的是"可读转录"；需要无损再加 RPC（Non-Goal）。
- [`marked` 引入 core 依赖，且 Web 打包两处使用] → 版本与 web 一致，用独立 `Marked` 实例避免全局配置串扰；其浏览器端体积已在 web bundle 内，无增量。
- [HTML 转义遗漏导致 XSS] → 双层防线：renderer 级转义 + 链接白名单，外加无脚本与 CSP；测试覆盖 `<script>`、`<img onerror>`、`javascript:`、`data:` 链接。
- [OSC 52 无法验证是否生效] → 文案不称"已复制"；原生方式优先；失败且超限时明确报错并提示 `/export`。
- [Windows 的 `Set-Clipboard` 路径未在本机（darwin）验证] → 先走 pi-tui 原生 `setText`，命令只是降级；以注入式测试覆盖分支，并在验收中标注 Windows 为未实机验证。
- [32 MiB 图片预算对多图会话偏紧] → 超限只降级为占位并报告数量，不致失败；常量集中，易调。
- [大会话导出在浏览器主线程拼接大字符串] → 图片串行读取并按预算限量；Markdown/JSON 为纯文本，规模与转录同阶。
- [`wx` 拒绝覆盖对习惯覆盖写的用户有摩擦] → 错误里给出明确提示，默认文件名带秒级时间戳基本不冲突。

## Migration Plan

纯增量功能，无数据迁移，无协议变化。回滚即移除新增命令、按钮与 `core` 子路径。新增依赖 `marked` 需更新 `bun.lock`。
