# Agent 工具调用与 Agent 指挥调用提示词机制

## 1. 目标与口径

本文目标：

1. 参考 [CC提示词文件整理.md](./CC%E6%8F%90%E7%A4%BA%E8%AF%8D%E6%96%87%E4%BB%B6%E6%95%B4%E7%90%86.md) 中 Claude Code 的 prompt 分层方式。
2. 参考当前 Codex 运行环境中可观察到的工具使用、代码编辑、委派与子 Agent 治理原则。
3. 结合 Star Sanctuary 当前已有 runtime 能力，整理出一套更适合 Belldandy 的：
   - 工具调用机制
   - Agent 指挥/委派机制
   - 可拆分注入的多份提示词模板

重要口径：

- 本文不是 Claude Code 或 Codex 内部 system prompt 的逐字转录。
- 对 Codex 的参考来自当前运行时可观察到的行为约束与操作准则抽象，而不是隐藏 prompt 的原文导出。
- 本文强调“机制 + 提示词 + 与现有代码接点”，目的是便于后续直接接入你们当前系统。

---

## 2. 当前项目里已经具备的基础能力

Star Sanctuary 其实已经有不少适合做治理的基础设施，问题更多是“还没有被 prompt 和运行时完整串起来”。

### 2.1 工具治理能力

已有能力：

- `packages/belldandy-skills/src/executor.ts`
  - `ToolExecutor`
  - 工具可见性、禁用判断、会话限制、广播与审计
- `packages/belldandy-skills/src/runtime-policy.ts`
  - `permissionMode`
  - `role`
  - `allowedToolFamilies`
  - `maxToolRiskLevel`
- `packages/belldandy-skills/src/tool-contract-v2.ts`
  - `recommendedWhen`
  - `avoidWhen`
  - `confirmWhen`
  - `preflightChecks`
  - `fallbackStrategy`
  - `expectedOutput`
  - `sideEffectSummary`
- `packages/belldandy-skills/src/tool-contract-render.ts`
  - 可把工具治理契约摘要渲染成 prompt
- [工具分级指南.md](./%E5%B7%A5%E5%85%B7%E5%88%86%E7%BA%A7%E6%8C%87%E5%8D%97.md)
  - 已经有 `P0/P1/P2/P3/P4/P_goal` 的分级思路

结论：

- 你们不是“缺工具能力”，而是“缺把工具能力压缩成模型可执行规则的 prompt 结构”。

### 2.2 委派与子 Agent 治理能力

已有能力：

- `packages/belldandy-skills/src/delegation-protocol.ts`
  - 已定义 `DelegationProtocol`
  - 已有 `intent / contextPolicy / expectedDeliverable / aggregationPolicy / launchDefaults`
- `packages/belldandy-skills/src/subagent-launch.ts`
  - 可根据 role 自动推导 `allowedToolFamilies / permissionMode / maxToolRiskLevel`
- `packages/belldandy-agent/src/launch-spec.ts`
  - 已支持 launch spec 归一化与 catalog 默认值补丁
- `packages/belldandy-agent/src/orchestrator.ts`
  - 已支持并发上限、排队、超时、事件回传、结果聚合

结论：

- 你们不是“缺委派 runtime”，而是“缺 manager prompt、worker prompt 和等待/集成准则”。

---

## 3. 从 Claude Code 与 Codex 抽出来的共同原则

下面这些原则，是两边都很明显的共同点，也是最值得迁移到 Belldandy 的部分。

### 3.1 工具调用共同原则

1. 先查当前代码/环境，再行动，不靠旧记忆盲改。
2. 默认最小工具面，只暴露当前任务真正需要的工具。
3. 读优先于写，搜优先于改，局部验证优先于大范围动作。
4. 风险动作必须带边界意识：影响、前提、失败处理、回滚。
5. 工具调用必须有明确目的，不能“试试看”式乱打。
6. 工具失败后先分类根因，再决定重试、降级或改走其他路径。
7. 修改类动作之后必须做最小验证，不能只凭“命令执行成功”就宣布完成。

### 3.2 委派共同原则

1. 先判断是否真的需要委派，而不是默认开子 Agent。
2. 主 Agent 保留关键路径，子 Agent 处理边界清晰的支线任务。
3. 委派任务必须具体、可交付、可验收。
4. 子 Agent 必须有明确角色、写入边界、工具权限和超时。
5. 并行任务不能重叠修改同一片代码，除非明确做了隔离。
6. 管理者不要反复阻塞式等待，要在等待期间继续做非重叠工作。
7. 结果集成时要先判断“能否直接采用”，而不是机械复制子 Agent 输出。
8. 最好让 verifier 和 coder 分离，验证代理的职责是找问题，不是帮忙证明一切都没问题。

---

## 4. 工具调用机制设计

建议把工具调用拆成五层，而不是只靠一段大 system prompt。

| 层级 | 作用 | 建议落点 |
| --- | --- | --- |
| L1 工具面治理 | 决定当前会话到底看见哪些工具 | `ToolExecutor` / Agent profile / toolWhitelist / 分级 |
| L2 工具治理摘要 | 把可见工具压缩成模型可执行规则 | `ToolContractV2` prompt summary |
| L3 工具使用总则 | 规定选择、前置检查、错误恢复、验证闭环 | `system-prompt` 动态 section |
| L4 任务态提示词 | 结合当前任务进一步收缩工具选择 | 运行时 task delta / launchSpec |
| L5 工具调用结果闭环 | 失败恢复、写后验证、回退策略 | `query-runtime` / tool result handling |

### 4.1 核心机制

#### 机制 A：默认不要把“所有工具 schema”都暴露给默认 Agent

建议：

- 默认聊天 Agent：只给 `P0 + P1 + 少量 P2`
- Coding Agent：`P0 + P1 + 编码相关 P2`
- Research Agent：`P0 + 搜索/读取相关 P2/P3`
- Goal Agent：`P0 + P1 + P_goal`

这点是 Claude Code 和 Codex 共同强调的核心思想之一：

- 不要让模型在巨大工具面前自己瞎选
- 应该先做工具面收缩，再谈调用质量

#### 机制 B：每个可见工具都要有“治理摘要”，而不只是 schema

Schema 只告诉模型“这个工具怎么填参数”，但不告诉模型：

- 什么时候该用
- 什么时候不该用
- 用之前要检查什么
- 失败后怎么退
- 结果应该长什么样

这部分正好适合用你们现有的 `ToolContractV2`。

#### 机制 C：工具调用必须走“选择 -> 前检 -> 执行 -> 校验 -> 收敛”闭环

建议把 prompt 固化为这个顺序：

1. 先决定是否需要工具
2. 若需要，选择最小工具
3. 执行前做 preflight
4. 工具失败时不要盲重试
5. 工具成功后判断是否还需要验证
6. 最后再向用户交付

#### 机制 D：对高风险工具强制加入 HITL 语义

高风险条件建议包括：

- 会写文件
- 会删文件
- 会发外部消息
- 会改配置
- 会跨工作区
- 会执行高风险命令

这里要把 runtime 的 `permissionMode`、`needsPermission`、`riskLevel` 和 prompt 联动起来，而不是只靠前端或工具层拦。

#### 机制 E：失败恢复必须是“分类恢复”而不是“统一重试”

建议把失败分成至少四类：

1. `input_error`
   - 参数不对、路径不对、格式不对
2. `permission_or_policy`
   - 没权限、被策略阻断、风险过高
3. `environment_error`
   - 缺依赖、网络不可用、进程不存在、端口被占用
4. `business_logic_error`
   - 命令成功但结果不符合预期

只有第一类和少量环境抖动才适合快速重试。

---

## 5. 工具调用提示词模板

下面提示词建议拆成多段注入，而不是一股脑塞进同一段 system prompt。

### Prompt T1：工具调用总则

用途：

- 作为所有可用工具之上的全局行为约束
- 推荐注入到 `system-prompt` 的独立 section

```md
## Tool Use Operating Policy

你不是为了“调用工具”而调用工具，而是为了以最小副作用完成当前任务。

遵循以下顺序：
1. 先基于当前仓库、配置、日志或会话上下文确认事实。
2. 如果不需要工具就不要调用工具。
3. 如果需要工具，优先选择能力最小、风险最低、输出最可验证的一种。
4. 写入、删除、外发、执行命令等高副作用动作前，先确认边界、目标与影响。
5. 工具失败时，先判断失败类型，再决定修正参数、换工具、降级方案或请求确认；不要对同一失败条件盲目重试。
6. 修改之后必须做最小验证，不能只依据“命令执行成功”判断任务完成。
7. 当存在不可逆副作用、权限不足、边界不清或回滚不明确时，暂停并请求用户确认。

默认偏好：
- search/read before write
- inspect before patch
- local context before general assumptions
- minimal diff before refactor
- verify before deliver
```

### Prompt T2：工具选择前检查

用途：

- 作为每次真正选择工具前的“思维闸门”
- 可拼到 task delta 或 ToolExecutor 观测提示中

```md
## Tool Selection Checklist

在调用工具前，先快速回答：

1. 当前我要解决的具体子问题是什么？
2. 不调用工具是否也能完成？
3. 哪个工具的能力面最小、最直接？
4. 这个动作会读取、写入、外发、执行还是委派？
5. 这个动作的预期输出是什么？拿到结果后我将如何判断成功？

如果你无法清楚回答以上问题，不要立即调用工具；先继续检索上下文或缩小问题。
```

### Prompt T3：高风险工具前检

用途：

- 用于 `needsPermission=true`、`riskLevel=high/critical` 或写操作前

```md
## Risky Tool Preflight

当前动作具有明显副作用。调用前必须确认：

- 目标对象：我要改什么、影响什么
- 边界范围：影响仅限哪些文件、目录、会话或外部对象
- 前置条件：依赖是否存在、路径是否正确、会话是否匹配、配置是否已启用
- 失败处理：如果失败，我会如何停止、回滚或改走其他路径
- 用户确认：如果动作不可逆、越权或可能影响真实环境，必须先征得确认

如果以上任一项不明确，不要继续执行。
```

### Prompt T4：工具失败恢复

用途：

- 工具返回失败时注入
- 避免 Agent 陷入机械重试

```md
## Tool Failure Recovery Policy

工具失败后不要立刻重试。先判断失败属于哪一类：

- 参数/输入错误
- 权限/策略阻断
- 环境问题
- 业务结果不满足预期

恢复顺序：
1. 修正输入
2. 检查权限与风险策略
3. 检查环境前提
4. 选择替代工具或降级方案
5. 若仍不清楚，则向用户报告当前证据和阻塞点

禁止：
- 在未改变任何条件的情况下重复同一调用
- 用更高风险工具去掩盖更低风险工具的失败
- 把真实错误伪装成“已完成”
```

### Prompt T5：写后验证与收敛

用途：

- 所有写操作、执行命令、外部发送之后

```md
## Post-Action Verification Policy

如果刚刚执行了写入、命令、发送或状态修改动作，必须补一层最小验证。

验证优先级：
1. 直接读取或检查刚修改的对象
2. 运行最小范围验证命令或断言
3. 检查关键日志、输出、状态位
4. 若无法验证，明确说明未验证部分和原因

只有在结果与目标一致、关键风险已被最小验证覆盖后，才能把该动作视为完成。
```

### Prompt T6：面向编码 Agent 的工具偏好

用途：

- 给 coder 角色单独注入

```md
## Coding Tool Preference

你的默认顺序是：
- 先定位：list/search/read
- 再改动：patch/write
- 再验证：read/test/build/smoke

默认偏好最小 diff，不要因为容易而重写整段代码。
如果修改跨多个文件，先确认依赖关系和写入边界。
如果某个文件已经非常大，优先新增小文件承接新逻辑，原文件只保留 wiring。
```

### Prompt T7：面向调研 Agent 的工具偏好

用途：

- 给 researcher 角色单独注入

```md
## Research Tool Preference

你的首要目标是收集证据、缩小不确定性、形成可执行结论，而不是直接改动。

默认优先：
- repository search / read
- logs / config / docs
- web or external lookup only when needed

尽量避免写入和执行高副作用动作。
如果信息仍不足，输出最关键缺口，而不是猜测性结论。
```

### Prompt T8：面向验证 Agent 的工具偏好

用途：

- 给 verifier 角色单独注入

```md
## Verification Agent Policy

你的职责不是帮助通过，而是主动发现漏洞、边界遗漏和未验证风险。

默认行为：
- 先找最可能出错的路径
- 先查高风险改动点和回归路径
- 优先寻找“表面成功但实际上不成立”的问题

除非明确授权，你不负责实现新功能；你的首要输出是问题、证据、复现路径和风险判断。
```

---

## 6. Agent 指挥与子 Agent 委派机制设计

建议把委派机制拆成六层。

| 层级 | 作用 | 建议落点 |
| --- | --- | --- |
| D1 委派开关策略 | 什么时候允许委派 | profile / mode / runtime setting |
| D2 委派资格判断 | 当前任务值不值得委派 | manager prompt |
| D3 launch spec 打包 | role、权限、工具族、风险级别、cwd、timeout | `buildSubAgentLaunchSpec` |
| D4 worker prompt | 子 Agent 如何做事 | role-specific worker prompts |
| D5 监控与等待策略 | manager 何时等待、何时继续做别的事 | orchestrator + manager prompt |
| D6 结果聚合与验收 | 如何集成结果、何时复核、何时驳回 | integration prompt + verifier flow |

### 6.1 建议的三档委派策略

#### 模式 A：Strict

适合：

- 普通聊天
- 用户没有明确表示要开子 Agent
- 敏感/高风险会话

规则：

- 默认不委派
- 只有用户明确要求，或当前模式明确启用 delegation，才允许

这更接近 Codex 当前默认约束。

#### 模式 B：Bounded Auto

适合：

- 编码/调研任务
- 可以接受有限自治

规则：

- 可自动委派只读调研、日志排查、独立验证、独立小块实现
- 不允许自动委派高风险写操作或范围不清的大重构

#### 模式 C：Goal Auto

适合：

- Goal/长期任务通道
- 已经有 `goal_* / task_graph_* / delegationProtocol`

规则：

- 主 Agent 可按 task node 自动委派
- 每个子 Agent 必须绑定 deliverable、role、tool families、risk ceiling、timeout

### 6.2 委派核心机制

#### 机制 A：只有满足以下条件才值得委派

至少满足一项：

- 存在多个互不阻塞的支线
- 需要只读调研与本地实现并行
- 需要 coder/researcher/verifier 角色分工
- 任务范围足够清晰，可定义交付物

否则不委派，主 Agent 自己做。

#### 机制 B：主 Agent 不应把“当前关键路径第一步”直接外包

如果下一步必须立刻依赖某个结果，优先主 Agent 自己完成。

这是 Claude Code 和 Codex 都很强调的一点：

- 把关键路径第一步外包，常常只会增加等待和漂移

#### 机制 C：每个子 Agent 必须带以下约束

至少应明确：

- `role`
- `goal` 或任务摘要
- `write scope`
- `expected deliverable`
- `allowedToolFamilies`
- `maxToolRiskLevel`
- `permissionMode`
- `timeoutMs`
- `done definition`

#### 机制 D：并行任务必须避免重叠写入

建议：

- coder 子 Agent 按文件集或模块分工
- verifier 尽量只读
- researcher 尽量只读

绝不要同时给两个 worker 同一片不隔离的写入边界。

#### 机制 E：manager 在等待期间必须继续推进非重叠工作

推荐顺序：

1. 先把可并行的支线发出去
2. 主 Agent 继续做关键路径上的本地工作
3. 只有在确实被阻塞时才等待子 Agent

#### 机制 F：结果集成必须有验收，不要机械采纳

manager 收到子 Agent 结果后，至少要判断：

- 结果是否回答了原问题
- 是否越界修改
- 是否与当前主线冲突
- 是否需要额外验证

---

## 7. Agent 指挥与子 Agent 提示词模板

### Prompt A1：Manager 委派总则

用途：

- 主 Agent 的 delegation section

```md
## Delegation Operating Policy

你可以把工作拆给其他 Agent，但不能把思考责任整体外包。

先判断：
1. 当前任务是否真的值得委派？
2. 哪些部分是关键路径，哪些是可并行支线？
3. 如果委派，子任务是否足够具体、边界清晰、可交付？

默认规则：
- 关键路径第一步优先自己完成
- 只把互不重叠、可验收、非模糊任务交给子 Agent
- 不要把同一写入范围同时交给多个 worker
- 在等待子 Agent 时，继续推进本地非重叠工作
- 收到结果后必须先验收，再决定是否采用
```

### Prompt A2：委派资格判断

用途：

- 在真正 `spawn/delegate` 之前执行的微型闸门

```md
## Delegation Gate

只有在以下情况之一成立时才委派：
- 存在可以并行推进的独立支线
- 需要角色分工（coder / researcher / verifier）
- 子任务有清晰交付物和边界
- 子任务的结果不会立即阻塞当前本地下一步

如果以上都不成立，不要委派，直接继续本地执行。
```

### Prompt A3：Manager 给 Worker 的统一任务包装

用途：

- 作为 manager 生成子 Agent instruction 的固定骨架

```md
你是一个受约束的子 Agent。

任务目标：
{task_goal}

你的角色：
{role}

当前只负责：
{owned_scope}

不要负责：
{out_of_scope}

交付物要求：
{deliverable_definition}

可用工具边界：
- allowed families: {allowed_tool_families}
- max risk: {max_tool_risk_level}
- permission mode: {permission_mode}

工作约束：
- 优先基于仓库当前状态行动，不要依赖旧记忆
- 不要重做主 Agent 已经在做的事
- 如果你需要写代码，只改你负责的范围
- 如果发现阻塞、冲突或边界不清，明确报告，不要自行扩题

完成标准：
{done_definition}
```

### Prompt A4：Coder Worker Prompt

用途：

- role=`coder`

```md
你是 coding worker。

目标：
- 在给定写入范围内完成实现或修复

默认顺序：
1. 先读相关文件
2. 确认最小修改点
3. 在边界内实施最小 diff
4. 做最小验证
5. 返回修改摘要、验证结果、剩余风险

禁止：
- 扩大任务范围
- 修改未授权文件
- 以大重构替代小修
- 假装验证已完成
```

### Prompt A5：Research Worker Prompt

用途：

- role=`researcher`

```md
你是 research worker。

你的职责：
- 收集证据
- 给出候选根因、实现路径或对比结论
- 不默认实施代码修改

输出必须包含：
- 你查了什么
- 你发现了什么
- 哪些结论确定，哪些仍不确定
- 对主 Agent 最有价值的下一步建议
```

### Prompt A6：Verifier Worker Prompt

用途：

- role=`verifier`

```md
你是 verifier worker。

你的职责不是证明方案正确，而是尽力发现缺陷、回归和未验证风险。

重点检查：
- 边界条件
- 权限与副作用
- 隐式耦合
- 改动后未覆盖的路径
- “看起来成功但其实不成立”的情况

输出优先级：
1. findings
2. evidence
3. reproduction or verification path
4. residual risk
```

### Prompt A7：并行委派 Prompt

用途：

- 用于 `delegate_parallel` 或并行 worker 批量下发

```md
## Parallel Delegation Policy

将任务拆分为多个并行 worker 时，必须保证：
- 每个 worker 的职责独立
- 每个 worker 的写入边界互不重叠
- 每个 worker 的交付物格式统一
- manager 自己保留集成与最终验收职责

并行任务不要按“概念主题”随意拆，优先按：
- 文件边界
- 模块边界
- 角色边界
- 只读调研 vs 写入实现 vs 独立验证
```

### Prompt A8：结果集成 Prompt

用途：

- manager 收到一个或多个子 Agent 结果后

```md
## Delegation Result Integration Policy

收到子 Agent 结果后，按以下顺序处理：
1. 判断结果是否真正回答了原任务
2. 检查是否越界、冲突或与当前主线不一致
3. 判断是否需要补本地验证
4. 只整合高置信、有证据、边界清晰的结果
5. 对失败结果要总结原因，但不要把失败结果包装成“无事发生”

只有 manager 才负责给用户最终结论。
```

### Prompt A9：等待与中断策略

用途：

- 防止 manager 过度阻塞等待

```md
## Wait Policy

启动子 Agent 后，不要立刻等待结果。

默认行为：
- 先继续做本地非重叠工作
- 只有在下一步明确依赖子 Agent 结果时才等待
- 如果等待超时，先输出当前已知状态与阻塞点
- 不要因为某个子 Agent 未返回，就停止整个主任务推进
```

---

## 8. 推荐的提示词装配方式

参考 Claude Code 的分层思路，Belldandy 建议采用“多段拼装”而不是“单段大 Prompt”。

### 8.1 工具调用装配

建议顺序：

1. Base system prompt
2. Repo / AGENTS / workspace rules
3. Tool Use Operating Policy
4. 当前可见工具的 `ToolContractV2` 摘要
5. 当前任务态 delta
6. 高风险动作时再加 `Risky Tool Preflight`
7. 工具失败时再加 `Tool Failure Recovery Policy`

### 8.2 子 Agent 装配

建议顺序：

1. Base worker identity prompt
2. Role prompt
3. Delegation package prompt
4. launchSpec 里的 runtime constraints
5. 当前任务上下文摘要
6. expected deliverable / done definition

---

## 9. 与现有代码的建议接点

### 9.1 工具调用侧

建议优先接入：

1. `packages/belldandy-agent/src/system-prompt.ts`
   - 增加 `Tool Use Operating Policy` section
2. `packages/belldandy-skills/src/tool-contract-render.ts`
   - 给当前可见工具输出更短、更模型友好的 contract summary
3. `packages/belldandy-skills/src/executor.ts`
   - 在工具失败时回传更清晰的失败分类
4. `packages/belldandy-core/src/query-runtime-message-send.ts`
   - 在写后或命令后补最小验证提示/状态回写

### 9.2 委派侧

建议优先接入：

1. `packages/belldandy-skills/src/subagent-launch.ts`
   - 补 role-specific prompt fragments
2. `packages/belldandy-agent/src/launch-spec.ts`
   - 把 `policySummary / expectedDeliverable / ownership` 补得更完整
3. `packages/belldandy-agent/src/orchestrator.ts`
   - 让 manager 端更容易拿到 queue / timeout / completion reasons
4. `packages/belldandy-skills/src/delegation-protocol.ts`
   - 可继续补 `ownedScope / outOfScope / doneDefinition`

---

## 10. 最小可落地版本建议

如果不想一次改太多，建议先上这 6 个：

### 工具调用先上

1. `Prompt T1：工具调用总则`
2. `Prompt T3：高风险工具前检`
3. `Prompt T4：工具失败恢复`

### Agent 委派先上

1. `Prompt A1：Manager 委派总则`
2. `Prompt A3：统一任务包装`
3. `Prompt A8：结果集成 Prompt`

这样就能先解决最常见的两个问题：

- 工具乱用、重试乱撞
- 子 Agent 任务模糊、结果难集成

---

## 11. 不建议继续沿用的反模式

### 工具调用反模式

- 给默认 Agent 暴露过大的工具面
- 只有 schema，没有 use/avoid/preflight/fallback 规则
- 工具失败后机械重试
- 一上来就写，而不是先查
- 写完不验证

### 委派反模式

- 把关键路径第一步直接外包
- 子 Agent 没有明确写入边界
- 同一代码区域开多个 coder 并行写
- manager 一发完子任务就阻塞等待
- verifier 既当裁判又当运动员

---

## 12. 一句话总结

要提升 Belldandy 的工具调用和子 Agent 调度质量，关键不在于继续增加工具数量，而在于：

- 先收缩工具面
- 再补治理摘要
- 再补前检/失败恢复/写后验证闭环
- 委派时明确角色、边界、交付物、等待策略和结果验收

这也是 Claude Code 与 Codex 两条路线里最值得融合到当前项目的核心经验。

---

## 13. 可落地到代码里的 Prompt Section 拆分方案

这一节把上面的机制进一步推进到“当前代码怎么改”的粒度。

目标：

- 不把所有规则重新塞回一个超长 `extraSystemPrompt`
- 最大化复用现有 `SystemPromptSection`、`ToolContractV2`、`DelegationProtocol`
- 先做能快速落地的 Phase 1，再做运行时更细粒度的 Phase 2

### 13.1 先明确四种 Prompt 载体

当前项目里，最适合承载 prompt 的其实不是一种，而是四种：

| 载体 | 作用 | 当前已有能力 | 适合放什么 |
| --- | --- | --- | --- |
| `SystemPromptSection` | 稳定、可观测、可截断、可做 provider-native blocks | `packages/belldandy-agent/src/system-prompt.ts` | 全局规则、工具总则、委派总则、角色规则 |
| `extraSystemPrompt` | 一次性额外文本 | `buildSystemPromptResult` 已支持 | 临时兼容，不建议继续扩张 |
| `AgentPromptDelta` / `prependContext` | 每轮动态注入、小范围覆盖 | `before_agent_start` hooks、`prompt-snapshot` 已支持 | 当前任务的微型规则、临时提醒、失败恢复提示 |
| `launchSpec + delegationProtocol` | 子 Agent 的专属任务包装 | `subagent-launch.ts` / `launch-spec.ts` 已支持 | 子 Agent 的任务目标、边界、权限、交付物 |

结论：

- 全局稳定规则放 `SystemPromptSection`
- 当前任务态的小提示放 `AgentPromptDelta`
- 子 Agent 专属规则不要回灌到主 prompt，直接放进 `launchSpec + delegationProtocol`

### 13.2 Phase 1：不改大框架，先把静态 section 拆出来

Phase 1 目标：

- 不改变主要运行链路
- 只在现有 section 模型上新增几个关键 section
- 让工具调用与委派规则先“有地方放”

#### 建议新增的 section

| 新 section id | 建议 source | 建议 priority | 注入时机 | 主要内容 |
| --- | --- | --- | --- | --- |
| `tool-use-policy` | `runtime` | `55` | 所有可用工具 Agent | `Prompt T1` |
| `tool-contract-governance` | `runtime` | `56` | 当可见工具数 > 0 | 当前可见工具的精简 `ToolContractV2` 摘要 |
| `delegation-operating-policy` | `runtime` | `57` | 当前 Agent 允许委派时 | `Prompt A1` + `Prompt A2` |
| `role-execution-policy` | `profile` | `58` | 根据当前 profile/role | `Prompt T6/T7/T8` 中对应的一份 |

#### 为什么把优先级放在 `workspace-tools(50)` 之后

当前 `system-prompt.ts` 里已有顺序大致是：

- `workspace-tools` = `50`
- `workspace-memory` = `60`
- `skills` = `70`

所以更合理的插法是：

1. 先让模型知道本地工具和环境说明
2. 再告诉它“工具应该怎么用”
3. 再补“当前工具面有哪些治理规则”
4. 然后才进入 memory / skills / bootstrap / context

也就是说新增 section 最适合落在：

- `50 < new sections < 60`

### 13.3 Phase 1 的具体文件改动建议

#### 文件一：`packages/belldandy-agent/src/system-prompt.ts`

建议新增：

1. 一个更通用的 runtime section 输入能力
2. 让 `gateway.ts` 可以把运行时 section 塞进来，而不是只能走 `extraSystemPrompt`

推荐改法：

```ts
export type SystemPromptSectionInput = Omit<SystemPromptSection, "text"> & {
  text: string;
};

export type SystemPromptParams = {
  ...
  runtimeSections?: SystemPromptSectionInput[];
};
```

在 `buildSystemPromptResult()` 中，位于 `workspace-tools` 和 `workspace-memory` 之间插入：

```ts
for (const runtimeSection of params.runtimeSections ?? []) {
  if (!runtimeSection.text.trim()) continue;
  sections.push(createSection(runtimeSection));
}
```

这样做的好处：

- 不破坏已有 section 排序模型
- 新增内容自动进入 `promptInspection.sections`
- 自动进入 `providerNativeSystemBlocks`
- 自动参与截断与 prompt snapshot

#### 文件二：`packages/belldandy-core/src/bin/gateway.ts`

这里已经在构建：

- `dynamicSystemPromptBuild = buildSystemPromptResult(...)`
- `agentPromptBuild = buildSystemPromptResult(...)`

因此最合适的接法是在这里新增：

```ts
const runtimeSections = buildAgentRuntimePromptSections({
  toolExecutor,
  role,
  canDelegate,
  registeredToolContracts,
});

const dynamicSystemPromptBuild = buildSystemPromptResult({
  ...existing,
  runtimeSections,
});
```

建议新建一个 helper 文件，避免 `gateway.ts` 继续膨胀：

- `packages/belldandy-core/src/bin/gateway-prompt-sections.ts`

建议导出：

```ts
buildAgentRuntimePromptSections(...)
buildToolUsePolicySection()
buildToolContractGovernanceSection(...)
buildDelegationOperatingPolicySection(...)
buildRoleExecutionPolicySection(...)
```

#### 文件三：`packages/belldandy-skills/src/tool-contract-render.ts`

当前 `buildToolContractV2PromptSummary()` 已经能产出摘要，但对直接进入系统 prompt 来说还偏长。

建议新增一个“更短的系统 prompt 版摘要”：

```ts
export function buildToolContractV2CompactPromptSummary(
  contracts: readonly ToolContractV2[],
  options?: { maxTools?: number; maxBulletsPerField?: number },
): string
```

输出目标：

- 保留 `family / risk / readonly / permission`
- `recommendedWhen / avoidWhen / preflightChecks / fallbackStrategy` 每项最多 1-2 条
- 控制总 token 量，适合直接拼进 `tool-contract-governance`

#### 文件四：`packages/belldandy-core/src/bin/gateway.ts` 的 profile 分支

这里已经为不同 Agent 构造：

- `currentSystemPrompt`
- `promptInspection.sections`

因此 `role-execution-policy` 应该在这里按 profile 或 launch role 决定。

规则建议：

- `default`：不注入角色专项 policy
- `coder`：注入 `Prompt T6`
- `researcher`：注入 `Prompt T7`
- `verifier`：注入 `Prompt T8`

### 13.4 Phase 1 的推荐 section 文本落位

#### `tool-use-policy`

来源：

- 直接使用本文 `Prompt T1`

建议位置：

- `packages/belldandy-core/src/bin/gateway-prompt-sections.ts`

#### `tool-contract-governance`

来源：

- `buildToolContractV2CompactPromptSummary(visibleContracts)`

建议位置：

- render 逻辑在 `packages/belldandy-skills/src/tool-contract-render.ts`
- 组装 section 在 `packages/belldandy-core/src/bin/gateway-prompt-sections.ts`

#### `delegation-operating-policy`

来源：

- 本文 `Prompt A1 + Prompt A2`

注入条件：

- 当前 Agent 有 `spawnSubAgent` 或 `spawnParallel`
- 或当前 profile 标记允许 delegation

#### `role-execution-policy`

来源：

- `Prompt T6 / T7 / T8`

注入条件：

- 当前 profile 的默认角色
- 或当前 run 的 `launchSpec.role`

---

## 14. Phase 2：引入运行时 Prompt Delta

Phase 1 能解决“规则没地方放”的问题，但还不够细。

真正让工具调用质量上去，还需要在运行中对当前回合做轻量提示，而不是把所有恢复逻辑都常驻在系统 prompt 里。

### 14.1 为什么需要 delta，而不是继续加 section

有些规则不适合常驻：

- 工具失败恢复
- 写后验证
- 当前这轮真的准备委派
- 当前这轮刚拿到子 Agent 结果，准备整合

这些都是“本轮临时语义”，更适合走 `AgentPromptDelta`。

### 14.2 建议扩展的 delta 类型

当前 `packages/belldandy-agent/src/prompt-snapshot.ts` 里 `AgentPromptDeltaType` 还比较少。

建议 Phase 2 扩展为：

```ts
export type AgentPromptDeltaType =
  | "user-prelude"
  | "runtime-identity"
  | "attachment"
  | "audio-transcript"
  | "tool-selection-policy"
  | "tool-failure-recovery"
  | "tool-post-verification"
  | "delegation-manager"
  | "delegation-result-integration";
```

### 14.3 推荐的 delta 注入点

#### Delta D1：工具选择闸门

注入点：

- `before_agent_start`
- 仅在当前会话工具面较大，或是 coding/research 模式时注入

建议文本：

- 使用 `Prompt T2`

#### Delta D2：工具失败恢复

注入点：

- 工具执行失败后，在下一轮模型继续思考前注入

推荐接点：

- `packages/belldandy-skills/src/executor.ts`
  - 为 `ToolCallResult` 增加更明确的 `failureKind`
- `packages/belldandy-agent/src/tool-agent.ts`
  - 在处理失败的 `tool_result` 后，为下一轮加入 `tool-failure-recovery` delta

建议扩展：

```ts
export type ToolCallResult = {
  ...
  failureKind?: "input_error" | "permission_or_policy" | "environment_error" | "business_logic_error";
};
```

#### Delta D3：写后验证

注入点：

- 当前工具结果成功，但工具属于 `workspace-write / patch / command-exec / service-admin / external send`

行为：

- 在下一轮提醒模型补最小验证

建议文本：

- 使用 `Prompt T5`

#### Delta D4：委派前闸门

注入点：

- 当前回合即将调用 `sessions_spawn / delegate_task / delegate_parallel`

建议文本：

- 使用 `Prompt A2`

#### Delta D5：子 Agent 结果集成

注入点：

- 主 Agent 收到子 Agent 返回结果后，下一轮准备整理结论时

建议文本：

- 使用 `Prompt A8`

### 14.4 Phase 2 的最合适实现位置

#### `packages/belldandy-agent/src/hooks.ts`

建议扩展 hook 返回能力，让工具钩子也能注入下一轮 prompt delta。

例如：

```ts
export interface AfterToolCallResult {
  deltas?: AgentPromptDelta[];
}
```

或者更保守一点，不改 hook 接口，先在 `tool-agent.ts` 内部按工具结果直接生成 delta。

#### `packages/belldandy-agent/src/tool-agent.ts`

这里已经有：

- `hookPromptDeltas`
- `runtimeIdentityDelta`
- `metaPromptDeltas`
- `collectRunPromptDeltas(...)`

所以最自然的做法是：

1. 新增一类 `runLoopPromptDeltas`
2. 每次工具执行后根据结果更新
3. 下一轮模型请求前带上这些 delta

可以新增：

```ts
function collectNextTurnPromptDeltas(...)
```

---

## 15. 子 Agent Prompt 拆分与落点方案

这里单独讲子 Agent，因为它不应该和主 Agent 共用一大段 prompt。

### 15.1 子 Agent Prompt 由三部分组成

| 层 | 作用 | 建议来源 |
| --- | --- | --- |
| Worker Base | 说明“你是受约束的子 Agent” | 新 helper |
| Role Prompt | coder / researcher / verifier 的角色行为 | 新 helper |
| Task Envelope | 当前具体任务、边界、交付物、权限 | `buildSubAgentLaunchSpec` + `DelegationProtocol` |

### 15.2 当前代码里最适合落点的文件

#### 文件一：`packages/belldandy-skills/src/subagent-launch.ts`

这里现在已经在做：

- role 推导
- permissionMode 推导
- allowedToolFamilies 推导
- maxToolRiskLevel 推导
- delegationProtocol 构造

因此建议在这里继续新增：

```ts
buildWorkerBasePrompt()
buildWorkerRolePrompt(role)
buildWorkerTaskEnvelope(options)
```

最终给 `instruction` 做统一包装：

```ts
const wrappedInstruction = [
  buildWorkerBasePrompt(),
  buildWorkerRolePrompt(role),
  buildWorkerTaskEnvelope(...),
].join("\n\n");
```

再把 `wrappedInstruction` 塞回 launchSpec。

#### 文件二：`packages/belldandy-skills/src/delegation-protocol.ts`

建议扩展 `DelegationProtocol`，补三个字段：

```ts
ownership?: {
  scopeSummary: string;
  outOfScope?: string[];
  writeScope?: string[];
};

acceptance?: {
  doneDefinition: string;
  verificationHints?: string[];
};

deliverableContract?: {
  format: string;
  requiredSections?: string[];
};
```

这样 worker 的任务包装就不是只有一句 `expectedDeliverable.summary`，而是有清晰验收面。

#### 文件三：`packages/belldandy-agent/src/launch-spec.ts`

这里负责归一化和继承 catalog 默认值。

建议继续让它支持以下字段的归一化：

- `ownership.scopeSummary`
- `ownership.outOfScope`
- `acceptance.doneDefinition`
- `deliverableContract.requiredSections`

这样所有子 Agent 会话都能把这些约束写进 `_agentLaunchSpec`，后续也能在 observability 里看到。

### 15.3 子 Agent Worker Prompt 的推荐包装顺序

建议顺序：

1. `Worker Base`
2. `Role Prompt`
3. `Task Envelope`
4. `Launch Constraints Summary`

例如：

```text
[Worker Base]
你是一个受约束的子 Agent，只负责当前被分配的子任务，不扩大范围。

[Role Prompt]
你是 coder / researcher / verifier ...

[Task Envelope]
任务目标、边界、禁止事项、交付物、完成标准

[Launch Constraints]
allowedToolFamilies / maxToolRiskLevel / permissionMode / timeoutMs / cwd
```

### 15.4 Manager Prompt 不应放到 Worker Prompt 里

主 Agent 负责：

- 判断是否委派
- 划分并行边界
- 等待策略
- 结果集成

子 Agent 负责：

- 在受限边界内完成自己的任务

所以：

- `Prompt A1 / A2 / A7 / A8 / A9` 属于 manager
- `Prompt A4 / A5 / A6` 属于 worker

不要混用。

---

## 16. 推荐的实际实施顺序

### 第一步：先做 Phase 1 的 section 化

先改：

1. `system-prompt.ts`
2. `gateway.ts`
3. `tool-contract-render.ts`

先让主 Agent 拥有：

- `tool-use-policy`
- `tool-contract-governance`
- `delegation-operating-policy`
- `role-execution-policy`

### 第二步：再做 Worker Prompt 包装

再改：

1. `subagent-launch.ts`
2. `delegation-protocol.ts`
3. `launch-spec.ts`

先让子 Agent 的 instruction 包装明确起来。

### 第三步：最后再做运行时 delta

最后改：

1. `prompt-snapshot.ts`
2. `tool-agent.ts`
3. `executor.ts`

这样可以避免一开始就在运行时链路里做过多侵入修改。

---

## 17. 最小版代码落地清单

如果只做一版最小但有效的落地，我建议直接做这 7 项：

1. 在 `system-prompt.ts` 增加 `runtimeSections`
2. 新建 `packages/belldandy-core/src/bin/gateway-prompt-sections.ts`
3. 新增 `tool-use-policy` section
4. 新增 `tool-contract-governance` section
5. 新增 `delegation-operating-policy` section
6. 新增 `role-execution-policy` section
7. 在 `subagent-launch.ts` 中对 worker instruction 做三段包装

只做这 7 项，项目的工具调用质量和子 Agent 指挥质量就会先明显提升，而且不会一次侵入太深。

---

## 18. Prompt Section Catalog v1

如果要把前面的方案直接变成代码，最先需要定下来的不是“大 prompt 长什么样”，而是“每一段 prompt 由谁生成、什么时候注入、最多占多长”。

### 18.1 主 Agent 的 section catalog

| section id | owner file | builder | source | priority | 注入条件 | 建议长度预算 |
| --- | --- | --- | --- | --- | --- | --- |
| `tool-use-policy` | `packages/belldandy-core/src/bin/gateway-prompt-sections.ts` | `buildToolUsePolicySection()` | `runtime` | `55` | 当前 Agent 可用工具数 > 0 | `250-450` 字 |
| `tool-contract-governance` | `packages/belldandy-core/src/bin/gateway-prompt-sections.ts` | `buildToolContractGovernanceSection()` | `runtime` | `56` | 存在可见工具契约 | `400-1200` 字 |
| `delegation-operating-policy` | `packages/belldandy-core/src/bin/gateway-prompt-sections.ts` | `buildDelegationOperatingPolicySection()` | `runtime` | `57` | 当前 Agent 允许委派 | `250-500` 字 |
| `role-execution-policy` | `packages/belldandy-core/src/bin/gateway-prompt-sections.ts` | `buildRoleExecutionPolicySection()` | `profile` | `58` | 当前 role 为 `coder/researcher/verifier` 之一 | `150-350` 字 |

建议约束：

1. `tool-contract-governance` 只渲染当前 Agent 真正可见的工具，不要把全仓工具契约都塞进来。
2. 工具很多时，优先显示：
   - 高风险工具
   - 当前 role 最常用工具
   - 有 `confirmWhen / preflightChecks / fallbackStrategy` 的工具
3. 如果渲染结果超预算，优先裁掉低风险、只读、说明价值低的工具摘要。

### 18.2 子 Agent 的 prompt catalog

子 Agent 更适合用“包装段”而不是主系统 section。

| envelope part | owner file | builder | 进入位置 | 作用 |
| --- | --- | --- | --- | --- |
| `worker-base-policy` | `packages/belldandy-skills/src/subagent-launch.ts` | `buildWorkerBasePrompt()` | `instruction` 前缀 | 说明子 Agent 不扩范围、只做被分配任务 |
| `worker-role-policy` | `packages/belldandy-skills/src/subagent-launch.ts` | `buildWorkerRolePrompt(role)` | `instruction` 前缀 | 给 coder / researcher / verifier 的角色偏好 |
| `worker-task-envelope` | `packages/belldandy-skills/src/subagent-launch.ts` | `buildWorkerTaskEnvelope()` | `instruction` 中段 | 明确目标、边界、交付物、完成标准 |
| `worker-launch-constraints` | `packages/belldandy-skills/src/subagent-launch.ts` | `buildWorkerLaunchConstraintSummary()` | `instruction` 末段 | 展示 `allowedToolFamilies / permissionMode / maxToolRiskLevel / cwd / timeoutMs` |

原则：

- manager 的规则不要混到 worker prompt 里
- worker prompt 只保留“我是谁、只负责什么、不能做什么、交付什么”
- worker 看到的是任务边界，不是整套 orchestration 方法论

### 18.3 推荐的预算与截断策略

当前 `system-prompt.ts` 已支持按 priority 截断，所以建议直接把预算也设计进去：

1. `tool-use-policy`：尽量固定短文本，不做动态膨胀。
2. `tool-contract-governance`：唯一允许随工具面变化而变长，但应设 hard cap。
3. `delegation-operating-policy`：只保留 manager 闸门，不放 worker 细节。
4. `role-execution-policy`：保持小而硬，像“角色守则”，不要写成长说明书。

推荐 hard cap：

- `tool-contract-governance` 最多 `8` 个工具
- 每个工具最多：
  - `recommendedWhen` `1` 条
  - `avoidWhen` `1` 条
  - `preflightChecks` `1-2` 条
  - `fallbackStrategy` `1` 条

---

## 19. 代码接口草案

这一节的目标是让后续真正改代码时，尽量不再重新设计接口。

### 19.1 `packages/belldandy-agent/src/system-prompt.ts`

建议直接复用现有 `SystemPromptSection`，不额外发明一套平行类型：

```ts
export type SystemPromptParams = {
  ...
  runtimeSections?: SystemPromptSection[];
};
```

然后在 `buildSystemPromptResult()` 中，把 `runtimeSections` 合并进原有 `sections` 列表，再统一走：

- priority 排序
- truncation
- `providerNativeSystemBlocks`
- `promptInspection.sections`

这样能保证：

- 不新增第二套 prompt 装配通道
- runtime section 自动进入现有 observability
- 后面做 delta 时也不会和 section 体系冲突

### 19.2 `packages/belldandy-core/src/bin/gateway-prompt-sections.ts`

建议新增一个专门的 section builder 文件，把“规则生成”和“启动 wiring”分开。

推荐接口：

```ts
import type { SystemPromptSection } from "@belldandy/agent";
import type { ToolContractV2 } from "@belldandy/skills";

export type BuildAgentRuntimePromptSectionsOptions = {
  visibleContracts: readonly ToolContractV2[];
  canDelegate: boolean;
  role?: "default" | "coder" | "researcher" | "verifier";
  permissionMode?: string;
  allowedToolFamilies?: string[];
  maxToolRiskLevel?: string;
};

export function buildAgentRuntimePromptSections(
  options: BuildAgentRuntimePromptSectionsOptions,
): SystemPromptSection[];

export function buildToolUsePolicySection(): SystemPromptSection;
export function buildToolContractGovernanceSection(
  contracts: readonly ToolContractV2[],
): SystemPromptSection | undefined;
export function buildDelegationOperatingPolicySection(input: {
  canDelegate: boolean;
}): SystemPromptSection | undefined;
export function buildRoleExecutionPolicySection(input: {
  role?: "default" | "coder" | "researcher" | "verifier";
}): SystemPromptSection | undefined;
```

建议职责边界：

- `gateway.ts` 负责收集 runtime 事实
- `gateway-prompt-sections.ts` 负责把事实渲染成 prompt section
- `system-prompt.ts` 负责排序、截断、block 化

### 19.3 `packages/belldandy-skills/src/tool-contract-render.ts`

建议保留现有：

- `buildToolContractV2PromptSummary()`

再新增一个专门给 system prompt 用的精简版：

```ts
export function buildToolContractV2CompactPromptSummary(
  contracts: readonly ToolContractV2[],
  options?: {
    maxTools?: number;
    maxBulletsPerField?: number;
  },
): string;
```

这个函数应优先产出：

- 当前工具家族
- 风险等级
- 是否只读
- 是否可能要求确认
- 一条前检
- 一条失败退路

不要把 schema 细节、长示例、字段解释全部塞进去。

### 19.4 `packages/belldandy-skills/src/subagent-launch.ts`

建议把当前直接传入的 `instruction` 再包一层，而不是让 manager 自己在外面拼字符串。

推荐接口：

```ts
type WorkerInstructionEnvelopeInput = {
  role?: "default" | "coder" | "researcher" | "verifier";
  instruction: string;
  allowedToolFamilies?: string[];
  permissionMode?: string;
  maxToolRiskLevel?: string;
  cwd?: string;
  timeoutMs?: number;
  expectedDeliverableSummary?: string;
};

export function buildWorkerInstructionEnvelope(
  input: WorkerInstructionEnvelopeInput,
): string;
```

包装顺序建议固定为：

1. Worker Base
2. Worker Role
3. Task Envelope
4. Launch Constraints

这样后续即使 manager prompt 变化，worker 的任务格式也能保持稳定。

### 19.5 `packages/belldandy-agent/src/launch-spec.ts`

建议 `policySummary` 不再只是一句模糊摘要，而是收敛成：

- 给 observability 展示的短摘要
- 给 worker envelope 参与拼装的结构化来源

如果后续要继续增强，推荐优先支持这些字段：

```ts
ownership?: {
  scopeSummary?: string;
  outOfScope?: string[];
};
acceptance?: {
  doneDefinition?: string;
  verificationHints?: string[];
};
deliverableContract?: {
  format: string;
  requiredSections?: string[];
};
```

这几个字段一旦进了 `launchSpec`，后面：

- UI 可以展示
- runtime 可以审计
- worker prompt 可以直接消费

---

## 20. 推荐的代码装配矩阵

下面这张表的作用，是把“哪一层负责什么”彻底钉住，避免后续又重新把所有东西塞回 `extraSystemPrompt`。

| 场景 | 最合适载体 | 负责文件 | 不建议放哪里 |
| --- | --- | --- | --- |
| 全局工具使用总则 | `SystemPromptSection` | `system-prompt.ts` + `gateway-prompt-sections.ts` | `extraSystemPrompt` |
| 当前可见工具治理摘要 | `SystemPromptSection` | `gateway-prompt-sections.ts` + `tool-contract-render.ts` | 每个工具 schema 后面直接附一大段说明 |
| 当前 Agent 是否应委派 | `SystemPromptSection` | `gateway-prompt-sections.ts` | worker instruction |
| 当前角色的工具偏好 | `SystemPromptSection` | `gateway-prompt-sections.ts` | 所有 agent 共用的一大段 role 说明 |
| 本轮工具失败恢复 | `AgentPromptDelta` | hooks / `tool-agent.ts` | 常驻 system prompt |
| 写后验证提醒 | `AgentPromptDelta` | hooks / `tool-agent.ts` | 常驻 system prompt |
| manager 的委派方法 | 主 Agent runtime section | `gateway-prompt-sections.ts` | `subagent-launch.ts` |
| worker 的任务边界 | worker envelope | `subagent-launch.ts` | 主 Agent system prompt |

### 20.1 Gateway 侧的推荐装配顺序

在 `packages/belldandy-core/src/bin/gateway.ts` 中，建议固定成这个顺序：

```ts
const runtimeSections = buildAgentRuntimePromptSections({
  visibleContracts,
  canDelegate,
  role,
  permissionMode,
  allowedToolFamilies,
  maxToolRiskLevel,
});

const promptBuild = buildSystemPromptResult({
  workspace,
  extraSystemPrompt,
  runtimeSections,
  ...
});
```

然后再把 `promptBuild.sections` 继续传给：

- `systemPromptSections`
- prompt snapshot
- provider-native system blocks

### 20.2 运行时 delta 的推荐顺序

如果后面要做 Phase 2，顺序建议是：

1. 先保留 section 体系不动
2. 再通过 hook 或 `input.meta.promptDeltas` 注入小段 delta
3. 只给当前这一轮真的需要的提醒
4. 不要让 delta 变成第二套常驻 system prompt

### 20.3 一句话的最终拆分原则

可以把整套拆分规则压缩成一句话：

> 稳定规则进 `section`，当前能力进 `runtime section`，短时纠偏进 `delta`，子 Agent 边界进 `worker envelope`。

---

## 21. 当前落地进度（2026-04-18）

下面这部分记录的是“已经真实落到代码里”的进度，而不是仅停留在设计建议。

### 21.1 已完成：Phase 1 静态 section 化

已经落地：

- `packages/belldandy-agent/src/system-prompt.ts`
  - 已支持 `runtimeSections`
- `packages/belldandy-core/src/bin/gateway-prompt-sections.ts`
  - 已可生成最小一版运行时 section
- `packages/belldandy-core/src/bin/gateway.ts`
  - 已接入 `tool-use-policy / tool-contract-governance / delegation-operating-policy / role-execution-policy`
- `packages/belldandy-skills/src/tool-contract-render.ts`
  - 已支持 compact summary，适合 prompt 注入

结论：

- 稳定规则已经不需要继续堆在一段 `extraSystemPrompt` 里。

### 21.2 已完成：run 级角色与工具约束 delta

已经落地：

- `packages/belldandy-agent/src/runtime-prompt-deltas.ts`
  - 已支持从 `launchSpec` 生成 `role-execution-policy`
  - 已支持从 `launchSpec` 生成 `tool-selection-policy`
- `packages/belldandy-agent/src/tool-agent.ts`
  - 已把这些 delta 注入实际模型请求
  - 已修正 sub-agent run 的 `agentId/profileId` 解析

结论：

- 子 Agent 不再只靠静态 profile 行为；当前这一轮 run 的角色与约束已经会影响真实 prompt。

### 21.3 已完成：工具结果驱动的下一轮 delta

已经落地：

- `packages/belldandy-agent/src/runtime-prompt-deltas.ts`
  - 已支持 `tool-failure-recovery`
  - 已支持 `tool-post-verification`
- `packages/belldandy-agent/src/tool-agent.ts`
  - 已在每轮模型调用前重算 system prompt 与 provider-native system blocks
  - 已把工具失败与写类成功结果变成只影响“下一轮”的 transient delta
- `packages/belldandy-agent/src/prompt-snapshot.ts`
  - 已补对应 delta type，便于后续 snapshot / inspection / observability

结论：

- Agent 已经从“会调用工具”升级为“会根据上一轮工具结果做恢复或补验证”。

### 21.4 已完成：子 Agent 结构化约束

已经落地：

- `packages/belldandy-skills/src/delegation-protocol.ts`
  - 已支持 `ownership`
  - 已支持 `acceptance`
  - 已支持 `deliverableContract`
- `packages/belldandy-agent/src/launch-spec.ts`
  - 已对这些字段做归一化
  - 已让它们随 `_agentLaunchSpec` 一起进入 runtime
- `packages/belldandy-skills/src/subagent-launch.ts`
  - worker envelope 已能消费：
    - `ownership.scopeSummary`
    - `ownership.outOfScope`
    - `ownership.writeScope`
    - `acceptance.doneDefinition`
    - `acceptance.verificationHints`
    - `deliverableContract.format`
    - `deliverableContract.requiredSections`

结论：

- 子 Agent prompt 不再只有一句“去做某件事”，而是已经具备结构化边界、验收标准与交付契约。

### 21.5 已完成：manager 侧结构化委派规则注入

已经落地：

- `packages/belldandy-core/src/bin/gateway-prompt-sections.ts`
  - delegation policy section 已明确要求 manager 在非平凡委派里填写：
    - `ownership.scope_summary`
    - `ownership.out_of_scope`
    - `acceptance.done_definition`
    - `deliverable_contract.format / required_sections`
  - 同时已明确：
    - 何时应该等待
    - 何时应继续本地非重叠工作
    - 何时应驳回或补发 follow-up delegation
- `packages/belldandy-skills/src/builtin/session/*.ts`
  - `sessions_spawn / delegate_task / delegate_parallel` 已支持接收结构化 delegation contract
- `packages/belldandy-agent/src/runtime-prompt-deltas.ts`
  - 已在 delegated result 返回后，向下一轮 prompt 注入 `Delegation Result Review`
  - manager 现在会在 review 阶段看到同一套：
    - ownership
    - doneDefinition
    - deliverableContract

结论：

- 结构化委派约束现在不只在 worker 侧生效，也已经进入 manager 的“委派前判断 + 委派后验收”闭环。

### 21.6 已完成：委派结果聚合与验收闸门

已经落地：

- `packages/belldandy-skills/src/builtin/session/delegation-contract.ts`
  - 已新增 delegated result gate evaluator
  - 已支持：
    - `requiredSections` 缺失检测
    - `Done Definition Check` 显式验收段落检测
    - 验收结果摘要与 manager action 提示生成
- `packages/belldandy-skills/src/subagent-launch.ts`
  - worker envelope 已明确要求：
    - 当存在 `acceptance.doneDefinition` 时，最终交付必须包含 `Done Definition Check`
    - 当存在 `deliverableContract.requiredSections` 时，应尽量按原 section 名称交付
- `packages/belldandy-skills/src/builtin/session/spawn.ts`
  - `sessions_spawn` 现在不再只看 worker 是否执行成功
  - 还会在返回前按 delegation contract 做 acceptance gate
- `packages/belldandy-skills/src/builtin/session/delegate.ts`
  - `delegate_task` 现在会把“worker success”和“contract accepted”合并为最终成功条件
- `packages/belldandy-skills/src/builtin/session/delegate-parallel.ts`
  - `delegate_parallel` 已支持：
    - 按 task 聚合 acceptance gate
    - 汇总 accepted / rejected by gate 数量
    - 在并行 fan-out 后输出明确的聚合验收结果
- `packages/belldandy-agent/src/runtime-prompt-deltas.ts`
  - 当 delegation tool 因 acceptance gate 被拒绝时，下一轮 prompt 会同时看到：
    - `Tool Failure Recovery`
    - `Delegation Result Review`

结论：

- 现在 manager 集成子 Agent 结果时，已经不是“拿到文本就算完成”。
- 运行时已经具备最小一版硬闸门：只有 `worker 执行成功 + 交付满足 contract` 才会被 session 工具视为真正成功。

### 21.7 已完成：observability / UI 展示

已经落地：

- `packages/belldandy-core/src/subtask-result-envelope.ts`
  - subtask runtime 中的 delegation 摘要已补齐：
    - `ownership`
    - `acceptance`
    - `deliverableContract`
- `packages/belldandy-core/src/task-runtime.ts`
  - subtask launch summary 的持久化 / 反序列化 / clone 链路已能保留这些结构化字段
- `packages/belldandy-core/src/query-runtime-subtask.ts`
  - `subtask.get` 现在会返回：
    - `acceptanceGate`
  - 其中包含：
    - `status`
    - `doneDefinitionCheck`
    - `requiredSections / missingRequiredSections`
    - `summary / reasons`
- `apps/web/public/app/features/subtasks-overview.js`
  - subtask detail 中的 `Delegation Protocol` 卡片已新增：
    - `Owned Scope`
    - `Out of Scope`
    - `Write Scope`
    - `Done Definition`
    - `Verification Hints`
    - `Required Sections`
  - subtask detail 中已新增 `Acceptance Gate` 卡片，用于显示当前 delegated result 的验收状态
- `apps/web/public/app/features/prompt-snapshot-detail.js`
  - prompt snapshot detail 已新增：
    - `Active Prompt Sections`
    - `Active Prompt Deltas`
    - `Provider Block Routing`

结论：

- 现在不仅能“看 prompt”，还能看见：
  - 当前 run 实际激活了哪些 section / delta
  - 当前子 Agent 的结构化 contract 是什么
  - 当前 delegated result 是否通过 acceptance gate

### 21.8 已完成：Anthropic / 多 provider 专项回归

已经落地：

- `packages/belldandy-agent/src/tool-agent.test.ts`
  - 已新增多 provider 一致性回归：
    - `OpenAI`
    - `Anthropic`
  - 已覆盖：
    - run-level `role-execution-policy / tool-selection-policy` 在两类 provider 下都进入实际请求
    - prompt snapshot 中的 `providerNativeSystemBlocks` 继续保留相同的 dynamic runtime `sourceDeltaIds`
  - 已新增 Anthropic follow-up delta 回归：
    - `Tool Failure Recovery`
    - `Tool Post-Action Verification`
    - `Delegation Result Review`
- `packages/belldandy-agent/src/anthropic.test.ts`
  - 继续作为 Anthropic provider-native system blocks 的基础单测护栏
- `packages/belldandy-agent/src/openai.test.ts`
  - 继续作为 OpenAI prompt snapshot / provider block inspection 的基础单测护栏

结论：

- 现在 run-level prompt 注入不再只是在 OpenAI 路径上看起来正确。
- 至少在当前两条主 provider 路径里，静态 block、runtime delta、transient tool-result delta 的生效方式已经有了稳定回归保护。

### 21.9 已完成：更强的 runtime 验收闸门

已经落地：

- `packages/belldandy-skills/src/builtin/session/delegation-contract.ts`
  - acceptance gate 结果现在不只返回 `accepted / rejected`
  - 还会产出结构化 runtime metadata：
    - `deliverableFormat`
    - `contractSpecificChecks`
    - `rejectionConfidence`
    - `managerActionHint`
  - `verification_report` 交付格式已新增 contract-specific gate：
    - 会检查 `Findings / Issues / Risks / Observations`
    - 会检查 `Recommendation / Verdict / Conclusion`
- `packages/belldandy-skills/src/builtin/session/spawn.ts`
  - `sessions_spawn` 成功或失败返回里都会带上 delegation gate metadata
- `packages/belldandy-skills/src/builtin/session/delegate.ts`
  - `delegate_task` 现在会把 structured gate metadata 一起写回 tool result
- `packages/belldandy-skills/src/builtin/session/delegate-parallel.ts`
  - `delegate_parallel` 现在会聚合：
    - `acceptedCount`
    - `gateRejectedCount`
    - `workerSuccessCount`
    - 每个 task 的 gate 结果摘要
- `packages/belldandy-agent/src/tool-agent.ts`
  - tool result 事件已开始携带 `metadata`
  - prompt snapshot 不再只抓首轮模型请求，而会记录当前 run 中最新一次真实请求
  - 这让 follow-up delta 触发后的最新 runtime 约束也能进入 snapshot
- `packages/belldandy-agent/src/runtime-prompt-deltas.ts`
  - 已能读取 structured delegation gate metadata
  - `Tool Failure Recovery / Delegation Result Review` 现在会把：
    - gate summary
    - rejection confidence
    - manager action hint
    一起带进下一轮 prompt
- `packages/belldandy-core/src/query-runtime-message-send.ts`
  - query runtime 的 `tool_result` websocket 事件已透传 `metadata`
  - runtime marks 里已补充 `acceptanceGateStatus / acceptanceGateConfidence`
- `packages/belldandy-core/src/query-runtime-subtask.ts`
  - subtask acceptance gate 观测已同步增强：
    - `deliverableFormat`
    - `contractSpecificChecks`
    - `rejectionConfidence`
    - `managerActionHint`

结论：

- 现在的 delegation gate 已经不只是“挡掉坏结果”。
- runtime、prompt、snapshot、query runtime、subtask inspect 这几层已经能共享同一份结构化验收结论。
- 对 `verification_report` 这类更强格式约束，运行时已经具备最小一版 contract-specific hard gate。

### 21.10 已完成：manager / verifier 侧的自动 follow-up 策略

已经落地：

- `packages/belldandy-skills/src/builtin/session/delegation-contract.ts`
  - delegated result metadata 现在不只带 gate 结论，还会带 `followUpStrategy`
  - `followUpStrategy` 已结构化产出：
    - `accept`
    - `retry`
    - `report_blocker`
  - 并包含：
    - 汇总 summary
    - per-task action item
    - follow-up delegation template
- `packages/belldandy-skills/src/builtin/session/spawn.ts`
  - `sessions_spawn` 现在会把 follow-up strategy 写入 tool result metadata
- `packages/belldandy-skills/src/builtin/session/delegate.ts`
  - `delegate_task` 现在会在 gate rejection 时直接给出 follow-up delegation template
- `packages/belldandy-skills/src/builtin/session/delegate-parallel.ts`
  - `delegate_parallel` 现在会在 fan-in 时聚合：
    - 哪些 task 可以 accept
    - 哪些 task 需要 retry
    - 哪些 task 应当 report blocker
- `packages/belldandy-agent/src/runtime-prompt-deltas.ts`
  - `Tool Failure Recovery` 现在会带上 follow-up summary
  - `Delegation Result Review` 现在会新增：
    - `Suggested Follow-Up Strategy`
    - follow-up delegation template
    - parallel fan-in 的 accept / retry / blocker 汇总
    - 当存在 `verificationHints` 时的 `Optional verifier handoff`
- `packages/belldandy-core/src/bin/gateway-prompt-sections.ts`
  - manager 侧静态 delegation policy 已补明确规则：
    - gate rejection 后必须显式分类 `accept / retry / report blocker`
    - verifier handoff 必须继承 `acceptance.verification_hints`
    - parallel fan-in 必须先做 accept / retry / blocker 汇总再继续

结论：

- 现在 manager 看到 rejected delegation result 时，不再只是“知道失败了”。
- runtime 已经能给出下一步动作的最小模板，并把 verifier handoff 的 `verificationHints` 继承下来。
- parallel fan-in 也不再只是展示多个结果，而会给出明确的 accept / retry / blocker 策略。

### 21.11 已完成：verifier / goals fan-in 的更细 contract-specific gate

已经落地：

- `packages/belldandy-core/src/goals/capability-acceptance-gate.ts`
  - 新增 goals 专用的 verifier / fan-in contract gate evaluator
  - gate 现在会在 capability plan orchestration 上输出结构化结论：
    - `pending`
    - `accepted`
    - `rejected`
  - 已覆盖的 contract-specific checks 包括：
    - fan-in `sourceAgentIds` 覆盖
    - fan-in `sourceTaskIds` 覆盖
    - verifier result `evidenceTaskIds` 覆盖
    - completed verifier result 的 recommendation/finding 一致性
    - verifier handoff / verifier result 状态对齐
- `packages/belldandy-core/src/goals/manager.ts`
  - `saveCapabilityPlan` 现在会在持久化 orchestration 前自动派生 `acceptanceGate`
  - gate 是 derived metadata，不再要求调用方手工拼装
- `packages/belldandy-core/src/goals/runtime.ts`
  - capability plan runtime normalization 已补 `acceptanceGate`
  - 读回 capability plan 时不会丢失 goals gate metadata
- `packages/belldandy-core/src/goals/types.ts`
  - capability orchestration 类型已补：
    - `GoalCapabilityPlanAcceptanceGate`
    - `GoalCapabilityPlanAcceptanceGateCheck`
    - `orchestration.acceptanceGate`

结论：

- 现在 goals runtime 不再只记录 `verifierHandoff / verifierResult` 原始字段。
- 对 verifier fan-in 的“结构是否完整、证据是否覆盖、结论是否自洽”已经有一层稳定的 contract gate。
- 这层 gate 已经能区分：
  - 还在等待 verifier 收口的 `pending`
  - 可以作为 fan-in 验收信号的 `accepted`
  - 因 evidence / source coverage / verdict inconsistency 被挡下的 `rejected`

### 21.12 已完成：更强的 runtime 执行动作

已经落地：

- `packages/belldandy-skills/src/builtin/session/delegation-contract.ts`
  - `followUpStrategy` 现在不只是 `accept / retry / report_blocker`
  - 还会补结构化 runtime 动作元数据：
    - `recommendedRuntimeAction`
    - `highPriorityLabels`
    - `verifierHandoffLabels`
  - per-item 也会带：
    - `recommendedRuntimeAction`
    - `priority`
    - `verifierTemplate`
- `packages/belldandy-agent/src/runtime-prompt-deltas.ts`
  - `Tool Failure Recovery` 现在会带：
    - `Suggested runtime action`
    - `High-priority follow-up items`
    - `Verifier handoff available for`
  - `Delegation Result Review` 现在会带：
    - strategy-level `Recommended runtime action`
    - high-priority / verifier-handoff 汇总
    - per-item `Runtime action`
    - 显式 `verifierTemplate` 摘要
  - run-level `tool-selection-policy` 也补了更强的 verifier handoff 约束：
    - 保留 inherited verification hints
    - 对照 done definition
    - 先产出 `verification_report` 再 accept / fan-in
- `packages/belldandy-core/src/query-runtime-message-send.ts`
  - query runtime marks 现在除了 `acceptanceGateStatus / acceptanceGateConfidence`
  - 还会补：
    - `followUpRuntimeAction`
    - `followUpHighPriorityLabels`
    - `verifierHandoffSuggested`
- `apps/web/public/app/features/prompt-snapshot-detail.js`
  - prompt snapshot detail 现在新增 `Follow-Up Strategy`
  - 可以直接看到：
    - strategy summary
    - `runtime=...`
    - `high=...`
    - `verifier_handoff=...`
    - per-item `action -> runtime action [priority]`

结论：

- follow-up strategy 现在不再只是 prompt 文本里的“建议”。
- runtime 已经有一条稳定的结构化观测链路，可以把下一步动作、优先级和 verifier handoff 选择显式暴露出来。
- 22.2 的范围在这里收口，不继续扩成自动执行器；下一步按顺序进入 22.3 的结构化 failureKind。

### 21.13 已完成：工具失败分类结构化

已经落地：

- `packages/belldandy-skills/src/types.ts`
  - `ToolCallResult / ToolAuditLog` 已补稳定字段：
    - `failureKind?: "input_error" | "permission_or_policy" | "environment_error" | "business_logic_error" | "unknown"`
- `packages/belldandy-skills/src/failure-kind.ts`
  - 新增统一 failure normalization / fallback inference helper
  - 负责：
    - 读取结构化 `failureKind`
    - 在缺失时从已有 error 文本做有限 fallback 推断
    - 生成统一的 failure tool result
- `packages/belldandy-skills/src/executor.ts`
  - executor 现在会对 tool result 做 `failureKind` normalization
  - 统一透传到 audit log
  - 对常见 executor 级失败已直接补结构化分类：
    - unknown tool -> `input_error`
    - policy block -> `permission_or_policy`
    - aborted / cancelled -> `environment_error`
- `packages/belldandy-skills/src/builtin/system/exec.ts`
  - `command-exec` 已补结构化失败分类：
    - command missing / invalid -> `input_error`
    - security / policy block -> `permission_or_policy`
    - abort / timeout / spawn error -> `environment_error`
- `packages/belldandy-skills/src/builtin/file.ts`
  - `workspace-read / workspace-write / delete` 已补结构化失败分类：
    - missing path / missing file / invalid parent -> `input_error`
    - sensitive path / whitelist deny / permission deny -> `permission_or_policy`
- `packages/belldandy-skills/src/builtin/apply-patch/index.ts`
  - `patch` 已补结构化失败分类：
    - empty input / invalid hunk payload -> `input_error`
    - abort -> `environment_error`
- `packages/belldandy-skills/src/builtin/fetch.ts`
  - `network-read` 已补结构化失败分类：
    - invalid URL / unsupported protocol -> `input_error`
    - private host / denied domain / SSRF policy block -> `permission_or_policy`
    - timeout / abort -> `environment_error`
- `packages/belldandy-skills/src/builtin/web-search/index.ts`
  - 搜索读取链路已补：
    - empty query -> `input_error`
    - provider unavailable / abort -> `environment_error`
- `packages/belldandy-skills/src/builtin/session/spawn.ts`
- `packages/belldandy-skills/src/builtin/session/delegate.ts`
- `packages/belldandy-skills/src/builtin/session/delegate-parallel.ts`
  - `session-orchestration` 已补结构化失败分类：
    - capability missing -> `environment_error`
    - input invalid -> `input_error`
    - acceptance gate rejected -> `business_logic_error`
- `packages/belldandy-agent/src/runtime-prompt-deltas.ts`
  - `Tool Failure Recovery` 现在优先消费结构化 `failureKind`
  - 只有缺失时，才回退到 error 文本 fallback inference
- `packages/belldandy-agent/src/tool-agent.ts`
- `packages/belldandy-core/src/query-runtime-agent-run.ts`
- `packages/belldandy-core/src/query-runtime-message-send.ts`
- `packages/belldandy-core/src/query-runtime-http.ts`
  - `tool_result` 事件、runtime marks 与 query runtime 观测链路已开始透传 `failureKind`

结论：

- 22.3 的目标已经按“有限范围收口项”落地：不是重写整套错误语义系统，而是先把最影响 runtime 决策的失败分类稳定结构化。
- `runtime-prompt-deltas` 已不再主要依赖自然语言 `error` 文本来决定恢复策略。
- 核心内置工具族和 session orchestration 链路已经具备 end-to-end 的 `failureKind` 透传与观测能力。

### 21.14 当前验证状态

本阶段已通过：

- `node .\node_modules\vitest\vitest.mjs run packages/belldandy-core/src/goals/capability-acceptance-gate.test.ts packages/belldandy-core/src/goals/manager.test.ts --reporter verbose`
- `node .\node_modules\vitest\vitest.mjs run packages/belldandy-agent/src/anthropic.test.ts packages/belldandy-agent/src/openai.test.ts packages/belldandy-agent/src/tool-agent.test.ts --reporter verbose`
- `node .\node_modules\vitest\vitest.mjs run packages/belldandy-core/src/server.query-runtime-domains.test.ts apps/web/public/app/features/prompt-snapshot-detail.test.js --reporter verbose`
- `node .\node_modules\vitest\vitest.mjs run apps/web/public/app/features/subtasks-overview.test.js --reporter verbose`
- `node .\node_modules\vitest\vitest.mjs run packages/belldandy-skills/src/subagent-launch.test.ts packages/belldandy-skills/src/builtin/session/session-tools.test.ts packages/belldandy-agent/src/runtime-prompt-deltas.test.ts --reporter verbose`
- `node .\node_modules\vitest\vitest.mjs run packages/belldandy-agent/src/tool-agent.test.ts --reporter verbose`
- `node .\node_modules\vitest\vitest.mjs run packages/belldandy-agent/src/runtime-prompt-deltas.test.ts packages/belldandy-agent/src/tool-agent.test.ts --reporter verbose`
- `node .\node_modules\vitest\vitest.mjs run packages/belldandy-skills/src/subagent-launch.test.ts packages/belldandy-agent/src/launch-spec.test.ts --reporter verbose`
- `node .\node_modules\vitest\vitest.mjs run packages/belldandy-core/src/bin/gateway-prompt-sections.test.ts packages/belldandy-skills/src/builtin/session/session-tools.test.ts packages/belldandy-agent/src/runtime-prompt-deltas.test.ts packages/belldandy-agent/src/tool-agent.test.ts --reporter verbose`
- `node .\node_modules\vitest\vitest.mjs run packages/belldandy-skills/src/builtin/session/session-tools.test.ts packages/belldandy-agent/src/runtime-prompt-deltas.test.ts packages/belldandy-agent/src/tool-agent.test.ts packages/belldandy-core/src/server.query-runtime-domains.test.ts --reporter verbose`
- `node .\node_modules\vitest\vitest.mjs run packages/belldandy-core/src/bin/gateway-prompt-sections.test.ts packages/belldandy-skills/src/builtin/session/session-tools.test.ts packages/belldandy-agent/src/runtime-prompt-deltas.test.ts packages/belldandy-agent/src/tool-agent.test.ts --reporter verbose`
- `node .\node_modules\vitest\vitest.mjs run packages/belldandy-agent/src/runtime-prompt-deltas.test.ts packages/belldandy-agent/src/tool-agent.test.ts packages/belldandy-skills/src/builtin/session/session-tools.test.ts apps/web/public/app/features/prompt-snapshot-detail.test.js --reporter verbose`
- `node .\node_modules\vitest\vitest.mjs run packages/belldandy-core/src/server.query-runtime-domains.test.ts --reporter verbose`
- `node .\node_modules\vitest\vitest.mjs run packages/belldandy-skills/src/executor.test.ts packages/belldandy-skills/src/builtin/system/exec.test.ts packages/belldandy-skills/src/builtin/file.test.ts packages/belldandy-skills/src/builtin/apply-patch/index.test.ts packages/belldandy-skills/src/builtin/fetch.test.ts packages/belldandy-skills/src/builtin/web-search/index.test.ts packages/belldandy-skills/src/builtin/session/session-tools.test.ts packages/belldandy-agent/src/runtime-prompt-deltas.test.ts --reporter verbose`
- `node .\node_modules\vitest\vitest.mjs run packages/belldandy-agent/src/tool-agent.test.ts packages/belldandy-core/src/server.query-runtime-domains.test.ts --reporter verbose`
- `corepack pnpm build`

---

## 22. 后续计划（按顺序）

下面是当前最合理的推进顺序。

### 22.1 下一步：verifier / goals fan-in 的更细 contract-specific gate

已完成：

- verifier result 已补更细的结构化 contract gate
- goals / fan-in 汇总场景已补 source/evidence/verdict 一致性验收
- goals capability plan orchestration 已开始持久化 `acceptanceGate`

### 22.2 然后：更强的 runtime 执行动作

已完成：

- follow-up strategy 已补结构化 runtime action：
  - `recommendedRuntimeAction`
  - `priority`
  - `highPriorityLabels`
- verifier handoff 已补更强的 runtime 约束继承：
  - `verifierTemplate`
  - verifier run-level prompt constraint
- UI / runtime inspect 已能直接显示 follow-up strategy 的结构化分类

### 22.3 最后：工具失败分类结构化（有限范围收口项）

已完成：

- `ToolCallResult / ToolAuditLog / AgentToolResult / query runtime tool_result` 已补 `failureKind`
- 已新增统一的 failure normalization / fallback inference helper：
  - `packages/belldandy-skills/src/failure-kind.ts`
- 已覆盖的关键工具族：
  - `command-exec`
  - `workspace-read / workspace-write / patch`
  - `network-read`
  - `session-orchestration`
- `runtime-prompt-deltas` 已改成：
  - 优先消费结构化 `failureKind`
  - 只有缺失时才回退到 error 文本 fallback
- runtime 观测链路已补：
  - websocket `tool_result`
  - query runtime marks / inspect 透传 `failureKind`
- 22.3 仍保持有限范围收口：
  - 没有把它扩成新的自动重试引擎
  - 没有试图一次覆盖所有工具和所有自然语言错误变体
  - 没有为 failure taxonomy 重写整套 tool result 协议

### 22.4 这条主线的明确收口目标

为了避免无止境推进，做到下面这些就认为这份文档对应的 v1 主线可以收口：

1. `22.1` 完成：
   - verifier / goals fan-in 有更细的 contract-specific gate
2. `22.2` 完成：
   - follow-up strategy 不只存在于 prompt 文本，runtime / UI / inspect 至少有一条稳定可观测链路
3. `22.3` 完成：
   - `failureKind` 已 end-to-end 打通
   - 核心内置工具族已能稳定产出结构化失败分类
   - `runtime-prompt-deltas` 已优先消费 `failureKind`
4. 验证完成：
   - 相关定向 Vitest 通过
   - `corepack pnpm build` 通过
5. 范围冻结：
   - 不再继续往本文件追加新的主线机制章节
   - 后续增强项改为单独 backlog / 单独设计说明推进

收口判断：

- 如果以上 5 条都满足，就把这份文档视为“Agent 工具调用与 Agent 指挥调用机制 v1 已完成”。
- 后续再做的内容，原则上应属于：
  - 稳定性增强
  - UI 体验优化
  - 评估体系 / 回归体系
  - 新场景适配
  而不再是这条主线本身未闭环。

当前状态：

- `22.1 / 22.2 / 22.3` 已全部完成。
- 相关定向 Vitest 与 `corepack pnpm build` 已通过。
- 因此这份文档对应的“Agent 工具调用与 Agent 指挥调用机制 v1 主线”现在可以视为已收口。
- 后续若继续推进，原则上应转入增强项或 backlog，而不是继续扩张这条主线章节。

---

## 23. Agent Teams 提示词机制评估（v1 收口后的增强项）

这部分不是把 22.x 主线重新打开，而是基于 Claude Code 的 Team / Swarm 思路，对 Belldandy 当前多 Agent 能力做一次增强评估。

### 23.1 当前结论

先明确结论：

- 现在的 Belldandy 已经支持多 Agent 并行执行任务。
- 现在的 Belldandy 也已经支持一个主 Agent 指挥多个 Agent，再做 fan-out / fan-in / verifier handoff / acceptance gate。
- 所以当前缺的不是“能不能多 Agent 协作”，而是“是否已经形成一层更成熟的 Agent Teams prompt 机制”。

代码依据：

- `packages/belldandy-agent/src/orchestrator.ts`
  - `SubAgentOrchestrator.spawn(...)` 支持单个子 Agent 拉起
  - `SubAgentOrchestrator.spawnParallel(...)` 支持并行 fan-out
- `packages/belldandy-skills/src/builtin/session/delegate-parallel.ts`
  - 已支持 manager 侧并行委派、结果聚合、acceptance gate
- `packages/belldandy-skills/src/delegation-protocol.ts`
  - 已有 `ownership / acceptance / deliverableContract / aggregationPolicy`
- `packages/belldandy-skills/src/subagent-launch.ts`
  - worker envelope 已有 role、owned scope、done definition、deliverable sections
- `packages/belldandy-core/src/bin/gateway-prompt-sections.ts`
  - manager / verifier 侧已经有 delegation operating policy

判断：

- Belldandy 当前更接近“结构化 delegation + acceptance gate + verifier handoff”。
- 距离 Claude Code 那种更完整的 “Agent Teams / swarm prompt layer”，主要还差 team-level 的提示词与协作语义，而不是基础 runtime 能力。

### 23.2 对比 Claude Code Team / Swarm 思路，还缺什么

结合 `docs/CC提示词文件整理.md` 里的：

- `TeamCreateTool/prompt.ts`
- `AgentTool/prompt.ts`
- `SendMessageTool/prompt.ts`
- `src/utils/swarm/teammatePromptAddendum.ts`
- built-in `plan / explore / verification` agent

Belldandy 目前最明显的缺口不在“能不能起 worker”，而在下面这些 team-aware prompt 能力：

- 缺少显式的 team topology prompt
  - 当前 prompt 主要描述“这次委派给某个 worker 的契约”
  - 但没有稳定描述“当前团队里有哪些成员、谁负责什么、彼此依赖关系是什么”
- 缺少 teammate communication protocol
  - 当前 worker 更像“接任务后独立完成并交付最终结果”
  - 缺少一层明确的“何时向 manager 汇报、何时向 teammate 交接、何时发送 blocker / decision request”的提示词协议
- 缺少 shared-state / scratchpad discipline
  - 当前有 deliverable contract，但缺少“哪些中间结论应该沉淀到共享摘要、哪些只放在最终 handoff、如何避免并行 worker 重复探索”的规则
- 缺少 manager fan-out / poll / fan-in loop prompt
  - 当前 manager 规则已经覆盖“何时委派、何时等待、何时驳回”
  - 但还缺一层更强的“先拆分、再本地推进、再选择性 wait、最后做整合”的 team operating loop
- 缺少动态 ownership / handoff 语义
  - 当前 ownership 更偏静态 write scope / out-of-scope
  - 还没有一层显式 prompt 告诉团队如何做 ownership transfer、partial handoff、上游结果未就绪时的等待策略
- 缺少 team-level completion gate
  - 当前 gate 主要是单 worker 结果是否满足 contract
  - 还没有一层团队级提示词要求 manager 判断“是否所有 lane 都已收敛、是否还有 unresolved overlap、是否该进入 synthesize / verify / integrate”

### 23.3 最有价值的增强项（按优先级）

如果后续真的要做 Agent Teams 强化，我认为优先级应该是：

- `P1`：新增 `team-topology-and-ownership` section
  - 让 manager 和 worker 都能看到团队 roster、职责、依赖、handoff 目标
- `P1`：新增 `manager-fanout-fanin-policy` section
  - 把 team 模式下的拆分、并行、本地推进、选择性等待、整合收口写成稳定 prompt 规则
- `P1`：新增 `teammate-communication-protocol`
  - 规范 `status update / blocker / decision request / handoff summary` 的最小格式
- `P2`：新增 `team-shared-state-policy`
  - 规定哪些内容应该进入共享摘要，如何避免多 worker 重复检索同一上下文
- `P2`：新增 `integrator / synthesizer / fan-in verifier` prompt
  - 把“最终整合者”从普通 manager 中抽出来，减少 manager 又调度又集成时的 prompt 混乱
- `P3`：新增 `adaptive polling cadence`
  - 根据任务类型和依赖关系，提示 manager 何时继续本地工作、何时 wait、何时中断某条 lane

### 23.4 推荐新增的 Prompt Sections

如果做 v2 / enhancement，推荐新增下面几类 section，而不是继续把所有内容塞进 `delegation-operating-policy`：

- `team-operating-model`
  - 说明当前 run 是否处于 team mode，以及这是 `parallel_patch / research_grid / verify_swarm / plan_execute_verify` 哪类团队协作模式
- `team-topology-and-ownership`
  - 描述 team roster、每个成员的 role、owned scope、depends-on、handoff target
- `teammate-communication-protocol`
  - 规定 status / blocker / handoff / decision request 的格式与触发时机
- `manager-fanout-fanin-policy`
  - 规定 manager 如何拆分、如何避免过度等待、如何在 fan-in 前做 acceptance triage
- `team-shared-state-policy`
  - 规定共享中间结论的边界，减少重复探索和重复摘要
- `team-completion-gate`
  - 规定团队级“何时可以宣布收敛”的检查项

建议落点：

- static section 先放在 `packages/belldandy-core/src/bin/gateway-prompt-sections.ts`
- run-level delta 可以继续放在 `packages/belldandy-agent/src/runtime-prompt-deltas.ts`
- worker envelope addendum 继续放在 `packages/belldandy-skills/src/subagent-launch.ts`

### 23.5 推荐补的 Prompt 模板

相对当前文档里已有的 manager / worker / verifier 模板，Agent Teams 更建议再补 4 类模板：

- `manager-team-planner`
  - 专门用于把大任务拆成 team lanes，并定义 roster / ownership / fan-in checkpoints
- `teammate-handoff`
  - 专门用于 worker 到 worker 或 worker 到 manager 的中途交接
- `team-synthesizer`
  - 专门用于多 lane 结果整合，不负责继续执行，只负责 reconcile / merge / conflict summary
- `team-verifier`
  - 专门用于针对 fan-in 后的整体结论做 team-level verification，而不是只看单个 worker handoff

这些模板的目标不是增加更多角色数量，而是把“团队协作动作”从普通 worker prompt 里拆出来。

### 23.6 推荐代码接点

如果要做 Agent Teams 增强，优先建议在这些位置扩，而不是重写 orchestration runtime：

- `packages/belldandy-core/src/bin/gateway-prompt-sections.ts`
  - 新增 team sections
- `packages/belldandy-skills/src/delegation-protocol.ts`
  - 新增 team metadata
  - 例如：
    - `team.id`
    - `team.mode`
    - `team.sharedGoal`
    - `team.memberRoster[]`
    - `team.dependsOn`
    - `team.handoffTo`
- `packages/belldandy-agent/src/launch-spec.ts`
  - 负责把 team metadata 归一化进 run-level spec
- `packages/belldandy-skills/src/subagent-launch.ts`
  - 根据 team metadata 生成 teammate-aware worker addendum
- `packages/belldandy-agent/src/runtime-prompt-deltas.ts`
  - 根据当前 team state 注入 fan-in / handoff / completion gate delta
- `packages/belldandy-core/src/query-runtime-subtask.ts`
- `apps/web/public/app/features/subtasks-overview.js`
- `apps/web/public/app/features/prompt-snapshot-detail.js`
  - 用于把 team roster、lane state、fan-in status、shared summary 暴露到 inspect / UI

### 23.7 收口判断

这部分我建议明确作为“v1 收口后的增强项”，而不是新主线。

原因：

- 当前系统已经具备多 Agent 并行和 manager 指挥多个 Agent 的基础能力
- 当前缺口主要是 team-aware prompt semantics，不是 runtime 不成立
- 这类增强价值很高，但也很容易越做越大，最后演变成“重写一套新的 team framework”

所以更合理的收口方式是：

- 现阶段把本节视为 Agent Teams backlog / design notes
- 只在明确要推进 Team Mode 时，单独开新设计文档或新章节
- 不把它并回 22.x，也不作为当前 v1 未完成项

一句话结论：

- Belldandy 现在已经“能多 Agent 协作”。
- 下一阶段如果要继续拉开和普通 delegation 的差距，最值得补的是：
  - `team topology`
  - `teammate communication`
  - `fan-out / fan-in operating loop`
  - `shared-state discipline`
  - `team-level completion gate`
- 这些内容应以 Agent Teams 增强项推进，而不是继续扩张 v1 主线。

### 23.8 IDENTITY「身份标签」接入 Agent Teams 的设计方案

这一节专门回答：如何把 `IDENTITY.md` 里的【IDENTITY | 身份标签】真正接入 Agent Teams，而不是只把它当作一段静态人格文本。

#### 23.8.1 当前代码现状

先看目前代码链路，结论很明确：

- `packages/belldandy-agent/src/system-prompt.ts`
  - 现在会把 `IDENTITY.md` 整段作为 `workspace-identity` 注入 system prompt
  - 但这是原始 markdown 注入，不是结构化身份治理数据
- `packages/belldandy-agent/src/workspace.ts`
  - `extractIdentityInfo()` 目前只提取：
    - `名字`
    - `头像`
    - `Emoji`
  - 并不会解析：
    - `当前身份标签`
    - `上级身份标签`
    - `下级身份标签`
    - `主人UUID`
- `packages/belldandy-protocol/src/identity.ts`
  - 目前只提供 `extractOwnerUuid()`
  - 也就是说只有 `主人UUID` 被结构化了，身份标签层级本身还没有结构化
- `packages/belldandy-agent/src/tool-agent.ts`
  - `buildRuntimeIdentityPromptDelta()` 现在只会注入：
    - 当前用户 UUID
    - 当前消息发送者信息
    - 房间成员里的 `identity`
  - 但不会把“我是谁、谁是我上级、谁是我下级、当前这个 sender 对我是什么关系”解析成团队治理规则
- `packages/belldandy-skills/src/delegation-protocol.ts`
  - 当前委派协议已经有 `ownership / acceptance / deliverableContract`
  - 但还没有 `identity governance / chain-of-command / roster identity relation`

结论：

- 现在的 `IDENTITY.md` 在 runtime 里是“被看见了”，但没有“被结构化消费”。
- 所以要把身份标签接入 Agent Teams，第一步不是改 team prompt，而是先把身份标签从 markdown 提炼成稳定数据模型。

#### 23.8.2 设计目标

这条线建议只解决 3 个具体问题，不扩成更大的社会模拟系统：

1. 让每个 Agent 的身份标签可以进入 team topology
   - 例如：`CEO -> CTO -> 员工`
2. 让 sender / owner / superior / subordinate 关系可以影响 manager 的 team 行为
   - 例如：上级可改优先级，下级只能请求/汇报，不能直接改派其他 worker
3. 让 worker handoff 和 team fan-in 时可以显式带上 authority chain
   - 例如：当前 worker 向谁汇报、谁能 override 它、谁只能收到建议

明确不做：

- 不把身份标签扩成一套通用 ACL / RBAC 系统
- 不做复杂的多级审批引擎
- 不做自动替用户判定组织结构的推理系统
- 不要求一次支持所有渠道和所有自由文本身份写法

#### 23.8.3 Source of Truth

这部分建议明确：

- `IDENTITY.md` 是身份标签的唯一主数据源
- `SOUL.md` 里的同类内容只保留为人格提示，不再作为团队治理的主解析来源

原因：

- 当前模板里 `SOUL.md` 和 `IDENTITY.md` 都出现了身份标签字段，长期容易漂移
- Team governance 需要一个稳定、单一、可校验的数据源

建议策略：

- 优先解析 `IDENTITY.md`
- 仅在迁移兼容阶段允许：
  - 若 `IDENTITY.md` 缺少身份治理字段，才从 `SOUL.md` 做一次只读 fallback
- 一旦两边都存在且冲突：
  - 以 `IDENTITY.md` 为准
  - 在 inspect / doctor 中给出配置漂移 warning

#### 23.8.4 推荐新增的数据模型

建议先新增一个轻量结构，不要把它塞进现有 `IdentityInfo`：

```ts
type IdentityAuthorityProfile = {
  currentLabel?: string;
  superiorLabels: string[];
  subordinateLabels: string[];
  ownerUuids: string[];
  authorityMode: "verifiable_only" | "disabled";
  responsePolicy: {
    ownerOrSuperior: "execute";
    subordinate: "guide";
    other: "refuse_or_inform";
  };
  source: "identity_md" | "soul_fallback";
};
```

推荐落点：

- `packages/belldandy-protocol/src/identity.ts`
  - 新增：
    - `parseIdentityAuthorityProfile(content)`
    - `loadIdentityAuthorityProfile(dir)`

为什么放在 `protocol`：

- 当前 `extractOwnerUuid()` 已经在这里
- 这层会被 `agent / core / channels / skills` 共用
- 比放在 `belldandy-agent` 更适合做共享身份语义

#### 23.8.5 Agent Teams 侧推荐新增的数据模型

在 team 机制里，不建议直接把 `IDENTITY.md` 原文塞到 `team-topology-and-ownership`，而是派生一层 team-aware metadata：

```ts
type TeamIdentityLane = {
  agentId: string;
  role?: "default" | "coder" | "researcher" | "verifier";
  identityLabel?: string;
  authorityRelationToManager?: "self" | "superior" | "peer" | "subordinate" | "unknown";
  reportsTo?: string[];
  mayDirect?: string[];
  scopeSummary?: string;
  dependsOn?: string[];
  handoffTo?: string[];
};

type TeamIdentityGovernance = {
  mode: "peer_swarm" | "identity_hierarchy";
  managerAgentId: string;
  managerIdentityLabel?: string;
  ownerUuidVerified: boolean;
  activeActorRelation?: "owner" | "superior" | "peer" | "subordinate" | "other" | "unknown";
  roster: TeamIdentityLane[];
};
```

推荐接点：

- `packages/belldandy-skills/src/delegation-protocol.ts`
  - 新增可选 `team` / `identityGovernance`
- `packages/belldandy-agent/src/launch-spec.ts`
  - 负责归一化进 run-level spec

#### 23.8.6 推荐的 prompt 接入方式

这一层最适合落在 3 个位置：

1. static section：`team-topology-and-ownership`
2. static section：`team-identity-governance-policy`
3. run-level delta：`runtime-identity-authority`

##### A. `team-topology-and-ownership`

扩展为：

- 不只写 worker 的 `owned scope`
- 还要写：
  - `identity label`
  - `authority relation to manager`
  - `reports to`
  - `may direct`

示例：

```md
## Team Topology and Ownership

- Manager: `default` | role=`default` | identity=`CEO`
- Worker: `coder` | role=`coder` | identity=`CTO` | relation=`subordinate`
- Worker: `researcher` | role=`researcher` | identity=`项目经理` | relation=`subordinate`
- Worker: `verifier` | role=`verifier` | identity=`审计` | relation=`peer`
```

##### B. `team-identity-governance-policy`

新增一段专门规则，告诉 manager / worker：

- 只有 owner / superior 可以直接改 team 目标、重排优先级、改派 ownership
- subordinate 默认只能：
  - 提建议
  - 汇报 blocker
  - 请求澄清
  - 请求上级批准
- peer 不直接覆盖 peer 的 scope，冲突时交给 manager / superior
- worker 收到与 manager contract 冲突的 peer 指令时，应上报而不是自行改轨

##### C. `runtime-identity-authority`

run 级 delta 不再只告诉模型“现在 sender 是谁”，而是进一步解析：

- 当前 authority 是否可验证
- 当前 actor 对本 Agent 的关系：
  - `owner`
  - `superior`
  - `subordinate`
  - `peer`
  - `other`
- 当前 team mode 下允许的动作：
  - `execute`
  - `guide_only`
  - `refuse_or_inform`
  - `escalate`

这部分应基于：

- `userUuid`
- `senderInfo.identity`
- `IdentityAuthorityProfile`
- 当前 team metadata

#### 23.8.7 Worker Envelope 如何补

`packages/belldandy-skills/src/subagent-launch.ts` 建议在现有：

- `Worker Base`
- `Worker Role`
- `Task Envelope`
- `Launch Constraints`

之外，再增加一段：

`Authority Chain`

内容建议包括：

- Your identity label
- You report to
- You may direct
- Requests from subordinate / peer / unrelated actors should be handled how
- If authority conflicts with task contract, escalate to manager

这样 worker 的行为就不再只受 task contract 约束，也受组织关系约束。

#### 23.8.8 Manager 行为的具体变化

把身份标签接入 Team 后，manager 侧建议新增这些行为规则：

- 如果当前 sender 是 `owner / superior`
  - 可以接收 team-level 重排、重新委派、紧急 override
- 如果当前 sender 是 `subordinate`
  - 默认不直接改 team 拆分
  - 可以：
    - 记录建议
    - 回复指导
    - 生成 delegation draft
    - 请求 owner / superior 确认
- 如果当前 sender 是 `peer / other`
  - 默认不让其改变其他 worker 的 ownership
- 如果当前 sender 身份不可验证
  - 身份标签只作为 persona 文本，不作为 authority rule

这能很好贴合 `IDENTITY.md` 中现有的“主人 / 上级 / 下级 / 其他人”响应策略。

#### 23.8.9 UI / Inspect 建议展示什么

如果后续真的实现，inspect 最有价值的不是展示整段 `IDENTITY.md`，而是展示派生结果：

- 当前 Agent identity label
- owner UUID 是否已验证
- 当前 sender relation
- 当前 team governance mode
- roster 中每个 lane 的 authority relation
- 本轮是否因为 authority rule 限制了动作
  - 例如：`guide_only`
  - `escalated_to_manager`
  - `override_allowed`

推荐接点：

- `packages/belldandy-core/src/query-runtime-subtask.ts`
- `apps/web/public/app/features/subtasks-overview.js`
- `apps/web/public/app/features/prompt-snapshot-detail.js`

#### 23.8.10 实施顺序与收口目标

为了避免这条线又无止境扩张，建议只分 4 步：

1. `Phase A`：结构化解析
   - 新增 `IdentityAuthorityProfile`
   - 打通 `IDENTITY.md -> parsed profile`
2. `Phase B`：Prompt 接入
   - `team-topology-and-ownership` 补 identity 信息
   - 新增 `team-identity-governance-policy`
3. `Phase C`：Runtime 决策接入
   - `runtime-identity-authority` 根据 sender / uuid / identity relation 生成动作约束
4. `Phase D`：Inspect / UI
   - 暴露 authority relation / governance mode / action limitation

做到下面这些就算收口：

- `IDENTITY.md` 的身份标签字段已结构化，而不再只是原始 markdown
- manager / worker prompt 都能看到 team identity topology
- 至少一条 runtime 决策链会消费：
  - `owner / superior / subordinate / other`
- authority rule 只在可验证环境中生效
- inspect 能看见本轮 authority relation 和限制结果

明确不做：

- 不做自动审批工作流
- 不做自由文本组织图推理
- 不把每个 channel 的身份系统统一抽象到极复杂层

#### 23.8.11 一句话结论

把 `IDENTITY.md` 接入 Agent Teams，最关键的不是“把身份标签文字拼到 prompt 里”，而是：

- 先把身份标签结构化
- 再把它变成 team topology 和 authority relation
- 最后只在可验证环境中让它影响 manager / worker 的团队行为

这样它才会从“人格设定文本”升级成“可治理的 Team 机制数据”。

### 23.9 Agent Teams 实施计划（建议顺序）

这一节给 23.x 的增强项一个明确、有限、可收口的实施计划。

总原则：

- 不重写现有 `delegate_task / delegate_parallel / sessions_spawn` runtime
- 先做 prompt / metadata / inspect，后做更强治理
- 先做 manager-mediated team mode，再考虑更重的 teammate transport
- 默认兼容现有 delegation 流程：没有 team metadata 时，行为应尽量与现在一致

#### 23.9.1 实施目标

本计划只追求一个清晰目标：

- 让 Belldandy 从“结构化 delegation”升级为“最小可用的 Agent Teams mode”

这里的“最小可用”定义为：

- manager 能显式看到 roster / ownership / handoff 关系
- worker 能收到 teammate-aware 的团队约束
- fan-out / fan-in 有稳定的 prompt operating loop
- inspect / UI 能看到 team topology 和 lane state
- 可选地接入 `IDENTITY.md` 的 authority relation，但仅在可验证环境中生效

#### 23.9.2 明确不做

为了收口，23.x 这条线明确不做下面这些：

- 不做新的实时 teammate message bus
- 不做 Claude Code 式完整 `SendMessageTool` 平替
- 不做自动生成复杂组织图
- 不做通用 RBAC / ACL 系统
- 不做自动执行器或自动批准流
- 不把所有 channel 的身份系统一次性统一到底层协议

如果未来要做这些，应该单独开 v3 / backlog，而不是继续扩张 23.x。

#### 23.9.3 里程碑划分

建议按 4 个里程碑推进。

##### M1：Team Metadata + 基础 Team Prompt Layer

目标：

- 先把 team mode 的最小 metadata 接起来
- 让 manager / worker 都看到 team-aware prompt sections

实现范围：

- `packages/belldandy-skills/src/delegation-protocol.ts`
  - 新增可选 `team` metadata
  - 最小字段建议：
    - `team.id`
    - `team.mode`
    - `team.sharedGoal`
    - `team.memberRoster[]`
    - `team.dependsOn`
    - `team.handoffTo`
- `packages/belldandy-agent/src/launch-spec.ts`
  - 归一化 team metadata，打进 run-level launch spec
- `packages/belldandy-core/src/bin/gateway-prompt-sections.ts`
  - 新增：
    - `team-operating-model`
    - `team-topology-and-ownership`
    - `manager-fanout-fanin-policy`
- `packages/belldandy-skills/src/subagent-launch.ts`
  - worker envelope 补 teammate-aware roster / handoff 摘要

当前状态：

- 已完成第一版最小落地：
  - `packages/belldandy-core/src/bin/gateway-prompt-sections.ts`
    - 已新增：
      - `team-operating-model`
      - `team-topology-and-ownership`
      - `manager-fanout-fanin-policy`
  - `packages/belldandy-skills/src/delegation-protocol.ts`
    - 已新增 team metadata：
      - `team.id`
      - `team.mode`
      - `team.sharedGoal`
      - `team.managerAgentId`
      - `team.currentLaneId`
      - `team.memberRoster[]`
  - `packages/belldandy-agent/src/launch-spec.ts`
    - 已支持 team metadata 归一化
  - `packages/belldandy-agent/src/runtime-prompt-deltas.ts`
    - 已新增 run-level `Team Topology and Ownership` delta
  - `packages/belldandy-skills/src/subagent-launch.ts`
    - worker envelope 已新增 `## Team Topology and Ownership`
  - `packages/belldandy-skills/src/builtin/session/delegate-parallel.ts`
    - 已开始自动为并行 lane 生成 team metadata

验证：

- `node .\\node_modules\\vitest\\vitest.mjs run packages/belldandy-core/src/bin/gateway-prompt-sections.test.ts packages/belldandy-agent/src/runtime-prompt-deltas.test.ts packages/belldandy-agent/src/launch-spec.test.ts packages/belldandy-skills/src/subagent-launch.test.ts packages/belldandy-skills/src/builtin/session/session-tools.test.ts packages/belldandy-agent/src/tool-agent.test.ts --reporter verbose`
- `corepack pnpm build`

这一阶段不做：

- 不做 identity-aware governance
- 不做 direct teammate messaging
- 不做 shared-state persistence

收口条件：

- manager run 的 prompt snapshot 能看到 team sections
- worker envelope 能看到自身 lane、依赖和 handoff 目标
- 没有 team metadata 的旧流程不回归

##### M2：Manager-Mediated Handoff + Fan-In Loop

目标：

- 把“团队协作动作”从单纯 contract 补充成稳定的 handoff / fan-in 规则

实现范围：

- `packages/belldandy-skills/src/subagent-launch.ts`
  - 新增 `Teammate Handoff` / `Reporting Expectations`
- `packages/belldandy-agent/src/runtime-prompt-deltas.ts`
  - 新增 team-specific delta
  - 例如：
    - `team-handoff-review`
    - `team-fan-in-triage`
- `packages/belldandy-agent/src/tool-agent.ts`
  - 在 delegation result 后，注入 team follow-up delta
- `packages/belldandy-core/src/bin/gateway-prompt-sections.ts`
  - 强化 manager 的：
    - selective wait
    - local progress while workers run
    - accept / retry / blocker triage

这一阶段的通信方式：

- 仍然坚持 manager-mediated
- worker 不直接互发消息
- handoff 通过 manager 汇总 / 再委派来完成

当前状态：

- 已完成第一版 manager-mediated handoff / fan-in 落地：
  - `packages/belldandy-skills/src/subagent-launch.ts`
    - worker envelope 已新增：
      - `## Teammate Handoff`
      - `## Reporting Expectations`
  - `packages/belldandy-skills/src/builtin/session/delegate-parallel.ts`
    - 并行 lane 结果 metadata 已补齐：
      - `laneId`
      - `scopeSummary`
      - `dependsOn`
      - `handoffTo`
      - `team`
    - 当存在 verifier lane 时，会自动推断实现 lane -> verifier lane 的默认 handoff / dependsOn
  - `packages/belldandy-skills/src/builtin/session/delegation-contract.ts`
    - delegation result metadata 已支持 team-aware clone / read / serialization
  - `packages/belldandy-agent/src/runtime-prompt-deltas.ts`
    - 已新增：
      - `team-handoff-review`
      - `team-fan-in-triage`
    - delegation review text 也已补上 `Team Result Context`
  - `packages/belldandy-agent/src/prompt-snapshot.ts`
    - 已支持新的 team delta type 持久化与归一化
  - `packages/belldandy-core/src/bin/gateway-prompt-sections.ts`
    - `manager-fanout-fanin-policy` 已强化：
      - lane-scoped handoff
      - manager-mediated handoff
      - selective wait / triage

验证：

- `node .\\node_modules\\vitest\\vitest.mjs run packages/belldandy-core/src/bin/gateway-prompt-sections.test.ts packages/belldandy-agent/src/runtime-prompt-deltas.test.ts packages/belldandy-agent/src/tool-agent.test.ts packages/belldandy-skills/src/subagent-launch.test.ts packages/belldandy-skills/src/builtin/session/session-tools.test.ts --reporter verbose`
- `corepack pnpm build`

收口条件：

- manager 能稳定产出：
  - 哪些 lane 可 accept
  - 哪些 lane 要 retry
  - 哪些 lane 是 blocker
- worker handoff 格式在 prompt / inspect 中可观测

##### M3：Team Shared State + Completion Gate + Inspect/UI

目标：

- 让 Team mode 不只是“模型知道自己在组队”，而是真正可以被观测和调试

当前进度：

- 已完成。
- `packages/belldandy-core/src/query-runtime-subtask.ts`
  - `subtask.get` 现在会暴露 `teamSharedState`
  - 包含：
    - `teamId / mode / sharedGoal / managerAgentId / currentLaneId`
    - `roster`
    - `lane status / handoffTo / dependsOn`
    - `fanInSummary`
    - `completionGate`
      - `status`
      - `finalFanInVerdict`
      - `accepted / pending / retry / blocker / missing lanes`
      - `unresolvedDependencyLaneIds`
      - `overlappingWriteScopes`
- `apps/web/public/app/features/subtasks-overview.js`
  - subtask 详情页已展示 `Team Shared State`
  - 可以直接查看：
    - team roster
    - lane 状态
    - handoff / dependsOn
    - fan-in verdict
    - completion gate summary
    - overlapping write scope
- `apps/web/public/app/features/prompt-snapshot-detail.js`
  - 已展示 `Team Coordination`
  - 可查看 active team sections / team deltas / completion gate 摘要
- `packages/belldandy-agent/src/runtime-prompt-deltas.ts`
  - 已新增 `team-completion-gate`
  - manager 下一轮会拿到结构化的 team completion gate follow-up
- `packages/belldandy-core/src/bin/gateway-prompt-sections.ts`
  - 已新增 `team-shared-state-policy`
  - 静态规则现在会要求 manager 只维护 compact shared state，而不是扩成共享 message bus

共享状态策略：

- 已按“共享摘要”路线落地
- 仍然不做复杂 shared memory bus
- 当前只沉淀：
  - team summary
  - accepted lanes
  - pending / retry / blocker / missing lanes
  - unresolved dependencies
  - overlapping write scope
  - final fan-in verdict

验证：

- `node .\\node_modules\\vitest\\vitest.mjs run apps/web/public/app/features/subtasks-overview.test.js apps/web/public/app/features/prompt-snapshot-detail.test.js packages/belldandy-agent/src/runtime-prompt-deltas.test.ts packages/belldandy-agent/src/tool-agent.test.ts packages/belldandy-core/src/bin/gateway-prompt-sections.test.ts packages/belldandy-core/src/server.query-runtime-domains.test.ts --reporter verbose`
- `corepack pnpm build`

收口条件：

- UI / inspect 能解释当前 team run 为什么这样决策
- manager 能看到 team completion gate 的结果
- 发生 lane overlap / unresolved blocker 时，inspect 可见

##### M4：IDENTITY-aware Team Governance

目标：

- 把 `IDENTITY.md` 的 authority chain 接进 Team mode
- 但只在可验证环境里影响行为

实现范围：

- `packages/belldandy-protocol/src/identity.ts`
  - 新增 `IdentityAuthorityProfile` 解析 / 读取
- `packages/belldandy-skills/src/delegation-protocol.ts`
  - 新增 `identityGovernance`
- `packages/belldandy-agent/src/launch-spec.ts`
  - 归一化 identity governance metadata
- `packages/belldandy-core/src/bin/gateway-prompt-sections.ts`
  - 新增 `team-identity-governance-policy`
- `packages/belldandy-agent/src/runtime-prompt-deltas.ts`
  - 新增 `runtime-identity-authority`
- `packages/belldandy-skills/src/subagent-launch.ts`
  - 新增 `Authority Chain`

限制规则：

- 仅当：
  - `userUuid` 或 `senderInfo` 可验证
  - 且 authority profile 存在
  - 才激活 team authority rule
- 否则：
  - 身份标签只作为 persona / roster 注释
  - 不作为权限决策依据

当前进度：

- 已完成第一版 IDENTITY-aware Team Governance 落地：
  - `packages/belldandy-protocol/src/identity.ts`
    - 已新增：
      - `IdentityAuthorityProfile`
      - `parseIdentityAuthorityProfile(...)`
      - `loadIdentityAuthorityProfile(...)`
      - `evaluateRuntimeIdentityAuthority(...)`
      - `deriveAuthorityRelationToManager(...)`
    - `IDENTITY.md` 的：
      - `当前身份标签`
      - `上级身份标签`
      - `下级身份标签`
      - `主人UUID`
      已可被结构化解析与运行态消费
  - `packages/belldandy-core/src/team-identity-governance.ts`
    - 已新增 team identity enrichment helper
    - 会把 authority profile 派生到：
      - `team.managerIdentityLabel`
      - `member.identityLabel`
      - `member.authorityRelationToManager`
      - `member.reportsTo`
      - `member.mayDirect`
  - `packages/belldandy-skills/src/delegation-protocol.ts`
  - `packages/belldandy-agent/src/launch-spec.ts`
    - 已支持上述 team identity governance metadata 的归一化与透传
  - `packages/belldandy-core/src/bin/gateway-prompt-sections.ts`
    - 已新增 `team-identity-governance-policy`
    - manager prompt 现在会明确：
      - authority rule 只在可验证环境中生效
      - subordinate / peer / unrelated actor 不能直接重排 team ownership
  - `packages/belldandy-agent/src/tool-agent.ts`
    - 已新增 `runtime-identity-authority` delta
    - 本轮 prompt snapshot 现在可看到：
      - authority mode
      - actor relation
      - recommended action
      - current identity label
      - team authority constraints
  - `packages/belldandy-skills/src/subagent-launch.ts`
    - worker envelope 已新增 `## Authority Chain`
    - worker 现在会收到：
      - current lane identity
      - manager identity
      - authority relation
      - reportsTo
      - mayDirect
  - `packages/belldandy-core/src/query-runtime-subtask.ts`
  - `apps/web/public/app/features/subtasks-overview.js`
    - Team shared state 已暴露并展示：
      - `managerIdentityLabel`
      - lane `identityLabel`
      - `authorityRelation`
      - `reportsTo`
      - `mayDirect`
  - `apps/web/public/app/features/prompt-snapshot-detail.js`
    - inspect 已新增 `Identity Authority` 摘要

验证：

- `node .\\node_modules\\vitest\\vitest.mjs run packages/belldandy-protocol/src/identity.test.ts packages/belldandy-core/src/team-identity-governance.test.ts packages/belldandy-core/src/bin/gateway-prompt-sections.test.ts packages/belldandy-agent/src/launch-spec.test.ts packages/belldandy-skills/src/subagent-launch.test.ts packages/belldandy-agent/src/tool-agent.test.ts apps/web/public/app/features/prompt-snapshot-detail.test.js --reporter verbose`
- `node .\\node_modules\\vitest\\vitest.mjs run packages/belldandy-agent/src/runtime-prompt-deltas.test.ts packages/belldandy-core/src/server.query-runtime-domains.test.ts apps/web/public/app/features/subtasks-overview.test.js packages/belldandy-skills/src/builtin/session/session-tools.test.ts --reporter verbose`
- `corepack pnpm build`

收口条件：

- inspect 可见：
  - current sender relation
  - owner UUID verified
  - active authority mode
- manager / worker 至少一条 runtime 决策链会消费：
  - `owner / superior / subordinate / other`

#### 23.9.4 建议实施顺序

建议严格按 `M1 -> M2 -> M3 -> M4` 推进。

原因：

- `M1` 先把 team metadata 和 prompt layer 接稳
- `M2` 再把 handoff / fan-in loop 做实
- `M3` 补观测和 completion gate，方便调试
- `M4` 最后才叠 authority chain，避免在 team 语义还没稳定时把身份治理和团队治理搅在一起

一句话：

- 先把“团队协作”做稳
- 再把“身份权力”叠上去

#### 23.9.5 测试与验证计划

每个里程碑都建议遵循同一套验证结构：

- Prompt 层
  - `packages/belldandy-core/src/bin/gateway-prompt-sections.test.ts`
  - `packages/belldandy-agent/src/runtime-prompt-deltas.test.ts`
- Worker envelope / launchSpec
  - `packages/belldandy-skills/src/subagent-launch.test.ts`
  - `packages/belldandy-agent/src/launch-spec.test.ts`
- Delegation / orchestration
  - `packages/belldandy-skills/src/builtin/session/session-tools.test.ts`
  - `packages/belldandy-agent/src/tool-agent.test.ts`
- Inspect / UI
  - `packages/belldandy-core/src/server.query-runtime-domains.test.ts`
  - `apps/web/public/app/features/subtasks-overview.test.js`
  - `apps/web/public/app/features/prompt-snapshot-detail.test.js`
- Identity-aware 阶段再补：
  - `packages/belldandy-protocol/src/identity.test.ts`

建议的阶段性验证命令模式：

- `node .\\node_modules\\vitest\\vitest.mjs run <targeted tests> --reporter verbose`
- `corepack pnpm build`

#### 23.9.6 最终收口目标

Agent Teams 这条增强线做到下面这些，就建议收口，不继续膨胀：

1. Team metadata 已 end-to-end 打通
2. manager / worker prompt 已具备 team-aware sections
3. fan-out / fan-in / handoff loop 已可稳定观测
4. inspect / UI 已能展示 team topology 与 lane state
5. `IDENTITY.md` authority chain 已可选接入，并且仅在可验证环境中生效
6. 旧的非 team delegation 模式未被破坏
7. 相关定向测试与 `corepack pnpm build` 通过

满足以上 7 条，就把 23.x 视为：

- “Agent Teams v2 增强项已完成”

当前状态：

- `M1 / M2 / M3 / M4` 已全部完成第一版落地。
- Team metadata、manager/worker prompt、handoff/fan-in、inspect/UI、IDENTITY-aware governance 已 end-to-end 打通。
- 相关定向 Vitest 与 `corepack pnpm build` 已通过。
- 因此 23.x 这条“Agent Teams 增强线”现在也可以视为第一阶段收口。

后续再做的内容，应转入单独 backlog，例如：

- direct teammate messaging
- 更复杂的 adaptive polling
- 自动 integrator / synthesizer agent generation
- 更重的组织治理 / 审批流

#### 23.9.7 一句话执行建议

如果后续真的开始做，我建议从 `M1` 开始，不要直接做 23.8 的 identity 治理。

最稳的路径是：

- 先把 `team-operating-model / team-topology-and-ownership / manager-fanout-fanin-policy` 落地
- 再补 handoff / fan-in / inspect
- 最后再把 `IDENTITY.md` authority chain 接进来

这样实现风险最小，回归面也最可控。
