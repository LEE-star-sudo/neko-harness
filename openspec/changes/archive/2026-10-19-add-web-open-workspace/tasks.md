# Tasks

## 1. 守卫抽取与服务端打开能力

- [x] 1.1 将 `mobile-admin.ts` 的回环 / Host / Origin / Sec-Fetch-Site / CSRF / 体上限检查抽成共用模块并让 mobile-admin 复用；验证：现有 `packages/web/test/mobile-admin.test.ts` 不改断言全部通过
- [x] 1.2 新增 `open-target.ts`：平台与 WSL 判定、VS Code 与文件管理器的探测、命令构造（纯函数，含 Windows `Code.exe` 定位）和 `execFile` 拉起；验证：新增单测覆盖 macOS / Windows / Linux / WSL 的命令与参数、路径含空格与引号、不可用降级
- [x] 1.3 新增 `GET /api/local/session`（返回 `{ csrf, targets }`，非回环 403）与 `POST /api/open`（目标白名单、绝对且存在的目录、体上限）并接入 `server.ts`；验证：新增服务端测试覆盖非回环、跨站 Origin、缺失或错误 CSRF、非法路径、成功拉起（注入假启动器）、启动失败的错误响应

## 2. 前端：打开按钮与图标

- [x] 2.1 在 `primitives.tsx` 新增 `panel-right` 等描边图标，并新增 VS Code、Finder、资源管理器、文件管理器的内联彩色图标组件；验证：`bun run check` 通过，组件渲染测试能找到对应 `aria-hidden` 图标
- [x] 2.2 新增 `lib/open-workspace.ts`（取令牌、调用 `/api/open`、localStorage 记忆与回退）；验证：单测覆盖令牌获取失败时隐藏、记忆值失效回退、请求失败映射为中文错误
- [x] 2.3 新增 `open-workspace-menu.tsx` 分体按钮（主按钮 + 下拉，键盘与 Escape 焦点回归，不可用项置灰并带原因）并接入 `TopBar`；验证：组件测试覆盖默认打开、切换目标、键盘操作、无会话时不可用、失败提示不影响草稿
- [x] 2.4 将工作区文字药丸改为 `panel-right` 图标按钮加改动数角标，保留 `data-workspace-entry`、`aria-expanded`、可访问名称；验证：更新 `workspace-sidebar.test.tsx` 与 `chat-page-interactions.test.tsx` 中依赖「工作区」文字的用例并通过，焦点回归行为不变
- [x] 2.5 调整 `styles.css` 与窄屏布局；验证：在 375、768、1440 像素宽度手动检查顶栏无溢出、无重叠，`layout-tokens.test.ts` 通过

## 3. 规格、文档与验收

- [x] 3.1 在 AGENTS.md 补充「Web 打开工作区」要点（服务端接口、共用守卫、不提升应用协议、WSL 按 Windows 处理）；验证：文档与实现一致，不重复 spec 内容
- [x] 3.2 全量验证；验证：`bun run check`、`bun run test`、`bun run build` 均通过
- [x] 3.3 在 macOS 上手动验证 VS Code 与 Finder 能打开当前工作区，局域网地址访问时入口隐藏；Windows / WSL 路径在可用环境下验证，不可用的在交付说明里标注
