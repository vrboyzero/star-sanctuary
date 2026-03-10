# Channels Routing (Router MVP)

## 1. 启用方式

在 `.env` 中配置：

```env
BELLDANDY_CHANNEL_ROUTER_ENABLED=true
BELLDANDY_CHANNEL_ROUTER_CONFIG_PATH=~/.star_sanctuary/channels-routing.json
BELLDANDY_CHANNEL_ROUTER_DEFAULT_AGENT_ID=default
```

关闭路由引擎（回滚）：

```env
BELLDANDY_CHANNEL_ROUTER_ENABLED=false
```

## 2. 配置文件示例

路径：`~/.star_sanctuary/channels-routing.json`

```json
{
  "version": 1,
  "defaultAction": {
    "allow": true,
    "agentId": "default"
  },
  "rules": [
    {
      "id": "discord-mention-only",
      "enabled": true,
      "priority": 100,
      "match": {
        "channels": ["discord"],
        "chatKinds": ["channel"],
        "mentionRequired": true
      },
      "action": {
        "allow": true,
        "agentId": "default"
      }
    },
    {
      "id": "ops-alert-route",
      "enabled": true,
      "priority": 200,
      "match": {
        "channels": ["discord", "feishu", "qq"],
        "keywordsAny": ["alert", "报警", "告警"]
      },
      "action": {
        "allow": true,
        "agentId": "ops"
      }
    }
  ]
}
```

## 3. 支持字段

- `match.channels`: `feishu | discord | qq | community | webhook`
- `match.chatKinds`: `dm | group | channel | room`
- `match.chatIds`: 指定会话/房间 ID
- `match.senderAllowlist`: 仅允许匹配这些 senderId
- `match.senderDenylist`: 仅匹配这些 senderId（常用于 deny 规则）
- `match.keywordsAny`: 文本包含任一关键词即命中
- `match.mentionRequired`: 是否要求被 @

## 4. 决策日志

启用后会输出 `channel-router` 日志，包含：

- `allow`
- `reason`
- `matchedRuleId`
- `agentId`


