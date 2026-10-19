# Tasks

## 1. Provider 下拉组件

- [x] 1.1 新增 `ProviderCombobox`（ARIA combobox：键入过滤、↑/↓/Home/End、Enter 选定、Escape 关闭并恢复焦点，项含名称、启用/Key 状态与模型数），在 `packages/web/test` 增加组件测试，运行 `bun run test` 中该用例通过
- [x] 1.2 `lib/providers.ts` 补充选择器所需的纯函数（默认 provider 解析：当前模型所属 → 首个可选；provider 选项过滤），并加单元测试覆盖「当前 provider 不可用」「无可选 provider」

## 2. 模型选择器

- [x] 2.1 重构 `model-picker.tsx` 为「provider 下拉 + 单行紧凑模型列表」，移除 `open` 手风琴状态，保留设为默认 ★、思考强度、provider 不可用提示与缺 Key「去配置」入口，验证 `provider-pages.test.tsx` 相关用例更新后通过
- [x] 2.2 实现搜索：有查询词时跨 provider 平铺并带 provider 标签，清空恢复下拉视图；增加用例覆盖 `claude` 搜索、缺 Key 不可选、数百模型滚动，验证通过
- [x] 2.3 在 375px 与键盘操作下检查无横向溢出且焦点可见（测试或浏览器手动验证并记录），Escape 取消恢复焦点

## 3. 模型服务页

- [x] 3.1 重构 `settings-page.tsx`：provider 下拉 + 单个 `ProviderCredentialCard`（`key={selected}` 切换时清除密码输入），默认 DeepSeek，移除 `<details>` 与整卡堆叠，验证切换 provider 后输入被清除的测试通过
- [x] 3.2 深链：由 `location.hash` 的 `credential-<id>` 初始化/更新选中 provider 并滚动到卡片；验证来自选择器、composer、联网搜索页的链接（含 `search-settings.test.tsx` 中 `#credential-deepseek` 断言）仍有效
- [x] 3.3 更新 `provider-pages.test.tsx` 中依赖旧结构的用例（启用/取消启用、保存/移除、锁定 DeepSeek、搜索），验证通过

## 4. 规格与整体验证

- [x] 4.1 `openspec validate provider-dropdown-model-ui --strict` 通过，且归档前 `web-ui` 规格中受影响条目与实现一致
- [x] 4.2 运行 `bun run check` 与 `bun run test`，全部通过；`bun run build` 的 web 构建（vite build）成功
