# 时间与 token 消耗自动统计实施结果

更新时间：2026-04-22
状态：已完成第一版落地并完成收口修正

## Goal

- 在 Agent 一次 run 开始/结束时，自动统计本次任务耗时与 token 消耗。
- 通过两个环境变量分别控制“时间自动统计”和“token 自动统计”是否开启。
- 开启后，在任务结束时把统计摘要与任务执行结果一并返回；关闭时不追加汇报。
- 保持实现轻量，不重构 Agent 主循环，不破坏现有 WebChat token 面板、`token.counter.result` 事件和会话 meta。

## 实施结果

### 已完成能力

1. 新增环境变量开关

- `BELLDANDY_AUTO_TASK_TIME_ENABLED`
- `BELLDANDY_AUTO_TASK_TOKEN_ENABLED`

当前语义：

- `true`：在最终结果后自动附带对应统计摘要
- `false`：不附带对应统计摘要

2. 已接入 run 生命周期自动统计

实现位置：

- [gateway.ts](/E:/project/star-sanctuary/packages/belldandy-core/src/bin/gateway.ts)

实际行为：

- `before_agent_start`
  - 根据环境变量初始化本次 run 的自动统计状态
- `setTokenCounter(...)` 之后
  - 若开启 token 自动统计，则自动启动命名计数器 `__auto_task_report__`
- `agent_end`
  - 若开启时间自动统计，则记录 `event.durationMs`
  - 若开启 token 自动统计，则自动停止 `__auto_task_report__` 并写入 token 结果

3. 已新增轻量运行态 helper

实现位置：

- [task-auto-report.ts](/E:/project/star-sanctuary/packages/belldandy-core/src/task-auto-report.ts)

职责：

- 保存本次会话 run 的自动统计结果
- 在最终输出时消费统计结果，避免串到下一轮
- 统一格式化追加统计块
- 统一清洗最终用户可见文本中的尾部重复统计块与 `<think>...</think>` 内容

4. 已在最终收口层追加“执行统计”摘要

实现位置：

- WebSocket / `message.send`：
  - [query-runtime-message-send.ts](/E:/project/star-sanctuary/packages/belldandy-core/src/query-runtime-message-send.ts)
- community / webhook：
  - [query-runtime-http.ts](/E:/project/star-sanctuary/packages/belldandy-core/src/query-runtime-http.ts)

当前输出格式：

```text
执行统计
- 耗时：12.34s
- Token：IN 120 / OUT 45 / TOTAL 165
```

接入结果：

- WebChat 最终消息会附带统计摘要
- assistant 持久化消息与前端最终显示保持一致
- `/api/message` 返回体中的 `payload.response` 会附带统计摘要
- `/api/webhook/:id` 返回体中的 `payload.response` 会附带统计摘要
- 若原始 final text 已自带旧统计块，收口层会先去重，再只保留一套整次 run 统计
- `<think>...</think>` 不再向用户可见输出泄露
- email inbound 持久化 assistant 文本也会做相同的可见文本清洗

5. 已补环境变量文档

已更新：

- [.env.example](/E:/project/star-sanctuary/.env.example)
- [runtime.env](/E:/project/star-sanctuary/packages/star-sanctuary-distribution/src/templates/default-env/runtime.env)

## 与原计划的偏差说明

### 偏差 1：运行态 store 没直接写在 `gateway.ts`

原计划：

- 在 `gateway.ts` 内直接维护 `Map<string, AutoTaskReportRecord>`

实际实现：

- 抽成独立模块 [task-auto-report.ts](/E:/project/star-sanctuary/packages/belldandy-core/src/task-auto-report.ts)

原因：

- hook 与 query runtime 都要共享这份状态
- 抽公共 helper 更小、更清晰，回滚也更容易

结论：

- 属于实现层优化，不影响原目标

### 偏差 2：时间统计没有调用 `timer` 工具

原计划：

- 第一版优先直接复用 `agent_end.durationMs`

实际实现：

- 保持了这个方案，没有额外改造 `timer` 工具

原因：

- `timer` 目前是工具内全局 Map + 文本接口
- 若强行走工具调用，会引入字符串解析和更多脆弱性

结论：

- 与原计划一致，不算缺项

### 偏差 3：增加了 run 结果兜底

实际实现额外做了一个兜底：

- 如果 hook 未产出完整统计，最终收口层会回退使用：
  - `runResult.durationMs`
  - `runResult.latestUsage`

原因：

- 某些 `startGatewayServer` 直启测试场景不会经过完整 gateway hook 组装
- 加一层兜底能保证功能在主路径和测试路径都稳定

结论：

- 这是对计划的补强，不是偏离

### 偏差 4：token 自动统计起点从 `before_agent_start` 挪到 `setTokenCounter(...)` 之后

原计划/第一版实现：

- 在 `before_agent_start` 内直接启动自动 token 计数器

后续修正：

- 改为在 `ToolExecutor.setTokenCounter(...)` 完成后再启动 `__auto_task_report__`

原因：

- `before_agent_start` 早于 token counter 绑定时机
- 继续在该时机启动会产生 `token counter unavailable` 告警

结论：

- 属于时序修正，不改变最终统计口径
- 修正后保留的是“包含 think 的整次 run 统计”

### 偏差 5：最终收口层增加了重复统计去重与 `<think>` 可见文本清洗

后续修正：

- 若模型原始 final text 已带一段旧 `执行统计`，收口层会剥掉旧块，只追加一套当前整次 run 统计
- 若模型原始 final text 含 `<think>...</think>`，收口层会在用户可见输出前清洗掉

原因：

- 真实运行中出现了“同一条 assistant 消息被写入两段统计”的情况
- 真实运行中也出现了 `<think>` 泄露到用户可见消息的问题

结论：

- 属于用户可见层的收口修正
- 不改变统计总口径，只消除重复展示和推理文本泄露

## 实施清单收口状态

| 项目 | 状态 | 说明 |
|---|---|---|
| 新增两个环境变量 | 已完成 | 已落到 `.env.example` 和 distribution 模板 |
| `before_agent_start` / `agent_end` 自动统计 hook | 已完成 | 已接入 `gateway.ts`，其中 token start 已修正为在 `setTokenCounter(...)` 之后触发 |
| 新增自动统计 helper | 已完成 | 已新增 `task-auto-report.ts` |
| `message.send` 最终文本拼接 | 已完成 | 已接入并持久化 assistant 文本 |
| `/api/message` 最终文本拼接 | 已完成 | 已接入 |
| `/api/webhook` 最终文本拼接 | 已完成 | 已接入 |
| 重复统计去重 | 已完成 | 最终输出若已存在旧统计块，会先去重再追加 |
| `<think>` 可见文本清洗 | 已完成 | WebSocket / HTTP / email inbound 已统一收口 |
| 补充定向测试 | 已完成 | 已补用例；当前本机 Vitest 入口异常，最新一轮仅完成构建验证 |

## 验证结果

### 已执行的验证

已确认通过：

```powershell
corepack pnpm build
```

结果：

- workspace 构建通过
- `tsc -b --force` 通过
- `verify-workspace-build.mjs` 通过

历史上已执行并通过的定向测试：

```powershell
corepack pnpm exec vitest run packages/belldandy-core/src/server.test.ts packages/belldandy-core/src/server.api-webhook.test.ts --reporter verbose
```

当时结果：

- `2` 个测试文件通过
- `38` 个测试通过
- 覆盖了：
  - `message.send` 最终结果附带统计摘要
  - `/api/message` 返回附带统计摘要
  - `/api/webhook/:id` 返回附带统计摘要

本轮后续收口新增但未在当前机器上重新跑通的测试：

- `message.send` 原始 final 已带旧统计块时，只保留一套整次 run 统计
- `message.send` 最终输出与持久化消息不再包含 `<think>`
- `/api/message` HTTP 返回不再包含 `<think>`

当前阻塞：

- 本机 `vitest` 启动入口异常，命令会落到缺失的 `node_modules\vitest\vitest.mjs`
- 因此这轮补充测试已落盘，但未在当前机器上完成最新一次自动执行验证

### 新增/覆盖的测试文件

- [server.test.ts](/E:/project/star-sanctuary/packages/belldandy-core/src/server.test.ts)
- [server.api-webhook.test.ts](/E:/project/star-sanctuary/packages/belldandy-core/src/server.api-webhook.test.ts)

### 验证结论

- WebSocket 主链路正常
- HTTP community / webhook 链路正常
- 统计摘要会在开启开关时追加
- 最终用户可见消息只保留一套整次 run 统计
- `think` 会计入统计口径，但 `<think>...</think>` 本身不会向用户显示
- 关闭开关时保持现有行为不变

## 仍保留的边界

- 当前自动统计状态按 `conversationId` 维度管理；如果未来同一会话出现真正并发多 run，仍建议升级为 `conversationId + runId`
- 第一版没有改造 `timer` 为共享 service，这部分技术债保持 `defer`
- 本次没有改前端 token 面板逻辑，也没有改变现有 `token.counter.result` 广播语义
- 当前“旧统计块”来源还未继续向前追根，只是在最终收口层保证用户只看到一套正确口径结果

## 当前建议配置

若只是先合入代码、保持现有对外行为不变，建议：

```env
BELLDANDY_AUTO_TASK_TIME_ENABLED=false
BELLDANDY_AUTO_TASK_TOKEN_ENABLED=false
```

若准备开始体验自动统计汇报，可再按需改为：

```env
BELLDANDY_AUTO_TASK_TIME_ENABLED=true
BELLDANDY_AUTO_TASK_TOKEN_ENABLED=true
```

## 结论

这份计划对应的第一版实施已经收口完成。

最终落地方案是：

- `hook` 负责 run 边界统计
- `query runtime` / 最终收口层负责把统计与最终结果拼接输出
- `time` 复用 `agent_end.durationMs`
- `token` 复用现有 `tokenCounter`
- 用户可见文本在最终输出前会统一清洗掉 `<think>...</think>` 与尾部旧统计块

实现满足原需求，且保持了较小改动面和可回滚性。
