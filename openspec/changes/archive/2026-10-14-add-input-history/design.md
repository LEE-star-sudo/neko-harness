# Design

## Context

动机见 proposal.md。现状：

- TUI 的 `BoundedEditor` 继承 pi-tui 1.2.0 的 `Editor`，后者已内置历史浏览（`addToHistory`、↑/↓、进入时保存草稿、上限 100、连续去重）。`tui.ts` 从未调用 `addToHistory`；历史是 Editor 的私有数组，没有清空/替换 API，且切换会话只做 `setText`，历史不会随会话隔离。
- Web 输入框是受控 `<textarea>`，草稿存放在模块级 `drafts` Map（按 `sessionId` 键），`SessionComposer` 以 `key=sessionId` 挂载，因此组件内的 ref/state 天然按会话隔离。`onKeyDown` 目前只在命令菜单打开时处理 ↑↓，`mentions.keyDown` 处理 `@` 候选。
- 两端都能拿到 `ChatView.items`，其中 `type: "user"` 项携带 `text`、可选 `skill`、`defaultImagePrompt`、`subagentRoundId`。技能调用项的 `text` 是展开后的消息，`skill.name`/`skill.args` 是用户输入的来源。
- core 已有“两端共用的纯函数”先例（`transcript-items`、`session-display` 等带子路径导出）。

## Goals / Non-Goals

**Goals:**

- 历史条目由单个 core 纯函数派生，两端共享，因而重开后仍在、按会话隔离、两端一致。
- 不改网关协议、不新增存储、不修改上游 pi 代码。
- Web 与 TUI 的触发语义尽量对等，且不干扰补全/菜单/IME。

**Non-Goals:**

- 不做跨会话/全局历史、不做 Ctrl+R 搜索、不做历史管理（删除、置顶）。
- 不恢复图片附件，不记录本地命令（`/compact`、`/export`、`/copy` 等）。
- 不改变 transcript 渲染与发送流程。

## Decisions

### D1：历史由 transcript 派生，而非客户端内存累积

`promptHistory(items): string[]`（新→旧）放在 `packages/core/src/input-history.ts`，以子路径 `@neko-harness/core/input-history` 导出，两端都调用它。

- 备选 A：各端在发送成功时本地累积。否决：刷新/重启即丢，两端各写一套，且要处理失败、幂等重试、他端提交等边界。
- 备选 B：网关新增 history RPC。否决：transcript 已在客户端，加协议无收益。
- 代价：本地命令不进历史，且历史只反映 transcript 中可见的输入；已在 spec 中明确为取舍。

过滤规则：排除 `subagentRoundId` 项；`skill` 存在时还原为 `/skill:${name}` 加可选 ` ${args}`；`defaultImagePrompt` 存在时不使用其 `text`（`text` 本身已由投影剔除默认提示，但仍以该字段为准保持防御）；`trim` 后为空则跳过；连续相同折叠；取最近 100 条。

### D2：TUI 通过 BoundedEditor 增加 `setHistory`

pi-tui 的历史字段是 `private`，没有替换 API，而本地需要整体替换（切会话、transcript 更新）。`BoundedEditor.setHistory(entries)` 用 TypeScript 允许的括号访问写入 `this["history"]`，并重置浏览态。

- 备选 A：每个会话一个 Editor 实例。否决：Editor 与布局、补全、鼠标区域、焦点强绑定，重建代价大。
- 备选 B：反复调 `addToHistory` 追加。否决：无法清空，会话切换后会残留旧会话历史。
- 风险：依赖 pi-tui 1.2.0 私有字段名。项目已精确锁版本，并用单测断言“灌入历史后 ↑ 能回填”，升级时测试先于行为失败；符合“只升版本不裹代码”，封装限于这一个方法。

### D3：TUI 在浏览态不被后台更新打断

`tui.ts` 在 `switchSession` 与 `applyView` 里调用 `promptHistory` 并交给 editor。若新旧列表相同则不动；会话变化时立即替换（同时已 `setText`，浏览态本就被重置）。同一会话内列表变化而用户正处于浏览态时，`BoundedEditor` 暂存新列表，在下一次 `handleInput`/`setText` 且已退出浏览态时再应用，避免索引漂移导致回填内容突然变化。

### D4：Web 用“光标在起点/末尾”判定，而非视觉首/末行

`<textarea>` 没有可靠的视觉行 API，自行镜像测量成本高且易错。规则：

- ↑：无选区，且（输入为空 或 `selectionStart === 0`）；
- ↓：处于浏览态、无选区且光标在文本末尾。
- 回填后 ↑ 将光标置于开头、↓ 置于末尾，因此连续按键可连续翻页；多行/折行条目中间位置仍由浏览器默认移动光标。

与 TUI（首行/末行）有细微差异，但可观察行为（空输入翻历史、行内移动优先）一致，spec 已按各端描述。

判定顺序在 `onKeyDown` 中：`isComposing` → `mentions.keyDown` → 命令菜单的 ↑↓/Tab/Esc → 历史 → Enter；因此菜单、候选、IME 始终优先。修饰键（Shift/Alt/Ctrl/Meta）按下时不触发，保留选择与系统快捷键。

### D5：Web 浏览态放在 `SessionComposer` 的 ref 中

`browse = useRef<{ index: number; draft: string } | null>(null)`，`SessionComposer` 以 `sessionId` 为 key，切会话即重置，无需额外清理。回填使用已有的 `edit({ text })`，从而刷新 `requestId`（新草稿不得复用旧请求标识），附件字段不动；并同步调整 textarea 高度与光标位置。

用户在回填文字上输入（`onChange`）、发送或草稿被外部替换（如升级恢复）时清空 `browse`。

浏览中历史列表变化时，Web 与 TUI 同样“冻结”：以进入浏览时的列表快照为准，退出后改用最新列表（列表本身由 `useMemo` 从 `view.items` 得到，浏览态持有快照）。

### D6：条目比较与存储

`trim` 只去首尾空白，保留内部换行；多行条目在 TUI 的 Editor 中以换行拆分回填，在 Web 中直接写入 textarea。

## Risks / Trade-offs

- [依赖 pi-tui 私有字段] → 仅在 `setHistory` 一处使用，精确锁版本，单测覆盖，升级走显式 OpenSpec 变更。
- [历史是否包含被压缩前的早期输入取决于 `view.items` 的内容] → 已验证：投影遍历全部 `view.entries`，压缩只追加 `[context compacted]`/`[new context]` 系统项，早期 user 项保留（`input-history.test.ts` 有断言）。
- [本地命令不进历史] → 用户重发 `/compact` 需重新键入；接受，换取零协议变更。
- [Web 与 TUI 触发细节不同] → 在各自 spec 中分别写明，并保证“空输入 ↑ 回填、↓ 还原草稿、行内移动优先”三条核心行为对等。
- [历史条目含敏感输入] → 历史来自已存在于 transcript 的内容，不新增落盘位置，不扩大暴露面。
