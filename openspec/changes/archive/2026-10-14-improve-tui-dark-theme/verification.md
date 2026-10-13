# 验证记录

环境：macOS arm64，Bun 1.4.2；2026-10-13。主题实现基于已安装 pi-tui 1.2.0。

## 自动检查

- `bun run build`：通过；保留已有 Vite chunk 大小提示。
- `bun run check`：通过；仅现有 `packages/tui/test/theme-syntax.test.ts` 的 useTemplate 信息（非错误）。
- `bun run test`：313 pass、0 fail，81 文件，1953 assertions，65.92s。
- 主题针对性测试：22 pass、0 fail，涵盖配色矩阵、嵌套 SGR 重置、truecolor/256 色、已有消息与展开状态往返切换、系统文本及通知刷新、auto 查询/迟到回复/通知取消。
- 浅色 `LIGHT_PALETTE` 与实施前 Git 版本逐字比较一致；浅色着色函数路径保持原行为。
- `openspec validate improve-tui-dark-theme --strict`、`git diff --check`：通过。

## 配色与对比度

`dark-theme.test.ts` 的矩阵按组件实际槽位组合覆盖面板、用户卡、三态工具卡、选中项、代码与 diff。表面默认前景及矩阵中所有文字均达到 4.5:1；装饰边框不计作正文。

| 示例文字/背景 | 对比度 |
| --- | --- |
| 辅助字 #9AA5CE / panel #24283B | 6.00:1 |
| 辅助字 #9AA5CE / userBg #292E42 | 5.53:1 |
| 注释 #8993B3 / codeBg #1A1B26 | 5.61:1 |
| 正文 #C0CAF5 / panel #24283B | 9.02:1 |

配色来源锁定 Tokyo Night commit `cdc07ac78467a233fd62c493de29a17e0cf2b2b6`；根 LICENSE 保留项目 MIT 条款并附配色来源、调整说明和上游 Apache-2.0 全文，沿现有发布包 LICENSE 入口分发。

## PTY 与可视检查

使用真实 ProcessTerminal/TuiAltScreen、产品布局、编辑器、消息/工具/面板组件；无模型请求。临时 Python PTY 驱动使用 pyte 解析输出、Pillow 渲染截图，未添加项目依赖。

- 80×24、60×16 × truecolor、256color × 纯黑 #000000、灰黑 #282C34、深蓝 #1A1B26，共 12 组通过。
- 样例覆盖展开 Thinking、用户消息、代码高亮、运行/成功/失败工具及其参数/输出、普通面板文字、错误/操作/辅助提示、状态栏和流式内容更新。
- 每组测试滚动后切换、详情中切换和流式更新后切换，共六次主题切换；前后草稿、光标、滚动位置和面板状态完全相同，工具展开保持。
- Esc 逐层返回后在原光标位置插入 Z，得到 KEEP-DRAFZT，确认编辑位置没有复位。
- 256 色输出未包含 truecolor SGR。量化后深色面板更偏蓝，但文字与选中/状态仍可辨识；不宣称精确复现 truecolor 色值。
- 截图属于终端输出模拟渲染，默认背景由测试呈现层分别设置，不修改真实终端配色；字体不含部分 braille 字形，截图中相应占位不代表产品丢失文字。主画布仍继承终端颜色。

本地证据目录：`/private/tmp/neko-dark-evidence/`。包含 12 组 ANSI 捕获、逐次状态 JSON、history/scrolled/detail PNG 和 summary.json。已查看 80×24 truecolor 深蓝背景的历史/详情与 60×16 256 色纯黑背景的详情截图。

## 真实 CLI

隔离 HOME、工作区、存储和随机网关端口，真实 `neko tui` 源码入口；80×24、60×16 各测试 auto 浅/深分支，共四组通过：

- COLORFGBG 指示深色时使用新蓝色强调，浅色时使用原樱花强调。
- `/theme` 标题计数为 3，包含 Auto (Current)、Light · sakura-day 和 Dark，不含 sakura-night。
- 手动选择 Dark 后重新打开标记 Dark (Current)，再选 Auto 可继续输入草稿并退出。
- 首次测试脚本在进程已正常退出后重复写 Ctrl+C 报 PTY EIO；修正驱动仅向仍运行的进程发送后四组全部通过，未改产品退出逻辑。

没有 Windows 真机验证，也没有新增 Windows CI。未修改 Web、配置格式、Pi 版本或依赖。实施期间另一变更 `unify-cli-help-output` 已独立提交为 `1330007`；本次保留其全部内容。
