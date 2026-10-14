# Tasks

## 1. core：文本规则、文件名与 Markdown / JSON 导出

- [x] 1.1 新建 `packages/core/src/conversation-export.ts` 并在 `packages/core/package.json` 增加 `./conversation-export` 子路径（`neko-source` / `types` / `import` 三项与现有子路径一致）；验证：`bun run --cwd packages/core build` 通过，`packages/web` 的 `bun run --cwd packages/web check:client` 能解析该子路径的类型导入。
- [x] 1.2 实现 `copyText(item)`、`lastAnswerText(items)`、`exportFormatFromPath(path)`、`exportFileName(title, format, at)`（规则见 design D1/D5 与 spec“可复制文本规则 / 最后一条回答 / 导出文件命名”）；验证：`packages/core/test/conversation-export.test.ts` 覆盖带 thinking 的 assistant、`/skill:` 有/无参数、默认图片提示、工具轮后的最终回答、无回答、非法字符/超长/空标题文件名、扩展名大小写与未知扩展名，且全部通过。
- [x] 1.3 实现 `exportConversation` 的 Markdown 与 JSON 输出及公共遍历（用户、assistant、工具、系统条目；`includeThinking` 开关；未完成工具标注；图片占位）；验证：同一份测试夹具下 `bun test packages/core/test/conversation-export.test.ts` 断言：默认不含 thinking、勾选后含且与正文分开、围栏长度大于内容中的反引号序列、JSON 可被 `JSON.parse` 往返且版本号与条目顺序正确、空转录被拒绝并给出原因。

## 2. core：HTML 导出

- [x] 2.1 在 `packages/core/package.json` 的 `dependencies` 精确锁定 `marked` 为 `18.1.0` 并更新 `bun.lock`；验证：`bun install --frozen-lockfile` 在更新后通过，`bun run build` 不报缺失依赖。
- [x] 2.2 新建 `conversation-export-html.ts`：独立 `new Marked()` 实例、覆盖 `html`/`link`/`image` 渲染器、CSP `<meta>`、无 `<script>`、内联样式、thinking 与工具用 `<details>`；验证：测试断言正文含 `<script>alert(1)</script>`、`<img src=x onerror=...>`、`[x](javascript:alert(1))`、`[x](data:text/html,...)` 时输出不含可执行标签或这些链接目标，且 `http/https/mailto` 链接保留。
- [x] 2.3 实现图片内嵌：`loadImage` 回调、按描述符 `bytes` 预检的 32 MiB 总预算、串行读取、单张失败占位并统计 `skippedImages`；验证：测试使用假 `loadImage` 断言内嵌 `data:` URI 正确、超预算的图片不调用加载器且占位、抛错的图片被替换而导出仍完成、`skippedImages` 数值正确。

## 3. tui：剪贴板写入

- [x] 3.1 新建 `packages/tui/src/clipboard-write.ts`，按 design D7 实现原生 → 平台命令 → OSC 52 的降级链、远程会话额外 OSC 52、100 000 字符 base64 上限与错误原因，`deps` 可注入；验证：`packages/tui/test/clipboard-write.test.ts` 注入假依赖，断言 macOS/Linux(Wayland、X11)/Windows 的命令选择、原生成功时不发 OSC 52、SSH 环境下额外发 OSC 52、全部失败且超限时抛带原因的错误、结果的 `method` 字段正确。

## 4. tui：`/copy` 与 `/export`

- [x] 4.1 在 `labels.ts` 命令表加入 `/copy`、`/export` 并确认 `/help` 命令列表自动包含；在 `tui.ts` 的 `submit()` 中于忙碌拦截之前实现 `/copy`（调用 `lastAnswerText` 与剪贴板写入，区分原生成功与仅 OSC 52 的提示文案，无内容时提示）；验证：`packages/tui/test/` 新增测试断言命令补全含 `/copy` 与 `/export`、`/help` 行含二者，`/copy` 在有/无回答时的通知文本与剪贴板调用，忙碌时仍执行且不修改草稿。
- [x] 4.2 实现 `/export [path] [--thinking]`：参数分词（引号、`--thinking`）、`~/` 与相对路径解析、扩展名判格式、默认文件名写入工作区目录、`wx` 写入与冲突/未知扩展名/父目录缺失/空会话的明确错误、写入失败清理、发起时快照 items/会话 id/标题/`chat` 句柄，HTML 的 `loadImage` 用 `downloadImage` + `chat.getImage`；验证：测试在临时目录断言三种格式写出内容、`--thinking` 生效、引号路径、已存在文件不被覆盖且内容不变、`.txt` 报错且无文件、导出期间切换会话后文件仍是原会话内容。
- [x] 4.3 用 pty 启动 `bun run neko tui`（需 `DEEPSEEK_API_KEY` 或测试用 faux 会话），完成一轮对话后执行 `/copy` 与 `/export`，在剪贴板（`pbpaste`）与生成文件中观察结果；验证：剪贴板内容等于最后一条回答正文，导出的 `.md` 与 `.html` 文件可打开，TUI 通知含完整路径。

## 5. web：气泡复制

- [x] 5.1 新增 `packages/web/src/client/lib/clipboard.ts`（`navigator.clipboard` → `execCommand("copy")` 降级，恢复焦点与选区，全部失败抛错）；验证：`packages/web/test/clipboard.test.ts` 模拟接口缺失与被拒绝，断言降级路径被调用、两者均失败时抛错、成功后原焦点元素恢复。
- [x] 5.2 新增 `CopyButton` 组件与 `copy` 图标，接入 `message-list.tsx` 的 `UserRow` 与 `AssistantRow`（气泡下方操作行；悬停/焦点显示、`(hover: none)` 常显；aria-label、`aria-live` 状态、最小点击区 32px；无可复制文本不渲染；不接入 `StreamingRow`），样式放 `styles.css`；验证：`bun run --cwd packages/web check:client` 与 `bun run check` 通过，并用浏览器打开 Web UI 实际检查：复制 assistant 气泡不含思考过程、技能调用气泡复制为 `/skill:` 形式、流式中无按钮、键盘 Tab 可聚焦、375px 宽度下按钮可见。

## 6. web：会话导出

- [x] 6.1 新增导出菜单组件并接入 `top-bar.tsx`（`Popover`、三种格式、“包含思考过程”默认关闭；快照 items/会话/标题/模型/cwd；HTML 的 `loadImage` 用 `appActions.image`；导出期间会话切换则取消并提示；Blob 下载并 `revokeObjectURL`；进行中禁用；空会话禁用并说明；窄屏仅图标）；验证：`bun run --cwd packages/web check:client` 通过，并用浏览器实际检查：三种格式各下载一次且文件名合规、勾选思考过程后内容含思考、含图片的 HTML 离线可见图片、空会话入口禁用、导出中切换会话得到取消提示且无文件下载、键盘与 Escape 焦点行为正确。
- [x] 6.2 为导出菜单的纯逻辑（若有，如下载文件名/取消判定）补测试；验证：`bun test packages/web/test` 通过；若无可抽出的纯逻辑则在任务完成说明中写明并以 6.1 的浏览器检查为准。

## 7. 文档与整体验证

- [x] 7.1 更新 `README.md`「日常操作」，增加复制（Web 气泡按钮、TUI `/copy`）与导出（TUI `/export [path] [--thinking]`、Web 顶栏导出、三种格式及“导出的是可读转录”）条目；验证：文中命令与实际 `/help` 输出、Web 界面文案一致。
- [x] 7.2 全量检查；验证：`bun run check`、`bun run test`、`bun run build` 均通过，且无 lockfile 之外的意外文件变更。

## Workflow follow-up

- 评审通过后归档本变更，并确认 `terminal-ui`、`web-ui` 的增量需求与新 `conversation-export` 规格已合入主规格。
