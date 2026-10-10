# web-ui Specification

## Purpose

浏览器前端：经 WebSocket 连接会话网关，提供与终端对等的对话、插话与会话管理能力。

## Requirements

### Requirement: 浏览器对话

系统 SHALL 提供 Web 界面，用户可在浏览器中提交输入、查看流式回答与工具调用详情，功能与终端前端对等。

#### Scenario: 打开即用

- **WHEN** 用户在浏览器打开 Web UI 并选择会话
- **THEN** 显示该会话的完整历史，后续事件实时到达

### Requirement: 断线重连

系统 SHALL 在 WebSocket 断开后自动重连；重连后从当前视图状态恢复，不重放历史事件。

#### Scenario: 网络抖动恢复

- **WHEN** WebSocket 断开 10 秒后恢复
- **THEN** 界面自动重连并展示会话最新状态，期间到达的回答完整可见

### Requirement: 静态托管

Web UI SHALL 构建为静态资源，由网关进程托管，无需独立前端服务器。

#### Scenario: 随网关启动

- **WHEN** 网关进程启动
- **THEN** 浏览器访问网关 HTTP 地址即可加载 Web UI

### Requirement: 二次元主题系统

系统 SHALL 提供以 design tokens 驱动的浅色二次元主题：蓝粉白配色（主色樱花粉、辅色天依蓝、白色基底），滚动条与表单控件配色与主题一致；模型输出的 Markdown 渲染前 MUST 经过消毒。

#### Scenario: 默认浅色主题

- **WHEN** 用户打开 Web UI
- **THEN** 界面以浅色蓝粉白主题呈现，正文文本相对背景对比度达到 WCAG AA

#### Scenario: 主题色应用一致

- **WHEN** 界面渲染按钮、链接、状态徽章与聊天气泡
- **THEN** 交互元素使用樱花粉/天依蓝主题色，且直接来自 design tokens 而非散落的颜色字面量

#### Scenario: 模型输出消毒

- **WHEN** 模型回答中包含 HTML 标签或脚本内容
- **THEN** 界面渲染为无害文本或经消毒的标记，不执行任何脚本
