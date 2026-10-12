# Spec Delta

## MODIFIED Requirements

### Requirement: Web 工作区引用候选

Web SHALL 在输入框有效词边界输入 @ 时展示当前工作区文件候选，支持名称搜索、子目录定位、方向键选择、Enter/Tab 确认和触屏点击；Esc 关闭且保留输入。选择 MUST 仅替换光标所在引用片段，不误发消息、不抢走输入焦点。邮箱中的 @ 和输入法组字 MUST NOT 误触发选择或发送。Windows、macOS 和 Linux 宿主 SHALL 均支持文件、目录和嵌套路径候选，引用路径统一使用 `/`，不得因宿主分隔符差异丢弃有效候选。

#### Scenario: 选择与继续编辑

- **WHEN** 用户在一段文字中输入 @，选择带空格的文件或目录
- **THEN** 插入准确引用并保留前后文字与光标，目录可继续浏览，关闭候选后可发送目录引用；文件和目录遵循统一引用语义

#### Scenario: 输入法与普通文本

- **WHEN** 用户输入邮箱、使用中文输入法确认文字或按 Esc 关闭候选
- **THEN** 邮箱保持普通文本，组字确认不选择候选或发送消息，取消不清空草稿

#### Scenario: Windows 文件与目录

- **WHEN** Windows 宿主已安装 fd，工作区包含未被忽略的 `README.md`、`src` 目录和 `src/index.ts`，用户输入 `@`
- **THEN** 候选包含该文件和目录；选择目录插入 `@src/`，继续定位可选择 `src/index.ts`

#### Scenario: 搜索嵌套文件与空格目录

- **WHEN** 用户通过名称搜索位于多级目录或带空格目录中的文件
- **THEN** Windows、macOS 和 Linux 均返回匹配的工作区内候选，插入的路径使用 `/` 并正确引用空格

## ADDED Requirements

### Requirement: Web 文件补全依赖安装引导

宿主未找到可执行 fd 或 fdfind 时，Web SHALL 在 @ 候选面板展示明确的缺少依赖提示与宿主平台对应的安装指导，该提示 MUST 能通过远程服务到达浏览器，不得退化为内部服务错误或无匹配结果。提示 SHALL 明确在运行 neko 的电脑上安装，并提示安装后重新打开终端并重启 neko。系统 MUST NOT 自动安装工具，提示 MUST 保留草稿且不阻止关闭候选后发送普通消息。

#### Scenario: Windows 缺少依赖

- **WHEN** gateway 运行在 Windows 且找不到 fd/fdfind，用户触发 @ 补全
- **THEN** 面板显示缺少依赖及 `winget install sharkdp.fd`

#### Scenario: macOS 缺少依赖

- **WHEN** gateway 运行在 macOS 且找不到 fd/fdfind，用户触发 @ 补全
- **THEN** 面板显示缺少依赖及 `brew install fd`

#### Scenario: Linux 与其他宿主

- **WHEN** gateway 运行在 Linux 且找不到 fd/fdfind
- **THEN** 面板提供明确标注 Debian/Ubuntu 的 `sudo apt install fd-find` 示例与官方安装文档地址，不声称 apt 适用于全部 Linux；其他未知宿主平台提供通用安装提示与官方安装文档地址

#### Scenario: 浏览器与宿主平台不同

- **WHEN** 用户通过 Windows 浏览器连接 macOS gateway，且 gateway 找不到 fd/fdfind
- **THEN** 显示 macOS 的安装命令，不根据浏览器平台显示 winget

#### Scenario: fdfind 已可用

- **WHEN** 宿主 PATH 只有可执行 fdfind，没有 fd
- **THEN** 补全正常搜索，不提示缺少依赖，不要求建立 fd 别名

#### Scenario: 安装后恢复与草稿保留

- **WHEN** 用户看到缺少依赖提示并关闭候选，随后安装工具、重新打开终端并重启 neko
- **THEN** 关闭候选时原草稿保留且可发送普通消息；重启后新查询在依赖可用时正常返回候选

#### Scenario: 其他错误不误报依赖缺失

- **WHEN** fd 已找到，但搜索超时、执行失败或请求被取消
- **THEN** 不显示安装依赖提示；取消或工作区切换后的旧反馈不得恢复候选面板
