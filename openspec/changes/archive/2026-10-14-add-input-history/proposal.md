# Proposal

## Why

在 Web 与 TUI 输入框里反复发送相似指令很常见（重试、微调措辞、重发 `/skill:`），但目前两端都无法用 ↑/↓ 找回已发送过的输入。TUI 使用的 pi-tui Editor 自带历史浏览能力，却从未被接线；Web 输入框则完全没有。需要一个按会话、跨端一致、重开后仍在的输入历史。

## What Changes

- 新增按会话的输入历史：在输入框中按 ↑ 回填更早的已发送输入，按 ↓ 向较新方向移动，越过最新一条后还原进入浏览前的草稿。
- 历史来源为会话 transcript 中已进入对话的用户输入（持久、按会话隔离、Web/TUI 一致），不新增网关协议或存储。
- core 提供一个纯函数，从 transcript items 派生历史条目：排除子 agent 内部输入与默认图片提示，技能调用还原为 `/skill:<name> [args]`，连续重复去重，上限 100 条，仅取文字不恢复图片附件。
- TUI：把派生历史灌入 Editor（切换会话、视图更新时同步），沿用 pi 的触发语义，补充会话隔离与草稿保护。
- Web：在输入框实现同等语义的 ↑/↓ 浏览，并避开命令菜单、`@` 文件候选与 IME 组合输入。
- 本地命令（如 `/compact`、`/export`、`/copy`）不在 transcript 中，不进入历史（已知取舍）。

## Capabilities

### New Capabilities

- `input-history`: 跨前端共享的输入历史派生规则（来源、过滤、技能还原、去重与上限、会话隔离），是两端行为一致的单一契约。

### Modified Capabilities

- `terminal-ui`: 新增 TUI 输入历史浏览交互（↑/↓ 触发条件、草稿还原、与补全/图片引用的交互、会话切换隔离）。
- `web-ui`: 新增 Web 输入框历史浏览交互（↑/↓ 触发条件、草稿还原、菜单/候选/IME 下不触发、编辑后退出浏览态）。

## Impact

- `packages/core`: 新增 `input-history.ts` 纯函数及子路径导出（与 `transcript-items` 同样方式），含单测。
- `packages/tui`: `src/tui.ts`、`src/components/editor.ts`（BoundedEditor）接线历史与会话切换重置。
- `packages/web`: `src/client/components/composer.tsx` 的键盘处理，及相应的草稿状态。
- 无新增依赖，无网关协议变更，不涉及 pi 上游代码改动。
