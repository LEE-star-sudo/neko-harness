# Tasks

## 1. 按键路由与 provider 切换

- [x] 1.1 修改 `LoginPanel.handleInput` 与 `#switch`：←/→ 仅在输入为空时切换 provider，非空时透传给 `Input`（光标移动）；Tab 始终切换；切换不再重建 `Input`（保留输入），仅重置 message。验证：`bun test packages/tui/test/login.test.ts` 中更新后的切换用例通过——粘贴内容后按 ←/→ 光标移动且内容/provider 不变，空输入时 ←/→ 切换，切换保留未保存输入
- [x] 1.2 更新帮助行：输入非空时不显示 "Left/Right Switch"（只留 Tab），空输入时保留。验证：测试断言两种状态下的帮助行文案

- [x] 1.3 聚焦时密钥输入行在插入点发射 `CURSOR_MARKER` + fake cursor（pi-tui 硬件光标习语，光标恒在固定星号之后），失焦不发射。验证：测试断言 focused 时渲染输出含 `CURSOR_MARKER` 且不泄露密钥，失焦/关闭后无标记；布局测试宽度不越界

## 2. 粘贴确认、清洗与错误透传

- [x] 2.1 遮罩行改为固定星号 + 字符数（如 `API Key: ******** (35 characters)`），窄终端不越界。验证：测试断言字符数随输入更新、星号数恒定、80/60 列下不溢出
- [x] 2.2 `#apply` 保存前 `trim()`；trim 后为空提示 "Enter an API key."；trim 后仍含控制字符（`charCodeAt(0) < 32`）提示具体原因（含换行/控制字符）且不发起保存请求。验证：测试覆盖带首尾空白的粘贴可保存、带内部换行被拒且原凭据不变
- [x] 2.3 保存/移除失败透传服务端 `error.message`（不落密钥）。验证：mock save 抛 "Enter a valid API key." 时面板显示该文案

## 3. 成功自动关闭与移除确认

- [x] 3.1 保存/移除成功显示确认文案，~800ms 后自动 `close()`；定时器受 `#generation` 防护并在 `close()` 中清理。验证：测试（假定时器）断言成功后面板自动关闭且焦点恢复，Esc 抢先关闭后定时器不再触发
- [x] 3.2 Ctrl+R 第一次进入内联确认态（帮助行提示再按一次确认），第二次执行移除，其他输入取消确认。验证：测试断言单次 Ctrl+R 不删除、二次确认才删除、其他键取消确认

## 4. 回归与文档

- [x] 4.1 全量回归 `bun run test` 与 `bun run check` 通过；既有 login 测试（遮罩、关闭丢弃 undo、迟到响应不夺取焦点）保持绿色
- [x] 4.2 手动验证 `bun run neko tui`：粘贴 DeepSeek key 保存后自动关闭、对话可用；粘贴带换行内容看到具体错误
