# Tasks

## 1. Token 与阶梯基础建设

- [x] 1.1 在 styles.css 的 `@theme` 中补齐 ink 300/800 档，新增字号阶梯（xs=12/sm=13/base=14/lg=16/xl=20）与收敛后的圆角阶梯（card 1rem、bubble 1.25rem、控件 0.625rem），`bun run check` 通过
- [x] 1.2 新建 `lib/layout.ts` 导出 `MOBILE_BREAKPOINT = 768`、`MESSAGE_COLUMN` 等布局常量；styles.css 的 `@theme` 声明 `--breakpoint-mobile: 48rem`；新增守护测试对拍 CSS 与 TS 常量（锚定具名行），测试通过
- [x] 1.3 将 `useMobile()`（nav-primitives.tsx）与 chat-page 初始侧栏状态改为读取 `layout.ts`；提取 `.chat-column` 共享类归一三处 `max-w-3xl` 与气泡宽度类，`bun run check && bun run test` 通过

## 2. 主题统一第一步：nav 变量映射换色

- [x] 2.1 把 `.nav-theme` 变量值改为引用聊天 token（`--nav-bg: var(--color-base)` 等），侧栏/顶栏/弹层即刻变为蓝粉白基调；对 1440/768/375 三档宽度截图确认无破版
- [x] 2.2 删除 nav 体系内的自定义焦点 outline 与滚动条配色，统一接入 `.focus-neko` 与全局滚动条样式；键盘 Tab 走查侧栏、顶栏、各弹层焦点环可见且为粉色双层环

## 3. 主题统一第二步：类清理与弹层迁移

- [x] 3.1 逐组件把 `.nav-*` 类替换为 Tailwind utilities（session-list、top-bar、nav-primitives、workspace-picker、model-picker），删除 styles.css 中 `.nav-theme` 变量块与死类；全站搜索 `nav-` 无残留引用
- [x] 3.2 WelcomeCat SVG 硬编码 hex 改为 `currentColor`/CSS 变量；更新引用旧 nav 类名或色值的测试断言，`bun run check && bun run test` 通过，三档宽度截图对比验收

## 4. 字号密度与 Markdown 降噪

- [x] 4.1 全组件套用字号阶梯：聊天正文/输入框 15px→14px（行高同步调至 1.75）、工具卡与状态栏归 sm 档、标题归 lg/xl 档；清除 `text-[13px]`/`text-[15px]` 等硬编码，grep 无残留
- [x] 4.2 Markdown 行内代码改为 ink-100 底 + ink-800 字 + 等宽字体（去药丸样式），代码块高亮不变；用含大量标识符的真实会话截图确认降噪效果与 AA 对比度

## 5. Composer 治理与 a11y 补漏

- [x] 5.1 composer 区域按"通知行 → 附件行 → 输入行"固定分层与间距；+ 与 ⋯ 按钮改用 SVG `Icon` 幽灵按钮，发送保持主按钮样式；桌面与移动端截图确认层级
- [x] 5.2 主输入框加 `aria-label="消息输入"`；技能/命令菜单条目改为"名称行 + 单行截断简述"两行结构；键盘与读屏走查通过
- [x] 5.3 「回到底部」浮钮改为贴消息列右缘固定槽位或为列表预留底部 padding，滚动后浮钮不再遮盖工具输出正文，截图验证
- [x] 5.4 聊天页补 `<main>` landmark 与聚焦可见的 skip-link；会话 tooltip 接 `aria-describedby`；键盘首次 Tab 出现 skip-link 且激活后焦点入主内容

## 6. 工具卡状态与状态栏修整

- [x] 6.1 `STATUS` 映射扩展为 `{ icon, classes }`：进行中 spinner + tianyi、成功 ✓ + 中性底、失败 ✗ + sakura-500 底加粗边框；新增/更新渲染测试覆盖三态，灰度截图下可区分
- [x] 6.2 status-bar 的 `useState+setTimeout` 刷新 hack 改为渲染时派生过滤过期相位；相关测试通过且无新增定时器

## 7. 死代码清理与最终验收

- [x] 7.1 删除 `lib/api.ts`、从 main.tsx 移除 QueryClientProvider、卸载 `@tanstack/react-query`；`bun install --frozen-lockfile` 更新 lockfile 后 `bun run build` 通过
- [x] 7.2 全量验收：`bun run check && bun run test && bun run build` 通过；`bun run neko web` 实跑，1440/768/375 三档对聊天页、设置页、各弹层截图走查，确认全站蓝粉白统一、无中性灰残留、字号密度符合阶梯

## Workflow follow-up

- 评审满意后归档该变更（`/opsx:archive`），归档会将 web-ui delta 合并入主 spec。
