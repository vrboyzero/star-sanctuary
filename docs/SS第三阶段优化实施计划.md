# SS 第三阶段优化实施计划

## 1. 目的

本文用于综合以下两份对比文档中的优化建议，形成一份可执行、可收口、可持续更新的第三阶段实施计划：

1. `docs/LA与SS的系统功能对比.md`
2. `docs/OC与SS的系统功能对比.md`

目标不是把两份文档里的建议简单拼接，而是：

1. 先识别重复项
2. 再识别可能冲突的项
3. 最后按 Star Sanctuary 当前路线重新排序

核心前提保持不变：

1. 不推翻 Star Sanctuary 现有 `local-first` 架构
2. 优先提升复杂任务执行质量
3. 暂不把大量预算投入到高返工概率的产品化收口项

---

## 2. 规划边界

### 2.1 本轮明确纳入的主目标

第三阶段的主目标是：

1. 降低复杂任务上下文污染
2. 提高多步执行稳定性
3. 增强子任务纠偏、恢复、承接能力
4. 补齐与复杂执行直接相关的外围基础设施
5. 在核心流程稳定后，再做面向普通用户的统一产品化收口

### 2.2 本轮明确不作为主线推进的项

以下内容本轮不作为主线：

1. 远程 workspace sandbox / vault 体系
   - 来源：`LA与SS`
   - 原因：与 `local-first` 路线不一致

2. `agent.md` 替代现有工作区文件体系
   - 来源：`LA与SS`
   - 原因：现有 `AGENTS.md / TOOLS.md / MEMORY.md / SOUL.md` 体系已成型

3. Companion Apps / Device Nodes / Voice Wake
   - 来源：`OC与SS`
   - 原因：会把 SS 拉向全端个人助手平台

4. 渠道数量竞赛
   - 来源：`OC与SS`
   - 原因：会稀释 SS 当前长期执行与治理主线

5. 安装与配置向导 2.0 作为当前阶段最高优先级
   - 来源：`OC与SS`
   - 原因：当前仍处于持续优化和结构调整期，过早产品化大概率返工

---

## 3. 两份文档的重复、互补与冲突整理

### 3.1 重复或可合并项

1. `LA：continuation-oriented runtime`
   与
   `OC：shared background ledger / current conversation binding / session scope`
   可以合并为同一条主线：
   - 统一复杂任务 continuation runtime
   - 补齐 task / conversation / subtask / cron / heartbeat 的共享状态与恢复语义

2. `LA：渐进式工具发现`
   与
   `OC：provider 元数据层 / model picker / onboarding scopes`
   可以合并为同一条主线：
   - 先把工具与 provider 的可发现性、可选择性、可缩放性做稳
   - 再回收到统一向导产品面

3. `LA：PTC`
   与
   `OC：provider 能力声明 / 附件理解管线 / 媒体 capability registry`
   不是冲突关系，而是执行面互补：
   - LA 更强调“程序化处理”
   - OC 更强调“能力注册与统一接入”

### 3.2 明确没有本质冲突的项

以下项没有本质冲突，可并行纳入阶段计划：

1. `LA` 的工具分层暴露
2. `LA` 的子任务 steering / resume
3. `OC` 的渠道安全配置产品化
4. `OC` 的统一长消息分段
5. `OC` 的 webhook guard / cron 校验

它们作用于不同层：

1. 工具发现层
2. 执行层
3. 会话与渠道层
4. 自动化与输入保护层

### 3.3 需要重新排序的项

以下项不是不能做，而是顺序必须后移：

1. 安装与配置向导 2.0
   - 来源：`OC与SS`
   - 原因：依赖 provider、channel、安全默认值、模型选择器、执行链这些底层能力先稳定

2. 独立 TUI 控制面
   - 来源：`OC与SS`
   - 原因：收益低于当前复杂任务主线，且会分散 UI/交互预算

3. 统一媒体能力注册层
   - 来源：`OC与SS`
   - 原因：有价值，但优先级仍低于复杂任务执行闭环与 provider/tooling 主线

---

## 4. 第三阶段总策略

第三阶段采用下面这条总策略：

1. 先做“复杂任务执行质量内核”
2. 再补“与执行直接相关的外围稳定层”
3. 最后再做“统一产品化收口”

也就是说，顺序应该是：

1. 工具发现与工具上下文治理
2. PTC 与结构化执行链
3. 子任务 steering / resume / continuation
4. 渠道安全、分段、webhook、cron 这类外围稳定层
5. provider 元数据与 model picker
6. 安装与配置向导 2.0
7. TUI

---

## 5. 分阶段实施计划

### 阶段 A：复杂任务执行质量内核

这是第三阶段的最高优先级主线。

#### A1. 渐进式工具发现增强

- 来源文档：`LA与SS`
- 目标：
  - 降低复杂任务首轮工具上下文负担
  - 减少重型工具误选和乱调
- 实施项：
  - MCP 双层暴露：摘要进 prompt，完整说明落工作区
  - builtin 重型工具簇 family summary / gating
  - loaded deferred tools 回收 / reset / shrink
- 收口目标：
  - 首轮 prompt 不再暴露完整 MCP schema
  - 重型工具簇可先发现、再展开、再调用
  - 长会话 loaded tools 不再只增不减
- 当前进度：
  - `P0-1` 已完成第一版最小落地
  - `P0-2` 已完成第一版最小落地
  - `P0-3` 已完成第一版最小落地
  - `P0-4` 已完成第一版最小落地
  - `P0-5` 已完成第一版最小落地
  - 当前 A1 主线已形成闭环：`MCP 双层暴露 -> builtin heavy family summary / gating -> loaded deferred tools reset / shrink / observability`
- 后续计划：
  - 基于已落地的最小 PTC runtime + helpers，继续观察真实复杂任务的使用路径
  - 若高频脚本模式稳定，再把高复用 helper 继续收敛成更窄的 wrapper / template
  - 主线后续切入 `P0-6 子任务 steering`

#### A2. PTC 落地

- 来源文档：`LA与SS`
- 目标：
  - 把结构化数据处理从“模型手工拼文本”升级为“本地程序化处理”
- 实施项：
  - 轻量 PTC runtime
  - 面向 MCP / memory / conversation / task 的 wrapper / helper
  - 保持权限、路径、审计与输出压缩约束
- 收口目标：
  - 至少 2 到 3 类复杂数据任务默认可走 PTC
  - 中间结构化数据尽量停留在本地执行链
  - token 噪声明显下降
- 当前进度：
  - `P0-4` 已完成第一版最小落地
  - `P0-5` 已完成第一版最小落地
  - 当前已落地最小能力：
    - 新增受控 `ptc_runtime` builtin
    - 仅允许脚本通过声明过的输入文件读取本地结构化数据
    - 仅允许写入受控 run 目录下的 `artifacts/`
    - 自动落盘 `script.js / manifest.json / result.json`
    - 已补 `ptc.helpers.mcp / records / report` 三组首批 helper
    - 已接入现有 tool contract、workspace 边界、audit/build/test 链
- 当前边界：
  - 仍未完成 MCP schema -> 本地 SDK / wrapper 自动生成
  - 当前 helper 仍是运行时 API，不是专用 MCP SDK / wrapper 生成器
  - 当前先聚焦 JSON / Markdown / 文本类结构化分析

#### A3. 子任务 steering / resume / continuation

- 来源文档：`LA与SS`
- 目标：
  - 提升复杂任务在中断、纠偏、换手时的稳定性
- 实施项：
  - 子任务运行中 steering
  - 明确 checkpoint / handoff / recovery 结构
  - 可 resume、可续跑、可接管
- 收口目标：
  - 子任务不再是一次性执行单元
  - 已完成或中断任务可恢复和承接
  - UI 中能明确区分运行态、等待态、可恢复态
- 当前进度：
  - `P0-6` 已完成第一版最小落地
  - `P0-7` 已完成第一版最小落地
  - `P0-8` 已完成第一版最小状态统一
  - 当前已落地最小能力：
    - gateway / query runtime 已新增 `subtask.update`
    - gateway / query runtime 已新增 `subtask.resume`
    - `subtask.get` 与 `goal.handoff.generate` 已统一输出第一版最小 `continuationState`
    - gateway / query runtime 已新增 `goal.handoff.get`
    - `conversation.meta` 已开始输出 main conversation 视角的最小 `continuationState`
    - resident observability / roster 已开始输出 resident 视角的最小 `continuationState`
    - WebChat 已在现有 subtask detail 区补轻量 steering 入口
    - WebChat 已在现有 subtask detail 区补轻量 resume 入口
    - WebChat 已在现有 subtask detail 区补最小 continuation state 展示卡片
    - WebChat 已在 session digest、resident 摘要卡、goal handoff panel 接入同一套最小 continuation 工作集
    - goal handoff panel 已改为直接读取服务端结构化 handoff snapshot，不再依赖前端缓存 + `handoff.md` 解析兜底
    - `continuationState` 已收窄第二轮通用字段，去掉当前未消费的 `status / updatedAt / source / activeRunId / activeNodeId`
    - `goal / resident / main / subtask` 四侧消费已统一优先读取单一 `recommendedTargetId`，不再依赖多套 active-* fallback
    - `recommendedTargetId` 已补显式 `targetType`，把 `conversation / session / node / goal` 语义从字符串值里拆出
    - resident observability continuation action 已按 `conversation / session / goal / node` 显式分发，不再只把非 conversation 目标降级回 chat
    - goal handoff / session digest / subtask detail 中的 `type:id` 展示已接成同一套 clickable continuation action
    - `node / session` continuation 已继续补到“进入后自动定位并高亮目标 node / session”，不再只停留在打开所属入口
    - `session` continuation 已补 `chat <-> subtasks` 双向联动：session continuation 进入 subtasks 后会同步 chat session，上下切换不再丢失关联
    - `node` continuation 已补 section 级 focus：tracking / capability 相关 section 与命中 checkpoint / node 卡片会一起高亮
    - `node` continuation 已进一步收窄到关联 checkpoint 视图：进入 tracking panel 后会只显示目标 node 关联的 checkpoint，并在无命中时给出针对性空态
    - `session` continuation 已进一步补 prompt snapshot 锚点：进入 subtask detail 后会自动定位并高亮对应 session 的 prompt snapshot section
    - 运行中的子任务可记录 `accepted / delivered / failed` steering 状态
    - 已结束子任务可记录 `accepted / delivered / failed` resume 状态
    - 当前实现采用“停止旧 run + 带 prior history 重拉起同一 task”的 safe-point steering
    - 当前 resume 采用“保留同一 task 记录 + 带 prior history 重拉起新 session”的最小 continuation
    - 已补 continuation builder 单测、server RPC 断言、定向 `vitest` 与全仓 `build` 验证
- 当前边界：
  - 还不是同一运行内的 token 级 mid-run 注入
  - 当前 resume 仍偏 same-task relaunch，还不是完整 checkpoint / handoff / recovery / continuation runtime
  - resident / main / subtask / goal 之间还没有共享 ledger 与统一 replay / takeover 机制
- 后续计划：
  - 继续观察 `continuationState` 在真实任务里的字段稳定性，确认 `checkpoints.labels / progress.current / progress.recent` 是否还可继续收窄
  - `node` 侧先继续观察“关联 checkpoint 视图”是否足够，不急着扩成新的折叠状态系统
  - `session` 侧先以 prompt snapshot 锚点作为最小稳定方案；若后续真实需求明确，再评估是否继续补真正的聊天消息时间线锚点
  - 若后续真实需求稳定，再评估把 `subtask / cron / heartbeat` 收敛到统一运行台账

#### A4. 统一 continuation runtime

- 来源文档：
  - `LA与SS`
  - `OC与SS`
- 当前状态：`已进入第二版最小 runtime 接线：在第一版最小状态统一之上，开始补 background continuation ledger`
- 目标：
  - 统一 long-goal / resident / subtask / background run 的恢复与交接语义
- 实施项：
  - continuation state 最小工作集统一
  - handoff / checkpoint 表达统一
  - 吸收 OC 的 shared ledger 思路，逐步把 `subtask / cron / heartbeat` 纳入统一运行台账
- 收口目标：
  - 同一个复杂任务可在多运行面稳定流转
  - 恢复依赖最小工作集，而不是整段历史
  - 失败恢复变成产品内显式能力
- 当前进度：
  - `P0-8` 已完成第一版最小落地：
    - 已新增共享 `continuation-state` helper
    - `subtask.get` 已输出标准化 `continuationState`
    - `goal.handoff.generate` 已输出标准化 `continuationState`
    - WebChat 已能在现有 subtask detail 区显示最小 continuation 工作集
  - 后续已补首批消费面：
    - `conversation.meta` 已开始返回 main conversation continuation state
    - resident observability / roster 已开始返回 resident continuation state
    - WebChat 已在 session digest、resident 摘要卡、goal handoff panel 消费统一 continuation state
    - 已新增 `goal.handoff.get`，goal handoff panel 改为直接读取服务端结构化 handoff snapshot
    - 已完成第二轮字段收窄，删除当前未消费的通用字段，并把消费面 target fallback 统一到 `recommendedTargetId`
    - 已补显式 `targetType`，把 `conversation / session / node / goal` 导航语义从 `recommendedTargetId` 字符串中拆出
    - resident / main / subtask / goal 展示层已统一显示 `type:id`，resident action 暂仅对 `conversation` 保持可点击跳转
    - resident observability continuation action 已改为按 `conversation / session / goal / node` 显式路由到 chat / goals 等现有入口
    - goal handoff / session digest / subtask detail 已复用同一 continuation action helper，把 `type:id` 文本升级为可点击动作
    - `node / session` action 已补最小 focus state，进入 goals / subtasks 后会自动滚动并高亮对应 node / session
    - `session` action 已补 `chat <-> subtasks` linked session context，subtasks 进入后会同步 chat session，再切回 subtasks 仍能按 parent conversation 过滤并自动选中原 task
    - `node` action 已把 tracking / capability 两类相关 section 一并纳入 focus，高亮不再只落在单张卡片
  - 当前已进入 A4 第一轮 runtime 接线：
    - 已新增独立 `background continuation ledger` 模块，不把主体逻辑继续塞进 `gateway / server`
    - `heartbeat` 已开始把 `running / ran / skipped / failed` 运行摘要写入统一 ledger
    - `cron` 已开始把 `started / finished / skipped` 运行摘要写入统一 ledger，并保留 `sessionTarget / nextRunAtMs / conversationId`
    - 已新增 background continuation builder，把 `cron / heartbeat` recent run 摘要收敛成同一类最小 `continuationState`
    - `system.doctor` 与现有 settings -> doctor 已开始显示统一 `Background Continuation Runtime` 摘要卡
    - 当前这一步的目的，是先把 `subtask / cron / heartbeat` 从“分散运行”推进到“至少可统一读取和诊断”的最小台账层
  - 当前这一版定位为“统一恢复工作集视图层 + 首批消费面接线”，不是完整 resident/main/subtask/goal runtime 融合
  - 已补 continuation builder 单测、RPC 断言、定向 vitest 与全仓 `build` 验证
- 当前边界：
  - 还没有统一的 continuation ledger / replay runtime
  - 当前 ledger 只覆盖 `cron / heartbeat`，还没有把 `subtask` 真正纳入同一条 background ledger
  - 当前仍以 doctor / observability 为主，不是完整的 replay / handoff / takeover / background recovery 产品面
  - 还没有显式跨 Agent takeover、checkpoint replay、background run recovery 产品闭环
- 技术债决策：`defer`
  - 暂不直接做 shared ledger + unified replay 大重构，避免一次性拉高耦合与验证面
- 后续计划：
  - 继续观察 resident / main / subtask 三侧对字段的真实消费频率，决定是否进一步压缩 `labels / recent` 等聚合字段
  - 继续评估是否要把 `node / session` 的定位从“section/card 高亮”继续推进到更细粒度的节点展开、checkpoint 过滤、消息锚点或时间线锚点
  - 下一步优先把 `subtask` 接入同一类 shared ledger 摘要，避免 `background continuation` 永远停留在 `cron / heartbeat` 双轨
  - 若 shared ledger 的字段稳定，再评估是否继续把它从 doctor 诊断面推进到更直接的 continuation 消费面
  - 最后再决定是否进入真正的 unified continuation runtime 重构

### 阶段 B：执行外围稳定层

这一阶段服务于阶段 A，但不替代阶段 A。

#### B1. 渠道安全配置产品化

- 来源文档：`OC与SS`
- 目标：
  - 为后续多渠道扩展提供稳的默认安全值
- 实施项：
  - `dmPolicy / allowFrom / mention` 默认值
  - pairing 范围
  - 配置告警
- 收口目标：
  - 渠道安全不再主要依赖人工手写规则
  - 降低误开放、误路由、群聊噪音

#### B2. 统一渲染感知长消息分段

- 来源文档：`OC与SS`
- 目标：
  - 统一不同渠道下的长消息、Markdown、代码块发送体验
- 实施项：
  - 渲染感知 chunking
  - 统一代码块、链接、长摘要分段策略
- 收口目标：
  - 明显减少截断、断块、发送失败与跨渠道表现不一致

#### B3. Webhook 入站保护层

- 来源文档：`OC与SS`
- 目标：
  - 补齐 webhook 在 auth 之前的统一防护
- 实施项：
  - body 限额
  - timeout
  - concurrency
  - rate limit
  - content-type 校验
- 收口目标：
  - webhook 入口不再只有 token 校验和内存幂等
  - 入站风险面显著收紧

#### B4. Cron 约束校验与 sessionTarget / stagger

- 来源文档：`OC与SS`
- 目标：
  - 让 cron 从“能跑”升级成“可预测、可约束”
- 实施项：
  - spec 合法性前置校验
  - `sessionTarget / delivery / failureDestination / stagger`
- 收口目标：
  - cron 配置歧义明显减少
  - 运行行为更稳定、更容易解释
- 当前进度：
  - `P1-4` 已完成第一版完整闭环，可按当前阶段目标收口
  - 当前已落地最小能力：
    - 已新增 cron spec normalize / validation 层，对 `schedule / payload / sessionTarget / delivery / failureDestination / staggerMs` 做前置校验与默认值收口
    - 已为 cron job 持久化模型补齐显式 `sessionTarget / delivery / failureDestination / staggerMs / lastStatus / lastError / lastDurationMs`
    - `systemEvent` 已按 `sessionTarget=main|isolated` 分发到稳定 job 会话或每次独立 run 会话
    - `delivery.mode=none` 已抑制成功通知；`failureDestination.mode=user` 已补最小失败通知
    - `staggerMs` 已同时进入创建时 next-run 计算与执行后 next-run 重算，不再只在首次创建时生效
    - scheduler 已对 `activeHours / isBusy` 命中的到期任务写入稳定 `skipped` 状态与原因，避免“为什么没跑”不可解释
    - WebChat / doctor / workspace 已补最小消费面：
      - `system.doctor` 已输出 cron runtime summary
      - settings -> doctor 已可见 scheduler 状态、sessionTarget / delivery / failureDestination / stagger 分布与近期 job 摘要
      - workspace 打开 `cron-jobs.json` 时已可见最小配置摘要
- 收口判定：
  - 当前 `P1-4` 可判定为“已收口”
  - 判定依据：
    - cron 的核心配置项已从“隐式约定”收口为显式 schema 与前置校验
    - `sessionTarget / delivery / failureDestination / stagger` 已贯通创建、持久化、调度执行、运行状态与基础消费面
    - `staggerMs` 的后续运行重算已闭环
    - `activeHours / isBusy` 的跳过行为已开始显式记录为 `skipped`，满足“更容易解释”的最小要求
- 出口条件：
  - 以下条件满足后，即可视为当前阶段 `P1-4` 完成：
    - cron 创建 / 更新输入会被 normalize + validation 拦住明显歧义配置
    - `sessionTarget / delivery / failureDestination / staggerMs` 都已进入持久化模型，而不是只停留在 tool 参数层
    - scheduler 对非 `at` 任务的下一次调度时间重算必须保留 job 级 `staggerMs` 语义
    - `activeHours / isBusy` 导致的未执行状态，至少会在 job runtime 上留下可解释的 `skipped` 记录
    - 现有设置或诊断面中，至少有一个稳定消费面能看到这些新增字段与运行态摘要
- 当前边界：
  - 当前还不是完整的 cron service / channel-level delivery target 产品壳
  - 当前 `cron` 工具的 `status` 仍偏轻量，不是完整的 job 级 runtime dashboard
  - 当前 UI 仍以 doctor / workspace 的“最小可见”方案为主，没有单独扩成新的 cron 管理页
- 后续增强方向：
  - 若后续真实使用频率提升，可再补更完整的 cron status/list 产品面，但这属于增强项，不再阻塞 `P1-4` 收口
  - 若后续需要多渠道精细投递，再评估是否把 delivery target 扩成 channel/account 级，而不是当前的 `user|none`

### 阶段 C：扩展抽象层整理

这一阶段既服务当前执行质量，也为后续安装向导收口做准备。

#### C1. Provider 元数据层

- 来源文档：`OC与SS`
- 目标：
  - 给 provider onboarding、能力声明、模型白名单、适用范围建立统一描述层
- 实施项：
  - provider metadata registry
  - onboarding scopes
  - 能力范围声明
- 收口目标：
  - provider 不再继续污染 gateway 主分支
  - 后续 model picker 和 setup wizard 有统一数据来源

#### C2. 认证感知 model picker

- 来源文档：`OC与SS`
- 目标：
  - 改善模型选择与配置体验
- 实施项：
  - `auth missing`
  - preferred provider
  - 手动输入回退
  - catalog 过滤
- 收口目标：
  - 模型选择不再主要靠手填和外部记忆

#### C3. 会话作用域与 current conversation binding

- 来源文档：`OC与SS`
- 目标：
  - 为多渠道和多线程连续性提供更清晰的会话抽象
- 实施项：
  - 显式 session scope 策略
  - 群聊 key 归一
  - current conversation binding
- 收口目标：
  - 跨线程、多渠道回复连续性更稳
  - 会话 key 与路由语义更一致

### 阶段 D：产品化收口

这一阶段必须在 A/B/C 的核心能力形态稳定后再做。

#### D1. 安装与配置向导 2.0

- 来源文档：`OC与SS`
- 当前策略：`后置实施`
- 原因：
  - 目前仍在优化调整期
  - provider / channel / security / execution 流程尚未完全稳定
  - 现在做成高完成度向导大概率返工
- 进入实施的前置条件：
  - provider metadata 已稳定
  - model picker 已稳定
  - 渠道安全默认值已明确
  - 至少一轮复杂任务执行链收口完成
- 收口目标：
  - 用统一向导把已成熟流程产品化，而不是把未稳定流程提前固化

#### D2. 独立 TUI 控制面

- 来源文档：`OC与SS`
- 当前策略：`低优先级后置`
- 原因：
  - 当前主收益仍在 WebChat 工作台与长期任务治理
  - TUI 不该抢占复杂任务主线预算

---

## 6. 可直接开工的任务清单

本节将前面的阶段计划进一步拆成可直接进入开发排期的 backlog。

优先级约定：

1. `P0`
   - 当前阶段最优先、直接决定复杂任务执行质量
2. `P1`
   - 高价值稳定层，紧跟主线推进
3. `P2`
   - 重要但依赖前序能力稳定后再推进
4. `P3`
   - 后置产品化收口项

### 6.0 当前收敛结论与优先级评估

- 当前 `P0-8` 与 `P1-1 ~ P1-4` 都已达到本阶段可收口状态，不建议继续反复 reopen；后续默认只做回归修补或被后续主线明确牵引的最小接线
- 结合当前代码状态，`P0-P2` 中仍真正影响第三阶段主线的最高优先级项是 `A4 / 统一 continuation runtime`
- 这次进入 `A4` 的策略，不是直接做 shared replay 平台，而是先补“统一 background continuation ledger + doctor 可见 runtime 摘要”这条最小台账链
- 当前建议推进顺序：
  1. `A4 / 统一 continuation runtime`
  2. `P2-3 会话作用域与群聊 key 归一`
  3. `P2-4 current conversation binding`
  4. `P2-1 Provider 元数据层`
  5. `P2-2 认证感知 model picker`
  6. `P2-5 统一媒体能力注册层 / 附件理解管线`
- 排序理由：
  - `A4` 仍直接决定复杂任务在 `subtask / goal / cron / heartbeat` 之间能否形成更稳的 continuation 语义
  - `P2-3 / P2-4` 会直接影响多渠道、多线程连续性，是后续渠道与 conversation surface 稳定化的关键前置
  - `P2-1 / P2-2` 更偏 provider / product abstraction，可在执行 runtime 稳住后推进
  - `P2-5` 有价值，但当前对第三阶段主线的阻塞性最低
- 当前这一轮 `A4` 的明确出口：
  - 至少先把 `cron / heartbeat` 纳入统一 background continuation ledger，并在现有 doctor / 诊断面可见
  - 再评估是否继续把 `subtask` 并入同一 ledger
  - `shared replay / checkpoint replay / cross-agent takeover` 继续保持后置，不作为这一轮出口条件

### 6.1 P0 任务

#### P0-1 MCP 双层暴露

- 来源文档：`LA与SS`
- 当前状态：`已完成第一版最小落地`
- 目标：
  - prompt 中仅保留 MCP 摘要
  - 完整说明按需读取
- 前置依赖：
  - 无
- 直接任务：
  - 增加 MCP server / tool family 摘要层
  - 生成工作区可读的完整工具说明
  - 补按需读取入口与调用指引
- 完成标志：
  - 首轮 prompt 不再注入完整 MCP schema
  - Agent 可以先发现，再读文档，再调 MCP 工具
  - 当前已完成的最小版本：
    - MCP 工具默认按 `deferred` 参与发现
    - 启动时生成 `generated/mcp-docs/...` 工作区文档
    - runtime prompt 已补 MCP discovery 摘要，引导先 `tool_search`、再 `file_read`、再按需加载 schema

#### P0-2 builtin 重型工具簇 summary / gating

- 来源文档：`LA与SS`
- 当前状态：`已完成第一版最小落地`
- 目标：
  - 压低 `goals / office / canvas / browser` 的上下文负担
- 前置依赖：
  - 与 `P0-1` 可并行
- 直接任务：
  - 增加 family summary
  - 增加 family-level gating 或更细的 deferred 策略
  - 审查当前 prompt 是否仍长期暴露过多子工具
- 完成标志：
  - 重型 builtin family 默认不再长期全暴露
  - 进入复杂任务时误选率下降
  - 当前已完成的最小版本：
    - `goals / office / browser / canvas` 已补 family summary
    - `tool_search` 已支持 family 级发现与 `expandFamilies`
    - runtime prompt 已补 builtin heavy family discovery 摘要，引导先看 family，再按需展开，再加载精确 schema
    - heavy builtin family 默认不再长期把全部成员 schema 注入 prompt

#### P0-3 loaded deferred tools 回收机制

- 来源文档：`LA与SS`
- 当前状态：`已完成第一版最小落地`
- 目标：
  - 防止长会话中 loaded tools 只增不减
- 前置依赖：
  - 与 `P0-1`、`P0-2` 相关
- 直接任务：
  - 增加 reset / unload / shrink 机制
  - 增加会话级观测，能看到当前 loaded tools 集合
- 完成标志：
  - 长会话中工具集合可主动收缩
  - context 污染可控
  - 当前已完成的最小版本：
    - `tool_search` 已支持 `resetLoaded / unload / shrinkTo`
    - loaded deferred tools 已按 conversation 持久化，避免只存在于单次 executor 内存
    - 会话级观测已接入现有入口：`tools.list`、`conversation.meta`、`conversation_read view=meta`、工具设置面板
    - 服务端当前真实 RPC 名是 `conversation.meta`，不是 `conversation.inspect`；文档和后续联调均应以 `conversation.meta` 为准
- 后续计划：
  - `P0-4` 已完成第一版最小落地，先观察实际使用路径与边界
  - 主线进入 `P0-5`，补高频 wrapper / helper，避免模型继续用长文本手工归并数据

#### P0-4 轻量 PTC runtime

- 来源文档：`LA与SS`
- 当前状态：`已完成第一版最小落地`
- 目标：
  - 让复杂结构化数据处理优先走本地程序化路径
- 前置依赖：
  - 无
- 直接任务：
  - 建立受控脚本运行入口
  - 定义脚本输入输出约束
  - 接入现有工具治理与审计
- 完成标志：
  - Agent 可稳定生成并执行受控脚本处理结构化数据
  - 不绕开权限、路径与审计边界
  - 当前已完成的最小版本：
    - 已新增 `ptc_runtime` builtin，使用受控 JS VM 而不是任意宿主脚本执行
    - 脚本只能通过显式声明的 `inputs` 读取工作区内文件
    - 产物仅允许写入 `generated/ptc-runs/<runId>/artifacts/`
    - 每次执行都会落盘 `script.js / manifest.json / result.json`
    - 已补单测与构建验证，覆盖成功路径、越界输入、禁用模式与超时边界

#### P0-5 PTC wrapper / helper 首批能力

- 来源文档：`LA与SS`
- 当前状态：`已完成第一版最小落地`
- 目标：
  - 覆盖最常见复杂数据场景
- 前置依赖：
  - `P0-4`
- 直接任务：
  - 补 MCP 结果聚合 helper
  - 补 memory / conversation / task 数据分析 helper
  - 补多结果归并和报表输出 helper
- 完成标志：
  - 至少 2 到 3 类复杂任务默认走 PTC 更优
  - 当前已完成的最小版本：
    - 已新增 `ptc.helpers.mcp.summarizeResults / flattenItems`
    - 已新增 `ptc.helpers.records.summarize / groupCount / pick / sortBy`
    - 已新增 `ptc.helpers.report.toMarkdownTable / writeMarkdownReport / writeJsonReport`
    - 已新增 3 个更窄的 PTC 模板：
      - `ptc.helpers.templates.mcpResultReport`
      - `ptc.helpers.templates.recordCollectionReport`
      - `ptc.helpers.templates.compareRecordSets`
    - 当前已能覆盖：
      - MCP 多结果归并与诊断摘要
      - conversation / task / memory 风格记录数组的字段统计、分组和排序
      - Markdown / JSON 报表落盘输出
      - 高复用场景下的一键化 MCP 汇总、记录报表和多数据集比较
  - 当前边界：
    - 仍未做 MCP schema -> helper 自动映射
    - 仍未做 conversation / task / memory 的专用 domain wrapper
    - 当前先以高频通用 helper + 窄模板为主，避免过早固化过重抽象

#### P0-6 子任务 steering

- 来源文档：`LA与SS`
- 当前状态：`已完成第一版最小落地`
- 目标：
  - 支持运行中纠偏
- 前置依赖：
  - 无
- 直接任务：
  - subtask runtime 支持 update / steering 输入
  - WebChat 侧补轻量入口，复用现有详情区域或二级入口
- 完成标志：
  - 运行中的子任务可被明确纠偏
  - 当前已完成的最小版本：
    - gateway / query runtime 已支持 `subtask.update`
    - `subtask runtime` 已支持 steering record 与 `accepted / delivered / failed` 通知
    - steering 会先停止当前 running session，再带旧会话历史与新指令重拉起同一 task
    - WebChat 已在现有 subtasks detail 区补 textarea + send button，不新增一级入口
    - 前端可见 steering 状态与通知，形成最小闭环
  - 当前边界：
    - 当前是 safe-point steering / relaunch，不是同一 run 内继续向前的 mid-run steering
    - 当前也不是完整 `resume / continuation` 体系
  - 技术债决策：`defer`
    - 完整 checkpoint / handoff / recovery 统一延后到 `P0-8`，避免在 `P0-6` 过早扩成大重构

#### P0-7 子任务 resume / continuation

- 来源文档：`LA与SS`
- 当前状态：`已完成第一版最小落地`
- 目标：
  - 支持中断后续跑、完成后续跑、换 Agent 承接
- 前置依赖：
  - `P0-6`
- 直接任务：
  - checkpoint / handoff / recovery 结构统一
  - resume API 与 UI 状态入口补齐
- 完成标志：
  - 子任务不再只是一次性执行单元
  - 当前已完成的最小版本：
    - gateway / query runtime 已支持 `subtask.resume`
    - 已结束的 `done / error / timeout / stopped` 子任务可从 detail 区直接发起 resume
    - runtime 已支持 `resume accepted / delivered / failed` 记录与通知
    - resume 会保留同一 task 记录，并以 prior history + 最新 resume 指令重拉起新 session
    - WebChat 已在现有 detail 区补最小 textarea + resume button，不新增一级入口
  - 当前边界：
    - 当前仍不是 checkpoint 级 continuation state
    - 当前仍未支持显式“换 Agent 承接”的产品入口
    - 当前更偏 same-task relaunch，而不是完整 handoff / recovery 平台
  - 技术债决策：`defer`
    - 跨 Agent handoff、checkpoint 统一与 continuation state 收敛继续留给 `P0-8`

#### P0-8 continuation runtime 最小状态统一

- 来源文档：
  - `LA与SS`
  - `OC与SS`
- 当前状态：`已完成第一版最小落地，并补齐 goal / resident / main 首批消费面`
- 目标：
  - 为 resident / main / subtask / long-goal 建立统一最小恢复状态
- 前置依赖：
  - `P0-7`
- 直接任务：
  - 定义 continuation state 最小字段
  - 统一 handoff / checkpoint 结构
  - 打通 compaction / summary / handoff 链
- 当前进展：
  - 已新增 `packages/belldandy-core/src/continuation-state.ts`
  - `subtask.get` 与 `goal.handoff.generate` 已统一输出第一版最小 `continuationState`
  - 已新增 `goal.handoff.get`，可无副作用读取 goal handoff snapshot + `continuationState`
  - `conversation.meta` 已开始输出 main conversation continuation state
  - resident observability / roster 已开始输出 resident continuation state
  - 当前统一的是“恢复工作集视图层”，已从 `subtask result` 与 `goal handoff` 扩到 `main / resident / goal` 首批消费面
  - WebChat 已在现有 subtask detail、session digest、resident 摘要卡、goal handoff panel 补最小 continuation 展示，不新增一级入口
  - goal handoff panel 已切到服务端结构化读取链，不再依赖前端缓存 + `handoff.md` 解析兜底
  - 已完成第二轮字段收窄：
    - 删除当前未消费的 `status / updatedAt / source / activeRunId / activeNodeId`
    - `goal / resident / main / subtask` 四侧消费已统一优先使用 `recommendedTargetId`
  - 已补显式 `targetType`，把 `conversation / session / node / goal` 导航语义从 `recommendedTargetId` 字符串中拆出
  - resident / main / subtask / goal 展示层已统一显示 `type:id`
  - resident observability continuation action 已改为按 `conversation / session / goal / node` 显式路由到 chat / goals 等现有入口
  - goal handoff / session digest / subtask detail 已复用同一 continuation action helper，把 `type:id` 文本升级为可点击动作
  - `node / session` action 已补最小 focus state，进入 goals / subtasks 后会自动滚动并高亮对应 node / session
  - `session` action 已补 `chat <-> subtasks` linked session context，subtasks 进入后会同步 chat session，再切回 subtasks 仍能按 parent conversation 过滤并自动选中原 task
  - `node` action 已把 tracking / capability 两类相关 section 一并纳入 focus，高亮不再只落在单张卡片
  - `node` action 已进一步收窄到关联 checkpoint 视图，tracking panel 在 node focus 下只显示命中 node 的 checkpoint
  - `session` action 已进一步补 prompt snapshot 锚点，subtask detail 会自动定位并高亮对应 session 的 prompt snapshot section
  - 已补 continuation builder 单测、RPC 断言、定向 `vitest` 与全仓构建验证
- 当前边界：
  - 仍不是 resident / main / subtask / goal 的完整共享 runtime 平台
  - 当前还没有 checkpoint-level execution replay，也没有跨 Agent takeover 产品闭环
- 技术债决策：`defer`
  - 真正的大一统 continuation runtime 继续后移，避免在 `P0-8` 直接扩成高风险重构
- 完成标志：
  - 多运行面间可以基于同一最小工作集稳定切换
- 收口判定 / 出口条件：
  - 当 `subtask / goal handoff / main conversation / resident` 四侧都已稳定消费同一份最小 `continuationState`，且导航目标统一收敛到 `recommendedTargetId + targetType` 时，`P0-8` 可判定为完成
  - 当 `goal / resident / main / subtask` 已能通过同一套 continuation action 进入现有入口，并在 `node / session` 两类高频目标上提供最小可用定位能力时，`P0-8` 可停止继续扩面
  - `node` 侧以“关联 checkpoint 视图”作为当前出口，不要求继续扩成新的折叠状态系统
  - `session` 侧以“prompt snapshot 锚点”作为当前出口，不要求在 `P0-8` 内继续补真正的聊天消息时间线锚点
  - shared ledger / replay runtime、checkpoint-level replay、cross-agent takeover、mid-run 注入不属于 `P0-8` 收口必需项，应拆到后续独立任务
- 后续计划：
  - 继续观察当前 `continuationState` 在真实任务中的字段使用频率和缺口
  - 继续评估 `checkpoints.labels / progress.current / progress.recent` 是否应再分层，避免把摘要与导航目标继续耦合进同一快照
  - `node` 侧先观察“关联 checkpoint 视图”是否已经覆盖主要 continuation 消费路径，暂不继续引入新的展开状态系统
  - `session` 侧先以 prompt snapshot 锚点作为最小稳定方案；若后续真实需求明确，再评估是否继续补真正的聊天消息时间线锚点
  - 暂不做 shared ledger / replay 平台化重构，等消费面稳定后再决定是否进入下一轮结构升级

#### A4-1 background continuation ledger / doctor 接线

- 来源文档：
  - `LA与SS`
  - `OC与SS`
- 当前状态：`已完成第一版最小接线`
- 目标：
  - 先把 `cron / heartbeat` 从分散后台运行推进到统一可读的 continuation runtime 台账
- 前置依赖：
  - `P0-8`
- 实现要点：
  - 新增独立 `background continuation ledger`
  - 记录 `cron / heartbeat` 的 `running / ran / skipped / failed` recent run 摘要
  - 把 recent run 摘要统一映射到最小 `continuationState`
  - 在现有 `system.doctor / settings -> doctor` 中暴露统一 runtime 卡片
- 当前已完成的最小版本：
  - 已新增独立 ledger 模块，不继续把主体逻辑塞进 `gateway / server`
  - `heartbeat` 已开始记录 `runId / conversationId / reason / message`
  - `cron` 已开始记录 `jobId / sessionTarget / nextRunAtMs / conversationId / status`
  - 已新增 `Background Continuation Runtime` doctor 卡片，可统一查看 `cron / heartbeat` 的最近运行与 continuation target
  - 已补 ledger builder 单测、doctor RPC 断言、前端摘要断言与构建验证
- 当前边界：
  - 当前还未把 `subtask` 正式纳入同一 ledger
  - 当前卡片仍偏诊断摘要，不是可直接 replay 的 continuation 产品面
- 技术债决策：`split_task`
  - 先把 `subtask` 并入 shared ledger 作为下一独立子任务
  - `checkpoint replay / takeover / recovery runtime` 继续拆分后置
- 完成标志：
  - `cron / heartbeat` 至少不再是两套完全分离、不可统一诊断的 background run 语义
  - doctor 中能看到统一 runtime 摘要、状态分布与可回看的 continuation target

### 6.2 P1 任务

#### P1 及后续阶段执行说明

- 从 `6.2 P1` 开始，直到 `6.3 P2`、`6.4 P3` 的后续计划项，凡是来源包含 `OC与SS` 的实现任务，在正式编码前都应先查看 `docs/OC与SS的系统功能对比.md` 中对应的 OC 对比项
- 同时应查看 `tmp/openclaw/openclaw-main` 中对应模块或链路的相关代码，确认 OC 当前实际实现方式，而不是只基于对比文档文字描述推进
- 每次进入具体实现前，都应先做一次简短评估：
  - 当前任务是否适合直接借鉴 OC 的代码实现方案
  - 当前仓库是否存在比 OC 更贴合 `local-first`、现有边界或复杂任务主线的实现方式
  - 若不直接沿用 OC 方案，需明确说明差异原因，避免后续重复回看同一对比结论
- 默认原则不是机械复刻 OC，而是“先对照、再取舍、后实现”：优先借鉴 OC 已被验证的结构与边界控制；若 SS 当前上下文已有更合适方案，则应在保持目标一致的前提下采用更优实现
- 这条规则的目的，是把 `OC 对比项 -> openclaw 代码参考 -> SS 方案取舍` 固化为 `P1 / P2 / P3` 阶段的统一前置步骤，减少后续偏离对比依据或重复决策的情况

#### P1-1 渠道安全配置产品化

- 来源文档：`OC与SS`
- 当前状态：`已完成第三版最小落地（可配置 + 可审批 + 实时提醒 + community 接线 + account surface）`
- 目标：
  - 给多渠道扩展提供稳的安全默认值
- 前置依赖：
  - 无
- 直接任务：
  - `dmPolicy / allowFrom / mention` 默认值
  - pairing 范围
  - 配置警告
- 当前进展：
  - 已新增 `stateDir/channel-security.json` 作为第一版渠道安全默认值配置入口
  - 当前已支持 `discord / feishu / qq` 三类渠道的 DM / mention 默认值，并已把同一套结构扩到 `community`：
    - `dmPolicy`
    - `allowFrom`
    - `mentionRequired`
  - `channel-security.json` 已继续收口到更通用的 per-channel account surface：
    - 顶层 `channels.<channel>` 仍可作为 channel 级默认值继续使用
    - 新增 `channels.<channel>.accounts.<accountId>`，可按渠道账号覆盖 `dmPolicy / allowFrom / mentionRequired`
    - 旧配置保持兼容，不需要一次性迁移
  - `createChannelRouter` 已补 channel security fallback：
    - 即使未启用手工 `channels-routing.json` 规则，也会继续消费 `channel-security.json`
    - 手工 route rule 仍保持更高优先级，安全默认值只作为 fallback 生效
  - `community` 已接入这套 runtime fallback：
    - `CommunityChannel` 已开始走同一套 channel router / security fallback
    - 当前按 `community` 房间消息消费 `mentionRequired.room`
    - `community` 渠道账号已使用 `community.json` 中的 agent name 作为 `accountId`
    - `community HTTP /api/message` 也已支持显式 `accountId` payload，并接入同一套 security fallback：
      - 房间消息会按 `mentionRequired.room` 评估
      - DM 命中 `allowlist` 阻断时，会沿用同一套 pending approval 记录链
  - `system.doctor` 已新增 `Channel Security (...)` 检查：
    - 已启用渠道但缺少安全策略时会显式告警
    - `dmPolicy=allowlist` 且 `allowFrom` 为空时会显式告警
    - 主要非 DM 场景未开启 mention gate 时会显式告警
    - `community` 已纳入同一检查链；若配置了账号级 policy，会按 account 视角评估有效策略
  - WebChat 设置面已补轻量 `Channel Security JSON` 编辑区，不新增一级入口：
    - 可直接读取 / 保存 `channel-security.json`
    - 保存时会做最小归一化
  - 已新增 `channel-security-approvals.json` 待审批存储
  - 当 `discord / feishu / qq` 的 DM 因 `allowlist` 被阻断时，runtime 会自动记录待审批 sender
  - WebChat 设置面已补待审批 sender 列表与 `批准 / 拒绝` 动作：
    - 批准后会自动把 sender 写入对应渠道的 `allowFrom`
    - 拒绝后会从 pending 队列移除
    - 当 pending request 命中了账号级策略时，也会回写到对应的 `channels.<channel>.accounts.<accountId>.allowFrom`
  - gateway / server 已补 `channel.security.get / update / pending.list / approve / reject` 最小 RPC
  - gateway 已在 pending sender 新增或重复命中时广播 `channel.security.pending` 事件
  - WebChat 已补待审批 sender 的最小实时提醒链：
    - 设置面打开时会自动刷新 pending 列表，不再需要手动点“刷新”
    - notice 已补一键“去审批”入口，可直接跳到渠道设置里的待审批区域
  - `channel-security.json` 已纳入 workspace sensitive file 保护，避免被普通 workspace 写入链路误改
  - `channel-security-approvals.json` 也已纳入 workspace sensitive file 保护
  - 已补 router / config / doctor / approval-store / `community HTTP /api/message` 定向单测，并通过定向 `vitest` 与全仓 `build`
- 当前边界：
  - 当前虽然已补 `community` 与 `accounts.<accountId>`，但仍主要覆盖 `dmPolicy / allowFrom / mentionRequired` 这三类最小安全默认值，不是 OC 那种完整 channel setup wizard / onboarding surface
  - 当前批准链仍是“pending sender -> allowFrom”最小闭环
  - 当前待审批主要覆盖 DM allowlist 阻断；`community` 房间消息当前主要消费 `mentionRequired.room`，不生成 room 级审批请求
  - 当前新的 per-channel account surface 只先接在 security fallback / doctor / approval-store 上，尚未扩成独立 account 管理 UI
  - 当前实时提醒仍是 WebChat notice + 设置面内自动刷新，不是独立 inbox / 批量审批工作台
- 技术债决策：`defer`
  - 更完整的 channel setup wizard、独立审批 inbox、以及把 account surface 做成专门 UI 继续后移，避免在 `P1-1` 继续扩成新入口
- 收口说明：
  - `P1-1` 按“第三版最小落地”口径正式收口：
    - `channel-security.json` 已成为多渠道安全默认值主入口
    - `discord / feishu / qq / community` 已接入同一套 security fallback
    - `accounts.<accountId>` 已形成可复用的 per-channel account surface
    - `pending sender -> allowFrom` 已形成最小可审批闭环
    - `doctor + WebChat settings + notice` 已形成最小产品化消费面
  - 本项后续不再以“补齐完整产品面”为目标继续扩展：
    - `pairing` 继续沿用现有全局能力，本轮不纳入 `channel-security.json` 的按渠道产品化范围
    - 完整 setup wizard / 独立 account 管理 UI / 独立审批 inbox 统一后移，不作为 `P1-1` 阻塞项
  - 从当前开始，若无新增渠道接入带来的安全缺口，`P1-1` 默认视为已完成，后续只允许做小型回归修补，不再继续扩 scope
- 完成标志：
  - 渠道安全配置不再主要依赖手工拼规则
- 后续计划：
  - 后续新增渠道时，优先直接复用当前 `channels.<channel> + accounts.<accountId>` 结构，而不是继续为每个渠道单独长新字段
  - 若后续审批量明显上升，再评估是否要从当前 notice + 设置面刷新，继续升级到批量审批或更细粒度的 account scope
  - 真正的 channel setup wizard 继续后移，等 `P1-2 / P1-3` 等外围稳定层完成后再决定是否收回成统一配置向导

#### P1-2 统一渲染感知长消息分段

- 来源文档：`OC与SS`
- 当前状态：`第一版最小统一层已落地（runtime strategy + settings 面接入），可按第一版口径收口后转入 P1-3`
- 目标：
  - 改善跨渠道长消息、Markdown、代码块发送稳定性
- 前置依赖：
  - 无
- 直接任务：
  - 抽象统一 chunking 层
  - 为 Discord 之外的渠道复用
- 当前进展：
  - 已在 `@belldandy/channels` 内新增共享 outbound chunking helper，先统一处理：
    - 段落优先分段
    - fenced code block 平衡拆分
    - 各渠道默认长度上限
  - 默认 runtime 策略已按平台能力细化为：
    - `discord`: `textLimit=1800`，`chunkMode=newline`
    - `qq`: `textLimit=1500`，`chunkMode=newline`
    - `feishu`: `textLimit=3000`，`chunkMode=newline`
    - `community`: `textLimit=3500`，`chunkMode=newline`
  - 已继续收口成更明确的 runtime 策略层：
    - 新增 `stateDir/channel-reply-chunking.json` 作为第一版 chunking runtime config 入口
    - 已支持按 `channels.<channel>` 声明：
      - `textLimit`
      - `chunkMode`
    - 已支持按 `channels.<channel>.accounts.<accountId>` 做账号级覆盖
    - gateway 启动时会统一加载这份 config，并注入各渠道发送路径
  - 第一版已接入：
    - `discord`
    - `qq`
    - `feishu`
    - `community`
  - 已接入现有 WebChat settings 面，与 `channel-security.json` 并列维护：
    - 支持读取 / 编辑 / 保存 `channel-reply-chunking.json`
    - 保存时先写 runtime JSON，再继续保存环境变量配置
  - 当前已先把“各渠道各写一套长消息分段”收口成共享 helper + runtime strategy 调用，不再只由 `discord` 独占
  - 已补 shared chunker / config resolver / runtime store / server RPC / `qq` / `community` 定向单测，并通过定向 `vitest` 与全仓 `build`
- 当前边界：
  - 当前仍是“最小 markdown-aware chunker”，不是 OC 那种完整 render IR / 平台渲染适配层
  - 当前先统一的是文本输出与 fenced code block，不包含图片、卡片、富媒体、按钮等 payload 的专门分段
  - 当前 chunk mode 仍只先落最小 `length / newline` 两档，不含更细的 render mode / markdown capability / payload-aware dispatch
- 第一版收口说明：
  - `P1-2` 第一版的目标是先把“长文本 / Markdown / 代码块”跨渠道分段从散落逻辑收口到共享 helper + runtime strategy，并给出可直接维护的设置入口
  - 只要后续没有新增渠道或明显的发送失败回归，`P1-2` 即可按当前第一版口径收口，不必继续扩到完整 render IR
  - 富媒体 payload-aware chunking、平台 markdown capability matrix、卡片 / 按钮 / 附件的专门分段继续后移，不作为当前 `P1-2` 阻塞项
- 完成标志：
  - 截断、断块、跨渠道表现不一致明显下降

#### P1-3 Webhook 入站保护层

- 来源文档：`OC与SS`
- 当前状态：`第一版最小 ingress guard 已落地（仅先覆盖 /api/webhook/:id）`
- 目标：
  - 在 auth 前就收紧入站风险
- 前置依赖：
  - 无
- 直接任务：
  - body 限额
  - timeout
  - concurrency
  - rate limit
  - content-type guard
- 当前进展：
  - 已在 `packages/belldandy-core/src/webhook/` 新增第一版共享 guard 层：
    - `memory-guards.ts`
    - `request-guards.ts`
  - 已把 webhook 入站保护从“散落在 route 内”收口成统一 ingress pipeline，当前统一处理：
    - pre-auth JSON `content-type` 校验
    - pre-auth body size limit
    - pre-auth body read timeout
    - per-client fixed-window rate limit
    - per-client in-flight concurrency limit
  - `server.ts` 已改成：
    - `community /api/message` 继续使用 route 级 JSON parser
    - `/api/webhook/:id` 不再依赖全局 `express.json()`
    - webhook 改为先走 ingress guard，再进入现有 `handleWebhookReceiveWithQueryRuntime`
  - 现有 webhook 主逻辑保持不变：
    - `token` 校验仍在 `query-runtime-http` 中完成
    - `idempotency` 语义保持原状
  - 第一版 runtime 参数已支持通过环境变量调整：
    - `BELLDANDY_WEBHOOK_PREAUTH_MAX_BYTES`
    - `BELLDANDY_WEBHOOK_PREAUTH_TIMEOUT_MS`
    - `BELLDANDY_WEBHOOK_RATE_LIMIT_WINDOW_MS`
    - `BELLDANDY_WEBHOOK_RATE_LIMIT_MAX_REQUESTS`
    - `BELLDANDY_WEBHOOK_RATE_LIMIT_MAX_TRACKED_KEYS`
    - `BELLDANDY_WEBHOOK_MAX_IN_FLIGHT_PER_KEY`
    - `BELLDANDY_WEBHOOK_MAX_IN_FLIGHT_TRACKED_KEYS`
  - 已补共享 guard 单测与 server ingress 定向回归，覆盖：
    - JSON content-type 判定
    - in-flight limiter
    - fixed-window rate limiter
    - request body timeout
    - `/api/webhook/:id` 的 `415 / 413 / 429 / 并发 429`
    - 以及原有 webhook idempotency 回归
- 当前边界：
  - 当前第一版只先覆盖 `/api/webhook/:id`，没有把 `/api/message` 一起并入同一套 guard runtime
  - 当前 rate limit / concurrency limiter 仍是单进程内存态，不是跨进程或持久化配额
  - 当前只先约束 JSON webhook，不包含 multipart、form-urlencoded 或更复杂 payload 类型
  - 当前还没有把这套 guard 做成可视化设置面，也没有纳入 system.doctor 的专门诊断项
- 第一版收口说明：
  - `P1-3` 第一版的目标是先把 webhook 在 auth 之前最容易失守的入口风险收紧，并把 guard 逻辑从 route 内散装判断收成共享层
  - 只要后续没有新增 webhook surface，且现有 `/api/webhook/:id` 没有再暴露明显的 body / rate / concurrency 缺口，`P1-3` 即可按当前第一版口径收口
  - 跨进程限流、统一 `/api/message` ingress、可视化配置与更细的异常审计继续后移，不作为当前 `P1-3` 阻塞项
- 完成标志：
  - webhook guard 形成统一层，不再散落在局部实现里

#### P1-4 Cron 约束校验与 stagger

- 来源文档：`OC与SS`
- 当前状态：`第一版最小约束层已落地（spec normalize + 显式 sessionTarget / delivery / failureDestination / stagger）`
- 目标：
  - 让 cron 配置与执行行为更可预测
- 前置依赖：
  - 无
- 直接任务：
  - spec 校验
  - `sessionTarget / delivery / failureDestination / stagger`
- 当前进展：
  - 已在 `packages/belldandy-core/src/cron/validation.ts` 新增第一版 cron spec normalize / validation 层
  - `CronStore.add / update / load` 已统一走这层最小规范化，而不再只是在执行层被动兜底
  - 第一版已补显式字段：
    - `sessionTarget`
      - 当前只先支持 `main / isolated`
      - `systemEvent` 默认 `main`
      - `goalApprovalScan` 默认 `isolated`
    - `delivery.mode`
      - 当前只先支持 `user / none`
    - `failureDestination.mode`
      - 当前只先支持 `user / none`
    - `staggerMs`
      - 当前先支持 `every / dailyAt / weeklyAt`
      - `at` 不支持 `stagger`
  - 已把 `systemEvent` 的执行语义从原先隐式的临时 `cron-${Date.now()}` 收口成显式分发：
    - `sessionTarget=main` 时使用稳定 job 会话 `cron-main:<jobId>`
    - `sessionTarget=isolated` 时每次运行使用新的 `cron-run:<jobId>:<timestamp>`
  - scheduler 已开始消费显式通知策略：
    - `delivery.mode=none` 时成功结果不再主动投递
    - `failureDestination.mode=user` 时执行失败会走最小失败通知
  - `staggerMs` 已接入 job 级 next-run 计算：
    - 基础 schedule 计算仍保持精确
    - 实际错峰通过 jobId 的稳定 offset 生效，避免不同 job 永远同时命中同一时刻
  - `cron` 工具已补最小参数入口与展示：
    - `sessionTarget`
    - `deliveryMode`
    - `failureDestinationMode`
    - `staggerMs`
    - list 输出会显式展示会话目标、通知模式和错峰配置
  - 已补 `store / scheduler / cron-tool` 定向测试，覆盖：
    - spec normalize 基本行为
    - `main / isolated` 两类 sessionTarget
    - `delivery.mode=none`
    - `failureDestination.mode=user`
    - `staggerMs` 字段与相关调度行为
- 当前边界：
  - 当前第一版没有直接照搬 OC 的 channel-level `delivery.to / channel / thread / accountId`，成功/失败通知仍只先走 SS 现有 `deliverToUser` 统一出口
  - 当前也没有补 `current / session:<id>` 这类更细粒度 sessionTarget
  - 当前 `stagger` 只先支持显式 `staggerMs`，还没有做 OC 那种 top-of-hour 默认错峰策略
  - 当前仍未把 cron / heartbeat / subtask 收进统一 shared ledger
- 第一版收口说明：
  - `P1-4` 第一版的目标是先把“cron spec 是什么、默认会话怎么跑、成功/失败怎么通知、错峰怎么表达”从隐式行为收成显式规范
  - 只要后续没有新增更复杂的 channel-native cron delivery 需求，当前这版即可作为 SS 的最小稳定 cron spec 继续演进
  - channel-level delivery target、`current / session:<id>`、默认 top-of-hour stagger、shared ledger 继续后移，不作为当前 `P1-4` 阻塞项
- 完成标志：
  - cron 歧义与行为漂移显著减少

### 6.3 P2 任务

#### P2-1 Provider 元数据层

- 来源文档：`OC与SS`
- 目标：
  - 建立 provider onboarding 与能力声明的统一描述层
- 前置依赖：
  - 阶段 A 的复杂任务主线进入稳定期
- 直接任务：
  - provider metadata registry
  - onboarding scopes
  - 模型白名单 / 能力范围声明
- 完成标志：
  - provider 不再继续污染 gateway 主分支

#### P2-2 认证感知 model picker

- 来源文档：`OC与SS`
- 目标：
  - 改善模型选择与配置体验
- 前置依赖：
  - `P2-1`
- 直接任务：
  - `auth missing`
  - preferred provider
  - 手动输入回退
  - catalog 过滤
- 完成标志：
  - 模型选择不再主要靠手填和外部记忆

#### P2-3 会话作用域与群聊 key 归一

- 来源文档：`OC与SS`
- 目标：
  - 提升多渠道会话连续性与路由一致性
- 前置依赖：
  - 无
- 直接任务：
  - session scope 策略
  - group/channel/webchat key 归一
- 完成标志：
  - 会话 key 与路由语义更一致

#### P2-4 current conversation binding

- 来源文档：`OC与SS`
- 目标：
  - 让跨线程、多渠道 reply-back 更稳定
- 前置依赖：
  - `P2-3`
- 直接任务：
  - current conversation binding 持久层
  - 与现有 resident conversation 绑定机制对齐
- 完成标志：
  - 外部线程继续回复到哪个 session 具备显式绑定

#### P2-5 统一媒体能力注册层 / 附件理解管线

- 来源文档：`OC与SS`
- 目标：
  - 为后续语音、图片、附件理解提供统一入口
- 前置依赖：
  - `P2-1`
- 直接任务：
  - capability/provider registry
  - 附件归一化
  - 缓存与识别 runner
- 完成标志：
  - STT / TTS / Image / Camera 不再只是分散工具集合

### 6.4 P3 任务

#### P3-1 安装与配置向导 2.0

- 来源文档：`OC与SS`
- 当前策略：
  - 后置产品化收口项
- 前置依赖：
  - `P2-1`
  - `P2-2`
  - `P1-1`
  - 阶段 A 至少完成一轮主线收口
- 直接任务：
  - `QuickStart / Advanced`
  - 风险确认
  - 远程 / 本地探测
  - 按模块分步配置
- 完成标志：
  - 向导收口的是“已稳定流程”，而不是“仍在变化的流程”

#### P3-2 独立 TUI 控制面

- 来源文档：`OC与SS`
- 当前策略：
  - 低优先级补强项
- 前置依赖：
  - 无强依赖，但建议在 P0/P1/P2 之后
- 直接任务：
  - 会话、Agent、Model 切换
  - 流式控制
  - 最小运维面
- 完成标志：
  - SSH / NAS / 无浏览器环境具备最小可用控制面

---

## 7. 建议的总顺序

按当前第三阶段建议，整体顺序如下：

1. `A1` 渐进式工具发现增强
2. `A2` PTC 落地
3. `A3` 子任务 steering / resume / continuation
4. `A4` 统一 continuation runtime
5. `B1` 渠道安全配置产品化
6. `B2` 统一渲染感知长消息分段
7. `B3` Webhook 入站保护层
8. `B4` Cron 约束校验与 `stagger`
9. `C1` Provider 元数据层
10. `C2` 认证感知 model picker
11. `C3` 会话作用域与 current conversation binding
12. `D1` 安装与配置向导 2.0
13. `D2` 独立 TUI 控制面

---

## 8. 明确的第三阶段收口目标

当下面这些条件同时满足时，可以认为第三阶段达到收口标准：

1. Agent 在复杂任务首轮不再背大量工具 schema，工具发现明显更轻
2. 复杂数据任务可优先走 PTC，而不是把原始结果全部塞进上下文
3. 子任务具备 steering、resume、continuation，而不是一次性执行后失联
4. long-goal / resident / subtask / background run 已具备统一的恢复与交接语义
5. 多渠道输入输出侧已经补齐安全默认值、长消息分段、webhook guard、cron 约束
6. provider 与 model 选择不再只靠环境变量和人工记忆，已具备统一元数据与选择入口
7. 安装与配置向导 2.0 只在上述核心流程稳定后再进入实施，而不是提前固化不稳定流程

如果只用一句话概括第三阶段的总收口目标，就是：

- 先把 Star Sanctuary 的复杂任务执行链做稳、做深、做可恢复，再把这些已稳定能力统一回收到产品化入口。 

---

## 9. 开发规则

### 9.1 文档进度同步规则

1. 每完成一项优化后，要进行 `OC与SS的系统功能对比.md` 的进度更新与后续计划说明，并要在 `2. 实现功能对比例表` 上进行已优化项的精简说明，以便后续查阅已实现的优化项。

### 9.2 通用技术债规避要求

1. 当某个代码文件已经超过 `3000` 行时，新增功能应优先考虑放到外部新文件，只在原文件保留最小接线、注册、转发或装配逻辑。
2. 除非是确实无法避免的局部修补，否则尽量不要再把新的主体逻辑继续写进已经超过 `3000` 行的文件。
3. 这条要求的目的很直接：
   - 先阻止大文件继续恶化
   - 让后续拆分从被动大重构变成新增功能自然外移

### 9.3 WebChat 复杂度控制

1. 当前 `webchat` 的结构和内容已经较复杂，新增功能时必须克制 UI 膨胀。
2. 非重要的新增内容，不要默认继续在 `webchat` 上增加新元素。
3. 能减少的非重要内容应优先减少；能并入同类或近似模块的内容，应优先并入，而不是新增并列入口、并列面板或并列控件。
4. 如果某项信息主要服务诊断、审计或调试，应优先复用已有区域，例如 `doctor`、长期任务详情、子任务详情、现有设置面板或已有二级弹窗，而不是新增一级导航入口。
