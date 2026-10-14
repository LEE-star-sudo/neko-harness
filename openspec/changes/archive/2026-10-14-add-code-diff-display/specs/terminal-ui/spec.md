# Spec Delta

## ADDED Requirements

### Requirement: TUI 工具卡代码变更 diff 展示

TUI 工具卡 SHALL 对 `edit` 与 `write` 工具调用展示代码变更 diff:折叠摘要行显示增删行数计数(如 `edit path (+18/-3)`、`write path (+142)`),点击展开后渲染 diff,默认折叠。展开的 diff SHALL 叠加两层着色:按目标文件语言的语法高亮与新增/删除行着色;语言不可识别时回退为仅增删着色。`write` 调用 SHALL 一律呈现为全新增 diff,不区分目标文件是否已存在。diff 数据 SHALL 来自服务端投影;无 diff 数据的工具调用保持原有摘要与展开行为。

#### Scenario: 语法高亮与回退

- **WHEN** 展开的 diff 目标文件语言可识别(如 `.ts`)
- **THEN** diff 行内代码按语言语法着色,新增/删除行另有明确着色区分;跨行字符串或块注释的语法着色保持连续;语言不可识别时仅按增删着色,不报错、不缺失内容

#### Scenario: edit 调用折叠与展开

- **WHEN** `edit` 工具调用完成,卡片默认折叠
- **THEN** 摘要行显示路径与增删行数计数;点击展开后 diff 以新增/删除高亮渲染,再次点击收起

#### Scenario: write 调用全新增呈现

- **WHEN** `write` 工具调用完成(无论新建或覆盖已有文件)
- **THEN** 摘要行显示预览的新增行数计数,展开区将展示的写入内容以新增高亮渲染

#### Scenario: write 内容原样保留

- **WHEN** 写入内容含代码缩进、前导数字或空行
- **THEN** diff 保留每行原始内容,不把缩进或数字识别为 edit 行号

#### Scenario: write 投影预览受限

- **WHEN** 写入内容超过服务端 diff 的行数或 UTF-8 字节预算
- **THEN** 服务端仅投影预算内的完整行并标记截断,不复制超长单行到 diff;展开卡片明确提示预览不完整,参数详情仍可预览

#### Scenario: 超长 diff 截断

- **WHEN** 展开的 diff 行数超过显示上限
- **THEN** 仅渲染前若干行并提示剩余行数,不撑爆滚动区

#### Scenario: 历史会话恢复

- **WHEN** TUI 打开包含历史 `edit` 调用的已持久会话
- **THEN** 从持久数据恢复 diff 并照常显示;无持久 diff 的历史 `write` 调用保持原有显示

#### Scenario: 其他工具不受影响

- **WHEN** 非 `edit`/`write` 工具调用完成
- **THEN** 卡片摘要与展开行为与现状一致,不出现 diff 计数或 diff 视图
