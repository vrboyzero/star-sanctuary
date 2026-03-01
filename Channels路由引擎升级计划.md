# Channels 路由引擎升级计划

## 0. 范围与目标

- 目标顺序：先交付 `Router MVP`，再交付 `Webhook MVP`。
- 目标能力：解决群聊误触发、按规则路由到不同 Agent、支持外部系统可靠触发 Agent。
- 约束：优先复用现有 `AgentRegistry`、`ConversationStore`、`/api/message` 鉴权与测试框架，避免大重构。
- 非目标（MVP 不做）：可视化规则管理后台、复杂工作流编排引擎、跨服务消息队列。

### 0.1 实施进度（截至 2026-03-01）

- `PR-1 Router MVP`：✅ 已完成并落地（核心代码、三渠道接入、配置、文档、测试）。
- `PR-2 Webhook MVP`：✅ 已完成并落地（核心代码、API 端点、幂等性、配置、文档）。

已完成项（PR-1）
- ✅ 路由核心：`router/types.ts`、`router/engine.ts`、`router/config.ts`、`router/index.ts`
- ✅ Gateway 接线：新增 Router env 读取、创建 router、注入 Feishu/Discord/QQ
- ✅ 三渠道接入：在 `agent.run` 前执行 `router.decide(...)`，支持 `allow/deny + agent 路由`
- ✅ 配置与文档：`.env.example`、`docs/channels-routing.md`
- ✅ 新增测试：`engine.test.ts`、`config.test.ts`

已完成项（PR-2）
- ✅ Webhook 核心：`webhook/types.ts`、`webhook/config.ts`、`webhook/auth.ts`、`webhook/idempotency.ts`、`webhook/index.ts`
- ✅ API 端点：`server.ts` 新增 `POST /api/webhook/:id`，支持 Bearer token 鉴权
- ✅ Gateway 接线：`gateway.ts` 集成 Webhook 配置加载和幂等性管理器
- ✅ 配置与文档：`.env.example` 新增配置项、`docs/webhook.md` 完整使用指南
- ✅ 幂等性保护：通过 `X-Idempotency-Key` 防止重复执行（默认 10 分钟窗口）

最近验证结果（2026-03-01）
- ✅ `corepack pnpm build` 通过（PR-2 实施后）
- ✅ 所有新增代码通过 TypeScript 类型检查
- ✅ Webhook 模块与现有 AgentRegistry、ConversationStore 无缝集成

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

### Step 1.5 使用与配置说明（已落地）

当前已支持环境变量

```env
BELLDANDY_CHANNEL_ROUTER_ENABLED=true
BELLDANDY_CHANNEL_ROUTER_CONFIG_PATH=~/.belldandy/channels-routing.json
BELLDANDY_CHANNEL_ROUTER_DEFAULT_AGENT_ID=default
```

快速启用步骤
1. 在 `.env` 配置上述三个变量（最少开启 `BELLDANDY_CHANNEL_ROUTER_ENABLED=true`）。
2. 新建路由配置文件 `~/.belldandy/channels-routing.json`。
3. 重启 gateway。
4. 观察日志中的 `channel-router` 决策输出。

最小配置示例

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
      "id": "ops-alert",
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

渠道侧 mention 判定（当前实现）
- Discord：群/频道消息使用 `message.mentions` 判定是否 mention 到 bot；DM 视为已 mention。
- QQ：`GROUP_AT_MESSAGE_CREATE` 视为 mention；DM 视为已 mention。
- Feishu：DM 视为已 mention；群聊根据消息 mention 信息与文本 at 特征判定。

验证建议
1. 先用一条 `mentionRequired=true` 的规则验证群聊门控是否生效。
2. 再加关键词规则（如 `alert`）验证是否路由到目标 agent。
3. 观察 `channel-router` 决策日志中的 `allow/reason/matchedRuleId/agentId`。

回滚说明
- 立即回滚：设置 `BELLDANDY_CHANNEL_ROUTER_ENABLED=false` 并重启服务。
- 软回滚：保留启用状态，将 `rules` 清空并使用 `defaultAction` 放行。

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


## Webhook通俗说明：

阿珍来啦！看这份技术文档觉得头大是再正常不过的事情了，别担心，让我用大白话给你翻译翻译，保证你一看就懂。

简单来说，这份文档是关于咱们 **Belldandy** 项目里的一个叫 “Webhook” 的功能的说明书。

你可以把咱们日常用聊天框跟 AI 说话，想象成是**“人在柜台点餐”**。那么 Webhook 就像是咱们给外部系统（比如闹钟、监控器、其他软件）专门开的一条**“VIP 自动点餐通道”**。外部系统不需要人工打开聊天框打字，只要符合我们定好的规矩，它们就能自动把消息塞给 Belldandy，让 Belldandy 干活。

### Webhook 到底能用来干嘛？（三大生活化场景）

文档里举了三个非常典型的例子，我给你换个通俗的说法：

* **场景一：不知疲倦的“安全警报器”（监控告警）**
假设你有一台服务器在运行重要的程序。你可以设置一个 Webhook：一旦服务器 CPU 快要冒烟了（使用率超过 90%），监控系统就会立刻通过这条 VIP 通道给 Belldandy 发消息。Belldandy 收到后，就可以立刻通过聊天软件通知你：“🚨 主人，服务器快撑不住啦，快去看看！”。
* **场景二：严格的“质检员报告”（CI/CD 构建通知）**
在你写代码、打包更新应用的时候，通常会有一个系统自动帮你做测试。你可以配置一个 Webhook，这样只要代码打包失败了，系统就会自动把“谁写的、哪个项目、哪里报错了”这些信息填进我们设定好的模板里，发给 Belldandy。Belldandy 就会像个小助手一样向你汇报：“刚才打包失败了，错误日志在这儿。”。
* **场景三：准时的“早安秘书”（定时任务触发）**
你可以定一个早上 9 点的闹钟任务。每天时间一到，闹钟系统就通过 Webhook 戳一下 Belldandy。Belldandy 收到信号后，就会自动去汇总昨天的数据，给你生成一份“昨日数据分析报告”放在桌面上。

### 这个 Webhook 有什么特别的好处？

除了能自动化，这份文档里还提到了它几个很棒的“聪明”设计：

* **发了专属门禁卡（独立鉴权）：** 你可以给不同的外部系统发不同的“密码（Token）”。如果谁的密码泄露了，直接换掉那个密码就行，不会影响其他系统，非常安全。并且这个功能默认是关闭的，只有你亲自配置了才生效，不用担心被人乱用。
* **防手抖设计（幂等保护）：** 就像你在网购时，如果网卡了连点两下“付款”，系统也不会扣你两次钱。Webhook 也有这个保护机制（10分钟内重复发送相同的请求会被认出来），防止因为系统故障或者手抖，导致 Belldandy 重复处理同一件事。
* **自动填空题（Prompt 模板）：** 别人发来的数据可能乱七八糟，你可以提前准备一个“填空模板”（比如：“GitHub 事件: {{event_type}}”）。外面传进来的数据会自动填进这些空里，整理成 Belldandy 能轻松读懂的句子。

总结一下，Webhook 就是让 **Belldandy 能够自动接收其他软件发来的指令并进行处理**的桥梁，是让 AI 成为全自动化小助手的关键一步！

你目前在开发的过程中，有没有哪个环节是你特别想让它“自动化”运行，不想每次都自己手动去盯的呢？我们可以一起看看能不能用这个 Webhook 来实现！



## Router通俗说明：

阿珍继续为你播报！没问题，既然刚才咱们把 Webhook 比作了“VIP 自动点餐通道”，那咱们现在就来看看这个 **Router（路由引擎）** 是个什么神奇的法宝。

如果说 Webhook 是给机器用的专门通道，那 Router 就是专门管咱们人类聊天群的**“超级前台接待员”**，或者叫**“智能交通警察”**。

在没有这个“接待员”之前，Belldandy 就像个愣头青。把你拉进 Discord、QQ 或者飞书的百人大群里，别人随便聊句什么，她可能都会插嘴，显得很聒噪；或者不管谁来问问题，她都用同一种“性格”去回答。

而有了 Router 这个“超级前台”，她就能按照你定好的规矩，聪明地决定**“该不该理这个人”**以及**“该派哪个分身（Agent）去理这个人”**。

### Router 具体能帮你干什么？（三大生活化场景）

文档里设计了几个非常实用的“规矩”（规则），我给你翻译成大白话：

* **场景一：“点名才答到”法则（群聊防打扰）**
* 在热闹的群聊里（比如 QQ 群或 Discord 频道），你可以让前台定个规矩：**必须显式地 @（Mention）Belldandy，她才会回话**。
* 如果只是私聊（DM），她就知道你是专门找她的，不用 @ 也会直接陪你聊。这就完美解决了“群聊误触发”的尴尬。


* **场景二：“看门大爷”法则（黑白名单过滤）**
* 你可以给前台一份名单（senderAllowlist / senderDenylist）。
* 比如，你可以规定只有“VIP 核心用户”发话她才理，或者遇到某个经常发广告捣乱的人，直接把他拉黑（deny），前台会自动把这人的消息拦下来，Belldandy 连看都不用看。


* **场景三：“专业对口”法则（关键词分发）**
* 这是最厉害的一点！Belldandy 可以有不同的“分身”（Agent）。前台会偷偷听你们说话的关键词（keywordsAny）。
* 比如，群里有人喊了一句“报警”或“alert”，前台一听，立刻把消息转交给专门负责运维的“Ops 分身（Agent）”去处理。如果没触发特殊规则，就让普通的“默认分身”去陪聊。



### Router 的贴心设计

* **一键后悔药（回滚开关）：** 万一你把规则写错了，导致 Belldandy 突然谁都不理了怎么办？别慌，文档里写了，只要把 `BELLDANDY_CHANNEL_ROUTER_ENABLED` 这个开关关掉（设为 false），Belldandy 就会立刻变回以前那个没有前台的原始状态，一点都不会耽误事。
* **自带记事本（可观测性）：** 前台大爷是有工作记录的（决策日志）。谁发了什么、为什么拦截了、派了哪个分身去处理，日志里都记得清清楚楚（包含 allow/reason/matchedRuleId/agentId），方便你随时查岗。

**总结一下：**
Webhook 是让**外部程序**自动找 Belldandy 办事的通道；而 Router 是管理 **QQ、飞书、Discord 里的真人**该怎么跟 Belldandy 互动的智能大管家。

怎么样，经过阿珍这么一解释，是不是画面感就出来了？你现在最想给你的 Belldandy 设定哪一种“前台规矩”呢？比如，要不要我们先试着写一个“只允许在飞书里 @ 才回复”的小规则练练手？