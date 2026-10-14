# Tasks

## 1. core：历史派生纯函数

- [x] 1.1 新增 `packages/core/src/input-history.ts`（`promptHistory(items): string[]`，新→旧），在 `packages/core/package.json` 增加 `./input-history` 子路径导出（含 `neko-source`/`types`/`import`），验证 `bun run build` 产出 `dist/input-history.js` 与 `.d.ts`
- [x] 1.2 新增 `packages/core/test/input-history.test.ts`，覆盖：排除 `subagentRoundId`、默认图片提示与空白输入；技能还原为 `/skill:name` 与 `/skill:name args`；连续去重与非连续保留；100 条上限；多行保留换行；验证 `bun run test` 中该文件全部通过
- [x] 1.3 实现前先用一个压缩后的会话样例确认 `view.items` 仍保留早期 user 项，把结论写入测试注释或 design 的 Risks（与 spec 一致即无需改动），验证有对应断言或记录

## 2. TUI：Editor 接线

- [x] 2.1 在 `packages/tui/src/components/editor.ts` 为 `BoundedEditor` 增加 `setHistory(entries)`（括号访问 pi 私有 `history`，重置浏览态；浏览态下暂存，退出浏览后在下一次 `handleInput`/`setText` 应用），验证 `packages/tui/test` 新增的单测：灌入历史后 ↑ 回填最近、↓ 还原草稿、浏览中更新不改变当前回填
- [x] 2.2 在 `packages/tui/src/tui.ts` 的 `switchSession` 与 `applyView` 调用 `promptHistory` 并 `setHistory`（列表未变则跳过），验证单测：切换会话后历史替换且不含上一会话内容、发送后新输入成为 ↑ 第一条
- [x] 2.3 补充 TUI 单测覆盖补全面板显示时 ↑↓ 不触发历史、多行内容中行内移动优先、回填后编辑退出浏览态、图片引用草稿经历史往返保持不变（与 `editor-images.test.ts` 风格一致），验证 `bun run test` 通过
- [x] 2.4 更新 TUI 操作帮助（`help-ui.ts` 的快捷键说明）加入“↑/↓ 浏览输入历史”，验证 `help-ui.test.ts` 通过并含该说明

## 3. Web：输入框历史

- [x] 3.1 新增 `packages/web/src/client/lib/input-history.ts` 纯逻辑（给定历史、浏览态、按键、光标/选区、是否为空 → 下一状态与回填文字及光标位置），并在 `packages/web/test/input-history.test.ts` 覆盖：空输入 ↑、光标在起点 ↑、有选区/修饰键不触发、↓ 仅在浏览态且光标在末尾、越界停止、还原草稿；验证 `bun run test` 通过
- [x] 3.2 在 `composer.tsx` 的 `SessionComposer` 接入：用 `useMemo` 从 `view.items` 派生 `promptHistory`，`browse` ref 保存索引、草稿与进入时列表快照；`onKeyDown` 顺序为 `isComposing` → `mentions.keyDown` → 命令菜单 → 历史 → Enter；回填用 `edit({ text })`（刷新 `requestId`）并同步 textarea 高度与光标；`onChange`、发送成功与草稿恢复时清空浏览态。验证 `bun run check` 通过
- [x] 3.3 浏览器手动验证（`bun run neko web`）：空输入 ↑↓ 翻历史并还原草稿；菜单/`@` 候选/IME 下不触发；附件保持；回填后 Enter 发送为新消息；切会话与刷新后历史正确。验证以操作记录写入变更说明或 PR 描述

## 4. 规格与整体验证

- [x] 4.1 `bun run check` 与 `bun run test` 与 `bun run build` 全部通过
- [x] 4.2 `openspec validate add-input-history --strict` 通过，且三份 delta spec 的 Scenario 与实现行为一一对应

## Workflow follow-up

- 实现与验证完成后，按项目惯例归档该变更（`/openspec-archive-change`），把 delta 同步进 `openspec/specs/{input-history,terminal-ui,web-ui}`。
