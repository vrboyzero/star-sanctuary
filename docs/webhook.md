# Webhook API 使用指南

## 概述

Webhook API 允许外部系统（如 CI/CD、监控告警、定时任务）通过 HTTP POST 请求直接触发 Belldandy Agent，无需 WebSocket 连接或聊天渠道。

## 特性

- **独立鉴权**：每个 webhook 有独立的 Bearer token
- **Agent 路由**：支持指定不同的 Agent 处理请求
- **幂等保护**：通过 `X-Idempotency-Key` 防止重复执行
- **灵活配置**：支持自定义会话 ID 前缀和 prompt 模板
- **默认关闭**：需要显式配置才启用，安全可控

## 快速开始

### 1. 创建配置文件

在 `~/.star_sanctuary/webhooks.json` 创建配置：

```json
{
  "version": 1,
  "webhooks": [
    {
      "id": "ci-alert",
      "enabled": true,
      "token": "your-secure-token-here",
      "defaultAgentId": "default",
      "conversationIdPrefix": "webhook:ci-alert"
    }
  ]
}
```

**配置说明：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | ✅ | Webhook 唯一标识（用于 URL 路径） |
| `enabled` | boolean | ❌ | 是否启用（默认 true） |
| `token` | string | ✅ | Bearer token（用于鉴权） |
| `defaultAgentId` | string | ❌ | 默认使用的 Agent ID（默认 "default"） |
| `conversationIdPrefix` | string | ❌ | 会话 ID 前缀（默认 "webhook:<id>"） |
| `promptTemplate` | string | ❌ | Prompt 模板（支持 `{{key}}` 变量替换） |

### 2. 生成安全 Token

```bash
# Linux/macOS
openssl rand -hex 32

# Windows PowerShell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

### 3. 重启 Gateway

```bash
corepack pnpm bdd stop
corepack pnpm bdd start -d
```

查看日志确认 Webhook 已加载：

```
[webhook] Loaded 1 webhook(s) from ~/.star_sanctuary/webhooks.json
```

## API 端点

### POST /api/webhook/:id

触发指定 ID 的 webhook。

**请求头：**

```http
Authorization: Bearer <token>
Content-Type: application/json
X-Idempotency-Key: <optional-unique-key>
```

**请求体：**

```json
{
  "text": "可选；为空时由 payload 模板生成",
  "agentId": "可选；不传则使用 webhook 默认 agent",
  "conversationId": "可选；不传则自动生成",
  "payload": {
    "any": "json",
    "data": "here"
  }
}
```

**响应（成功）：**

```json
{
  "ok": true,
  "payload": {
    "webhookId": "ci-alert",
    "conversationId": "webhook:ci-alert:2026-03-01",
    "response": "Agent 的回复内容"
  }
}
```

**响应（错误）：**

```json
{
  "ok": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Missing or invalid bearer token"
  }
}
```

## 使用示例

### 示例 1：CI/CD 构建通知

**配置：**

```json
{
  "id": "ci-build",
  "enabled": true,
  "token": "ci-build-token-abc123",
  "defaultAgentId": "ops",
  "promptTemplate": "CI 构建 {{status}}: {{project}} (分支: {{branch}})\n构建日志: {{log_url}}"
}
```

**调用：**

```bash
curl -X POST http://127.0.0.1:28889/api/webhook/ci-build \
  -H "Authorization: Bearer ci-build-token-abc123" \
  -H "Content-Type: application/json" \
  -H "X-Idempotency-Key: build-12345" \
  -d '{
    "payload": {
      "status": "失败",
      "project": "belldandy",
      "branch": "main",
      "log_url": "https://ci.example.com/builds/12345"
    }
  }'
```

**Agent 收到的 prompt：**

```
CI 构建 失败: belldandy (分支: main)
构建日志: https://ci.example.com/builds/12345
```

### 示例 2：监控告警

**配置：**

```json
{
  "id": "monitor-alert",
  "enabled": true,
  "token": "monitor-alert-token-xyz789",
  "defaultAgentId": "ops",
  "conversationIdPrefix": "alert"
}
```

**调用：**

```bash
curl -X POST http://127.0.0.1:28889/api/webhook/monitor-alert \
  -H "Authorization: Bearer monitor-alert-token-xyz789" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "🚨 CPU 使用率超过 90%，请立即检查服务器状态"
  }'
```

### 示例 3：定时任务触发

**配置：**

```json
{
  "id": "daily-report",
  "enabled": true,
  "token": "daily-report-token-def456",
  "defaultAgentId": "analyst"
}
```

**调用（cron job）：**

```bash
# 每天 9:00 触发
0 9 * * * curl -X POST http://127.0.0.1:28889/api/webhook/daily-report \
  -H "Authorization: Bearer daily-report-token-def456" \
  -H "Content-Type: application/json" \
  -d '{"text": "生成昨日数据分析报告"}'
```

## 幂等性保护

使用 `X-Idempotency-Key` 请求头防止重复执行：

```bash
curl -X POST http://127.0.0.1:28889/api/webhook/ci-build \
  -H "Authorization: Bearer token" \
  -H "X-Idempotency-Key: unique-event-id-12345" \
  -H "Content-Type: application/json" \
  -d '{"text": "构建失败"}'
```

**行为：**

- 首次请求：正常执行，返回 Agent 响应
- 重复请求（10 分钟内）：返回缓存响应 + `"duplicate": true`

**时间窗口配置：**

```env
# .env.local
BELLDANDY_WEBHOOK_IDEMPOTENCY_WINDOW_MS=600000  # 10 分钟（默认）
```

## 错误码

| 错误码 | HTTP 状态码 | 说明 |
|--------|------------|------|
| `WEBHOOK_DISABLED` | 404 | Webhook 功能未启用或配置为空 |
| `WEBHOOK_NOT_FOUND` | 404 | 指定的 webhook ID 不存在 |
| `WEBHOOK_DISABLED` | 403 | Webhook 已禁用（`enabled: false`） |
| `UNAUTHORIZED` | 401 | Bearer token 缺失或错误 |
| `INVALID_REQUEST` | 400 | 请求参数错误（缺少 text/payload） |
| `AGENT_UNAVAILABLE` | 503 | Agent 未配置或创建失败 |
| `INTERNAL_ERROR` | 500 | 服务器内部错误 |

## 安全建议

1. **Token 管理**
   - 使用强随机 token（至少 32 字节）
   - 定期轮换 token
   - 不同 webhook 使用不同 token

2. **网络隔离**
   - 仅在内网或 VPN 内暴露 Webhook 端点
   - 使用 HTTPS（生产环境）
   - 配置防火墙规则限制来源 IP

3. **日志监控**
   - 监控 `[webhook]` 日志中的异常请求
   - 设置告警规则（如频繁 401 错误）

## 配置示例

### 多 Webhook 配置

```json
{
  "version": 1,
  "webhooks": [
    {
      "id": "ci-build",
      "enabled": true,
      "token": "ci-build-token",
      "defaultAgentId": "ops",
      "conversationIdPrefix": "ci"
    },
    {
      "id": "monitor-alert",
      "enabled": true,
      "token": "monitor-alert-token",
      "defaultAgentId": "ops",
      "conversationIdPrefix": "alert"
    },
    {
      "id": "daily-report",
      "enabled": true,
      "token": "daily-report-token",
      "defaultAgentId": "analyst",
      "conversationIdPrefix": "report"
    }
  ]
}
```

### Prompt 模板示例

```json
{
  "id": "github-webhook",
  "enabled": true,
  "token": "github-webhook-token",
  "promptTemplate": "GitHub 事件: {{event_type}}\n仓库: {{repository}}\n操作者: {{sender}}\n详情: {{action}}"
}
```

调用时：

```json
{
  "payload": {
    "event_type": "pull_request",
    "repository": "belldandy",
    "sender": "alice",
    "action": "opened"
  }
}
```

Agent 收到：

```
GitHub 事件: pull_request
仓库: belldandy
操作者: alice
详情: opened
```

## 故障排查

### Webhook 未生效

1. 检查配置文件是否存在：`~/.star_sanctuary/webhooks.json`
2. 检查日志：`tail -f ~/.star_sanctuary/logs/gateway.log | grep webhook`
3. 确认 Gateway 已重启

### 401 Unauthorized

1. 检查 `Authorization` 请求头格式：`Bearer <token>`
2. 确认 token 与配置文件中的一致
3. 检查 webhook ID 是否正确

### 404 Not Found

1. 确认 webhook ID 存在于配置文件中
2. 检查 URL 路径：`/api/webhook/<id>`（不是 `/api/webhooks`）

### 503 Agent Unavailable

1. 检查 `.env.local` 中的 Agent 配置（API Key）
2. 确认 `BELLDANDY_AGENT_PROVIDER=openai`
3. 查看日志中的 Agent 创建错误

## 与 /api/message 的区别

| 维度 | `/api/message` | `/api/webhook/:id` |
|------|----------------|-------------------|
| 用途 | 官网社区集成 | 外部系统触发（CI/CD/监控） |
| 鉴权 | 单一全局 token | 每个 webhook 独立 token |
| 配置 | 环境变量 | 配置文件（支持多个） |
| 幂等性 | ❌ 无 | ✅ 有（X-Idempotency-Key） |
| conversationId | 必须由调用方提供 | 可自动生成 |
| Prompt 模板 | ❌ 不支持 | ✅ 支持 |

## 参考资料

- [Channels 路由引擎](./channels-routing.md)
- [Agent Registry 多 Agent 管理](../packages/belldandy-agent/README.md)
- [ConversationStore 会话持久化](../packages/belldandy-agent/src/conversation.ts)



