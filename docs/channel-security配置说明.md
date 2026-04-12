# channel-security 配置说明

`channel-security.json` 是 Star Sanctuary 的**渠道安全兜底策略**。它不负责把消息分发给哪个 Agent，而是优先回答一个更基础的问题：

1. **这条消息是否允许进入系统 (Security Gate)**：例如 DM 是否只允许白名单用户，群聊 / 房间消息是否必须 `@` 机器人。
2. **不同渠道是否需要不同的安全默认值 (Channel Defaults)**：例如 Discord 频道默认要求 mention，Community 房间默认要求 mention。
3. **不同账号是否需要账号级覆盖 (Account-Level Override)**：尤其是 `community` 渠道，可以按具体 `accountId` 做单独策略。

## 1. 与 channels-routing.json 的区别

当前渠道运行时分两层：

1. 手工路由规则：`channels-routing.json`
2. 安全 fallback：`channel-security.json`

两者的职责分工如下：

- `channels-routing.json`
  - 负责**业务路由**
  - 决定消息是否命中某条路由规则
  - 决定命中后交给哪个 `agentId`
  - 也可以显式 `allow: false` 做业务层拒绝

- `channel-security.json`
  - 负责**安全兜底**
  - 决定 DM 是否需要白名单
  - 决定公开场景是否必须 `@`
  - 在 `channels-routing.json` 未命中，或未启用时，仍然可以继续生效

需要特别注意：

- 即使 `BELLDANDY_CHANNEL_ROUTER_ENABLED=false`，`channel-security.json` 仍会作为 fallback 生效。
- 因此它更像“渠道安全默认值”，而不是“消息分流器”。

## 2. 配置文件位置

默认路径：

```text
~/.star_sanctuary/channel-security.json
```

在状态目录中通常就是：

```text
<stateDir>/channel-security.json
```

当前支持的渠道：

- `discord`
- `feishu`
- `qq`
- `community`

## 3. 支持的字段

最小结构如下：

```jsonc
{
  "version": 1, // 配置版本号，当前固定写 1
  "channels": {} // 渠道策略集合；空对象表示暂未配置任何渠道安全规则
}
```

每个渠道支持以下字段：

- `enabled`
  - 可选，布尔值
  - `false` 表示该渠道的安全策略临时关闭
- `dmPolicy`
  - 可选，值为 `open | allowlist`
  - `open`：DM 默认放行
  - `allowlist`：DM 只有 `allowFrom` 中的 sender 才放行
- `allowFrom`
  - 可选，字符串数组
  - DM 白名单 sender 列表
- `mentionRequired`
  - 可选
  - 可以是布尔值、数组，或对象
  - 最终作用都是定义哪些公开场景必须 `@` 才放行
- `accounts`
  - 仅在需要账号级覆盖时使用
  - 常见于 `community`
  - 结构为 `accounts.<accountId> = ChannelSecurityAccountPolicy`

## 4. mentionRequired 的写法

`mentionRequired` 支持三种写法：

### 4.1 布尔值

```jsonc
{
  "mentionRequired": true // 对 group / channel / room 三种公开场景全部要求 mention
}
```

等价于：

- `group=true`
- `channel=true`
- `room=true`

### 4.2 数组

```jsonc
{
  "mentionRequired": ["group", "room"] // 只要求群聊和房间必须 mention；频道 channel 不要求
}
```

表示只有 `group` 和 `room` 需要 mention。

### 4.3 对象

```jsonc
{
  "mentionRequired": {
    "group": true,   // 飞书群、QQ 群这类 group 场景要求 mention
    "channel": false, // 频道场景不要求 mention
    "room": true     // community room 这类房间场景要求 mention
  }
}
```

当前公开场景支持：

- `group`
- `channel`
- `room`

`dm` 不使用 `mentionRequired`。

## 5. community 账号级覆盖

`community` 渠道支持账号级策略。关键原因是：

- `community.json` 里可以配置多个 agent 账号
- 这些账号名会作为 `accountId`
- 运行时会优先读取 `channels.community.accounts.<accountId>`

例如：

```jsonc
{
  "version": 1, // 配置版本号
  "channels": {
    "community": {
      "dmPolicy": "allowlist", // community 的 DM 采用白名单模式
      "allowFrom": [], // 当前社区渠道级 DM 白名单；留空表示先收紧
      "mentionRequired": {
        "room": true // community 房间消息必须显式 mention 才放行
      },
      "accounts": {
        "贝露丹蒂": {
          "dmPolicy": "allowlist", // 对账号“贝露丹蒂”单独要求 DM 白名单
          "allowFrom": [], // 该账号自己的 DM 白名单
          "mentionRequired": {
            "room": true // 对该账号来说，room 场景也必须 mention
          }
        }
      }
    }
  }
}
```

说明：

- `channels.community` 是社区渠道的默认值
- `channels.community.accounts.贝露丹蒂` 是对账号 `贝露丹蒂` 的覆盖层
- 如果账号级没写某项，会继续继承渠道级默认值

## 6. 稳妥默认版示例

下面是一份偏保守、适合刚接好渠道时使用的默认模板：

- `discord / feishu / qq` 的 DM 默认走白名单
- 公开场景默认要求 mention
- `community` 房间默认要求 mention
- `community` 中的实际账号 `贝露丹蒂` 也单独写明覆盖，避免后续行为不清晰

```jsonc
{
  "version": 1, // 配置版本号
  "channels": {
    "discord": {
      "dmPolicy": "allowlist", // Discord 私信默认不放开，只允许白名单 sender
      "allowFrom": [], // Discord DM 白名单，后续可通过审批流逐步补充
      "mentionRequired": {
        "channel": true // Discord guild channel 场景必须 mention
      }
    },
    "feishu": {
      "dmPolicy": "allowlist", // 飞书私聊走白名单
      "allowFrom": [], // 飞书 DM 白名单
      "mentionRequired": {
        "group": true // 飞书群聊必须 @ 机器人
      }
    },
    "qq": {
      "dmPolicy": "allowlist", // QQ 私聊走白名单
      "allowFrom": [], // QQ DM 白名单
      "mentionRequired": {
        "group": true,   // QQ 群聊必须 @ 机器人
        "channel": true // QQ 频道也必须 @ 机器人
      }
    },
    "community": {
      "dmPolicy": "allowlist", // Community DM 默认收紧
      "allowFrom": [], // Community 渠道级 DM 白名单
      "mentionRequired": {
        "room": true // Community 房间消息必须 mention
      },
      "accounts": {
        "贝露丹蒂": {
          "dmPolicy": "allowlist", // 针对账号“贝露丹蒂”的单独 DM 白名单策略
          "allowFrom": [], // 账号级白名单；批准后优先写这里
          "mentionRequired": {
            "room": true // 对这个账号来说，房间里也必须 mention
          }
        }
      }
    }
  }
}
```

这份配置的效果是：

- DM 不会默认放开给陌生 sender
- 群聊 / 频道 / 房间不会因为普通消息就误触发
- `community` 场景会明确按账号名 `贝露丹蒂` 应用房间 mention gate

## 7. 当前已写入的默认配置

当前我已经将上述稳妥默认版写入：

```text
C:\Users\admin\.star_sanctuary\channel-security.json
```

你当前的实际配置要点是：

- `discord`
  - `dmPolicy=allowlist`
  - `mentionRequired.channel=true`
- `feishu`
  - `dmPolicy=allowlist`
  - `mentionRequired.group=true`
- `qq`
  - `dmPolicy=allowlist`
  - `mentionRequired.group=true`
  - `mentionRequired.channel=true`
- `community`
  - 渠道级默认要求 `room` mention
  - 账号 `贝露丹蒂` 也显式要求 `room` mention

## 8. 为什么 allowFrom 默认留空

稳妥默认版里，`allowFrom` 我刻意先留空，是因为它代表“先收紧，再人工放开”：

- 对陌生 DM，不默认放行
- 首次遇到新的 sender，如果命中 DM allowlist 阻断，会进入待审批流程
- 批准后，sender 会被写回对应渠道或账号的 `allowFrom`

待审批相关文件通常在：

```text
<stateDir>/channel-security-approvals.json
```

也就是说：

- 空白名单不是“坏配置”
- 它是“先默认不信任，再逐步建立白名单”的安全起点

但也要知道一个副作用：

- 在 `system.doctor` 中，这类配置通常会给出提醒：`dmPolicy=allowlist but allowFrom is empty`

这不是解析错误，而是提示你：

- 当前策略是偏保守的
- 还没有实际放行任何 DM sender

## 9. 审批流说明

当某条 DM 消息命中 `dmPolicy=allowlist`，但发送者不在 `allowFrom` 里时，当前运行时会走待审批链，而不是直接把这条 sender 永久丢失。

审批流的基本过程是：

1. 渠道收到一条 DM 消息
2. `channel-security.json` 判断该 sender 不在白名单
3. 运行时把这条请求写入 `channel-security-approvals.json`
4. Gateway 广播 `channel.security.pending` 事件
5. 你可以在 WebChat / 配置接口里查看 pending 请求
6. 选择 `批准` 或 `拒绝`
7. 如果批准，系统会自动把该 `senderId` 合并进对应作用域的 `allowFrom`
8. 如果拒绝，只会移除 pending，不会改动现有白名单

待审批文件路径：

```text
<stateDir>/channel-security-approvals.json
```

文件结构示例：

```jsonc
{
  "version": 1, // 审批存储文件版本号
  "pending": [
    {
      "id": "request-uuid", // 这条审批请求的唯一 ID
      "channel": "feishu", // 来源渠道
      "senderId": "ou_xxx", // 被阻断 sender 的真实 ID
      "senderName": "Alice", // 发送者显示名，便于人工识别
      "chatId": "oc_xxx", // 当时触发阻断的 DM 会话 ID
      "chatKind": "dm", // 审批流当前只处理 DM
      "messagePreview": "你好，帮我看一下这个问题", // 消息摘要，帮助你判断是否该批准
      "requestedAt": "2026-04-12T10:00:00.000Z", // 首次进入待审批列表的时间
      "updatedAt": "2026-04-12T10:00:00.000Z", // 最近一次命中阻断的时间
      "seenCount": 1 // 同一 sender 被阻断的累计次数
    }
  ]
}
```

字段含义：

- `id`
  - 这条审批请求的唯一 ID
- `channel`
  - 来源渠道，例如 `feishu`、`discord`
- `accountId`
  - 可选，主要用于 `community` 的账号级审批
- `senderId`
  - 发送者唯一标识；批准后写回 `allowFrom` 的就是它
- `senderName`
  - 可选，仅用于便于人工识别
- `chatId`
  - 当时触发阻断的 DM 会话 ID
- `chatKind`
  - 当前实现里审批流只处理 `dm`
- `messagePreview`
  - 消息预览，便于判断是否该放行
- `requestedAt / updatedAt`
  - 首次记录时间 / 最近一次更新时间
- `seenCount`
  - 同一 sender 命中阻断的累计次数

批准时的回写规则：

- 普通渠道 `discord / feishu / qq`
  - 直接把 `senderId` 合并进 `channels.<channel>.allowFrom`
- `community` 且带 `accountId`
  - 合并进 `channels.community.accounts.<accountId>.allowFrom`
  - 不会误写到整个 `community` 的顶层 `allowFrom`

这意味着：

- `community` 的审批是账号级的
- 不同 community 账号可以拥有各自独立的 DM 白名单

当前你本地的审批流状态：

- `channel-security-approvals.json` 已初始化
- 目前内容是空的 `pending: []`
- 说明当前还没有待你处理的 DM 白名单审批记录

## 10. 常见调整方式

### 10.1 想放开某个 Discord DM 用户

```jsonc
{
  "channels": {
    "discord": {
      "dmPolicy": "allowlist", // 仍然保留白名单模式
      "allowFrom": ["user_123456"] // 手工放开这个 Discord sender
    }
  }
}
```

### 10.2 想让 Feishu 群聊不必 @ 也能响应

```jsonc
{
  "channels": {
    "feishu": {
      "mentionRequired": {
        "group": false // 飞书群聊不再强制要求 @ 机器人
      }
    }
  }
}
```

### 10.3 想临时关闭某个渠道的安全策略

```jsonc
{
  "channels": {
    "qq": {
      "enabled": false // 临时关闭 QQ 渠道的安全策略，不再做白名单或 mention gate 判断
    }
  }
}
```

### 10.4 想给 community 某个账号单独放宽

```jsonc
{
  "channels": {
    "community": {
      "accounts": {
        "贝露丹蒂": {
          "dmPolicy": "open", // 对账号“贝露丹蒂”的 DM 直接放开
          "mentionRequired": {
            "room": false // 这个账号在房间里也不再强制要求 mention
          }
        }
      }
    }
  }
}
```

## 11. 生效与排障

修改 `channel-security.json` 后：

1. 保存文件
2. 重启 Gateway / 主服务
3. 发一条真实消息验证
4. 必要时再看 `system.doctor` 与 `channel-router` / `channel security` 日志

如果某条消息没响应，优先排查：

1. 是否命中了 DM allowlist 阻断
2. 是否因为群聊 / 房间没有 `@` 而被 mention gate 阻断
3. `community` 消息是否使用了正确的 `accountId`
4. 账号级覆盖是否写在 `accounts.<accountId>` 下
5. 修改后是否忘了重启服务

常见阻断原因：

- `channel_security:dm_allowlist_blocked`
- `channel_security:mention_required_blocked`

如果你只想做消息分流，不想做渠道安全门控：

- 继续主要使用 `channels-routing.json`
- 但仍建议保留一份基础 `channel-security.json`，至少为公开场景开启 mention gate
