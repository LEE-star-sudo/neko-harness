# Design

## Context

`/login` 面板由 `packages/tui/src/components/login.ts` 的 `LoginPanel` 实现：拦截键盘事件后委托给 pi-tui 的 `Input`（单行输入组件，自带光标移动、bracketed paste、undo）。当前实现把 ←/→/Tab 一律劫持为切换 provider（`#switch` 重建 `Input`，内容被丢弃），保存失败统一吞错，成功不关闭面板，Ctrl+R 无确认。服务端校验在 `packages/core/src/runtime.ts` `saveCredential`：拒绝空值、超 4096 字符、含控制字符（`charCodeAt(0) < 32`），落盘前 `trim()`。

动机见 proposal.md，行为契约见 `specs/terminal-ui/spec.md` 的"登录配置" delta。

## Goals / Non-Goals

**Goals:**

- 恢复 ←/→ 的光标移动语义，消除方向键导致的数据丢失。
- 粘贴后可确认（显示字符数）、可保存（自动去首尾空白）、失败可知（具体原因）。
- 保存/移除成功自动关闭面板；移除需内联确认。

**Non-Goals:**

- 不改服务端凭据校验规则与存储格式（core/gateway 协议不变）。
- 不重做面板布局或新增 provider；web 端设置页不在范围内。

## Decisions

- **D1 按键路由按输入是否为空分流**：`handleInput` 中，←/→ 仅在 `Input` 值为空时切换 provider；非空时透传给 `Input.handleInput`（恢复光标移动）。Tab 始终切换 provider，成为主要的切换键，帮助行相应标注。
  - 备选：完全把切换挪到 Tab。否决——空输入时 ←/→ 切换是无害且已养成的习惯。
- **D2 切换 provider 保留输入**：`#switch` 不再重建 `Input`，仅重置 message。
  - 备选：保留旧行为（清空）或清空前确认。否决——前者即本变更要修的数据丢失；后者打断心流，且把 A 的 key 存入 B 需要用户显式 Enter，风险可控。
- **D3 遮罩行显示固定星号 + 字符数**：如 `API Key: ******** (35 characters)`，星号数量不再随长度变化（顺带消除长度泄露），字符数让用户确认粘贴完整性。不显示任何明文片段——密钥在终端回显中保持零明文。
  - 备选：显示头尾各 2 位明文。否决——明文片段出现在终端回显与录屏中的风险大于确认收益，字符数已足够发现截断/多带字符。
- **D4 保存前清洗，内部控制字符给出具体原因**：`#apply` 先 `trim()`；trim 后为空提示 "Enter an API key."；trim 后仍含控制字符（与服务端同规则）提示 "Key contains a newline or control character." 且不发起请求。清洗在本地完成，与服务端校验同规则，不产生新的失败模式。
- **D5 错误透传服务端 message**：`#apply` 的 catch 显示 `error instanceof Error ? error.message : String(error)`。core 的错误文案为固定字符串（"Enter a valid API key." / "Cannot save API key."），不含密钥，泄露风险无。
  - 备选：维持笼统文案。否决——"格式不对"和"写盘失败"的处置完全不同。
- **D6 成功后延迟自动关闭**：保存/移除成功显示确认文案，~800ms 定时器后调用 `close()`（复用现有关闭路径：恢复聊天焦点与草稿）。定时器归入 `#generation` 防护——面板中途被 Esc 关闭或重新打开时定时器失效；`close()` 内清理定时器。
  - 备选：成功立即关闭。否决——用户需要看到"Saved"反馈，800ms 足以读完。
- **D7 移除用二次按键内联确认**：Ctrl+R 第一次进入 `#confirmingRemove` 状态，帮助行变为 "Press Ctrl+R again to remove / Esc cancel"，第二次 Ctrl+R 执行；任何其他输入取消确认。不引入新组件，复用现有 message/help 行。
  - 备选：复用市场面板的确认视图。否决——单键二次确认在单行操作上足够，避免面板状态机膨胀。
- **D8 密钥行复用 pi-tui 光标机制**：聚焦时在遮罩末尾（插入点）发射 `CURSOR_MARKER` + `renderFakeCursor(" ")`——与 `Input` 组件同一习语：终端支持时 TUI 把硬件光标（原生闪烁）定位到标记处，不支持时把 fake cursor 解析为反色块。光标永远位于固定 8 星号之后，位置不随密钥长度变化，不泄露内容。`visibleWidth`/`truncateToWidth` 对 APC 标记零宽安全（`Input` 同样依赖）。
  - 备选：自维护定时器切换可见性做软件闪烁。否决——每个组件自管动画会触发整帧重绘且与 TUI 的硬件光标协议重复。

## Risks / Trade-offs

- [bracketed paste 的多行内容进入 `Input` 后，trim 只去首尾，中间换行仍被拒] → D4 给出具体原因，用户手动清理后可重试；不尝试自动删除内部换行（可能改变有效 key 的语义）。
- [←/→ 语义随输入是否为空变化，可能让肌肉记忆不一致] → 帮助行动态提示：非空时不再显示 "Left/Right Switch"，只留 Tab。
- [自动关闭打断想继续配置另一 provider 的用户] → 800ms 仅关闭面板，重新 `/login` 成本低；切换 provider 应发生在保存前。
