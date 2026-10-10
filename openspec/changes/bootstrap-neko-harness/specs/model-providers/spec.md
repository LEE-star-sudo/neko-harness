# Spec Delta

## Purpose

管理模型提供商接入：DeepSeek 为默认 provider，统一处理认证、模型目录与 thinking level 映射。

## ADDED Requirements

### Requirement: DeepSeek 接入

系统 SHALL 内置 DeepSeek provider，使用 OpenAI Chat Completions 格式（api.deepseek.com），从 DEEPSEEK_API_KEY 环境变量读取凭证，支持 deepseek 系列模型的 thinking、tool use 与流式输出。

#### Scenario: 未配置密钥

- **WHEN** DEEPSEEK_API_KEY 未设置时启动
- **THEN** 系统提示缺少凭证且不发起任何模型请求

#### Scenario: thinking 级别映射

- **WHEN** 会话配置 thinking level 为 high
- **THEN** 发往 DeepSeek 的请求携带该 provider 方言对应的 thinking 参数，且回答中的推理内容与正文分离呈现

### Requirement: 模型目录与切换

系统 SHALL 提供可用模型列表（含上下文窗口、价格、支持的能力），并允许按会话切换模型与 thinking level。

#### Scenario: 会话级切换模型

- **WHEN** 用户在某会话中切换模型
- **THEN** 该会话的下一次请求使用新模型，其他会话不受影响
