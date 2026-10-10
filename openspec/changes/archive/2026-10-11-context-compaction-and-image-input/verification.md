# 实施验收记录

日期：2026-10-11。Bun 1.4.2，macOS arm64；Pi/chord 全部保留精确 1.1.0。新增 sharp 精确 0.35.5，不修改 reference。全部模型调用使用 faux provider，未调用真实 DeepSeek API，未删除或迁移用户历史。

## 自动回归

最终结果：105 tests passed，0 failed，530 assertions，32 个测试文件。check、build、OpenSpec strict 与 diff --check 均通过。

可复现命令：

```sh
bun run check
bun run build
bun test --conditions=neko-source --isolate
openspec validate context-compaction-and-image-input --strict
git diff --check
```

- core `compaction.test.ts`：手动、默认后台/阻塞阈值、溢出后恢复、摘要重试、失败、中止、waiting-to-apply、应用、无需执行、过期跳过、摘要执行期间重启及终态重开；压缩不更改最近消息时间，不重复统计用量。
- core `images.test.ts` / `image-runtime.test.ts`：PNG/JPEG/WebP、缩放和透明度、动画/伪造格式/损坏/像素/字节/数量限制；仅图、图文顺序、幂等、重启/fork、原文件删除；模型受理协调；同图不同名称和排队消息的条目元数据；工作区同名图、跨目录、权限拒绝及读取变化；原 read 保持拒绝图片；仅图标题使用 off 的文本占位。
- gateway `images.test.ts` / `image-uploads.test.ts`：Unix/WS 传输大于单块上限的图片，分块读取，状态不携带 base64；上传所有权、顺序、大小、并发、TTL、release、重复引用；已回收上传的 requestId 幂等重试；fork 历史、无关会话拒绝和失效门面；压缩状态同步。既有断连重连、配置与会话管理测试继续运行。
- TUI `image-input.test.ts` / `layout.test.ts`：引号/空格/转义路径、普通句子不误识别、命令精确解析、源文件保留、平台剪贴板模拟/回退；PNG/JPEG/WebP 转 Pi Kitty 图形协议、只加载可见图片、无图形回退；120×40、80×24、60×16 的编辑器和压缩状态/停止提示边界。

## 实际交互验收

使用独立临时 SQLite、随机 WebSocket 端口、独立 Unix socket 和模拟 vision/text 模型启动预览。浏览器与独立 PTY 连接同一会话；测试工作区与正常 ~/.neko 数据分离。

- Web：加号选择图片、仅图和图文发送；拖放与 paste 事件；损坏图片逐项报错并禁止误发；无视觉模型保留附件并阻止发送，历史仍可预览。
- Web：切会话保存文字和附件；故意延迟文件读取并在发送过程中添加新文字/图片，确认受理后仅移除已发送内容，保留新草稿。
- Web：菜单方向键、Enter 选择、Escape 返回编辑器；输入法组字 Enter 不触发命令；移动触屏模拟 tap 选择命令；有附件时 `/compact` 不消费附件。
- Web：历史预览打开/关闭，Escape 关闭后恢复按钮焦点；1440、1024、768、375 宽度，布局稳定后页面宽度等于视口，发送和菜单入口可见。预览网关重启后重新读取历史图片成功。
- TUI PTY：带空格路径拖入生成图片引用，Ctrl+U 删除、Ctrl+- 撤销恢复；/sessions 切换后草稿隔离并恢复；仅图发送后 Web 实时出现同一图片；TUI `/compact keep decisions` 的无需压缩状态同时出现在 Web。
- 读图工具通过真实 NodeExecutionEnv 与模拟模型集成验证；未用真实模型视觉输出质量作为验收依据。

## 限制与实现取舍

- Ghostty 实际画面验收未完成：电脑控制工具返回 “Computer Use is not allowed to use the app 'com.mitchellh.ghostty' for safety reasons.”。独立 PTY/协议测试不等于 Ghostty 画面实测，该限制未被绕过；后续用户于 2026-10-11 确认已验证，tasks 4.4 据此完成。Windows/Linux 与 macOS 剪贴板平台适配使用模拟后端验证，未声称完成各平台真实剪贴板验收。
- 网关上传和剪贴板直接使用有界内存，不生成临时图片目录；已同步设计说明。用户文件始终只读。图片持久化于 Pi 内容块，宿主元数据以条目位置绑定文件名；fork 后保持显示信息。
- Web 构建仍提示单个压缩后 bundle 大于 500 kB，与此前同类警告一致，构建成功；未通过提高警告阈值隐藏。
- 测试截图、模拟存储、临时脚本和进程只用于本次验收，不归档为项目资产。

清理已完成：关闭独立浏览器和 PTY，停止本次模拟网关/Web 服务，删除本次截图、测试 SQLite、临时图片、脚本和日志。仅保留此文字记录与仓库内自动测试。其他未跟踪的变更目录未修改。

## 图片输入交互修复复验

- Web 图片预览底部保存入口使用粉蓝按钮与下载图标；独立模拟会话中验证 375px 窄屏完整可见，点击触发 `preview.png` 下载。
- TUI 全局监听过滤 Kitty 按键释放事件，剪贴板快捷键同时过滤连发，并防止并行读取和清空草稿后的延迟回填。
- 空闲编辑时连续两次 Esc（400 毫秒内）清空输入；Backspace/Delete 整体删除图片引用，原生 Ctrl+- 撤销保留附件与大段粘贴内容。
- TUI 回归 22 tests passed、136 assertions；check、build、diff --check 通过。按键行为使用协议事件测试，仍不等同于 Ghostty 实机画面验收。
- 本轮独立浏览器和模拟服务已关闭，测试截图、脚本与日志已删除，不纳入归档。

## 用户验收确认

2026-10-11 用户确认已验证并要求归档提交，补齐 Ghostty 实际画面与本轮交互修复的人工验收。代理的自动测试、浏览器实测和用户实测分别记录，不将模拟测试声称为平台实测。web-search 相关变更不属于本次归档与提交范围。

## 归档提交复核

从提交候选内容创建独立副本，排除 web-search 与 Tavily 凭据扩展后完成 build、check 和完整测试：109 tests passed、0 failed、548 assertions、33 个文件。沙箱内本地监听曾返回 EPERM，放行本地监听后全套通过。暂存内容与验证副本逐文件一致。

六份主规格已同步并保留原有内容；本次 change 严格校验通过。主规格严格校验保留 web-ui 原有 Purpose 少于 50 字符的警告，不为归档改写既有 Purpose。构建仍有既有 500 kB bundle 警告。
