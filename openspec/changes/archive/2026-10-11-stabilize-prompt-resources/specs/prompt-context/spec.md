## MODIFIED Requirements

### Requirement: 资源刷新与请求内一致性

系统 SHALL 在新用户输入提交时按会话工作区准备 AGENTS.md 与 skills 快照，仅在该输入进入 transcript 后激活。尚未放入上下文的输入、失败或撤回的输入 MUST NOT 改变活动快照。没有新输入进入上下文时，后续工具轮 MUST 复用活动资源，不因磁盘修改改变系统节。同一边界放入多个输入时，最后一个输入的快照 SHALL 优先。文件修改、删除和权限变化在新输入生效时体现，无需 reload；各节共享构建结果，各会话快照隔离。

#### Scenario: 编辑后自动生效

- **WHEN** 用户在会话进行中编辑了 `<workspace>/AGENTS.md`，随后提交下一条输入
- **THEN** 该输入触发的请求的系统提示词包含编辑后的内容

#### Scenario: 新增技能目录

- **WHEN** 用户在会话进行中新建 `<workspace>/.agents/skills/x/SKILL.md`，随后提交下一条输入
- **THEN** `skills` 节包含技能 x

#### Scenario: run 内修改不改变系统提示词

- **WHEN** 一次 run 中模型调用工具修改了 `<workspace>/AGENTS.md`，工具轮结束后同一 run 发起下一次模型请求
- **THEN** 在没有新输入进入上下文且工具与配置不变时，系统提示词与本 run 第一次请求完全相同，不追加系统更新；修改在新输入进入上下文时生效

#### Scenario: 会话隔离

- **WHEN** 会话 A 与会话 B 共享同一工作区，会话 B 的 run 进行中，用户修改 AGENTS.md 后在会话 A 提交输入
- **THEN** 会话 A 的请求包含修改后的内容；会话 B 当前 run 的后续请求系统提示词不变

#### Scenario: 无快照时加载

- **WHEN** 进程重启后恢复一个未完成的 run，该会话尚无快照
- **THEN** 系统按会话工作区加载资源作为快照，请求正常继续

#### Scenario: 排队或撤回不提前激活

- **WHEN** 当前 run 进行中提交 followUp 输入并随后撤回该排队输入
- **THEN** 当前 run 的后续请求继续使用原活动快照

#### Scenario: 提交被拒绝

- **WHEN** 忙碌会话拒绝了已准备资源的输入
- **THEN** 该输入的资源快照不生效，当前 run 的系统资源不变

#### Scenario: 多输入版本按 placement 生效

- **WHEN** 两个输入分别以不同资源版本提交并依次进入上下文
- **THEN** 每次 placement 激活对应版本；若同批放入，则最后一个输入的资源快照优先

## ADDED Requirements

### Requirement: 提示词渲染确定性

相同资源、相同顺序的工具声明与工作区 MUST 渲染出逐字节相同的系统节，不依赖进程 locale、文件系统枚举顺序或加载次数。用户级与项目级技能目录 SHALL 各自按 UTF-16 码元顺序排序；随后按用户级在前、项目级在后合并，同名覆盖保留已有位置，不要求合并列表全局排序。

#### Scenario: locale 无关

- **WHEN** 同一组技能目录（名称含大小写混合与非 ASCII 字符）分别在不同 locale 的进程中渲染
- **THEN** 两次渲染的 `skills` 节逐字节相同

#### Scenario: 内容未变不产生更新

- **WHEN** 用户提交新输入时资源被重读，但所有 AGENTS.md 与 SKILL.md 内容均未变化
- **THEN** 该请求不追加任何系统提示词更新

### Requirement: 工具规则与工具接口一致

`rules` 节中某工具的规则 MUST 使用该工具实际声明的参数名称与调用形状描述用法，不得引用工具不存在的参数。对 edit 工具，规则 SHALL 描述 `edits[]` 数组形式：每项 `oldText` 精确匹配且尽量短、同一文件多处修改合并为一次调用、各项基于原始文件匹配且不得重叠。

#### Scenario: edit 规则引用实际参数

- **WHEN** 请求启用了 edit 工具
- **THEN** `rules` 节中的 edit 规则以 `edits[].oldText` 指代匹配文本，并包含多处修改合并为一次调用、各项不得重叠的指引
