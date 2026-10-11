# Tasks

## 1. 会话资源快照

- [x] 1.1 `resources.ts`：准备资源支持按显式技能名捕获同次读取文本；按会话/requestId stage 快照，通过公开 submission entry 激活，提供 discard/forget；失败、排队、撤回不污染活动版本
- [x] 1.2 `prompt.ts`：按 conversationId/workspace 取活动资源；保留 WeakMap 请求内共享，支持无快照时加载
- [x] 1.3 `runtime.ts`：非重复输入准备与同源展开，submit 前 stage、失败 discard；公开 placement 回调、查询直读、归档 forget

## 2. 提示词内容

- [x] 2.1 `prompt.ts`：`TOOL_GUIDELINES.edit` 替换为 pi `editToolSystemPromptContribution.guidelines` 的四条原文（`edits[].oldText` 形态）
- [x] 2.2 `packages/core/src/prompt/skills.ts`：`scanSkillsDir` 排序比较器改为二元字符串比较，去掉 `localeCompare`

## 3. 测试

- [x] 3.1 `packages/core/test/prompt-runtime.test.ts`：用 faux 工具调用构造一次 run（第一轮返回调用自定义工具，工具执行时改写 `<workspace>/AGENTS.md`，第二轮返回文本），断言第二次请求的 system 文本与第一次逐字节相同、transcript 中无新增 system 消息；随后提交下一条输入，断言包含新内容
- [x] 3.2 会话隔离：两个同工作区会话，A 的 run 挂起在工具调用期间修改 AGENTS.md 并让 B 提交，断言 A 后续请求的系统节不变、B 的请求含新内容
- [x] 3.3 `/skill:` 同源：扫描后展开前文件变化不混合正文/元数据；多个排队输入分别保留资源版本，按 placement 激活；拒绝和撤回不影响活动资源
- [x] 3.4 `listSkills` 在 run 进行中返回新增技能，且不改变该 run 后续请求的 `skills` 节
- [x] 3.5 技能每层 UTF-16 排序，覆盖保持位置；edit 指引通过 throwaway smoke 核对实际 schema，不添加文案锁定测试
- [x] 3.6 迁移所有 createNekoPrompt 调用；删除仅锁定文案/内部缓存计数的测试，保留跨提交编辑刷新行为测试

## 4. 文档与验证

- [x] 4.1 根 `AGENTS.md` 更新准备/placement 激活时机与 run 内资源稳定性说明
- [x] 4.2 `packages/core/README.md` 同步更新隔离、查询实时、多输入优先级与重启行为
- [x] 4.3 运行 `bun run check` 与 `bun run test` 全部通过
- [x] 4.4 冒烟：实际运行 harness 验证工具轮修改资源不会触发系统 patch；有环境 API key 时运行真实 DeepSeek 请求记录 cache hit/miss，未命中不作为正确性失败；verification.md 明确观测与限制
