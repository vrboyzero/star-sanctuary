# Channels 路由引擎升级计划

## 0. 范围与目标

- 目标顺序：先交付 `Router MVP`，再交付 `Webhook MVP`。
- 目标能力：解决群聊误触发、按规则路由到不同 Agent、支持外部系统可靠触发 Agent。
- 约束：优先复用现有 `AgentRegistry`、`ConversationStore`、`/api/message` 鉴权与测试框架，避免大重构。
- 非目标（MVP 不做）：可视化规则管理后台、复杂工作流编排引擎、跨服务消息队列。

---

## 1. PR-1：Router MVP（Channels 路由引擎）

### Step 1.1 路由规则模型与匹配引擎（纯逻辑层）

改动文件
- `packages/belldandy-channels/src/router/types.ts`（新增）
- `packages/belldandy-channels/src/router/engine.ts`（新增）
- `packages/belldandy-channels/src/router/config.ts`（新增）
- `packages/belldandy-channels/src/router/index.ts`（新增）
- `packages/belldandy-channels/src/index.ts`（导出 router）

接口草案
```ts
export type ChannelKind = "feishu" | "discord" | "qq" | "community" | "webhook";
export type ChatKind = "dm" | "group" | "channel" | "room";

export interface RouteContext {
  channel: ChannelKind;
  chatKind: ChatKind;
  chatId: string;
  text: string;
  senderId?: string;
  senderName?: string;
  mentions?: string[];
  eventType?: string;
}

export interface RouteRule {
  id: string;
  enabled: boolean;
  priority: number;
  match?: {
    channels?: ChannelKind[];
    chatKinds?: ChatKind[];
    chatIds?: string[];
    senderAllowlist?: string[];
    senderDenylist?: string[];
    keywordsAny?: string[];
    mentionRequired?: boolean;
  };
  action: {
    allow: boolean;
    agentId?: string;
  };
}

export interface RouteDecision {
  allow: boolean;
  reason: string;
  agentId?: string;
  matchedRuleId?: string;
}

export interface ChannelRouter {
  decide(ctx: RouteContext): RouteDecision;
}
```

测试清单
- `engine` 单测：优先级命中顺序正确（高优先级先命中）。
- `mentionRequired`：群聊未 mention 拒绝，DM 不受影响。
- `senderAllowlist/senderDenylist`：黑白名单生效且 deny 优先。
- `keywordsAny`：关键词触发路由到指定 `agentId`。
- 无规则命中时走默认策略（默认 allow + default agent）。

### Step 1.2 Gateway 接线与配置加载

改动文件
- `packages/belldandy-core/src/bin/gateway.ts`
- `.env.example`
- `docs/channels-routing.md`（新增）
- `packages/belldandy-channels/src/router/default-config.json`（可选新增）

接口草案
```ts
// env
BELLDANDY_CHANNEL_ROUTER_ENABLED=true
BELLDANDY_CHANNEL_ROUTER_CONFIG_PATH=~/.belldandy/channels-routing.json
BELLDANDY_CHANNEL_ROUTER_DEFAULT_AGENT_ID=default

// gateway wiring
const router = createChannelRouter({
  enabled,
  configPath,
  defaultAgentId,
  logger,
});
```

测试清单
- 启用 router 且配置不存在时：回退默认策略，不影响启动。
- 配置解析失败时：记录告警并回退默认策略（不 crash）。
- 关闭 router 时：行为与当前版本一致。

### Step 1.3 三个主渠道接入（Feishu / Discord / QQ）

改动文件
- `packages/belldandy-channels/src/feishu.ts`
- `packages/belldandy-channels/src/discord.ts`
- `packages/belldandy-channels/src/qq.ts`
- `packages/belldandy-channels/src/types.ts`（为 channel config 增加可选 router/agentResolver）

接口草案
```ts
export interface RoutedChannelConfig extends ChannelConfig {
  router?: ChannelRouter;
  agentResolver?: (agentId?: string) => BelldandyAgent;
  defaultAgentId?: string;
}
```

实现要点
- 各渠道在调用 `agent.run` 前先构造 `RouteContext`，执行 `router.decide(ctx)`。
- `decision.allow=false` 时直接跳过回复（并打印结构化日志）。
- `decision.agentId` 存在时，用 `agentResolver(decision.agentId)` 获取 Agent；不存在则走当前默认 Agent。

测试清单
- Discord 群聊未 mention 时不触发。
- QQ `GROUP_AT_MESSAGE_CREATE` 在 mention gating 开启时触发，其余群消息按规则过滤。
- Feishu 群消息按 `mentionRequired` 与关键词规则触发。
- 命中不同 rule 时可路由到不同 Agent（验证 `conversationStore` 中 `agentId`）。

### Step 1.4 路由可观测性与回滚开关

改动文件
- `packages/belldandy-core/src/bin/gateway.ts`
- `packages/belldandy-channels/src/router/engine.ts`
- `docs/channels-routing.md`

接口草案
```ts
logger.info("channel-router", "decision", {
  channel, chatId, allow, reason, matchedRuleId, agentId
});
```

测试清单
- 决策日志包含 `allow/reason/matchedRuleId/agentId`。
- `BELLDANDY_CHANNEL_ROUTER_ENABLED=false` 一键回滚到旧行为。

PR-1 验收标准
- 三渠道都支持基础 mention gating + 关键词路由 + agent 路由。
- 默认关闭，不影响现网；开启后规则可配置并可快速回滚。
- 单测通过，网关可启动，核心消息链路无回归。

---

## 2. PR-2：Webhook MVP（外部触发入口）

### Step 2.1 Webhook 配置模型与鉴权组件

改动文件
- `packages/belldandy-core/src/webhook/types.ts`（新增）
- `packages/belldandy-core/src/webhook/config.ts`（新增）
- `packages/belldandy-core/src/webhook/auth.ts`（新增）
- `.env.example`
- `docs/webhook.md`（新增）

接口草案
```ts
export interface WebhookRule {
  id: string;
  enabled: boolean;
  token: string; // MVP: bearer token
  defaultAgentId?: string;
  conversationIdPrefix?: string; // default: webhook:<id>
  promptTemplate?: string; // default: stringify payload
}
```

```json
{
  "version": 1,
  "webhooks": [
    {
      "id": "ci-alert",
      "enabled": true,
      "token": "replace-me",
      "defaultAgentId": "ops",
      "conversationIdPrefix": "webhook:ci-alert"
    }
  ]
}
```

测试清单
- 配置文件不存在/格式错误：启动不崩溃，webhook endpoint 返回明确错误。
- token 缺失、token 错误、hook id 不存在时返回 401/404。
- disabled hook 返回 403。

### Step 2.2 新增 `POST /api/webhook/:id` 并接入 Agent

改动文件
- `packages/belldandy-core/src/server.ts`
- `packages/belldandy-core/src/bin/gateway.ts`（安全校验）
- `packages/belldandy-core/src/server.test.ts`

接口草案
```http
POST /api/webhook/:id
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "text": "可选；为空时由 payload 模板生成",
  "agentId": "可选；不传则使用 webhook 默认 agent",
  "conversationId": "可选；不传则自动生成",
  "payload": { "any": "json" }
}
```

```json
{
  "ok": true,
  "payload": {
    "webhookId": "ci-alert",
    "conversationId": "webhook:ci-alert:2026-02-28",
    "response": "agent final text"
  }
}
```

测试清单
- endpoint 默认关闭（与 `community api` 一致风格）。
- 启用后 bearer 鉴权生效。
- 最小请求可触发 Agent 并返回响应。
- 指定 `agentId` 时走 `AgentRegistry` 对应 profile。

### Step 2.3 安全硬化（MVP 最小版）

改动文件
- `packages/belldandy-core/src/webhook/idempotency.ts`（新增）
- `packages/belldandy-core/src/server.ts`
- `packages/belldandy-core/src/server.test.ts`

接口草案
```http
X-Idempotency-Key: <event-id>
```

实现要点
- 同一 `(webhookId, idempotencyKey)` 在时间窗口内只执行一次。
- 重复请求返回 200 + `duplicate: true`，不重复触发 `agent.run`。

测试清单
- 同 key 重放不重复执行。
- 无 key 时按普通请求处理。
- 窗口过期后允许再次执行。

### Step 2.4 文档与运维落地

改动文件
- `docs/webhook.md`
- `.env.example`
- `Belldandy渠道对接说明.md`（补充 webhook 章节）

测试清单
- 文档中的 curl 示例可直接跑通。
- 出错码（401/403/404/400/500）与文档一致。

PR-2 验收标准
- 存在独立 webhook 入口，不依赖 WebSocket pairing。
- 具备基础鉴权、最小幂等、防误触发机制。
- 与 `AgentRegistry`、`ConversationStore` 打通，能稳定触发并追踪会话。

---

## 3. 发布顺序与回滚策略

- 发布顺序：`PR-1 Router MVP` 合并并灰度后，再发 `PR-2 Webhook MVP`。
- Router 回滚：关闭 `BELLDANDY_CHANNEL_ROUTER_ENABLED` 即可回到旧行为。
- Webhook 回滚：关闭 `BELLDANDY_WEBHOOK_ENABLED` 或移除对应 webhook 配置。
- 风险控制：每个 PR 都保持“配置默认关闭”，先测试环境验证再放量。

---

## 4. 工时预估（单人）

- PR-1 Router MVP：6-11 人日。
- PR-2 Webhook MVP：5-8 人日。
- 合计：约 3-4 周（含联调与文档）。

