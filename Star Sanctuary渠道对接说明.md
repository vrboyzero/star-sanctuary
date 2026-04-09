# Star Sanctuary 渠道对接说明

本文基于当前仓库实际代码更新，覆盖 Star Sanctuary 现阶段已经接好的渠道接入方式、共用安全机制、社区房间连接与 `community HTTP API` 的最新行为。

---

## 1. 当前已接入的渠道面

当前代码中，已明确接入并在 Gateway 里有启动装配的渠道包括：

- 飞书 `FeishuChannel`
- QQ `QqChannel`
- Discord `DiscordChannel`
- 社区房间 `CommunityChannel`
- 社区 HTTP 入口 `/api/message`

对应核心接线位置：

- `packages/belldandy-core/src/bin/gateway.ts`
- `packages/belldandy-core/src/server.ts`
- `packages/belldandy-channels/src/feishu.ts`
- `packages/belldandy-channels/src/qq.ts`
- `packages/belldandy-channels/src/discord.ts`
- `packages/belldandy-channels/src/community.ts`
- `packages/belldandy-core/src/query-runtime-http.ts`

---

## 2. 所有渠道共用的运行时约定

### 2.1 状态目录

默认状态目录是 `~/.star_sanctuary`。

如果设置了以下环境变量，会改用显式目录：

- `BELLDANDY_STATE_DIR`
- Windows 下也支持 `BELLDANDY_STATE_DIR_WINDOWS`
- WSL 下也支持 `BELLDANDY_STATE_DIR_WSL`

渠道相关持久化文件目前主要落在状态目录下：

- `community.json`
- `channels-routing.json`
- `channel-security.json`
- `channel-security-approvals.json`
- `sessions/`

### 2.2 启动方式

开发态常用：

```bash
corepack pnpm bdd start
```

或：

```bash
corepack pnpm dev:gateway
```

生产构建后也可以用：

```bash
corepack pnpm start
```

### 2.3 渠道路由与安全默认值

当前渠道运行时分两层：

1. 可选手工路由规则：`channels-routing.json`
2. 默认安全 fallback：`channel-security.json`

相关行为：

- `BELLDANDY_CHANNEL_ROUTER_ENABLED=true` 时，会启用手工路由规则
- 即使未启用手工规则，`channel-security.json` 仍会作为 fallback 生效
- 当前安全 fallback 已覆盖：
  - `discord`
  - `feishu`
  - `qq`
  - `community`

### 2.4 `channel-security.json` 结构

配置文件路径：

```text
<stateDir>/channel-security.json
```

当前支持的最小结构：

```json
{
  "version": 1,
  "channels": {
    "discord": {
      "dmPolicy": "allowlist",
      "allowFrom": ["user_1"],
      "mentionRequired": {
        "channel": true
      }
    },
    "community": {
      "accounts": {
        "assistant": {
          "dmPolicy": "allowlist",
          "allowFrom": ["u_123"],
          "mentionRequired": {
            "room": true
          }
        }
      }
    }
  }
}
```

支持字段：

- `dmPolicy`: `open` 或 `allowlist`
- `allowFrom`: DM 白名单 sender 列表
- `mentionRequired`: 对 `group / channel / room` 的 mention gate
- `accounts.<accountId>`: 对单个渠道账号做覆盖

说明：

- `channels.<channel>` 是该渠道默认值
- `channels.<channel>.accounts.<accountId>` 是账号级覆盖层
- 当前 `community` 已实际消费 `accountId`
- `community` 房间模式主要消费 `mentionRequired.room`

### 2.5 待审批 sender 与 WebChat 入口

当前 DM allowlist 阻断后，会落到：

```text
<stateDir>/channel-security-approvals.json
```

当前已接上待审批链的入口：

- 飞书 DM
- QQ DM
- Discord DM
- community HTTP DM
- community 渠道 runtime 中若走到 DM allowlist 阻断，也会走同一回调

当前审批方式：

- WebChat 设置页可以直接读取和保存 `channel-security.json`
- WebChat 设置页可以查看 pending sender
- 支持 `批准 / 拒绝`
- 批准后会把 sender 写回对应渠道或账号的 `allowFrom`
- 有新的 pending request 时，Gateway 会广播 `channel.security.pending`

### 2.6 `system.doctor` 渠道检查

当前 `system.doctor` 已加入 `Channel Security (...)` 检查，主要会提示：

- 渠道已启用但未配置 `channel-security.json`
- `dmPolicy=allowlist` 但 `allowFrom` 为空
- 群聊 / 房间场景未开启必要的 mention gate
- `community` 会按 `community.json` 中的 agent name 作为 `accountId` 做账号级检查

---

## 3. 飞书接入

### 3.1 需要的环境变量

```env
BELLDANDY_FEISHU_APP_ID=cli_xxxxxxxxxxxxxxxx
BELLDANDY_FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# 可选：把飞书渠道固定路由到某个 agent profile
BELLDANDY_FEISHU_AGENT_ID=default
```

### 3.2 平台侧配置

飞书开放平台侧至少要完成：

1. 创建企业自建应用
2. 启用机器人能力
3. 开通消息相关权限
4. 事件订阅改为长连接模式
5. 订阅 `im.message.receive_v1`
6. 发布应用版本

### 3.3 当前代码行为

飞书消息进入后会：

- 推断当前是 `dm` 或群聊
- 解析 mentions
- 进入 channel router / security fallback
- 若 DM 命中 `allowlist` 阻断，则写入 pending approval
- 使用 `chatId` 作为 conversation 维度

### 3.4 常见问题

**发送消息后不回复**

优先检查：

- 应用是否已发布
- `im.message.receive_v1` 是否已订阅
- App ID / App Secret 是否正确
- Gateway 日志里是否出现 `Route blocked message ... (channel_security:...)`

---

## 4. QQ 接入

### 4.1 需要的环境变量

```env
BELLDANDY_QQ_APP_ID=你的AppID
BELLDANDY_QQ_APP_SECRET=你的AppSecret
BELLDANDY_QQ_SANDBOX=true

# 可选：把 QQ 渠道固定路由到某个 agent profile
BELLDANDY_QQ_AGENT_ID=default
```

说明：

- `BELLDANDY_QQ_SANDBOX` 默认不是 `false` 时会按沙箱模式处理
- 当前代码使用 QQ 官方 AccessToken 模式，系统自动获取和刷新

### 4.2 当前代码行为

QQ 消息进入后会：

- 根据事件类型推断 `dm / group / channel`
- 非 DM 场景使用是否 `@机器人` 来决定 `mentioned`
- 进入 channel router / security fallback
- 若 DM 命中 `allowlist` 阻断，则写入 pending approval
- 当前 conversationId 采用 `qq_<chatId>`

### 4.3 启动验证

启动后可观察日志：

- AccessToken 获取成功
- WebSocket 已启动
- 收到消息后的 route decision 或 blocked 日志

---

## 5. Discord 接入

### 5.1 需要的环境变量

```env
BELLDANDY_DISCORD_ENABLED=true
BELLDANDY_DISCORD_BOT_TOKEN=你的BotToken
```

### 5.2 平台侧配置

Discord Developer Portal 侧至少要完成：

1. 创建 Application
2. 创建 Bot 并保存 Token
3. 开启 `MESSAGE CONTENT INTENT`
4. 将 Bot 邀请进目标服务器并授予发言权限

### 5.3 当前代码行为

Discord 消息进入后会：

- 自动区分 DM 与 guild channel
- 解析 mentions
- 进入 channel router / security fallback
- 若 DM 命中 `allowlist` 阻断，则写入 pending approval
- 回复超出平台限制时，会按 2000 字符分段发送

### 5.4 常见问题

**Bot 在线但不回复**

优先检查：

- `BELLDANDY_DISCORD_ENABLED=true`
- `BELLDANDY_DISCORD_BOT_TOKEN` 是否有效
- `MESSAGE CONTENT INTENT` 是否开启
- 是否被 `channel-security.json` 阻断

---

## 6. 社区房间接入 `community.json`

### 6.1 配置文件位置

社区房间配置路径是：

```text
<stateDir>/community.json
```

默认状态目录下通常就是：

```text
~/.star_sanctuary/community.json
```

### 6.2 最小配置示例

```json
{
  "endpoint": "https://api.goddess-ai.top",
  "agents": [
    {
      "name": "assistant",
      "apiKey": "your-api-key-here",
      "room": {
        "name": "room-123",
        "password": "optional-password"
      }
    }
  ],
  "reconnect": {
    "enabled": true,
    "maxRetries": 10,
    "backoffMs": 5000
  }
}
```

字段说明：

| 字段 | 必填 | 说明 |
|---|---|---|
| `endpoint` | 是 | 社区服务地址，推荐填写 `https://api.goddess-ai.top` |
| `agents` | 是 | 社区账号列表，可同时配置多个 |
| `agents[].name` | 是 | 社区账号名，同时也是该账号在安全策略里的 `accountId` |
| `agents[].apiKey` | 是 | 社区服务 API Key |
| `agents[].room` | 否 | 启动时要自动加入的房间 |
| `reconnect` | 否 | 自动重连策略 |

### 6.3 当前代码行为

`CommunityChannel` 当前已经接入：

- channel router
- channel security fallback
- account-level policy
- pending approval callback

关键点：

- `agents[].name` 会被当作 `accountId`
- 房间消息会以 `room` chatKind 进入安全策略
- 若某个账号配置了 `mentionRequired.room=true`，房间里必须显式提及该账号才会放行
- 当前社区房间 conversationId 采用 `community:<roomId>`
- `join_room` / `leave_room` 工具仍然可用，且会修改 `community.json`

### 6.4 多 Agent 行为

可同时配置多个 community agent：

- 每个 agent 独立维护连接状态
- 每个 agent 有自己的 `accountId`
- 安全策略可以按 `channels.community.accounts.<agentName>` 分别控制

示例：

```json
{
  "version": 1,
  "channels": {
    "community": {
      "accounts": {
        "coder": {
          "mentionRequired": {
            "room": true
          }
        },
        "researcher": {
          "dmPolicy": "allowlist",
          "allowFrom": ["u_42"]
        }
      }
    }
  }
}
```

### 6.5 注意事项

- `community.json` 含敏感信息，不要提交到版本控制
- `agents[].name` 已不只是显示名，它现在会进入安全策略匹配
- 如果房间里发了消息但 Agent 没响应，要检查是否被 `mentionRequired.room` 阻断

---

## 7. 社区 HTTP API `/api/message`

这是独立于社区房间 WebSocket 之外的 HTTP 入口，由 `packages/belldandy-core/src/server.ts` 和 `packages/belldandy-core/src/query-runtime-http.ts` 提供。

### 7.1 启用条件

至少需要：

```env
BELLDANDY_AUTH_MODE=token
BELLDANDY_AUTH_TOKEN=your-gateway-token

BELLDANDY_COMMUNITY_API_ENABLED=true
BELLDANDY_COMMUNITY_API_TOKEN=your-community-api-token
```

说明：

- `BELLDANDY_COMMUNITY_API_ENABLED=true` 不能和 `BELLDANDY_AUTH_MODE=none` 一起使用
- 若未单独设置 `BELLDANDY_COMMUNITY_API_TOKEN`，运行时会回退到 `BELLDANDY_AUTH_TOKEN`
- 请求需要 `Authorization: Bearer <token>`

### 7.2 最小请求示例

```http
POST /api/message
Authorization: Bearer your-community-api-token
Content-Type: application/json
```

```json
{
  "text": "@assistant hello",
  "conversationId": "conv-001",
  "accountId": "assistant",
  "senderInfo": {
    "id": "u_123",
    "name": "Alice",
    "type": "user"
  },
  "roomContext": {
    "environment": "community",
    "roomId": "room-alpha",
    "members": []
  }
}
```

### 7.3 当前运行时行为

`/api/message` 当前已支持：

- 显式 `accountId`
- 按 `accountId` 解析 `channels.community.accounts.<accountId>`
- 房间消息消费 `mentionRequired.room`
- DM 消费 `dmPolicy / allowFrom`
- DM 命中 allowlist 阻断时写入 `channel-security-approvals.json`
- 阻断时返回 `403` 和 `CHANNEL_SECURITY_BLOCKED`

阻断返回示意：

```json
{
  "ok": false,
  "error": {
    "code": "CHANNEL_SECURITY_BLOCKED",
    "message": "Community message blocked by channel security policy (...)"
  },
  "payload": {
    "reason": "channel_security:mention_required_blocked",
    "accountId": "assistant",
    "chatKind": "room"
  }
}
```

### 7.4 什么时候该传 `accountId`

建议：

- 只要是 `community` HTTP 入口，就显式传 `accountId`
- 多账号场景必须传
- 单账号场景也建议传，避免后续扩展时行为漂移

---

## 8. 排障建议

### 8.1 渠道已启动但不回复

优先检查：

1. 对应渠道凭据是否完整
2. Gateway 日志里是否出现 `Route blocked message`
3. `channel-security.json` 是否开启了更严格的 `allowlist` 或 `mentionRequired`
4. WebChat 设置页里是否出现待审批 sender
5. `system.doctor` 是否对 `Channel Security (...)` 报警

### 8.2 community 房间里发消息无响应

优先检查：

1. `community.json` 的 `agents[].name` 是否与你提及的账号一致
2. `channel-security.json` 是否配置了：
   - `channels.community.accounts.<accountId>.mentionRequired.room=true`
3. 文本里是否真的提到了该账号，例如 `@assistant`

### 8.3 `/api/message` 返回 401 或 404

检查：

- `BELLDANDY_COMMUNITY_API_ENABLED=true` 是否已开启
- `Authorization: Bearer ...` 是否正确
- `BELLDANDY_COMMUNITY_API_TOKEN` 是否配置正确

### 8.4 `/api/message` 返回 403

这通常不是系统故障，而是安全策略生效。优先看返回体中的：

- `payload.reason`
- `payload.accountId`
- `payload.chatKind`

常见原因：

- `channel_security:mention_required_blocked`
- `channel_security:dm_allowlist_blocked`

---

## 9. 当前边界

当前这套渠道对接已经具备：

- 多渠道统一接线
- 手工路由 + 安全 fallback
- `community` 账号级安全策略
- WebChat 最小审批闭环
- `system.doctor` 风险提示

但仍有明确边界：

- 还不是完整的渠道 onboarding wizard
- 账号级管理主要还是 JSON + 设置页审批，不是独立 account 管理 UI
- room 级场景当前主要做 mention gate，不做 room 级审批流
- 各渠道的渲染分段能力仍不完全统一，Discord 支持最完整

---

## 10. 推荐最小上线组合

如果要稳妥上线一个新渠道，建议最少同时准备：

1. 渠道凭据
2. `channel-security.json`
3. WebChat 设置页可访问
4. `system.doctor` 自检通过
5. 至少一条真实消息验证

一个建议起步模板：

```json
{
  "version": 1,
  "channels": {
    "discord": {
      "dmPolicy": "allowlist",
      "allowFrom": []
    },
    "feishu": {
      "dmPolicy": "allowlist",
      "allowFrom": []
    },
    "qq": {
      "dmPolicy": "allowlist",
      "allowFrom": []
    },
    "community": {
      "accounts": {
        "assistant": {
          "mentionRequired": {
            "room": true
          }
        }
      }
    }
  }
}
```

这样做的目的很直接：

- DM 默认先收紧
- community 房间默认要求显式 mention
- 后续再通过审批链把可信 sender 放开
