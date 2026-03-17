# Token 监控功能列表

更新日期：2026-03-17

## 1. 核对范围

本次核对基于以下两份文档与当前仓库代码：

- `docs/archive/token消耗对接.md`
- `docs/archive/token监控方案.md`

本仓库能直接验证的是 `Star Sanctuary / Belldandy` 侧实现，包括 WebChat、Gateway、community 渠道、任务级 token 计数器与前端展示。

`office.goddess.ai` 接收端（如 `/api/internal/token-usage` 路由、数据库写库逻辑）不在当前仓库中，**本次未直接验代码**，这里只能验证“上传端已实现到什么程度”。

## 2. 已实现功能列表

| 功能 | 当前状态 | 说明 | 代码依据 |
|---|---|---|---|
| WebChat token 用量事件推送 | 已实现 | Agent 运行结束后，Gateway 会向前端推送 `token.usage` 事件，包含 `systemPromptTokens / contextTokens / inputTokens / outputTokens / cacheCreationTokens / cacheReadTokens / modelCalls`。 | `packages/belldandy-core/src/server.ts` |
| WebChat 顶部 token 面板展示 | 已实现 | 前端已展示 `SYS / CTX / IN / OUT / ALL`；`ALL` 为当前前端会话内累计值，连接成功时会重置。 | `apps/web/public/index.html`、`apps/web/public/app.js` |
| WebChat token 上传开关与配置读取 | 已实现 | Gateway 会读取 `BELLDANDY_TOKEN_USAGE_UPLOAD_ENABLED / URL / APIKEY / TIMEOUT_MS`，并支持旧字段 `BELLDANDY_TOKEN_USAGE_UPLOAD_TOKEN` 兼容。 | `packages/belldandy-core/src/server.ts`、`.env.example` |
| WebChat token 增量上传 | 已实现 | WebChat 链路在收到 `usage` 后，会按 `inputTokens + outputTokens` 计算累计值，再用 `lastUploadedUsageTotal` 求增量上传，避免重复记账。 | `packages/belldandy-core/src/server.ts` |
| 共享 token 上传 helper | 已实现 | WebChat 与 community 共用 `uploadTokenUsage(...)`；helper 内置超时、错误告警、非阻塞失败降级。 | `packages/belldandy-protocol/src/token-usage-upload.ts` |
| community token 上传 | 已实现 | 社区消息链路会在 `usage` 事件上报时按增量上传，`source` 固定为 `community`。 | `packages/belldandy-channels/src/community.ts` |
| community 按主人 UUID 记账 | 已实现 | `CommunityChannel` 支持注入 `ownerUserUuid`，上传时把主人 UUID 带入请求体。 | `packages/belldandy-channels/src/community.ts`、`packages/belldandy-core/src/bin/gateway.ts` |
| 根目录 `IDENTITY.md` 主人 UUID 解析 | 已实现 | Gateway 会从根工作区 `IDENTITY.md` 提取 `**主人UUID**`，供 community 严格 UUID 模式使用。 | `packages/belldandy-protocol/src/identity.ts`、`packages/belldandy-core/src/bin/gateway.ts` |
| 严格 UUID 模式缺失告警 | 已实现 | 当 `BELLDANDY_TOKEN_USAGE_STRICT_UUID=true` 且未解析到主人 UUID 时，Gateway 启动 community 渠道会输出 warning。 | `packages/belldandy-core/src/bin/gateway.ts` |
| 任务级 token 计数器服务 | 已实现 | `TokenCounterService` 已支持 `start / stop / list / notifyUsage / cleanup`，按命名计数器统计任务级输入、输出、总 token 与耗时。 | `packages/belldandy-agent/src/token-counter.ts` |
| `token_counter_start` / `token_counter_stop` 工具 | 已实现 | 两个工具已实现并注册到 Gateway；停止时会返回 JSON 结果。 | `packages/belldandy-skills/src/builtin/token-counter.ts`、`packages/belldandy-core/src/bin/gateway.ts` |
| 任务级结果事件广播 | 已实现 | `token_counter_stop` 会主动广播 `token.counter.result` 到前端。 | `packages/belldandy-skills/src/builtin/token-counter.ts`、`packages/belldandy-core/src/bin/gateway.ts` |
| 默认 run 级任务统计 | 已实现 | `message.send` 现在会在每次 Agent run 结束后自动生成一条 `name=run` 的任务级 token 结果，并广播 `token.counter.result`。 | `packages/belldandy-core/src/server.ts` |
| 任务级结果会话持久化 | 已实现 | 自动 run 结果和手动 `token_counter_stop` 结果都会写入 `ConversationStore`，保存为会话 meta。 | `packages/belldandy-agent/src/conversation.ts`、`packages/belldandy-skills/src/builtin/token-counter.ts`、`packages/belldandy-core/src/server.ts` |
| 任务级结果查询接口 | 已实现 | Gateway 新增 `conversation.meta`，可读取指定会话最近的任务级 token 记录。 | `packages/belldandy-core/src/server.ts` |
| 任务级结果前端展示 | 已实现 | 前端已增加 `TASK / IN / OUT / TOTAL` 面板，收到 `token.counter.result` 后显示 8 秒。 | `apps/web/public/index.html`、`apps/web/public/app.js` |
| 最近任务 Token 记录区 | 已实现 | 前端新增最近任务 token 列表，支持在当前会话中持续查看最近记录，不再只依赖 8 秒闪现面板。 | `apps/web/public/index.html`、`apps/web/public/app.js`、`apps/web/public/styles.css` |
| 自动任务边界计数 | 已实现 | 检测到 `sessions_spawn / delegate_task / delegate_parallel` 后自动开启计数器；`agent_end` 时自动停止并广播结果。 | `packages/belldandy-core/src/bin/gateway.ts` |
| 工具执行上下文注入 tokenCounter | 已实现 | `ToolExecutor` 已按 `conversationId` 注入 `tokenCounter`，工具可直接访问任务级计数器。 | `packages/belldandy-skills/src/executor.ts`、`packages/belldandy-skills/src/types.ts` |
| run 结束前计数器泄漏清理 | 已实现 | `ToolEnabledAgent` 在 `finally` 中会保存快照、清理泄漏计数器并从 executor 中移除绑定。 | `packages/belldandy-agent/src/tool-agent.ts` |

## 3. 已实现但有边界/限制的项

| 项目 | 当前状态 | 说明 | 代码依据 |
|---|---|---|---|
| WebChat 上传依赖 `userUuid` | 已实现但有限制 | WebChat 只有在 `ctx.userUuid` 存在时才会上报 token；用户 UUID 主要来自 WebSocket `connect` 握手。 | `packages/belldandy-core/src/server.ts`、`apps/web/public/app.js` |
| `message.send` 的 `userUuid` 覆盖 | 已实现 | Gateway 现在会解析 `params.userUuid`，并按 `params.userUuid ?? 握手UUID` 的优先级透传给 Agent 与 token 上传链路。 | `apps/web/public/app.js`、`packages/belldandy-core/src/server.ts` |
| community 缺失主人 UUID 时的上传 | 已实现但取决于接收端策略 | 当前 community 在 `ownerUserUuid` 缺失时仍会继续上传，只是不带 `userUuid`。如果接收端开启 strict uuid 校验，这类请求可能失败。 | `packages/belldandy-channels/src/community.ts`、`packages/belldandy-core/src/bin/gateway.ts` |
| 任务级计数器“跨 run 持续” | 已实现 | `ToolEnabledAgent` 会把活跃计数器快照写回 `ConversationStore`，当前已补 `.meta.json` 持久化；对已落会话消息的场景，Gateway 重启后也可恢复。 | `packages/belldandy-agent/src/tool-agent.ts`、`packages/belldandy-agent/src/conversation.ts` |
| 任务级结果前端展示字段 | 已实现但较轻量 | 前端只展示 `name / input / output / total`，`durationMs` 和 `auto` 标记虽然已在事件中存在，但当前 UI 没有展示。 | `packages/belldandy-skills/src/builtin/token-counter.ts`、`packages/belldandy-core/src/bin/gateway.ts`、`apps/web/public/index.html`、`apps/web/public/app.js` |
| 严格 UUID 配置文档 | 代码已支持，示例配置未补全 | 代码里已经读取 `BELLDANDY_TOKEN_USAGE_STRICT_UUID`，但当前 `.env.example` 未看到该配置说明。 | `packages/belldandy-core/src/bin/gateway.ts`、`.env.example` |

## 4. 当前自动验证结果

### 4.1 已通过

- `corepack pnpm build`
  - 结果：通过
- `node .\\node_modules\\vitest\\vitest.mjs run packages/belldandy-channels/src/community.test.ts packages/belldandy-protocol/src/identity.test.ts`
  - 结果：通过，共 2 个测试文件、5 个测试
- `node .\\node_modules\\vitest\\vitest.mjs run packages/belldandy-agent/src/conversation.test.ts packages/belldandy-core/src/server.test.ts packages/belldandy-channels/src/community.test.ts packages/belldandy-protocol/src/identity.test.ts`
  - 结果：通过，共 4 个测试文件、30 个测试

### 4.2 已验证到的测试覆盖

- `packages/belldandy-channels/src/community.test.ts`
  - 验证 community 按增量上传
  - 验证上传关闭时不上传
  - 验证缺失 `ownerUserUuid` 时仍上传但不带 `userUuid`
- `packages/belldandy-protocol/src/identity.test.ts`
  - 验证 `IDENTITY.md` 中 `主人UUID` 解析成功
  - 验证文件缺失或字段缺失时返回 `undefined`
- `packages/belldandy-agent/src/conversation.test.ts`
  - 验证 task token 结果与 active counter meta 可持久化并重新加载
- `packages/belldandy-core/src/server.test.ts`
  - 验证 `message.send` 默认会发出自动 run 级 `token.counter.result`
  - 验证 `conversation.meta` 可以读回持久化的任务级 token 记录
- `packages/belldandy-skills/src/builtin/token-counter.test.ts`
  - 验证 `token_counter_start` 成功启动与重复启动失败
  - 验证 `token_counter_stop` 成功返回统计结果
  - 验证 `token_counter_stop` 会广播结果并写入 `conversationStore`
  - 验证服务缺失时的降级报错

### 4.3 当前未看到直接自动化验证的项

- 未检到 WebChat 前端 `token.usage / token.counter.result` 展示逻辑的前端自动化测试
- 未检到 WebChat 上传链路的独立单测

## 5. 结论

当前仓库里的 token 监控能力，已经形成两条主链路：

1. **会话级 token 监控**
   - WebChat 可实时看到本次 run 的 token 数据与前端会话累计值
   - Gateway / community 可把 token 增量上传到 office 内部接口

2. **任务级 token 监控**
   - 现在每次 `message.send` 都会默认生成一条 run 级任务 token 结果
   - Agent 仍可通过 `token_counter_start` / `token_counter_stop` 主动划定更细的任务边界
   - 也支持对 `sessions_spawn / delegate_task / delegate_parallel` 做自动计数
   - 结果会广播到前端，并写入会话 meta 供最近记录区与后续查询使用

当前还值得继续补的点主要有两个：

- WebChat 前端的任务级 token 历史展示还缺前端自动化测试
- WebChat 上传链路还缺独立定向单测
