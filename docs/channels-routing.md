# Channels Routing (Router MVP)

这是一个负责处理多渠道消息分发的规则引擎，主要解决两个核心问题：
1. **消息过滤与响应控制 (Message Filtering & Control)**：决定系统是否应该响应某个渠道或会话的消息（allow/deny）。
2. **动态 Agent 派发 (Dynamic Agent Dispatch)**：根据消息的特征（来源、类型、发送者、关键词等），将请求动态路由给特定的 Agent 实例处理。

## 1. 匹配与执行逻辑

每次收到新消息时，网关会构造一个 `RouteContext`，并在所有配置的路由规则中按 `priority` **优先级从高到低**依次匹配。
只要遇到第一条满足所有条件的规则，就会立刻停止并应用其定义的 `Action`。如果所有规则都不匹配，则回退使用 `defaultAction`。

支持的匹配字段（如果一个规则中写了多个级联条件，则 **必须全部满足** 才会命中）：

- `match.channels`: 限定渠道类型 (`feishu | discord | qq | community | webhook`)
- `match.chatKinds`: 限定会话类别 (`dm | group | channel | room`)
- `match.chatIds`: 按具体的系统会话/房间 ID 过滤
- `match.senderAllowlist`: 发送者 ID 白名单（仅匹配这些发送者）
- `match.senderDenylist`: 发送者 ID 黑名单（排除这些人，常用于实现全局或渠道 deny 规则）
- `match.keywordsAny`: 文本只要包含列表中任一关键词即命中
- `match.mentionRequired`: 是否要求消息必须 `@系统自身` 才响应

## 2. 启用方式

在 `.env` 中配置开启通道和策略路径：

```env
BELLDANDY_CHANNEL_ROUTER_ENABLED=true
BELLDANDY_CHANNEL_ROUTER_CONFIG_PATH=~/.star_sanctuary/channels-routing.json
# 如果上方配置的所有规则都没有说明 agentId，此项作为保底
BELLDANDY_CHANNEL_ROUTER_DEFAULT_AGENT_ID=default
```

随时可通过配置以下变量将其关闭（恢复默认无差别放行并指定单一保底 Agent）：

```env
BELLDANDY_CHANNEL_ROUTER_ENABLED=false
```

## 3. 配置文件示例

路径：`~/.star_sanctuary/channels-routing.json`

下面是一个集成多种常见需求的典型用例：

- 如果运维频道发送了带有 "报警" 或 "alert" 字样的消息，交给 `ops` Agent 处理。
- Discord 频道中，必须 `@` 机器人才予以处理。
- 特权功能：限定那几个专门的管理员在发消息时，不论渠道如何，都指派给 `admin` Agent。
- 防打扰：屏蔽特定的几个捣乱者的帐号。
- 兜底：其余所有未命中的合法消息，统一丢给默认 Agent 处理。

```jsonc
{
  "version": 1, // 配置版本号，当前固定写 1
  // 默认策略：如果下方的所有 rules 都没有命中，将执行 defaultAction
  "defaultAction": {
    "allow": true,      // 默认允许继续处理这条消息
    "agentId": "default" // 默认交给 default Agent
  },
  "rules": [
    {
      "id": "block-annoying-user", // 规则唯一 ID，便于日志里识别
      "enabled": true, // true 表示启用这条规则；false 表示暂时跳过
      // 优先级必须最高，提前拦截。数字越大优先级越高
      "priority": 999, 
      "match": {
        // senderDenylist 常用于屏蔽特定的发送者，支持多渠道的 ID
        "senderDenylist": ["evil_user_id_1001", "3344556677"]
      },
      "action": {
        // allow: false 表示直接丢弃，不予回复
        "allow": false 
      }
    },
    {
      "id": "admin-action-route", // 管理员特权路由规则
      "enabled": true, // 当前启用
      "priority": 300, // 优先级低于 deny 规则，高于普通业务规则
      "match": {
        // senderAllowlist 表示：消息的发送者必须是这几个人之一，才算命中这个规则
        "senderAllowlist": [
          "123456789",      // 某个 QQ 管家的账号
          "ou_feishuIDabcd" // 某个飞书高管的 ID
        ]
      },
      "action": {
        "allow": true, // 允许继续进入 Agent 处理
        // 将包含特权意图的消息路由给 admin AI 去处理
        "agentId": "admin"
      }
    },
    {
      "id": "ops-alert-route", // 告警关键词路由规则
      "enabled": true, // 当前启用
      "priority": 200, // 优先级低于管理员规则
      "match": {
        // 限定渠道：必须是这三者其一的来源
        "channels": ["discord", "feishu", "qq"],
        // 词库过滤：当文本中包含任意一个该列表里的词汇时命中
        "keywordsAny": ["alert", "报警", "告警"]
      },
      "action": {
        "allow": true, // 允许处理
        "agentId": "ops" // 转给 ops Agent
      }
    },
    {
      "id": "discord-mention-only", // Discord 频道 mention gate 规则
      "enabled": true, // 当前启用
      "priority": 100, // 普通兜底规则优先级
      "match": {
        // 限定渠道
        "channels": ["discord"],
        // 限定只有在 channel 频道模式下才生效（屏蔽 dm 私聊）
        "chatKinds": ["channel"],
        // 强制要求：消息发送人必须 @ 了机器人才会响应
        "mentionRequired": true
      },
      "action": {
        "allow": true, // 满足 mention 条件后允许处理
        // 转交给默认的处理人员
        "agentId": "default"
      }
    }
  ]
}
```

## 4. 决策日志

启用后会输出 `channel-router` 日志，包含：

- `allow`
- `reason`
- `matchedRuleId`
- `agentId`


