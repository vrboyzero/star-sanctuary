# Belldandy Token 消耗对接实施方案

## 1. 目标与范围

- 目标 1：将 Belldandy WebChat 中 `ALL` token 累计消耗按增量写入 `office.goddess.ai` 数据库。
- 目标 2：在 `office.goddess.ai` 的 `users` 表新增用户累计 token 字段。
- 目标 3：在 Belldandy 增加可配置开关，控制是否上传 token 消耗。
- 目标 4：在 `users` 表新增实名信息字段，为后续支付对接准备。
- 已确认：`id_card_no` 本期按明文字段落库。

## 2. 当前实现现状（已检索）

- WebChat 的 `ALL` 仅在前端会话内存累计，刷新即重置。
  - 文件：`apps/web/public/app.js`
- 后端会通过 `token.usage` 事件持续推送 usage。
  - 文件：`packages/belldandy-core/src/server.ts`
- `userUuid` 在 WebSocket 握手阶段可获取并传入 Agent 运行上下文。
  - 文件：`packages/belldandy-core/src/server.ts`
- `office.goddess.ai` 使用 SQLite + Drizzle，`users` 表与手写增量迁移已存在。
  - 文件：`office.goddess.ai/server/src/db/schema.ts`
  - 文件：`office.goddess.ai/server/src/db/migrate.ts`

## 3. 数据库变更（office.goddess.ai）

### 3.1 users 新增字段

在 `office.goddess.ai/server/src/db/schema.ts` 的 `users` 表新增：

- `tokenUsageTotal: integer("token_usage_total").notNull().default(0)`
- `realName: text("real_name")`
- `idCardNo: text("id_card_no")`  // 本期明文存储

### 3.2 增量迁移

在 `office.goddess.ai/server/src/db/migrate.ts` 追加：

- `ALTER TABLE users ADD COLUMN token_usage_total INTEGER NOT NULL DEFAULT 0`
- `ALTER TABLE users ADD COLUMN real_name TEXT`
- `ALTER TABLE users ADD COLUMN id_card_no TEXT`

使用现有 `migrateAlter(...)` 模式，保证重复执行幂等（列已存在时跳过）。

## 4. 服务间写入接口（office.goddess.ai）

新增内部接口：

- 路径：`POST /api/internal/token-usage`
- 认证：`Authorization: Bearer <USER_API_KEY>`
- 相关环境变量（office 侧）：无需额外内部 token，直接使用用户 API Key 鉴权

请求体建议：

```json
{
  "userUuid": "a10001",
  "deltaTokens": 123,
  "conversationId": "conv-xxx",
  "source": "webchat"
}
```

处理逻辑：

1. 校验 `deltaTokens > 0`。
2. 按 Bearer API Key（`api_keys.key_hash`）反查 `api_keys.user_id` 作为目标用户。
3. 更新 `api_keys.last_used_at` 作为审计信息。
4. 执行原子累加：`token_usage_total = token_usage_total + deltaTokens`（含封顶保护）。
5. 未匹配用户时返回可观测错误（如 404），Belldandy 侧仅告警不阻塞主流程。
## 4.1 当前实现状态（2026-03-02）

- 已实现：每用户 API Key 鉴权上传（推荐）。
- 已实现：`BELLDANDY_TOKEN_USAGE_STRICT_UUID=true` 时启用 userUuid 严格一致性校验。

## 5. Belldandy 网关改造

## 5.1 新增配置项

在 Belldandy 增加环境变量：

- `BELLDANDY_TOKEN_USAGE_UPLOAD_ENABLED=false`
- `BELLDANDY_TOKEN_USAGE_UPLOAD_URL=http://127.0.0.1:3001/api/internal/token-usage`
- `BELLDANDY_TOKEN_USAGE_UPLOAD_APIKEY=`  
- `BELLDANDY_TOKEN_USAGE_UPLOAD_TIMEOUT_MS=3000`（可选）

并同步到：

- `.env.example`
- `config.update` 安全白名单（至少包含 `BELLDANDY_TOKEN_USAGE_UPLOAD_ENABLED`）

## 5.2 上传时机与算法

接入点：`packages/belldandy-core/src/server.ts` 中处理 `item.type === "usage"` 的分支。

上传原则：

- 只上传增量，不上传累计值，避免重复记账。
- 计算方式：
  - `runTotal = inputTokens + outputTokens`
  - `delta = runTotal - lastReportedTotal`
  - 仅当 `delta > 0` 且开关开启且存在 `userUuid` 时上传

`lastReportedTotal` 建议在当前请求处理作用域内维护（按 `conversationId + session` 维度）。

## 5.3 userUuid 一致性修补（先不实现）

当前 `message.send` 参数可带 `userUuid`，但解析返回对象中未透传该字段。建议修补：

- `parseMessageSendParams(...)` 返回值包含 `userUuid`
- 运行时优先级建议：`params.userUuid ?? state.userUuid`

避免“握手 UUID”与“消息 UUID”不一致导致写库归属偏差。

## 6. 字段使用建议（实名与支付准备）

- `real_name`：实名展示/支付实名校验预留。
- `id_card_no`：本期明文存储，仅作为支付对接准备字段。
- 后续建议（下一期）：
  - 至少对 `id_card_no` 做脱敏返回；
  - 增加加密存储与权限分级访问。

## 7. 验证清单

1. 执行 `office.goddess.ai/server` 的 `pnpm db:migrate`，确认三列落库成功。
2. 启动 office 与 Belldandy，打开上传开关并配置 URL/APIKEY（用户自己的 API Key）。
3. WebChat 发送消息后，检查 `users.token_usage_total` 递增。
4. 关闭开关后再次发送，确认不再写库。
5. 模拟 office 不可达/鉴权失败，确认 Belldandy 聊天主流程不受影响，仅日志告警。
6. 验证 API Key 被删除后上传立即失败（401），实现单用户吊销生效。
7. （可选）开启 `BELLDANDY_TOKEN_USAGE_STRICT_UUID=true`，验证 `userUuid` 不一致时返回 403。

## 8. 风险与回滚

- 风险 1：若误传累计值会重复计费。  
  规避：严格按 `delta` 上传。
- 风险 2：`userUuid` 口径不统一导致写到错误用户。  
  规避：API Key 模式以 `api_keys.user_id` 为准；必要时开启严格 UUID 校验。
- 风险 3：内部接口故障影响响应链路。  
  规避：上传异步化、失败降级为日志。

回滚路径：

1. 立即将 `BELLDANDY_TOKEN_USAGE_UPLOAD_ENABLED=false`。
2. 保留字段不删，停止写入即可。
3. 必要时下线 `POST /api/internal/token-usage` 路由。

## 9. 预计改动文件清单

- Belldandy
  - `packages/belldandy-core/src/server.ts`
  - `.env.example`
- office.goddess.ai
  - `server/src/db/schema.ts`
  - `server/src/db/migrate.ts`
  - `server/src/index.ts`（挂载 internal 路由）
  - `server/src/routes/internal.ts`（新增）

## 10. 下一阶段方案：改为“每用户 API Key 鉴权上传”

### 10.1 背景与目标

- 原模式：所有 Belldandy 实例共享一个内部 token。
- 问题：多用户场景下，不便于按用户独立吊销、审计、限流。
- 目标：允许每个用户在自己的 Belldandy 中配置“自己的 office API Key”作为上传鉴权。

### 10.2 设计要点

1. 上传鉴权凭证改为用户 API Key  
   - Belldandy 使用 `BELLDANDY_TOKEN_USAGE_UPLOAD_APIKEY` 字段，值填该用户在 office 生成的 `plainKey`（如 `gro_xxx`）。
2. office 端鉴权逻辑改造  
   - `POST /api/internal/token-usage` 支持 `Authorization: Bearer <API_KEY>`。
   - 通过 `hashApiKey` + `api_keys.key_hash` 校验 key。
   - 以 `api_keys.user_id` 作为最终写入目标用户，不再仅依赖请求体 `userUuid`。
3. 归属一致性策略  
   - 默认：以 `api_keys.user_id` 为准直接累加。
   - 可选严格模式：若请求传了 `userUuid` 且与 key 归属用户不一致，则返回 403。
4. 审计与可运维性  
   - 更新 `api_keys.last_used_at`。
   - 后续可在 `api_keys` 增加用途字段（如 `scope=token_usage_upload`）实现最小权限。

### 10.3 迁移策略（开发期已收敛）

- 当前开发期已直接收敛为“仅 API Key 鉴权上传”。
- 不再支持 `BELLDANDY_INTERNAL_TOKEN` 全局共享 token 模式。

### 10.4 配置说明（Belldandy 用户侧）

- `BELLDANDY_TOKEN_USAGE_UPLOAD_ENABLED=true`
- `BELLDANDY_TOKEN_USAGE_UPLOAD_URL=http://<office-host>/api/internal/token-usage`
- `BELLDANDY_TOKEN_USAGE_UPLOAD_APIKEY=<该用户自己的 office API Key 明文>`

说明：这里的 `TOKEN` 不再是全局共享内部 token，而是“该用户自己的 API Key”。

### 10.5 预期收益

- 每用户独立凭证、可单独吊销，安全性更高。
- 多实例并发上传时，归属更准确。
- 后续接入计费/配额体系更自然（可直接按 key 或 user 统计）。
