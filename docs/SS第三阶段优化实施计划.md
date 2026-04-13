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

5. `D0 / D1` 产品化安装路径在早期不作为最高优先级
   - 来源：`OC与SS`
   - 原因：早期仍处于持续优化和结构调整期，过早产品化大概率返工
   - 当前更新：`D1 Advanced` 第一版与 `H4-2` 第一轮收口后，主线已转到 `D0` 安装到启动闭环稳定性

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

1. `D0` 一行命令安装器 / bootstrap installer
   - 来源：本轮新增产品化收口项
   - 原因：依赖发布产物命名、跨平台安装协议、`bdd` shim 与安装后交接链路先稳定

2. `D1` 安装与配置向导 2.0
   - 来源：`OC与SS`
   - 原因：依赖 `D0`、provider、channel、安全默认值、模型选择器、执行链这些底层能力先稳定

3. 独立 TUI 控制面
   - 来源：`OC与SS`
   - 原因：收益低于当前复杂任务主线，且会分散 UI/交互预算

4. 统一媒体能力注册层
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
6. `D0` 一行命令安装器 / bootstrap installer
7. `D1` 安装与配置向导 2.0
8. `D2` 独立 TUI 控制面

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
- 当前状态：`已按“最小 shared ledger + 最小 replay/takeover 接线”正式收口`
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
  - 当前已完成 A4 第一轮 runtime 接线：
    - 已新增独立 `background continuation ledger` 模块，不把主体逻辑继续塞进 `gateway / server`
    - `heartbeat` 已开始把 `running / ran / skipped / failed` 运行摘要写入统一 ledger
    - `cron` 已开始把 `started / finished / skipped` 运行摘要写入统一 ledger，并保留 `sessionTarget / nextRunAtMs / conversationId`
    - `subtask` 已接入同一类 shared ledger，同步写入 `running / ran / failed / skipped` 摘要，不再停留在 `cron / heartbeat` 双轨
    - 已新增 background continuation builder，把 `cron / heartbeat` recent run 摘要收敛成同一类最小 `continuationState`
    - `system.doctor` 与现有 settings -> doctor 已开始显示统一 `Background Continuation Runtime` 摘要卡
    - doctor 中的 background runtime recent entries 已接成现有 continuation action，可最小 replay 到 chat / goals / subtasks 等既有消费面
    - 已新增最小 `subtask.takeover`：
      - 仅支持 `finished subtask`
      - 内部仍复用 same-task relaunch / resume 链
      - 只额外允许显式覆盖接手的 `agentId / profileId`
    - 当前这一步的目的，是先把 `subtask / cron / heartbeat` 从“分散运行”推进到“至少可统一读取和诊断”的最小台账层
  - 当前这一版定位为“统一恢复工作集视图层 + 首批消费面接线”，不是完整 resident/main/subtask/goal runtime 融合
  - 已补 continuation builder 单测、RPC 断言、定向 vitest 与全仓 `build` 验证
- 收口判定：
  - `A4` 现可按“最小 shared ledger + 最小 replay/takeover 接线”口径正式判定为已收口
  - 判定依据：
    - `cron / heartbeat / subtask` 已进入同一条 background continuation ledger，而不是继续分散成多套不可统一读取的后台运行摘要
    - 统一 ledger 已能稳定收敛为最小 `continuationState`，并进入现有 `system.doctor / settings -> doctor` 消费面
    - doctor 中的 recent runtime entry 已可通过现有 continuation action 回看到既有 chat / goals / subtasks 入口，完成最小 replay 闭环
    - `finished subtask` 已有显式 takeover 入口与 RPC，且实现边界仍保持在 same-task relaunch wrapper，没有演变成 unified runtime 重构
  - 收口说明：
    - 从第三阶段当前目标看，`A4` 的职责是先把 continuation runtime 从“分散摘要”推进到“统一最小台账 + 可回看 + 最小 takeover”
    - 这一目标现在已经满足，不应再把更深的 replay / recovery / mid-run orchestration 继续塞回 `A4`
    - 后续若仍需增强，应新开后置任务承接，避免 `A4` 边界持续膨胀、反复 reopen
- 出口条件：
  - 以下条件满足后，即可视为当前阶段 `A4` 完成：
    - `cron / heartbeat / subtask` 三类后台/异步运行面都已进入同一 shared ledger
    - shared ledger 中的 recent entry 至少带有可消费的最小 `continuationState`，而不是只有诊断字符串
    - 现有消费面中，至少有一个稳定入口能从 ledger entry 直接回看/打开对应 continuation target
    - `finished subtask` 至少支持一次显式跨 agent 承接，且状态、目标 agent、resume 记录都能在现有 subtask detail / runtime 记录中看到
    - 本轮实现仍保持“最小接线”边界，没有引入新的 unified replay platform、checkpoint runtime 或 mid-run takeover 编排层
- 当前边界：
  - 当前仍以 doctor / observability + 既有消费面为主，不是完整的 replay / handoff / takeover / background recovery 产品面
  - 当前 takeover 只覆盖 `finished subtask`，还没有 mid-run takeover、goal takeover、session takeover 的产品闭环
  - 还没有 checkpoint-level replay、background run recovery runtime、统一 replay workbench
- 技术债决策：`defer`
  - 暂不直接做 shared ledger + unified replay 大重构，避免一次性拉高耦合与验证面
- 后续计划：
  - 继续观察 resident / main / subtask 三侧对字段的真实消费频率，决定是否进一步压缩 `labels / recent` 等聚合字段
  - 继续评估是否要把 `node / session` 的定位从“section/card 高亮”继续推进到更细粒度的节点展开、checkpoint 过滤、消息锚点或时间线锚点
  - 若 shared ledger 的字段稳定，再评估是否继续把 replay 从 doctor/现有入口接线推进到更直接的 continuation 产品面
  - 若真实场景继续需要更深恢复能力，再单独拆出 `checkpoint replay / background recovery / mid-run takeover`
  - 最后再决定是否进入真正的 unified continuation runtime 重构

#### A5. continuation runtime 后置增强

- 来源文档：
  - `LA与SS`
  - `OC与SS`
- 当前状态：`已按“checkpoint replay + background recovery + 受限 safe-point takeover”完成当前阶段收口`
- 目标：
  - 在不破坏当前最小台账边界的前提下，补更深一层的 replay / recovery / takeover 能力
- 前置依赖：
  - `A4` 已稳定
  - `background continuation ledger` 字段在真实任务中已跑过一轮并确认稳定
- 直接任务：
  - `A5-1 checkpoint replay`
    - 让 goal / checkpoint 能从已记录的 continuation 工作集回放到更具体的执行节点，而不只停留在“打开对应页面”
    - 优先做最小 checkpoint-level replay，不直接扩成统一 replay 引擎
  - `A5-2 background recovery runtime`
    - 为 `cron / heartbeat / background subtask` 失败后补最小恢复动作与恢复状态，而不只是在 doctor 中显示失败摘要
    - 明确 recovery record、recovered-from、latest recovery outcome 的最小字段
  - `A5-3 mid-run takeover / handoff`
    - 评估运行中子任务的 safe-point 接管，而不是只支持 `finished subtask`
    - 若实现，必须继续限制在 safe-point，不做 token 级 live injection
  - `A5-4 goal / session takeover`
    - 把 takeover 语义从 `finished subtask` 扩到更高层目标，但保持“最小入口 + 既有消费面承接”边界
    - 不直接引入新的统一 runtime 控制台
  - `A5-5 replay / continuation workbench 评估`
    - 评估是否真的需要独立 replay workbench，还是继续复用 doctor / goals / subtasks / chat 即可
    - 只有当 doctor 入口已明显不足时，才考虑新增独立产品面
  - `A5-6 session 锚点深化`
    - 在 prompt snapshot 锚点之外，评估是否补真正的聊天消息时间线锚点
    - 仅在真实回看需求稳定出现后再推进
- 收口目标：
  - continuation 不再只具备“看得到、点得到、接得住”三件事，而开始具备“局部回放、失败恢复、有限接管”的增强能力
  - 这些增强仍保持最小边界，不演变成大一统 runtime 重构
- 完成标志：
  - 至少有一项深度恢复能力形成最小闭环并通过真实场景验证
  - `A4` 已有入口不被破坏，shared ledger 字段没有因增强项再次失控膨胀
  - 继续明确哪些能力仍属于后续独立大任务，而不是在 `A5` 内无限扩面
- 当前边界：
  - `A5` 是后置增强，不是第三阶段收口前的强制项
  - 若 `P2-1 ~ P2-5`、产品化收口或渠道主线更紧急，`A5` 可以继续后移
  - `A5` 默认不得回改 `A4` 已收口的出口条件、shared ledger 主链、doctor 最小消费面与既有 finished-subtask takeover 语义；若后续某项增强必须触碰这些已收口主链，应单独评估风险并另开任务，不在 `A5` 内直接扩做
- 当前阶段收口定义（更新）：
  - `A5` 当前阶段不以完整做完 `A5-1 ~ A5-6` 为目标
  - 当前阶段的完成定义调整为：
    - `A5-1 checkpoint replay` 已完成
    - 继续补 `A5-2 background recovery runtime` 的最小失败恢复闭环
    - 再补 `A5-3` 的受限版 safe-point takeover / handoff
  - `A5-4 / A5-5 / A5-6` 明确保留为后续增强储备，不作为当前阶段收口条件
  - 这样收口后，`A5` 即满足：
    - 已具备“局部回放”
    - 已具备“失败恢复”
    - 已具备“有限接管”
    - 但仍不演变成大一统 continuation runtime 重构
- 当前阶段风险判断（更新）：
  - 继续推进 `A5` 当前阶段收口属于`中等、可控`
  - `A5-2` 的主要风险是 recovery 字段膨胀、自动恢复循环、误恢复到错误目标
  - `A5-3` 的主要风险是从 safe-point 滑向 live injection；因此必须继续限制为 safe-point takeover
  - `A5-4 / A5-5 / A5-6` 当前若继续推进，扩面风险明显高于收益，故保持后置
- 技术债决策：`split_task`
  - 把 `checkpoint replay / background recovery / mid-run takeover / goal-session takeover / workbench 评估` 拆成同一主题下的后置包，而不是继续挂在 `A4` 下混做
- 后续计划：
  - `A5` 当前阶段不再主动扩面
  - 仅继续观察真实 `checkpoint replay / background recovery / safe-point takeover` 使用信号
  - 若出现误判、误恢复或接管语义不清，再做最小修补
  - `A5-4 / A5-5 / A5-6` 继续保持后置，不纳入当前阶段完成定义

##### A5-2 background recovery runtime 文件级计划

- 本轮目标：
  - 在现有 `background continuation ledger` 之上补最小恢复闭环
  - 让 `cron / heartbeat / background subtask` 在失败后不再只是“看得到失败”，而是能形成一次受控恢复尝试
  - 继续复用 doctor / 现有 continuation 消费面，不新增统一恢复控制台
- 本轮边界：
  - 仅处理 `failed` 的后台项
  - 仅允许“最多一次受控恢复尝试 + 恢复结果落账 + doctor 可见”
  - 必须有节流 / 去重，避免失败后无限自旋
  - 不扩成统一后台任务编排器，不改 `A4` 的 shared ledger 主链
- 文件级实现清单：
  - `packages/belldandy-core/src/background-recovery-runtime.ts`
    - 新增 `A5-2` 主体逻辑，避免把主体继续塞进 `gateway.ts`
    - 定义最小恢复决策、节流 / 去重、恢复结果记录与执行器接口
    - 仅支持：
      - `recoverHeartbeat()`
      - `recoverCron(jobId)`
      - `recoverSubtask(taskId)`
  - `packages/belldandy-core/src/background-continuation-runtime.ts`
    - 为 `BackgroundContinuationRecord` 增加最小 recovery 字段
    - 建议字段控制在：
      - `recoveredFromRunId?`
      - `recoveryAttemptCount?`
      - `latestRecoveryAttemptAt?`
      - `latestRecoveryOutcome?`
      - `latestRecoveryRunId?`
      - `latestRecoveryReason?`
    - 同步补 `clone / normalize / persist / doctor report`
    - doctor 汇总补最小恢复计数
  - `packages/belldandy-core/src/cron/scheduler.ts`
    - 为 `CronSchedulerHandle` 增加极小 `runJobNow(jobId)` 手动恢复入口
    - 复用现有 `executeJob`，不引入新的调度语义
  - `packages/belldandy-core/src/heartbeat/runner.ts`
    - 复用现有 `runOnce()` 作为 heartbeat recovery 执行器
    - 不额外改调度语义
  - `packages/belldandy-core/src/task-runtime.ts`
    - subtask recovery 继续复用现有 `resumeSubTask` 主链，只支持终态失败任务
  - `packages/belldandy-core/src/subtask-background-continuation-ledger.ts`
    - 确保失败 subtask ledger 记录稳定带出 recovery 所需 source/task 语义
    - 避免恢复前后因签名问题重复刷账
  - `packages/belldandy-core/src/bin/gateway.ts`
    - 实例化 background recovery runtime
    - 注入 `heartbeatRunner.runOnce` / `cronSchedulerHandle.runJobNow` / `resumeSubTask`
    - 在后台失败事件落账后触发最小恢复判断
    - 保持为装配 / 接线层，不承载主体逻辑
  - `packages/belldandy-core/src/server.ts`
    - `system.doctor` 继续复用现有 background continuation runtime 卡片
    - 补最小 recovery 汇总与最近恢复结果可见性
  - `apps/web/public/app/features/doctor-observability.js`
    - 在现有 background runtime 卡片中补 recovery 摘要
    - 不新增新面板
  - 测试：
    - `packages/belldandy-core/src/background-recovery-runtime.test.ts`
    - `packages/belldandy-core/src/background-continuation-runtime.test.ts`
    - `packages/belldandy-core/src/subtask-background-continuation-ledger.test.ts`
    - `packages/belldandy-core/src/server.test.ts`
- 本轮完成判定：
  - failed background run 能触发一次最小恢复尝试
  - 同一失败信号在节流窗口内不会重复恢复
  - ledger / doctor 能看见 `recoveredFrom` 与最近恢复结果
  - 不新增新导航、不新增独立恢复控制台
- 当前进度：
  - `A5-2 background recovery runtime` 已完成第一版最小闭环
  - 已落地内容：
    - 已新增独立 `background-recovery-runtime` 模块，专门承载后台失败恢复决策、节流 / 去重与结果落账，不把主体逻辑继续塞进 `gateway.ts`
    - `background continuation ledger` 已补最小 recovery 字段：
      - `recoveredFromRunId`
      - `recoveryAttemptCount`
      - `latestRecoveryAttemptAt`
      - `latestRecoveryOutcome`
      - `latestRecoveryRunId`
      - `latestRecoveryReason`
      - `latestRecoveryFingerprint`
    - `cron` 已补极小 `runJobNow(jobId)` 恢复入口，复用现有执行主链而不是引入新调度语义
    - `heartbeat` 已复用现有 `runOnce()` 作为 recovery 执行器
    - `background subtask` 已复用现有 `resumeSubTask` 主链做最小失败恢复，并在 shared ledger finalize 后触发 recovery 判断
    - `gateway` 已把 `cron / heartbeat / subtask` 的 failed run 接到统一 background recovery runtime，而不是三处各自散落处理
    - `system.doctor / web doctor` 的 background continuation runtime 卡片已补 recovery 汇总与最近恢复结果可见性
  - 已完成验证：
    - `packages/belldandy-core/src/background-continuation-runtime.test.ts`
    - `packages/belldandy-core/src/background-recovery-runtime.test.ts`
    - `packages/belldandy-core/src/subtask-background-continuation-ledger.test.ts`
    - `packages/belldandy-core/src/server.test.ts` 已定向通过 background continuation runtime 的 doctor 用例
    - `corepack pnpm build` 已通过
  - 当前收口说明：
    - `A5-2` 到此收口为“failed background run 已能触发一次最小恢复尝试，并把恢复结果稳定落到 ledger / doctor”
    - 当前仍未扩做后台统一恢复控制台、策略编排器或多轮自动重试器
- 后续计划：
  - 下一步进入 `A5-3` 的受限版 safe-point takeover / handoff
  - 继续明确边界：
    - 仅做 safe-point takeover
    - 不做 token 级 live injection
    - 不把 takeover 扩成更高层统一 runtime 控制台

##### A5-3 safe-point takeover / handoff 文件级计划

- 本轮目标：
  - 为 `running subtask` 补最小 `safe-point takeover`
  - 语义上是“停止当前 session -> 以新 agent 重新拉起”，而不是 live injection
  - 在 runtime record / query runtime / Web detail 区都补明确的 takeover / handoff 表达
- 本轮边界：
  - 只处理 `subtask` 层
  - 不扩到 `goal / session takeover`
  - 不新增新 RPC，不新增统一 takeover 控制台
  - 必须继续限制在 safe-point，不做 token 级 live steering / injection
- 文件级实现清单：
  - `packages/belldandy-core/src/task-runtime.ts`
    - 为 `SubTaskRecord` 增加独立 `takeover` 记录
    - 新增 `SubTaskTakeoverStatus / SubTaskTakeoverRecord`
    - 新增 `createSubTaskTakeoverController`
    - 运行中接管语义固定为：
      - 记录 accepted
      - stop current session
      - 复用 prior history
      - 用新 `agentId/profileId` relaunch
      - 标记 delivered / failed
  - `packages/belldandy-core/src/subtask-takeover-runtime.ts`
    - 承载 running / terminal takeover 的最小分发逻辑
    - `gateway.ts` 只保留装配与接线
  - `packages/belldandy-core/src/continuation-state.ts`
    - 为 subtask continuation 补最小 takeover 感知
    - 至少能表达：
      - 可接管
      - 正在接管
      - 已由新 agent 接管
  - `packages/belldandy-core/src/query-runtime-subtask.ts`
    - 继续复用 `subtask.takeover`
    - 但在 query runtime 中明确 running task 命中的是 `safe-point takeover`
    - 不再默认把 takeover 视为 finished-task only
  - `packages/belldandy-core/src/server.ts`
    - 继续复用 `subtask.takeover` RPC
    - 接入新的 running / terminal takeover dispatcher
  - `packages/belldandy-core/src/bin/gateway.ts`
    - 注入新的 safe-point takeover controller / dispatcher
    - 不承载 takeover 主体逻辑
  - `apps/web/public/app/features/subtasks-overview.js`
    - running task 也显示 `safe-point takeover` 输入与按钮
    - finished task 继续保留现有 takeover
    - 在 detail 区单独渲染 takeover 记录，不再混在普通 resume / steering 里
  - `apps/web/public/app/i18n/zh-CN.js`
  - `apps/web/public/app/i18n/en-US.js`
    - 补明确文案：
      - safe-point takeover placeholder
      - accepted / delivered / failed
      - “停止后重拉起，不是 live injection”
  - `packages/belldandy-core/src/subtask-background-continuation-ledger.ts`
    - 把 takeover 记录纳入 ledger signature，确保 background continuation / doctor 能感知接管变化
  - 测试：
    - `packages/belldandy-core/src/task-runtime.test.ts`
    - `packages/belldandy-core/src/server.test.ts`
    - `packages/belldandy-core/src/subtask-background-continuation-ledger.test.ts`
    - `apps/web/public/app/features/subtasks-overview.test.js`
- 本轮完成判定：
  - running subtask 可以由新 agent 发起 safe-point takeover
  - takeover 语义明确是 stop + relaunch，而不是 live injection
  - takeover 在 runtime record / UI / query runtime 中有独立表达
  - finished-task takeover 旧行为不回归
- 当前进度：
  - `A5-3 safe-point takeover / handoff` 已完成受限版最小闭环
  - 已落地内容：
    - `task-runtime` 已新增独立 `takeover` 记录、`SubTaskTakeoverStatus / Record / Mode` 与显式 `createSubTaskTakeoverController`
    - running subtask takeover 已固定为 `stop current session -> prior history -> new agent relaunch` 的 safe-point 语义，不做 live injection
    - 已新增独立 `subtask-takeover-runtime` 分发层，`gateway.ts` 只保留 running / terminal takeover 接线，不再把 takeover 隐藏成 finished-task resume 包装
    - `continuation-state` 已补最小 takeover 感知，能区分 `safe_point_takeover / agent_takeover`
    - `query-runtime-subtask` 已明确 running task 命中的是 `safe_point takeover`
    - Web 子任务详情区已新增 running / finished 统一 takeover 区，并把 takeover 记录从普通 resume 区分离展示
    - 中英文本地化已补齐 “安全点重拉起，不是 live injection” 的提示
    - `subtask-background-continuation-ledger` 已把 takeover 记录纳入 signature，避免 background continuation / doctor 漏感知接管变化
  - 已完成验证：
    - `packages/belldandy-core/src/task-runtime.test.ts`
    - `packages/belldandy-core/src/subtask-background-continuation-ledger.test.ts`
    - `packages/belldandy-core/src/continuation-state.test.ts`
    - `packages/belldandy-core/src/background-continuation-runtime.test.ts`
    - `apps/web/public/app/features/subtasks-overview.test.js`
    - `packages/belldandy-core/src/server.test.ts -t "subtask.takeover accepts"` 已定向通过 finished takeover 与 running safe-point takeover 两组 RPC 用例
    - `corepack pnpm build` 已通过
  - 当前收口说明：
    - `A5` 当前阶段到此按“checkpoint replay + background recovery + 受限 safe-point takeover”正式收口
    - 当前仍未扩做 `goal / session takeover`、统一 takeover 控制台、checkpoint replay workbench 或更深 session 锚点
- 后续计划：
  - `A5` 后续不再主动开发
  - 只在真实使用中观察三类信号：
    - safe-point takeover 是否存在误停、误接管或文案理解偏差
    - background recovery 是否出现误恢复或恢复节流不足
    - checkpoint replay 是否仍有 target 锚点不清问题
  - 若出现问题，仅做最小修补；`A5-4 / A5-5 / A5-6` 继续后置

##### A5 当前建议的首刀与文件级计划

- 当前建议首刀：`A5-1 checkpoint replay`
  - 先把 `A5` 收敛成 goal / checkpoint 级最小 replay 闭环
  - 让用户可从现有 `handoff / continuation` 入口，直接 replay 到对应 node channel，而不只是打开 goals 详情页
  - 不新开 replay workbench，不扩成统一 continuation 平台
- 当前阶段收口边界：
  - 仅实现 `checkpoint replay`
  - 不顺手扩做 `A5-2 background recovery runtime`
  - 不在这一轮推进 `A5-3 / A5-4` 的 mid-run takeover / goal-session takeover
  - 不回改 `A4` 已收口的 shared ledger / doctor 最小消费面主链
- 文件级实现清单：
  - `packages/belldandy-core/src/goals/types.ts`
    - 为 `GoalHandoffSnapshot` 增加最小 `checkpoint replay descriptor`
    - 字段控制在最小集：`checkpointId / nodeId / runId? / title / summary? / reason`
  - `packages/belldandy-core/src/goals/handoff.ts`
    - 从 open checkpoint 生成 replay descriptor
    - 在 `resumeMode=checkpoint` 时让 `nextAction` 与 replay target 对齐
    - `handoff.md` 补最小 replay 摘要，不新增独立大面板
  - `packages/belldandy-core/src/continuation-state.ts`
    - 为 goal continuation 补可选 replay 字段
    - `buildGoalContinuationState` 透传 checkpoint replay descriptor
    - 其他 scope 暂不扩面，仅保留可选字段兼容后续增强
  - `packages/belldandy-core/src/goals/manager.ts`
    - 评估并落地 `resumeGoal(goalId, nodeId?)` 的最小 replay 参数扩展
    - 若接入 replay，则把 `checkpointId` 写入最小进度事件，保留可审计性
  - `packages/belldandy-core/src/server.ts`
    - 为 `goal.resume` 透传最小 replay 参数
    - `goal.handoff.get / generate` 返回新增 replay 字段
  - `apps/web/public/app/features/continuation-targets.js`
    - 在 goal checkpoint 场景生成最小 `goalReplay` continuation action
    - 其他 `goal / node / session / conversation` 语义保持不变
  - `apps/web/public/app.js`
    - 在 `openContinuationAction` 中新增 `goalReplay` 分支
    - 点击后复用现有 `resumeGoal` 主链进入目标 node channel
  - `apps/web/public/app/features/goals-readonly-panels.js`
    - 在现有 continuation 区补 replay target 的最小说明
    - 按钮文案在 checkpoint 场景更明确为 replay 语义
  - `apps/web/public/app/features/goals-detail.js`
    - 在 recovery suggestion 文案中与 checkpoint replay 语义对齐
    - 不新增新区域
  - 测试：
    - `packages/belldandy-core/src/goals/manager.test.ts`
    - `packages/belldandy-core/src/server.test.ts`
    - `apps/web/public/app/features/continuation-targets.test.js`
- 本轮完成判定：
  - open checkpoint 的 goal 能产出明确 replay target
  - Web continuation 点击后能进入对应 node channel，而不是只停在 goals 详情
  - 不新增一级导航、不新增 replay workbench、不破坏既有 continuation action
- 当前进度：
  - `A5-1 checkpoint replay` 已完成第一刀闭环
  - 已落地内容：
    - `goal.handoff.get / generate` 已输出最小 `checkpointReplay` 描述，明确 `checkpointId / nodeId / title / reason`
    - `goal continuationState` 已补可选 `replay` 字段，复用现有 continuation 消费面承接
    - `goal.resume` 已支持最小 `checkpointId` 透传，并在 `progress.md` 写入 `checkpoint_replay_started`
    - Web 端现有 continuation action 已新增 `goalReplay` 分支，点击后会直接 replay 到目标 node channel
    - goals readonly handoff / continuation 区已补最小 replay 摘要，不新增独立 workbench
    - goals detail recovery suggestion 文案已与 checkpoint replay 语义对齐
  - 已完成验证：
    - `packages/belldandy-core/src/continuation-state.test.ts`
    - `packages/belldandy-core/src/goals/manager.test.ts`
    - `apps/web/public/app/features/continuation-targets.test.js`
    - `packages/belldandy-core/src/server.test.ts` 已定向通过 `goal.handoff.get` 与 `goal.resume` 两个 A5-1 相关用例
  - 当前收口说明：
    - `A5-1` 到此收口为“checkpoint 级 replay 已能从现有 handoff / continuation 入口进入目标 node channel”
    - 本轮不继续扩做 background recovery runtime、mid-run takeover、goal / session takeover
- 后续计划：
  - 先观察真实使用中，checkpoint replay 是否已覆盖大部分“看得到但继续不了”的场景
  - 若后续真实需求继续集中在后台失败恢复，再单独推进 `A5-2 background recovery runtime`
  - 若后续真实需求集中在运行中接管或更高层 takeover，再分别拆进 `A5-3 / A5-4`

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

#### D0. 一行命令安装器 / bootstrap installer

- 来源文档：本轮新增产品化收口项
- 当前策略：`后置实施`
- 原因：
  - 目前仍在优化调整期
  - 发布产物命名、跨平台安装协议、`bdd` 命令 shim 与安装后交接链路尚未完全稳定
  - 现在固化安装协议，大概率会放大后续返工成本
- 进入实施的前置条件：
  - GitHub Releases tag / metadata 解析链已稳定
  - `Windows / macOS / Linux` 至少各有一条稳定的源码包 bootstrap 路径
  - `bdd` CLI 入口与安装后 `setup/start/doctor` 交接语义已稳定
- 默认安装源：
  - GitHub Releases 的源码包（`zipball / tarball`）
  - GitHub Releases metadata API（用于解析目标 tag 与源码包地址）
- 边界说明：
  - `artifacts/` 仍可保留为内部构建中间产物与小白特供 exe/portable 包来源
  - 但 `artifacts/` 不作为默认安装协议，也不作为 Setup 2.0 的主入口定义
- 收口目标：
  - 用户只需一行命令即可完成“下载源码包 -> 检查 `Node / corepack` -> `pnpm install / build` -> 进入 `bdd setup`”
  - 覆盖 `Windows / macOS / Linux`
  - 安装目录保留 `start.bat / start.sh` 作为重复启动入口；`Windows` 默认生成桌面快捷方式
  - 默认路径允许依赖用户机器已有 `Node.js`，但不依赖用户预先装好全局 `pnpm`

#### D1. 安装与配置向导 2.0

- 来源文档：`OC与SS`
- 当前策略：`后置实施`
- 原因：
  - 目前仍在优化调整期
  - provider / channel / security / execution 流程尚未完全稳定
  - 现在做成高完成度向导大概率返工
- 进入实施的前置条件：
  - `D0` 已让默认产品路径具备“用户先获得可运行 `bdd`”的能力
  - provider metadata 已稳定
  - model picker 已稳定
  - 渠道安全默认值已明确
  - 至少一轮复杂任务执行链收口完成
- 收口目标：
  - 在 `bdd` 已可运行后，用统一向导把已成熟流程产品化，而不是把未稳定流程提前固化
  - `D1` 只负责安装后的配置与首次引导，不承担默认下载职责
  - 配对批准默认在 WebChat 内闭环完成，不要求用户回终端执行批准命令

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

- 当前 `P0-8`、`A4` 与 `P1-1 ~ P1-4` 都已达到本阶段可收口状态，不建议继续反复 reopen；后续默认只做回归修补或被后续主线明确牵引的最小接线
- `A4` 已按“统一 background continuation ledger + doctor 可见 runtime 摘要 + 最小 replay/takeover 接线”正式收口
- continuation 相关后续能力已转入 `A5 / continuation runtime 后置增强` 草案，不再阻塞第三阶段当前主线
- 当前建议推进顺序：
  1. `P2-3 会话作用域与群聊 key 归一`
  2. `P2-4 current conversation binding`
  3. `P2-1 Provider 元数据层`
  4. `P2-2 认证感知 model picker`
  5. `P2-5 统一媒体能力注册层 / 附件理解管线`
  6. `A5 / continuation runtime 后置增强`
- 排序理由：
  - `P2-3 / P2-4` 会直接影响多渠道、多线程连续性，是后续渠道与 conversation surface 稳定化的关键前置
  - `P2-1 / P2-2` 更偏 provider / product abstraction，且已逐渐成为后续产品化收口前的重要欠账
  - `P2-5` 有价值，但当前对第三阶段主线的阻塞性低于会话与 provider 两条线
  - `A5` 虽重要，但已被明确降级为后置增强，不应再压过当前主线
- 当前 `A4` 的正式收口说明：
  - `cron / heartbeat / subtask` 已纳入统一 background continuation ledger，并在现有 doctor / 诊断面可见
  - doctor recent entry 已能复用现有 continuation action 回看既有消费面
  - `finished subtask takeover` 已完成最小落地
  - `checkpoint replay / background recovery runtime / mid-run takeover / goal-session takeover` 已转入 `A5`，不再作为 `A4` 阻塞项

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
- 当前状态：`已完成第二版最小接线`
- 目标：
  - 先把 `cron / heartbeat / subtask` 从分散后台运行推进到统一可读的 continuation runtime 台账
- 前置依赖：
  - `P0-8`
- 实现要点：
  - 新增独立 `background continuation ledger`
  - 记录 `cron / heartbeat / subtask` 的 `running / ran / skipped / failed` recent run 摘要
  - 把 recent run 摘要统一映射到最小 `continuationState`
  - 在现有 `system.doctor / settings -> doctor` 中暴露统一 runtime 卡片
- 当前已完成的最小版本：
  - 已新增独立 ledger 模块，不继续把主体逻辑塞进 `gateway / server`
  - `heartbeat` 已开始记录 `runId / conversationId / reason / message`
  - `cron` 已开始记录 `jobId / sessionTarget / nextRunAtMs / conversationId / status`
  - `subtask` 已并入同一 background continuation ledger，同步记录 `status / sessionId / summary / continuation target`
  - 已新增 `Background Continuation Runtime` doctor 卡片，可统一查看 `cron / heartbeat / subtask` 的最近运行与 continuation target
  - doctor recent entry 已支持通过现有 continuation action 直接打开对应 continuation target
  - 已补 ledger builder 单测、doctor RPC 断言、前端摘要断言与构建验证
- 当前边界：
  - 当前卡片仍是基于既有消费面的最小 replay 接线，不是独立 replay workbench
  - 当前只解决“可统一记录 + 可最小回看”，还没有背景恢复编排能力
- 技术债决策：`split_task`
  - `checkpoint replay / recovery runtime / mid-run takeover` 继续拆分后置
- 完成标志：
  - `cron / heartbeat / subtask` 不再是多套完全分离、不可统一诊断的 background run 语义
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
- 当前状态：`已完成第一版最小只读 catalog 接线（provider/model catalog + models.list 外移）`
- 目标：
  - 建立 provider onboarding 与能力声明的统一描述层
- 前置依赖：
  - 阶段 A 的复杂任务主线进入稳定期
- 直接任务：
  - provider metadata registry
  - onboarding scopes
  - 模型白名单 / 能力范围声明
- 当前进展：
  - 已新增独立 provider/model catalog 模块，不再把 `models.list` 主体逻辑继续塞回 `server.ts`
  - 已把 `models.list` 外移为独立 query-runtime 处理器，统一返回：
    - `providers`
    - `models`
    - `currentDefault`
    - `manualEntrySupported`
  - 第一版已开始输出最小 provider metadata：
    - `providerId / providerLabel`
    - `onboardingScopes`
    - `authStatus`
    - `protocol / wireApi`
    - 最小 `capabilities`
  - 第一版来源当前先覆盖：
    - env primary model
    - `models.json` fallback profiles
  - 第一版已把 `models.json` 在线编辑接入现有 WebChat settings：
    - 编辑入口位于 `OpenAI Model` 与 `Heartbeat Interval` 之间
    - 形态沿用轻量 JSON 编辑区，不新增一级设置入口
    - 服务端已补 `models.config.get / update` 最小 RPC
    - 已补 `[REDACTED]` 保留旧密钥语义，避免把 fallback `apiKey` 明文回传到前端
    - 保存后会原地刷新 runtime `modelFallbacks`，并立刻反映到 `models.list / model picker`
  - 当前目的，是先把 provider/model 目录从“零散 env + fallback 列表”推进到“统一只读 catalog 入口”，为后续 `P2-2` model picker 提供单一数据源
- 当前边界：
  - 当前仍不包含 provider setup wizard、provider 插件化 onboarding 或独立 provider 管理面板
  - 当前 `manualEntrySupported` 仅先作为 catalog 能力位输出，手动输入模型的完整产品闭环仍留给 `P2-2`
  - 当前 provider metadata 仍是最小注册式描述，不是完整 provider runtime / routing 重构
- 第一版收口说明：
  - `P2-1 v1` 当前按“最小 catalog + models.list 外移 + settings 内联 models.json 编辑”口径先行收口
  - 后续继续围绕 `P2-2` 扩成 auth-aware model picker，但不应把 provider setup wizard 或 plugin-sdk 式大抽象提前塞进本轮
- 完成标志：
  - provider 不再继续污染 gateway 主分支

#### P2-2 认证感知 model picker

- 来源文档：`OC与SS`
- 当前状态：`已完成第一版最小 picker 接线（auth-aware labels + manual model fallback）`
- 目标：
  - 改善模型选择与配置体验
- 前置依赖：
  - `P2-1`
- 直接任务：
  - `auth missing`
  - preferred provider
  - 手动输入回退
  - catalog 过滤
- 当前进展：
  - WebChat 现有 `modelSelect` 已开始消费 `P2-1` 的统一 catalog 数据，不再只显示裸模型名
  - 第一版已补最小 auth-aware picker 能力：
    - option label 已开始显示 `providerLabel`
    - `authStatus=missing` 已开始显示显式缺失提示
    - 当前 default model 展示已复用同一套格式化逻辑
  - 第一版已补手动模型输入回退：
    - 现有下拉已新增最小 `Manual Model...` 入口
    - 已新增 `manual:<model>` override 语义
    - message send 主链继续复用现有 `modelId -> modelOverride` 接线，不做额外重构
  - 当前已补下一小步产品化增强：
    - `modelSelect` 已开始按 provider 分组展示
    - provider 组顺序已按“当前默认 provider 优先、已就绪 provider 在前、缺鉴权 provider 后置”收敛
    - 已新增最小 catalog 过滤输入框，可按模型名 / provider 关键字过滤
    - default option 文案已去掉前置“默认模型”，仅保留模型名自身携带的 `（默认）`
  - 当前已补显式 preferred provider 配置：
    - settings 已新增 `BELLDANDY_MODEL_PREFERRED_PROVIDERS` 轻量输入
    - `models.list` 已开始返回 `preferredProviderIds`
    - 保存后会原地刷新 model picker 排序，不需要等待重启才能看到 provider 分组顺序变化
  - 已补前端 `chat-network` 定向测试与 agent profile 解析测试
- 当前边界：
  - 当前仍是“增强现有 modelSelect”的最小方案，不是新的 provider/model 设置面板
  - 当前仍没有 setup wizard 联动、复杂 provider 权重策略或独立 catalog 管理面板
  - 当前手动输入模型默认仍复用 primary provider 的 baseUrl/apiKey，不是独立 custom provider 配置流
- 第一版收口说明：
  - `P2-2 v1` 当前按“auth-aware labels + manual model fallback + 不重构消息发送主链”口径先行收口
  - 后续若继续增强，应优先围绕 provider 分组、preferred provider 与 catalog 过滤，不应直接膨胀成新的设置入口
- 完成标志：
  - 模型选择不再主要靠手填和外部记忆

#### P2-3 会话作用域与群聊 key 归一

- 来源文档：`OC与SS`
- 当前状态：`已完成（v1 已完成 canonical session key 接线与本轮兼容边界收口）`
- 目标：
  - 提升多渠道会话连续性与路由一致性
- 前置依赖：
  - 无
- 直接任务：
  - session scope 策略
  - group/channel/webchat key 归一
- 当前进展：
  - 已新增统一 `session-key` builder，开始为 `discord / feishu / qq / community` 生成 canonical `sessionScope / sessionKey`
  - 路由上下文已开始透传 `sessionScope / sessionKey`，为后续 `P2-4` binding 持久层预留稳定接线点
  - 当前仍保持旧 `conversationId` 持久化规则不变，避免在 `P2-3 v1` 提前引入历史 session 迁移与 reply-back 回归
  - 本轮已完成 `session scope / group-channel key` 兼容边界检查，确认当前主风险不在 `session-key` 生成，而在“显式 canonical `sessionKey` 被用于主动外发”时的跨渠道误用边界
  - 已为 `feishu / qq / discord / community` 四渠道补齐显式 `sessionKey` 的渠道一致性校验；当 binding 记录的 `channel` 与当前渠道不一致时，会直接拒绝主动外发，不再误读其他渠道 binding
  - 已补四渠道回归测试，锁定“错渠道 `sessionKey` 不得继续外发”的边界
  - 已完成定向 `vitest` 与 `@belldandy/channels build` 验证
- 当前边界：
  - 当前只统一 canonical session 语义与渠道接线，不改 resident main conversation 语义
  - 当前仍保持旧 `conversationId / legacyConversationId` 兼容保留，不做历史 session 迁移
  - 当前不把 `current conversation binding` 持久层、外发审计或 reply-back 产品面继续并回 `P2-3`；这些已归入 `P2-4`
- 收口说明：
  - `P2-3` 现可按“统一 session key builder + 四渠道接线 + 旧 `conversationId` 兼容保留 + 主动外发跨渠道误用边界补齐”口径判定为已完成
  - 这次收口后，`P2-3` 不再继续扩新的 binding 主线；后续仅保留与 `P2-4` 相邻面的回归观察和零星兼容修补
- 完成标志：
  - 会话 key 与路由语义更一致

#### P2-4 current conversation binding

- 来源文档：`OC与SS`
- 当前状态：`已完成第一版收口（v1 已接入显式 binding store）`
- 目标：
  - 让跨线程、多渠道 reply-back 更稳定
- 前置依赖：
  - `P2-3`
- 直接任务：
  - current conversation binding 持久层
  - 与现有 resident conversation 绑定机制对齐
- 当前进展：
  - 已新增共享 current conversation binding store，开始把 `canonical sessionKey -> 当前回复目标` 持久化到独立状态文件
  - `discord / feishu / qq / community` 收到消息时已开始更新 binding 记录
  - `sendProactiveMessage()` 在未显式传入目标时，已优先回退到 binding store，而不是只依赖进程内最后活跃 chatId
  - `sendProactiveMessage()` 已开始支持显式 `{ sessionKey }` 目标，且 `heartbeat / cron` 等上游主动发送入口已开始直接传入 canonical `sessionKey`
  - `heartbeat / cron` 的用户外发已不再写死飞书，现已开始通过统一 sender registry 按已有 binding 顺序解析 `feishu / qq / community / discord` 的 canonical `sessionKey`
  - `community leave_room` 的告别消息发送已开始优先消费当前房间上下文里的 canonical `sessionKey`，不再只按旧 `roomId` 直发
  - `feishu / qq / discord` 的无目标 `sendProactiveMessage()` 已收窄为 binding-only，不再继续回退到旧 `last-active / default channel` 兜底
  - `system.doctor / settings -> doctor` 已新增最小 `External Outbound Runtime` 诊断卡，可汇总近期外发记录、失败量、resolve vs delivery 失败拆分、错误码分布与最近失败样本
- 当前边界：
  - 当前仍只覆盖渠道侧“当前回复目标”绑定，不触及 resident main conversation / goal / subtask 绑定语义
  - 当前不提供独立 binding 管理 UI，也不改现有外部工具入参
- 第一版收口说明：
  - `P2-4 v1` 先按“共享 binding store + 四渠道更新 + proactive fallback”口径推进
  - 当前已完成的收口范围：
    - `discord / feishu / qq / community` 收到消息时更新 current conversation binding
    - `sendProactiveMessage()` 支持显式 `{ sessionKey }`
    - `WebChat -> 飞书 / QQ / Community / Discord` 文本外发 `v1` 已完成
    - `heartbeat / cron / community leave_room` 等主动发送入口已开始优先消费 canonical `sessionKey`
    - `feishu / qq / discord` 的旧 `last-active / default channel` 兜底已退场
    - 外发审计、doctor runtime 与 outbound failure diagnosis 第二版细化已完成
  - 当前剩余仅保留：
    - 多渠道手测回归
    - 真实使用中的观察性补丁
  - 若后续再继续增强，再考虑把更多 outbound / reply-back 入口直接消费 canonical `sessionKey`
- 完成标志：
  - 外部线程继续回复到哪个 session 具备显式绑定

##### P2-4 WebChat -> 飞书 outbound v1

- 当前判断：
  - 可行，且与 `P2-3 / P2-4` 已落地的 `canonical sessionKey + current conversation binding` 主线直接衔接
  - `v1` 不做外部渠道互发，也不做外部渠道回发到本地 `WebChat`
- `v1` 范围：
  - 支持 `WebChat -> 飞书 / QQ / Community / Discord`
  - 仅支持文本消息
  - 全部通过 `sessionKey / current conversation binding` 解析目标
  - 默认要求显式确认后再外发，但提供设置开关允许用户关闭确认
  - 不做联系人搜索、不做 chat 目标猜测、不做图片/附件/卡片/富媒体
- 目标：
  - 让用户可在 `WebChat` 中明确要求 Agent 向当前已绑定的外部渠道会话发送一段文本
  - 让这类跨渠道外发具备可审计、可拒绝、可失败回显的最小闭环
- 前置依赖：
  - `P2-3`
  - `P2-4 v1`
- 建议实现：
  - 新增一个最小 outbound 工具，例如 `send_channel_message`
  - 首版开放：
    - `channel=feishu`
    - `channel=qq`
    - `channel=community`
    - `channel=discord`
  - 工具内部只接受：
    - `channel`
    - `content`
    - 可选 `sessionKey`
  - 当未显式传入 `sessionKey` 时，仅允许解析目标渠道的最新 binding；若无 binding 则直接失败
  - gateway 侧新增最小 sender registry，把四个外部渠道实例统一暴露给受控工具
  - 外发前先生成待发送摘要，并按设置决定是否要求用户显式确认
  - 确认后由 sender registry 调度对应渠道执行 `sendProactiveMessage(content, { sessionKey })`
- 直接任务：
  - 在 gateway 侧补一个最小 outbound sender registry，把 `feishu / qq / community / discord` 四个渠道实例暴露给受控工具，而不是在工具层直接感知具体渠道实现
  - 在 skills 侧新增 `send_channel_message` 最小工具
  - 在 settings / config 中补一个最小开关，例如 `external outbound require confirmation`
  - 为外发工具补审计字段：
    - source conversationId
    - source channel=`webchat`
    - target channel
    - target sessionKey
    - sent / failed / rejected
  - 为 WebChat 对话补最小确认链，避免模型直接把提示词中的文本外发到外部渠道
  - 补无 binding / binding 失效 / 渠道未初始化 / 发送失败等错误回显
- 风险：
  - 最大风险是发错目标；`v1` 必须坚持“仅发往已有 binding 的外部渠道会话，不猜测目标”
  - 跨渠道外发属于外部写操作；若无确认链，风险高于普通只读工具
  - 若缺少审计，后续无法追踪“是谁从哪个会话触发了这次外发”
- 工作量判断：
  - `v1` 按上述范围推进，预计为 `中偏小`
  - 以当前代码状态估计，可按 `1.5 ~ 3` 天口径实现与验证
- 收口标志：
  - 用户可在 `WebChat` 中要求 Agent 向已绑定 `飞书 / QQ / Community / Discord` 会话发送文本
  - 系统在发送前默认具备显式确认，且确认可通过设置开关关闭
  - 成功 / 失败 / 拒绝三类结果都能在当前会话中回显并带最小审计记录
- 当前边界：
  - 不扩为外部渠道之间通用互发
  - 不支持外部渠道主动回发到本地 `WebChat`
  - 不支持附件、图片、音频、卡片消息
  - 不支持陌生外部会话首次发起；仍要求目标会话先通过现有 binding 建立
  - 这一步定位为 `P2-4` 的受控 outbound 延伸，不单独升级为新的渠道产品面

- 当前实现进展（已完成）：
  - 已新增统一 `send_channel_message` builtin，支持：
    - `WebChat -> 飞书`
    - `WebChat -> QQ`
    - `WebChat -> Community`
    - `WebChat -> Discord`
  - 已新增统一 outbound sender registry，把四个外部渠道实例从 gateway 侧受控暴露给工具层
  - 已新增独立 external outbound confirmation store，默认通过 WebChat 页面确认弹窗完成审批
  - 已新增独立 external outbound audit store，开始把：
    - source conversationId
    - source channel=`webchat`
    - target channel
    - target sessionKey
    - confirmed / rejected / auto_approved
    - sent / failed / rejected
    - content preview
    写入独立 JSONL 审计文件
  - 已新增 `external_outbound.confirm` RPC 与 `external_outbound.confirm.required / resolved` 事件链
  - 已在 settings 中补 `BELLDANDY_EXTERNAL_OUTBOUND_REQUIRE_CONFIRMATION` 开关，默认开启
  - 已完成至少一轮真实 `WebChat -> 飞书` 手工联调，主链路可用

- 当前收口判断：
  - `P2-4` 下的 “WebChat -> 外部渠道文本外发 v1” 已按既定范围落地完成
  - 该子项当前可按“文本-only + binding-only + 默认确认 + 审计落盘”口径收口
  - `P2-4` 当前可按“代码主链已收口、剩余仅保留多渠道手测观察”口径转为完成态

  - 已完成的收口清单：
  - `send_channel_message` 最小工具已完成
  - `feishu / qq / community / discord` 统一 sender registry 已完成
  - `sessionKey / current conversation binding` 目标解析已完成
  - 默认确认 + 可关闭确认开关已完成
  - 成功 / 失败 / 拒绝三类结果最小回显已完成
  - 最小审计落盘已完成
  - resolve 失败的错误码 / 原因已开始进入审计与详情展示，不再只覆盖真正发起后的 send failed
  - `qq` 的 binding-only 主动发送已不再借道进程内 `replyContextByChatId` 回填旧目标
  - `feishu / discord` 的历史 `last-active / default channel` 状态面与配置面已退场

- 下一步计划：
  - `P2-4` 主线当前不再继续扩做
  - 剩余仅保留多渠道手测回归与真实问题驱动的小修补

- 后续计划推进状态：
  - 已完成一版最小“审计可视化 / outbound 可观察性”接线：
    - server 已支持读取最近 external outbound audit 记录
    - WebChat 已把“外部消息外发审计”迁入 `记忆查看 -> 外发审计` 页签，不再放在 settings 中
    - 当前可直接查看最近文本外发的：
      - 时间
      - target channel
      - target sessionKey
      - confirmed / rejected / auto_approved
      - sent / failed / rejected
      - content preview
      - source conversationId
      - error
  - 这一步仍保持“最小消费面”定位：复用现有记忆查看列表/详情框架，不新增一级导航，不做完整 audit workspace

- 基于当前真实进度修正后的下一阶段可开工清单：
  1. `P2-3 / 会话作用域与群聊 key 归一` 收口检查
     - 复核 `canonical sessionKey / sessionScope` 在 `webchat / discord / feishu / qq / community` 的剩余兼容边界
     - 保持旧 `conversationId` 兼容不动，仅确认是否还有必须补的 group/channel key 归一残口
  2. `H1 / 统一心智入口与用户画像摘要层` 预研切口
     - 先梳理现有 `private/shared memory`、`session digest`、`experience usage`、`USER.md / MEMORY.md` 等读取面
     - 先形成最小 `mind/profile snapshot builder` 方案，不直接扩成新的一级 UI
  3. `H1 / v1 第一刀实现`
     - 先做服务端统一摘要 builder 与最小 query/runtime 输出
     - 消费面优先复用现有 doctor、memory viewer、agent detail，而不是新增一级产品面
  4. `H2 / 轻量自动学习闭环` 前置梳理
     - 等 `H1` 最小 mind/profile snapshot 稳定后，再评估 learning loop 的最小输入输出边界
  5. `P2-4 / 多渠道手测观察`
     - 作为收口后观察项保留，不再作为主线开发任务

#### P2-5 统一媒体能力注册层 / 附件理解管线

- 来源文档：`OC与SS`
- 目标：
  - 为后续语音、图片、附件理解提供统一入口
- 当前策略：
  - 先做 `P2-5-v1` 最小闭环，不做跨产品媒体平台重构
  - 先统一能力声明、附件归一化、共享理解 runner/cache
  - 首版不新增新面板，不重做 Web，不一次性替换现有 `STT / TTS / Image / Camera`
- 前置依赖：
  - `P2-1`
- 直接任务：
  - capability/provider registry
  - 附件归一化
  - 缓存与识别 runner
- `P2-5-v1` 文件级实现清单：
  - `packages/belldandy-core/src/media-capability-registry.ts`
    - 定义统一媒体 capability 词表与最小查询入口
    - 收口 `image_input / video_input / audio_transcription / text_inline / tts_output / image_generation / camera_capture`
  - `packages/belldandy-core/src/provider-model-catalog.ts`
    - 补最小媒体 capability 推断
    - 让 runtime 至少能回答“当前 chat model 是否具备图像/视频输入能力”
  - `packages/belldandy-core/src/attachment-understanding-runner.ts`
    - 抽离 `message.send` 中当前附件判路
    - 统一附件归一化、kind 判定、prompt delta 生成、content part 生成、能力判路和降级策略
  - `packages/belldandy-core/src/attachment-understanding-cache.ts`
    - 增加最小 fingerprint cache
    - 首版优先避免同一音频附件重复 STT
  - `packages/belldandy-core/src/query-runtime-message-send.ts`
    - 收缩为接线、落盘、stats 汇总和 run input 组装
    - 不继续堆具体附件判路逻辑
  - `packages/belldandy-core/src/attachment-understanding-runner.test.ts`
    - 覆盖缓存命中与能力降级两组核心边界
  - `packages/belldandy-core/src/server.test.ts`
    - 保留 `message.send` 集成测试主路径
    - 补附件归一化后 prompt/meta 注入与缓存命中验证
- 建议执行顺序：
  1. 先定 `media-capability-registry.ts` 与 `provider-model-catalog.ts` 的能力词表
  2. 再做 `attachment-understanding-runner.ts` 与 `attachment-understanding-cache.ts`
  3. 然后回接 `query-runtime-message-send.ts`
  4. 最后补 `runner.test.ts` 与 `server.test.ts`
- 本轮收口标准：
  - `message.send` 的附件判路不再继续堆在单一大函数里
  - 同一附件至少对音频转录具备 fingerprint 级去重缓存
  - runtime 有单一入口回答“当前模型/当前媒体工具支持什么能力”
  - `STT / TTS / Image / Camera` 至少在能力声明层已统一，不再只是分散文件
  - 首版不扩成 OCR / 视频理解平台，不进入 provider runtime 大重构
- 当前实现进展（2026-04-10）：
  - 已新增 `packages/belldandy-core/src/media-capability-registry.ts`
    - 已统一收口 `image_input / video_input / audio_transcription / text_inline / tts_output / image_generation / camera_capture`
    - 已提供 `provider/model` 最小媒体 capability 推断，以及 `builtin media tools` 的统一能力声明
  - 已完成 `packages/belldandy-core/src/provider-model-catalog.ts` 接线
    - `models.list` 现在会带出最小媒体 capability，而不再只有 `chat / responses_api / anthropic_api`
    - 当前已能回答“当前 chat model 是否具备图像/视频输入能力”
  - 已新增 `packages/belldandy-core/src/attachment-understanding-cache.ts`
    - 已增加最小音频转录 fingerprint cache
    - 当前同一音频附件重复提交时，会优先复用已缓存 STT 结果，而不是每次重跑
  - 已新增 `packages/belldandy-core/src/attachment-understanding-runner.ts`
    - 已从 `message.send` 中抽出附件归一化、kind 判定、prompt delta 生成、content part 生成
    - 已补基于 capability 的最小降级：当当前模型未声明 `image_input / video_input` 时，不再盲目走多模态注入
  - 已完成 `packages/belldandy-core/src/query-runtime-message-send.ts` 收口
    - 当前只保留 `message.send` 接线、stats 汇总与 run input 组装
    - 附件主链已改为统一调用 `attachment-understanding-runner`
  - 已完成 `packages/belldandy-core/src/server.ts` 最小接线
    - 已把当前请求对应的 model ref 解析为统一媒体 capability，供附件 runner 判路使用
  - 已补两组测试：
    - `packages/belldandy-core/src/attachment-understanding-runner.test.ts`
      - 覆盖音频 fingerprint cache 命中
      - 覆盖图片在无 `image_input` capability 下的稳定降级
    - `packages/belldandy-core/src/server.test.ts`
      - 覆盖 `models.list` 的媒体 capability 输出
      - 覆盖 `message.send` 的音频转录缓存复用
- 本轮验证：
  - `node .\\node_modules\\vitest\\vitest.mjs run packages/belldandy-core/src/provider-model-catalog.test.ts packages/belldandy-core/src/attachment-understanding-runner.test.ts`
  - `node .\\node_modules\\vitest\\vitest.mjs run packages/belldandy-core/src/server.test.ts -t "models.list returns sanitized model list with current default model ref|message.send caps appended audio transcript chars when user text already exists|message.send reuses cached audio transcription for repeated attachments"`
  - `corepack pnpm build`
- 当前阶段判定：
  - `P2-5-v1` 当前已完成最小闭环，可按“已完成（当前阶段收口）”处理
  - 当前阶段收口说明：
    - 已形成统一媒体 capability registry，而不是继续把能力散落在 `provider catalog / multimedia tools / message.send` 各处
    - 已形成统一附件理解 runner/cache，而不是继续把附件逻辑堆在 `message.send` 单文件里
    - `STT / TTS / Image / Camera` 当前已至少在能力声明层收口，不再只是彼此独立的工具文件
    - 当前阶段不做 OCR / 通用文件理解平台 / provider runtime 重构 / 新 Web 面板
- 后续计划：
  - 后续默认只观察真实图片/视频/音频附件场景下的 capability 误判与降级提示质量
  - 若出现误判，优先补更稳的 provider/model capability 映射，不先扩新面板或新附件类型
  - 若后续真实需求明确，再单独评估是否把 OCR、更多文件类型理解或共享附件摘要缓存纳入下一轮
- 完成标志：
  - STT / TTS / Image / Camera 不再只是分散工具集合

### 6.4 P3 任务

#### P3-1 `D0` 一行命令安装器 / bootstrap installer

- 来源文档：
  - 本轮新增产品化收口项
- 当前状态：
  - `已完成第一版源码包 installer 主链与安装态 envDir 固定；Unix 侧仍待真实环境验证`
- 当前策略：
  - 当前交付链路稳定性主线
- 前置依赖：
  - GitHub Releases tag / metadata 规则稳定
  - `bdd` CLI 安装后交接链稳定
- 直接任务：
  - GitHub Releases 源码包与 metadata API
  - `install.ps1 / install.sh`
  - `Windows / macOS / Linux` 平台识别、用户目录安装约定与 `Node / corepack` 检查
  - GitHub release 源码包下载、解压、`pnpm install / build` bootstrap
  - `bdd` shim 生成、`start.bat / start.sh` 保留与安装后直接进入 `bdd setup`
  - `Windows` 桌面快捷方式默认创建
- 当前进展：
  - 已新增仓库级 `install.ps1 / install.sh`
  - 默认协议已切换为“GitHub Releases 源码包 + `Node / corepack / pnpm / build` bootstrap + 安装后进入 `bdd setup`”
  - `install.ps1` 已完成一轮真实 Windows 手测：
    - 在独立安装目录中成功完成源码包下载、依赖安装、构建与 `current/` 落盘
    - 已成功落盘 `bdd.cmd / start.bat / install-info.json`
    - `bdd.cmd --help` 已通过
    - `start.bat` 已在临时端口成功拉起 Gateway，并通过 `/health` 返回 `200`
  - `install.sh` 已完成与 Windows 版一致的安装顺序、回滚语义和 wrapper 行为静态对称性修补
  - 安装器生成的 `bdd.cmd / bdd / start.bat / start.sh / start.ps1` 现已直接执行安装态 `current/packages/belldandy-core/dist/bin/bdd.js`，不再回退到仓库根 `start.*` 或 `corepack pnpm ... bdd` 开发链
  - 已完成一轮真实 `WSL Ubuntu (Linux)` 手测：
    - `install.sh --version v0.2.4 --no-setup` 已跑通
    - 完整 `install.sh --version v0.2.4` 已成功把 `.env.local` 写入安装根
    - 安装态 `start.sh` 已成功拉起 Gateway，并通过 `/health` 返回 `200`
    - `bdd doctor --json` 已确认 `Environment directory` 与 `.env.local` 都指向安装根
    - 已额外完成一轮真实 `PTY` 驱动的安装态 `bdd setup` 冒烟，确认配置写入安装根后可自然 `exit 0`
  - 已完成一轮基于真实模型凭据的隔离端到端手测：
    - 使用隔离 `envDir / stateDir` 写入真实模型配置
    - `bdd doctor --json` 已确认 `OpenAI Base URL / API Key / Model` 通过
    - gateway 已成功启动并通过 `/health`
    - WebChat 已成功以 `MiniMax-M2.7-highspeed` 作为默认模型完成真实发送
    - 通过消息区“复制全文”已确认 assistant 实际回复内容为 `E2E smoke ok`
  - 已完成一轮 WebChat assistant 正文自动化可观测性修补与真实 smoke：
    - assistant 消息 DOM 已补稳定 `.msg-body` 节点，并同步 `role="article"`、`aria-label` 与 `data-message-text`
    - Playwright 自动化快照已可直接读到 assistant 正文，不再依赖“复制全文”旁路确认
    - 真实 smoke 中已确认最新 assistant 回复会直接呈现为 `article "Belldandy(MVP) 收到：只回复：E2E smoke ok"`
  - 安装器生成的 `bdd.cmd / bdd / start.bat / start.sh / start.ps1` 已显式注入安装态 `runtimeDir/envDir`
  - 安装布局已固定为“安装根就是 `envDir`，`current/` 只是 runtime workspace”，安装后的 `.env / .env.local` 默认落在安装根
  - `install-info.json` 已补 `envDir` 元数据，用于后续 runtime 识别安装态目录结构
  - distribution runtime 已补“`install-info.json` + `current/`”安装态识别，即使当前工作目录本身存在 `.env.local`，安装态 `bdd setup` 也会优先写回安装根，而不是回退到源码仓库 `legacy_root`
  - `start.bat / start.sh` 已完成跨平台启动上下文对齐：既保留源码态可用性，也能在安装态下自动回推安装根 `envDir`
  - 已补 `install-state` smoke：
    - 新增独立 smoke 脚本，覆盖 `start.bat / start.sh / bdd.cmd / bdd` 四个重复启动入口
    - 会在隔离安装根下校验 wrapper contract、启动 Gateway、验证 `/health` 与安装根 `.env` 自动生成
    - Windows 当前已原生覆盖 `start.bat / bdd.cmd`；`start.sh / bdd` 在 Windows 宿主下先走 contract 级语义执行，后续再补真实 Unix 原生 smoke
  - 已补 `install-journey` smoke：
    - 已覆盖 `setup -> doctor -> start -> /health` 一条龙主链
    - 会确认 `bdd setup --json` 的 `.env.local` 回写到安装根，而不是源码仓库
    - 会确认 `bdd doctor --json` 看到的 `Environment directory` 与 `.env.local` 都继续指向安装根
    - Windows 当前已原生覆盖 `bdd.cmd + start.bat`；Unix wrapper 在 Windows 宿主下走 semantic 路径
  - 已补 `install-lifecycle` smoke：
    - 已覆盖“初次 setup/start -> 重复安装刷新 wrapper/current -> 升级后再次启动”最小 lifecycle
    - 会保留安装根 `.env / .env.local` 与隔离 `stateDir`
    - 会校验 `.env.local` marker、state marker 与 `install-info.json version/tag` 升级后仍成立
  - 已补真实 `install.ps1` rerun smoke：
    - 已新增 `install-script-lifecycle` smoke，真实调用 `install.ps1` 两次
    - `install.ps1 / install.sh` 已补本地测试入口：`SourceDir/--source-dir + SkipInstallBuild/--skip-install-build`
    - 当前已确认 rerun 时会保留安装根 `.env.local`、隔离 `stateDir`，并创建 `backups/current-*`
  - 已补真实 `install.ps1` rollback smoke：
    - 已新增 `install-script-rollback` smoke，覆盖 `after_backup / after_promote / before_install_build / before_setup`
    - `install.ps1 / install.sh` 已补 rollback failpoint 接线
    - 当前已确认 rollback 后会恢复 `current/`、`install-info.json` 与安装根 wrapper，并继续通过 `start -> /health -> doctor`
  - 已补 WSL 下真实 `install.sh` rerun / rollback smoke：
    - 已新增 `install-script-lifecycle:wsl` 与 `install-script-rollback:wsl`
    - 当前会通过 `wsl.exe -d Ubuntu bash -lc ...` 真实调用 `install.sh`
    - 当前采用最小 fake source fixture，先验证 installer rerun / rollback 语义，而不依赖宿主 Windows 工作区里的原生模块
  - 已补 WSL 下真实 `install.sh` staging source build smoke：
    - 已新增 `install-script-build:wsl`
    - `install.ps1 / install.sh` 当前都已支持：`SourceDir/--source-dir` 在 `SkipInstallBuild/--skip-install-build` 下继续走 symlink / junction 语义，在真实 install/build 时改为复制 source 到 `current/`，避免污染原 source
    - 当前会先准备 Linux-safe staging source，再由 `WSL Ubuntu` 真实完成 `pnpm install / pnpm build -> bdd setup --json -> start -> /health -> doctor`
    - 当前已额外确认 `packages/belldandy-memory` 下的 `better-sqlite3` 可在 Linux 安装产物中成功加载
  - 已补 Windows 下真实 `install.ps1` staging source build smoke：
    - 已新增 `install-script-build`
    - 当前会先准备 Windows staging source，再由 `install.ps1` 真实完成 `pnpm install / pnpm build -> bdd setup --json -> start.bat -> /health -> doctor`
    - 当前已额外确认 `packages/belldandy-memory` 下的 `better-sqlite3` 可在 Windows 安装产物中成功加载
  - 已补更接近真实外部故障的 Windows rollback smoke：
    - 已新增 `install-script-rollback:real`
    - 当前已覆盖四类 install/build 侧非 failpoint 样本：复制后 source 缺 `package.json`、`corepack prepare` 失败、`pnpm install` 直连 tarball 依赖获取失败、以及 registry 不可达导致的依赖元数据获取失败；另有 source 缺 `packages/belldandy-core/dist/bin/bdd.js` 导致 `bdd setup` 启动失败
    - 当前已确认上述真实异常后都会恢复 `current/`、`install-info.json`、安装根 wrapper、`.env.local` 与 `stateDir`
  - 已补升级后 `setup / skip-setup` 交接策略：
    - fresh install 在未显式 `-NoSetup / --no-setup` 时，当前仍默认进入 `bdd setup`
    - 升级时若安装根已保留 `.env.local`，当前会默认跳过 `bdd setup`，并提示后续如何显式重跑 setup
    - 已补显式 `-ForceSetup / --force-setup`，用于升级后强制重跑 `bdd setup`
    - 已新增 `install-script-upgrade-handoff` smoke，当前已验证“升级自动 skip setup”与“force-setup 失败后 rollback 恢复”两条路径
  - 已收 `pnpm approve-builds` 的 install/build 口径：
    - `pnpm-workspace.yaml` 已显式沉淀 `ignoredBuiltDependencies: node-pty / onnxruntime-node / protobufjs`
    - 当前默认安装主链不再出现 `Run "pnpm approve-builds"` 噪音提示
    - 当前保留的语义是：`node-pty` 继续走 `child_process` fallback，local embedding 继续维持 optional 口径，飞书 SDK 相关 build script 不作为默认 install/build 阻塞项
    - Windows / WSL 两条真实 build smoke 当前都已确认安装日志中不再出现该 warning
  - `@belldandy/browser` 已补稳定 `bin/relay.mjs` shim：
    - 当前 Windows build smoke 中已不再出现 `Failed to create bin ... belldandy-relay` 的 install warn
- 当前边界：
  - `Linux / WSL` 侧当前剩余边界主要是“非 TTY 自动化驱动 `bdd setup`”的交互兼容性；真实 `PTY`/手工终端主链已确认可自然退出
  - `install.sh` 的“真实仓库源码 + Linux 依赖安装/构建”版本完整闭环当前也已在 `WSL Ubuntu` 下跑通，但仍不能直接复用宿主 Windows 工作区的 `node_modules`
  - 当前若直接在 WSL 里复用宿主 Windows 工作区的 `node_modules`，仍会命中 `better-sqlite3 invalid ELF header` 这类跨平台原生模块问题；当前口径是先 staging source，再在 Linux 安装根内独立 `pnpm install/build`
  - `macOS` 当前暂无验证环境，仍标记为“未验证”，但不再作为当前阶段阻塞项
  - assistant 正文的基础自动化可观测性已修补，但长 Markdown、代码块、表格、图片/视频缩略图等富文本回复仍只做了基础回归，后续需继续观察快照稳定性
  - 当前 installer 仍依赖用户机器已安装 `Node.js v22.12+` 与自带 `corepack` 的 Node 发行版
- 当前阶段结论：
  - `D0` 的“安装到启动闭环稳定性”主线已完成第一阶段收口，不再继续扩 installer 功能面
  - 本轮重点已完成：
    - 安装态 `current/` 与安装根 `envDir` 的识别已不再只依赖目录默认名
    - `start.bat / start.sh / bdd.cmd / bdd` 与 runtime 判定已共享同一套安装态口径
    - 最小 install-state smoke 已能覆盖“安装后重复启动 / `bdd setup` / `/health`”主链，不误回退到源码仓库 `legacy_root`
  - 本阶段完成明细：
    - runtime 已开始消费 `install-info.json` 的 `currentDir / envDir`
    - `install-state` smoke 已落地并通过
  - 第二刀“安装到启动一条龙 / 重复安装后再次启动”也已完成最小收口：
    - `install-journey` smoke 已落地并通过
    - `install-lifecycle` smoke 已落地并通过
    - 当前已能自动验证 `.env.local / stateDir` 在刷新安装态与升级后仍保留，并继续通过 `doctor` 与 `/health`
  - 第三刀“真实 installer rerun 语义”也已落地：
    - `install-script-lifecycle` smoke 已落地并通过
    - 当前已能真实验证 `install.ps1` rerun 时的 `backups/current-*`、`install-info.json` 升级和安装根 env/state 保留
  - 第四刀“真实 installer rollback 语义”也已落地：
    - `install-script-rollback` smoke 已落地并通过
    - 当前已能真实验证 `install.ps1` 在 `after_backup / after_promote / before_install_build / before_setup` 失败时，会恢复 `current/`、安装根 metadata/wrapper 与 env/state
  - 第五刀“WSL 下真实 install.sh installer 语义”也已落地：
    - `install-script-lifecycle:wsl` 与 `install-script-rollback:wsl` 已落地并通过
    - 当前已能在 `Ubuntu` 下真实验证 `install.sh` 的 rerun / rollback 语义
  - 第六刀“WSL 下真实 install.sh build 闭环”也已落地：
    - `install-script-build:wsl` 已落地并通过
    - 当前已能在 `Ubuntu` 下真实验证 staging source -> Linux `pnpm install/build` -> `bdd setup --json` -> `start -> /health -> doctor` 主链
  - 第七刀“Windows 下真实 install.ps1 build / real rollback”也已落地：
    - `install-script-build` 已落地并通过
    - `install-script-rollback:real` 已落地并通过
    - 当前已能在 Windows 下真实验证 staging source -> `pnpm install/build` -> `bdd setup --json` -> `start.bat -> /health -> doctor`
    - 当前也已覆盖五类真实 rollback 异常：build 前 `package.json` 缺失、`corepack prepare` 失败、tarball 依赖获取失败、registry 不可达导致的 `pnpm install` 获取失败，以及 `bdd setup` 启动时缺 `bdd.js`
  - 第八刀“升级后 setup / skip-setup 交接策略”也已落地：
    - `install.ps1 / install.sh` 当前都已支持：fresh install 默认进入 setup，升级时若保留 `.env.local` 则默认跳过 setup
    - 已补显式 `-ForceSetup / --force-setup`，用于升级后强制重跑 setup
    - `install-script-upgrade-handoff` 已落地并通过，当前已确认 auto-skip 与 force-setup rollback 语义
  - 第九刀“`pnpm approve-builds` install/build 口径”也已落地：
    - `pnpm-workspace.yaml` 已补 `ignoredBuiltDependencies: node-pty / onnxruntime-node / protobufjs`
    - `install-script-build / install-script-build:wsl` 当前都已加严为“不应再出现 `Ignored build scripts` / `Run \"pnpm approve-builds\"`”
    - 当前已在 Windows / WSL 两条真实 build smoke 中确认该 warning 消失
  - 收口后仅保留观察与补盲：
    - `macOS` 有真实环境时再做实机验证
    - 若出现新的真实外部失败样本，再按样本驱动补日志、提示或 rollback 边界
- 当前可用安装命令：
  - Windows PowerShell 默认安装：
    - `irm https://raw.githubusercontent.com/vrboyzero/star-sanctuary/main/install.ps1 | iex`
  - Windows PowerShell 指定版本并跳过 setup：
    - `& ([scriptblock]::Create((irm https://raw.githubusercontent.com/vrboyzero/star-sanctuary/main/install.ps1))) -Version v0.2.4 -NoSetup`
  - Windows PowerShell 升级后强制重跑 setup：
    - `& ([scriptblock]::Create((irm https://raw.githubusercontent.com/vrboyzero/star-sanctuary/main/install.ps1))) -Version v0.2.4 -ForceSetup`
  - Linux / macOS 默认安装：
    - `curl -fsSL https://raw.githubusercontent.com/vrboyzero/star-sanctuary/main/install.sh | bash`
  - Linux / macOS 指定版本并跳过 setup：
    - `curl -fsSL https://raw.githubusercontent.com/vrboyzero/star-sanctuary/main/install.sh | bash -s -- --version v0.2.4 --no-setup`
  - Linux / macOS 升级后强制重跑 setup：
    - `curl -fsSL https://raw.githubusercontent.com/vrboyzero/star-sanctuary/main/install.sh | bash -s -- --version v0.2.4 --force-setup`
- 完成标志：
  - 默认用户无需预先手工下载源码包或自行判断构建步骤
  - 默认路径基于 GitHub Releases 源码包 bootstrap，而不是官网大包下载链
  - `artifacts/` 保持内部构建中间产物与特供包定位，不成为默认安装协议
  - 安装完成后仍有稳定的重复启动入口，不要求用户再次理解安装目录结构
  - 安装态运行、再次启动与 `bdd setup` 默认都稳定落到安装根 `envDir`

#### P3-2 `D1` 安装与配置向导 2.0

- 来源文档：`OC与SS`
- 当前状态：`已完成第一版 CLI setup 主流程、Advanced 模块化入口第一版、四个模块第一轮增强、第二轮批量整理/诊断反馈起步与第一版 WebChat 配对闭环；当前主线已转入第二轮体验与风险提示收口`
- 当前策略：
  - 后置产品化收口项
- 前置依赖：
  - `P3-1`
  - `P2-1`
  - `P2-2`
  - `P1-1`
  - 阶段 A 至少完成一轮主线收口
- 直接任务：
  - `QuickStart / Advanced`
  - 风险确认
  - 远程 / 本地探测
  - 按模块分步配置
  - WebChat 内配对批准入口
- 当前进展：
  - `bdd setup` 已完成第一版 2.0 主流程收口：
    - 已支持 `QuickStart / Advanced`
    - 已支持 `local / lan / remote`
    - 已支持已有配置 `reuse / modify / reset`
    - 已支持非交互 flag 到答案模型的统一转换
    - 已补 summary 输出与非本地访问 `auth` 安全校验
    - 已修正 `.env.local` 托管键覆盖式写入，避免旧的 `OPENAI_* / AUTH_*` 键残留
  - 已补 WebChat 内 pairing 批准最小闭环，默认用户流不再要求切回终端执行 `bdd pairing approve <code>`
  - 初次模型配置继续复用当前设置弹窗，不新增独立配置入口
  - WebChat 打开时，若默认模型尚未设置完成，当前会自动弹出设置弹窗
  - WebChat 打开时，若当前会话尚未完成配对，当前会自动弹出设置弹窗并聚焦 pairing 批准区域
  - pairing pending 已按当前 `clientId` 收口为“当前会话只保留最新一条待批准配对码”，避免旧码残留
  - 已完成一轮真实手测，确认“打开 WebChat -> 自动弹设置 -> 批准 pairing -> pending 清空”的主链闭环成立
  - 已完成一轮真实 CLI 冒烟，确认安装态 `runtimeDir` 下的 `bdd setup` 会写回安装根 `envDir`，不会误命中源码仓库配置
  - 已额外完成一轮真实 `WSL PTY` 驱动冒烟，确认安装态 `bdd setup` 在真实终端输入下会自然退出；当前剩余问题只收敛在非 TTY 自动化交互边界
  - 已完成一轮带真实模型凭据的隔离端到端手测，确认“保存配置 -> 启动 gateway -> 打开 WebChat -> 真实发消息 -> 收到有效回复”主链闭环成立
  - 已完成一轮 WebChat assistant 正文自动化可观测性修补与真实 smoke：
    - assistant 消息 DOM 已补稳定 `.msg-body` 节点，并同步 `role="article"`、`aria-label` 与 `data-message-text`
    - Playwright 自动化快照已可直接读到 assistant 正文，不再依赖“复制全文”旁路确认
    - 真实 smoke 中已确认最新 assistant 回复会直接呈现为 `article "Belldandy(MVP) 收到：只回复：E2E smoke ok"`
  - `Advanced` 第一版模块化入口已落地：
    - 已支持 `community / models / webhook / cron`
    - 已新增 `bdd configure community|models|webhook|cron` 作为后续统一补配置入口
    - `community` 已支持最小 endpoint / agent / Community API token 复用策略
    - `models` 已支持最小 `models.json fallback` 配置写入
    - `webhook` 已支持最小单条 webhook rule 的 add/update/clear
    - `cron` 已支持 `.env.local` 内 `BELLDANDY_CRON_ENABLED / BELLDANDY_HEARTBEAT_*` 开关
    - `community / models / webhook / cron` 进入前均已补当前配置摘要
    - `community` 已支持显式选择已有 agent 进行更新，也已支持删除单个 agent
    - `models` 已支持显式选择已有 fallback 进行编辑，也已支持删除单个 fallback
    - `webhook` 已支持显式选择已有 rule 进行编辑，也已支持删除单个 rule
    - `cron` 在关闭 heartbeat 时会自动清理旧的 `BELLDANDY_HEARTBEAT_INTERVAL`
    - 已补第一轮输入校验：`community endpoint / fallback base URL` 仅允许合法 `http(s)` URL，`webhook id` 收敛为安全 path segment，`heartbeat interval` 与 gateway 实际解析规则保持一致
  - `models` 已完成第一轮更完整编辑能力收口：
    - `protocol / wireApi` 已从自由文本收口为受限选项
    - 已新增 `requestTimeoutMs / maxRetries / retryBackoffMs / proxyUrl` 四个高级字段
    - 已新增 fallback 整理动作：按 `id / displayName / model` 排序、批量删除多个 fallback，以及批量编辑多个 fallback 的高级字段
    - 已补更强的 provider / protocol 维度诊断摘要：
      - 可汇总 provider bucket 分布、同 provider 重复 fallback、generic provider bucket
      - 可提示继承全局 `protocol`、`protocol=anthropic + wireApi` 无效组合、`wireApi=responses` 兼容性提醒
      - 可提示 auth/runtime 缺失与 provider/model 路由重复
    - 已补轻量 preferred provider 配置入口：
      - 可直接在 `bdd configure models` 中编辑 `BELLDANDY_MODEL_PREFERRED_PROVIDERS`
      - 确认前会预览当前顺序、下一次生效顺序、命中/未命中的 fallback provider bucket 与 picker grouping 变化
    - 已修正编辑已有 fallback 时修改 `id` 的重命名语义，不再遗留旧项
    - 已补重复 `fallback id` 校验
  - `community` 已完成第一轮高级字段收口：
    - 已补 `reconnect.enabled / maxRetries / backoffMs`
    - 已补 agent 级 `office.downloadDir / office.uploadRoots`
    - 当前配置摘要已可显示 `reconnect` 与 `office` 概况
    - 编辑已有 agent 时，若修改名称，当前已按“重命名”语义处理，不再残留旧项
    - `Organize agents` 当前已支持批量编辑多个 agent 的 `room / office`
  - `webhook` 已完成第一轮增强：
    - 已补 `promptTemplate`
    - 当前配置摘要已可显示 rule 是否使用自定义 `promptTemplate`
    - 编辑已有 rule 时，若修改 `id`，当前已按“重命名”语义处理，不再残留旧项
    - 已补重复 `webhook id` 校验
  - `cron` 已完成第一轮增强：
    - 已补 `HEARTBEAT_ACTIVE_HOURS`
    - 已补 `cron-jobs.json` 的最小单条 job 编辑入口
    - 当前最小 job 编辑已覆盖 `every / dailyAt / weeklyAt / at` 与 `systemEvent / goalApprovalScan`
    - 当前配置摘要已可直接显示已有 jobs 的最小概况
  - `community / webhook / cron` 已进入第二轮体验收口起步：
    - `community` 已补首批风险提示与诊断 note：
      - `http://` 非本地 endpoint 风险
      - 已有 agent 但 reconnect 关闭的风险
      - Community API 复用 gateway auth 的风险
      - `Organize agents` 当前已支持批量编辑多个 agent 的 `room / office`
    - `webhook` 已补首批批量整理与诊断反馈：
      - 支持批量 enable/disable/remove
      - 已补 enabled/disabled/custom template 统计
      - 已补空白 `promptTemplate` 的 fallback 提示
      - 已补模板 placeholder 摘要、字段来源说明、preview 缺字段提示与不支持嵌套字段 warning
      - 已补更细的 payload schema / 请求预览：
        - `Webhook payload schema` 当前会展开顶层字段与一层嵌套字段路径，并附基础样例值 / array item 数量
        - `Webhook request preview` 当前会显示 conversation handling、template coverage、request body preview 与 resolved prompt preview
        - 当前支持直接输入 `JSON[]` 做多样例对比预览，会显示 common/union keys、各 sample schema highlights 与逐 sample request preview
      - organize 已补批量策略预设：
        - `Disable enabled JSON fallback webhooks`
        - `Enable disabled custom-template webhooks`
      - `Remove disabled JSON fallback webhooks`
      - 当前可将命中结果命名保存为自定义策略，并支持再次应用
      - 保存策略时当前会额外显示命中摘要与风险提示（例如当前命中数量、template mix、fallback / nested placeholder 风险）
      - 当前可管理已保存策略：`rename / remove / clear all`
      - organize 执行前会额外显示 `Webhook organize preview`，汇总命中数量、变更影响、template mix 与 agent coverage
      - 当前会自动保存最近一次 `Webhook organize preview`
      - 当前可选择 `Save matched webhooks as selection`
      - 当前可直接 `Reuse last preview result / Reuse last selected webhooks`
    - `cron` 已补首批批量整理与诊断反馈：
      - 支持批量 enable/disable/remove jobs
      - 已补批量整理前的常用 filter：
        - `enabled / disabled / failed / skipped / ok`
        - `silent / goalApprovalScan / systemEvent / missing next run`
      - 已补组合条件筛选：
        - 可叠加 `enabled state / last status / payload kind`
        - 可叠加 `silent / missing next run / failure delivery off / one-shot`
      - 已补批量策略预设：
        - `Disable silent failed jobs`
        - `Disable jobs missing next run`
        - `Disable silent goal scans`
        - `Enable disabled goal scans`
        - `Remove disabled one-shot jobs`
      - 已补命中结果复用与策略沉淀：
        - 当前可直接复用上一次选中的 job 集继续做下一轮 organize
        - 组合条件现已可保存为自定义 strategy，并持久化到 `cron-organize-state.json`
        - 后续可直接从 saved custom strategy 重新命中并执行同类批量动作
      - 已补 saved strategy 管理：
        - 已支持 rename / remove one / clear all
        - 可直接在 `bdd configure cron -> organize` 内维护 `cron-organize-state.json`
      - 已补批量策略建议：
        - 会根据当前 `cron-jobs.json` 自动给出可命中的预设策略与命中数
        - 当前会在进入 `cron` 模块时直接显示 `Cron organize suggestions`
        - 建议文案现已带运行历史摘要，例如 failures / skips / missing next run / slow runs / examples
      - 已补批量命中预览 / dry-run：
        - 在真正写入前会先显示 `Cron organize preview`
        - 当前可直接选择 `Review and pick jobs / Apply to all matched jobs / Dry-run only`
        - dry-run 不会写回 `cron-jobs.json`，只返回本轮命中与影响摘要
      - 已补 preview 结果复用：
        - 上一轮 preview / dry-run 的命中结果会持久化到 `cron-organize-state.json`
        - 下一轮可直接选择 `Reuse last preview result`，复用上一轮 action + matched jobs
      - 已补 preview 结果复用后的更细编排：
        - 复用上一轮 preview 结果时，当前可直接保留原 action
        - 也可直接切换为 `enable / disable / remove` 后继续 apply 或 dry-run
      - 已补 preview / selection 之间的桥接沉淀：
        - preview 阶段当前可直接选择 `Save matched jobs as selection`
        - 保存后无需重走 filter / conditions，下一轮可直接走 `Reuse last selected jobs`
      - 已补 enabled/disabled job 统计
      - 已补 runtime disabled / next run missing / heartbeat 全天运行等诊断提示
      - 已补 earliest next run、recent failures、delivery summary 与“一次性 job 保留 / silent job / goalApprovalScan failure 无通知”风险提示
      - 已补单 job `run now`：
        - gateway runtime 可达时，直接走真实 `cron.run_now`
        - runtime 不可达时，回退为写回 `nextRunAtMs=now` 的排队模式
      - 已补单 job `recovery hint`，可针对 failed/skipped/silent/one-shot job 给出定向恢复建议
      - 已补单 job `recovery run / replay`：
        - 可通过真实 `cron.recovery.run` 对最近 failed cron run 触发 targeted recovery
        - 可回放 background continuation ledger 中的最近失败 / recovery outcome / recovery replay 摘要
  - `bdd configure <module>` 已补显式 completion banner，自动化可稳定等待 `Community / Models / Webhook / Cron configuration saved`
  - `bdd configure <module>` 现已区分：
    - 实际有变更时输出 `configuration saved`
    - 用户一路 `Skip` 时输出 `configuration unchanged`
  - 已完成一轮隔离 `envDir / stateDir` 的真实交互 smoke：
    - `bdd setup --flow advanced --scenario local`
    - `bdd configure community`
    - `bdd configure webhook`
    - `bdd configure cron`
    - 已确认只写入隔离目录，不误写回仓库根
  - 已完成一轮 `configuration unchanged` 的真实交互 smoke，确认 `bdd configure community|models|webhook|cron` 在 skip-only 路径下都会稳定输出 `configuration unchanged`，且不会误落盘
  - 已补 `Advanced` 校验与 `configure` completion 的定向自动化测试，并已通过
  - 已补 `models` 第一轮增强的定向 helper 测试，并通过：
    - `node .\\node_modules\\vitest\\vitest.mjs run packages/belldandy-core/src/cli/wizard/advanced-modules-shared.test.ts`
    - `node .\\node_modules\\vitest\\vitest.mjs run packages/belldandy-core/src/cli/wizard/advanced-modules-models-diagnostics.test.ts`
    - `node .\\node_modules\\vitest\\vitest.mjs run packages/belldandy-core/src/cli/wizard/advanced-modules-models-organize.test.ts`
    - `node .\\node_modules\\vitest\\vitest.mjs run packages/belldandy-core/src/cli/wizard/advanced-modules-models-preferred-providers.test.ts`
  - 已补 `Advanced` 定向交互 smoke，并通过：
    - `community`：覆盖 `reconnect + office`
    - `community`：覆盖 Community API 风险提示
    - `models`：覆盖批量编辑 fallback 高级字段
    - `models`：覆盖轻量 preferred provider 顺序更新
    - `webhook`：覆盖 `promptTemplate`、rule 重命名与模板字段来源/缺字段/嵌套字段 warning
    - `webhook`：覆盖批量 disable
    - `cron`：覆盖 `HEARTBEAT_ACTIVE_HOURS` 与最小 job 编辑
    - `cron`：覆盖批量 disable jobs、organize filter / combined conditions / strategy preset / last hit reuse 与 automation diagnostics 摘要
    - `cron`：覆盖单 job `run now`
    - `cron`：覆盖单 job `recovery run / replay`
    - `cron`：覆盖单 job `recovery hint`
  - 已完成一轮第二轮增强后的验证：
    - `corepack pnpm build`
    - `node .\\node_modules\\vitest\\vitest.mjs run packages/belldandy-core/src/cli/wizard/advanced-modules-shared.test.ts`
    - `node .\\node_modules\\vitest\\vitest.mjs run packages/belldandy-core/src/cli/wizard/advanced-modules.smoke.test.ts`
    - `node .\\node_modules\\vitest\\vitest.mjs run packages/belldandy-core/src/server.doctor.test.ts`
  - 已完成一轮全仓 `build` 验证，确认本轮 `models` 增强未破坏主构建链：
    - `corepack pnpm build`
  - 已完成一轮 `Advanced UX` 隔离真实交互 smoke：
    - `bdd configure community` 已命中“选择已有 agent 更新”与“删除单个 agent”
    - `bdd configure models` 已命中“删除单个 fallback”
    - `bdd configure webhook` 已命中“删除单个 rule”
    - 以上分支均已检查隔离 `stateDir` 落盘结果，与交互选择一致
  - 当前边界：
  - 这不代表 `D1` 已整体完成；当前只完成了第一版基础主流程、第一版 `Advanced` 模块入口与 WebChat 侧第一版闭环
  - `models` 已完成第一轮“更完整 fallback 编辑 / 整理”收口，但仍未进入：
    - primary model / compaction / memory summary 等更完整模型配置面
    - 更深的 provider 探测 / 连通性校验 / runtime 级失败诊断
    - 如后续继续增强，优先应围绕现有 picker / catalog / doctor 的轻量联动，而不是扩成新的完整模型控制台
  - `community / webhook / cron` 的第二轮 CLI 收口已推进到“暂不阻塞主线”的状态；后续若继续补，优先视作增强项，而不是 `D1 Advanced` 第一版必须完成项
  - `community` 当前剩余更适合放入观察与小修：
    - Community API / auth 风险提示继续打磨
    - reconnect / office 诊断继续细化
  - `webhook` 当前剩余更适合放入增强 backlog：
    - 内建样例集 / 常见 webhook 场景模板
  - `cron` 当前剩余更适合放入增强 backlog：
    - 更细的策略建议演进与组合
  - `D0` 已完成第一版 installer 主链与安装态 envDir 固定，但跨平台真实验证与“安装后直接进入 setup”完整链路仍未完全收口
  - 已完成一轮真实 `WSL Ubuntu (Linux)` 安装链验证与一轮 `WSL PTY` 交互复核；当前剩余 Unix 侧验证重点只剩非 TTY 自动化兼容边界，`macOS` 维持未验证标记但不阻塞
  - 已完成一轮带真实凭据的“保存配置 -> 启动 -> WebChat -> 正常发消息”端到端手测，且前端侧 assistant 富文本消息自动化稳定性覆盖已完成一轮更完整推进：
    - 已补 `chat-ui` 定向自动化，覆盖长 Markdown、代码块 / 表格、图片 / 视频缩略图、复制反馈、media modal、流式增量渲染、完成态音频播放与基础安全清洗
    - 当前前端剩余观察点主要转为更接近真实浏览器的 smoke、长流式消息滚动稳定性与富媒体快照稳定性，而不是基础文本消息是否可见
- 已确认决策：
  - 默认下载源确定为 GitHub Releases 的源码包与 metadata API，而不是 GitHub 上的 `portable / single-exe` 大包
  - 默认 installer 本身就是“release 源码包 bootstrap + 本机构建”路径；不再单独定义 `--from-source`
  - 默认安装目录统一收敛到用户目录
  - 安装完成后默认立即进入 `bdd setup`
  - `start.bat / start.sh` 作为所有正式安装形态的标准重复启动入口；`Windows` 桌面快捷方式默认创建，并指向同一 `start.bat`
  - WebChat 内配对批准入口默认两者都保留：设置页作为稳定主入口，配对弹窗负责即时提醒与就地批准
  - `QuickStart` 不只支持本地单机；它应覆盖本地、局域网、远程/反向代理后的基础场景，但仍只问最少问题
  - `community` 与 `models.json fallback` 都不进入 `QuickStart`：前者放入 `Advanced` 的统一入口，后者放入 `Advanced` 的最小子流程；更完整模型面后置
  - `webhook / cron` 第一阶段只保留基础开关；后续新增 `bdd configure <module>` 作为统一补配置入口
- 完成标志：
  - 向导收口的是“已稳定流程”，而不是“仍在变化的流程”
  - `D1` 仅负责安装后的配置与首次引导，不与默认下载协议耦合
  - 默认用户流中的配对批准可在 WebChat 内完成，不要求额外 CLI 命令
- 后续计划：
  - 当前主线已从 `D1 Advanced` 转向更接近交付 / 稳定性的 `D0`
  - `D0` 当前优先收口“安装到启动闭环稳定性”，`D1` 先维持观察与小修：
    - `models`：批量高级字段编辑、更强诊断摘要与轻量 preferred provider 配置入口已补齐，继续保持观察，不扩成完整模型配置中心
    - `community`：后续若再补，优先是 Community API / auth 风险提示与 reconnect / office 诊断细化
    - `webhook`：后续若再补，优先是内建样例集 / 常见 webhook 场景模板
    - `cron`：后续若再补，优先是更细的策略建议演进与组合
  - 前端侧 assistant 富文本消息的自动化稳定性覆盖已完成一轮更完整推进，当前转入观察与补充：
    - 已覆盖长 Markdown、代码块 / 表格、图片 / 视频缩略图、复制反馈、media modal、流式增量渲染、完成态音频播放与基础安全清洗
    - 后续若继续补，优先是更接近真实浏览器的 smoke、长流式消息滚动稳定性与富媒体快照稳定性观察
  - `H4` 已改为观察与小修项，不再作为当前主线：
    - `H4-1` 的最小可观测闭环与 `H4-2` 的统一 diagnostics 口径已经成立
    - 后续默认只围绕真实 fallback / degrade 信号质量、doctor / explainability 文案与 runtime 证据闭环做最小修补
  - `Linux` 侧“非 TTY 自动化驱动 `bdd setup`”暂时降为观察项；如后续确有脚本化首装需求，再单独补自动化兼容层
  - `macOS` 保持未验证标记，待后续有真实环境时再补，不作为当前阶段推进前置条件

#### P3-3 `D2` 独立 TUI 控制面

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
12. `A5` continuation runtime 后置增强
13. `D0` 一行命令安装器 / bootstrap installer
14. `D1` 安装与配置向导 2.0
15. `D2` 独立 TUI 控制面

---

## 8. 明确的第三阶段收口目标

当下面这些条件同时满足时，可以认为第三阶段达到收口标准：

1. Agent 在复杂任务首轮不再背大量工具 schema，工具发现明显更轻
2. 复杂数据任务可优先走 PTC，而不是把原始结果全部塞进上下文
3. 子任务具备 steering、resume、continuation，而不是一次性执行后失联
4. long-goal / resident / subtask / background run 已具备统一的恢复与交接语义
5. 多渠道输入输出侧已经补齐安全默认值、长消息分段、webhook guard、cron 约束
6. provider 与 model 选择不再只靠环境变量和人工记忆，已具备统一元数据与选择入口
7. `D0 / D1` 只在上述核心流程稳定后再进入实施，而不是提前固化不稳定流程

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

### 9.4 HA 借鉴边界与实现原则

1. 对 `HA` 的借鉴目标是优化强化 `SS`，不是追求对 `HA` 的功能表面或代码结构做一比一复刻。
2. 如果 `HA` 的方法作用效果更好、实现方案更优，可以优先借鉴；但只要能达成优化目标，若存在更适合 `SS` 当前架构、治理边界与产品方向的方法，应优先采用更适合 `SS` 的实现方案。
3. 新增优化项默认优先采用：
   - 最小接线
   - 渐进式增强
   - 可回滚的局部抽象
   - 不削弱 `SS` 现有长期任务、记忆治理、审计、WebChat 工作台等已有价值能力
4. 除非某项能力经过单独评估确有必要，否则不以吸收 `HA` 优点为理由引入中大型重构，不直接打散当前已经稳定的 `goal / resident / review governance / continuation / distribution` 主线结构。

---

## 10. 基于 HA 筛选结论的增补优化目标与优先级重排

本章节基于 `HA与SS的系统功能对比.md` 的审查结论，重新整理后续优化目标、`HA` 可借鉴点、`SS` 更适合的实现路线，以及当前未完成计划项的整体优先级。

说明：

- 本章节用于覆盖“后续未完成项”的剩余排序与新增规划。
- 若与上文 `6.0` 或 `7.` 中的旧排序存在差异，以本章节为准。
- 核心原则仍然是：优化强化 `SS`，不做中大型重构，不削弱 `SS` 已有的长期任务、记忆治理、审计与工作台优势。

### 10.1 重新确认的优化主目标

1. 多层记忆系统
   - 目标不是简单补一个“更多 memory provider 列表”，而是把短记忆、会话记忆、长期记忆、用户画像摘要逐步收敛成统一心智入口，服务长期陪伴型 agent。

2. 自动学习闭环
   - 目标是增强 `SS Agent` 的自动学习能力，但保持现有 candidate / review / publish 治理链，不走无审查自动发布。

3. 自动提炼技能
   - 目标是加强技能提炼、制作、修改能力。
   - 自动生成技能继续保持 `SS` 当前基本机制。
   - 优先吸收“自动发现 skill 过期并触发更新建议”这一类能力，而不是直接让 runtime 改正式 skill。

4. 自我优化与运行时韧性
   - 目标是补对 `SS` 真正有价值的 runtime resilience，而不是改变 `SS` 的治理主线。

5. 模型接口
   - 目标明确：先完成。
   - 这里应优先收掉当前 `P2-1 / P2-2`，把 provider / model 入口先做成稳定可用的产品层。

6. 部署机制
   - 目标是保留 `Windows Portable / Single-Exe` 既有优势，同时增强云端、远程、隔离后端部署弹性，为未来常驻云端 agent 做准备。

### 10.2 各目标的 HA 可借鉴点与 SS 实现取向

| 主题 | 我们的优化目标 | HA 可借鉴点 | 更适合 SS 的实现取向 | 边界 |
|---|---|---|---|---|
| 多层记忆系统 | 把短记忆、会话记忆、长期记忆、用户画像摘要逐步整合成统一心智入口 | `MEMORY.md + USER.md + session_search + Honcho` 的分层心智；外部 memory provider abstraction | 先在 `SS` 内部做统一“mind/profile snapshot builder”，把 resident/private/shared memory、session digest、experience/method 摘要、用户画像摘要收进同一最小读取层；外部 provider 先预留 adapter/interface，不急着接多个 provider | 不削弱现有 `private/shared/hybrid`、shared review、experience usage 治理链 |
| 自动学习闭环 | 让 agent 运行后更容易自动沉淀记忆、经验与方法候选 | Hermes 的 memory nudge、skill nudge、background review | 先做“只生成 candidate / suggestion，不自动发布”的轻量 learning loop；把 nudge 放进 prompt/runtime，把 review 结果落到 candidate layer | 不绕过现有 review / publish 审批链 |
| 自动提炼技能 | 提升技能生成、修订、维护能力 | skill 作为 procedural memory；运行中发现缺口后触发 patch 心智 | 保持 `SS` 当前 candidate -> review -> publish 基本机制，新增“skill freshness / stale detection / update suggestion / patch candidate”链路 | 不直接允许 runtime 修改正式 skill |
| 自我优化与运行时韧性 | 增强 runtime 在失败、降级、辅助任务上的稳定性 | auxiliary routing、fallback provider、payment fallback、prompt caching / compression 等韧性思路 | 只吸收对 `SS` 有明显收益的部分：auxiliary task provider routing、one-shot fallback、错误分类与退路；不照搬整套 HA runtime | 不削弱 explainability、doctor、审计和 continuation 既有优势 |
| 模型接口 | 完成 provider metadata 与 model picker 产品化 | shared provider runtime、OpenRouter routing、custom endpoint 处理 | 直接推进 `P2-1 / P2-2`，必要时参考 HA 的 runtime resolver 思路，但实现保持贴合 `SS` 现有 OpenAI-compatible 主链与 fallback queue | 不为 provider 层重构拖慢当前主线 |
| 部署机制 | 强化云端、远程、隔离后端部署弹性 | local / Docker / SSH / Modal / Daytona / Singularity 多 backend 思路 | 先做 `SS` 自己的 execution backend abstraction；第一阶段优先 `local / Docker / SSH`，随后再评估更云端化 backend；保留 `Portable / Single-Exe` 现有交付链 | 不直接把部署机制演变成平台级大重构 |

### 10.3 新增工作流与实施方案

#### 10.3.1 H1 统一心智入口与用户画像摘要层

- 目标：
  - 为长期陪伴型 agent 建立统一 `mind/profile snapshot` 读取层。
- 第一阶段最小落地：
  - 新增统一 summary builder，把以下内容收敛成同一份最小工作集：
    - 会话侧：session digest / recent durable facts
    - 长期记忆侧：resident private/shared/hybrid 摘要
    - 方法经验侧：高频 methods / experience usage digest
    - 用户画像侧：从当前会话与长期记忆归纳出的 profile summary
  - 给这份 mind snapshot 明确预算与字段边界，避免再次扩大 prompt 体积
  - 先预留 external memory provider adapter interface，不急着接入多个真实 provider
- 第二阶段再考虑：
  - 外部 provider 接线
  - Honcho 式更深用户画像能力
- 当前进展：
  - 已新增独立 `mind/profile snapshot builder`，先把摘要拼装逻辑外移到 `packages/belldandy-core/src/mind-profile-snapshot.ts`，避免继续堆入 `server.ts`
  - 当前第一版已统一收敛以下只读数据源：
    - `resident observability` 的 `conversation digest / experience usage / resident headline`
    - `USER.md`
    - resident 私有 `MEMORY.md`
    - shared `MEMORY.md`
    - resident memory manager 的 `private/shared` recent snippets 与 chunk count
  - `system.doctor` 已新增 `mindProfileSnapshot` payload 与 `mind_profile_snapshot` check
  - `webchat` 当前先不新增一级入口，只在现有 `doctor` 卡片中显示 `Mind / Profile Snapshot`
  - 已新增独立 `mind runtime digest` 投影层：`packages/belldandy-core/src/mind-profile-runtime-digest.ts`
    - 从现有 `mindProfileSnapshot` 派生更短的 prompt-safe lines
    - 当前只保留 `identity / profile / durable memory / resident / experience` 等高价值信号
    - 已显式限制最大行数、单行长度与总字符预算
  - 已新增独立 `mind runtime prelude`：`packages/belldandy-core/src/mind-profile-runtime-prelude.ts`
    - 通过独立 `before_agent_start` hook 接入 `gateway`
    - 当前只在 `main` 会话尝试注入，`goal / goal_node` 会话默认跳过
    - 当前要求达到最小稳定信号数后才注入，不做全局无条件 prompt 注入
  - 已补两组 H1 相关测试：
    - `mind-profile-runtime-digest.test.ts`
    - `mind-profile-runtime-prelude.test.ts`
  - 已完成与现有链路的兼容验证：
    - `mind-profile-snapshot.test.ts`
    - `learning-review-nudge.test.ts`
    - `@belldandy/core build`
  - 已补 prompt snapshot 可读性与清理增强，降低 H1 手测与回顾成本：
    - runtime prompt snapshot 持久化后会自动写出 `diagnostics/prompt-snapshots/_index.json` 与 `_index.txt`
    - index 当前会汇总 `conversationId / sessionKind / latestRunId / latestCreatedAt / latestFileName / snapshotCount`
    - CLI 导出的 prompt snapshot 已默认隔离到 `diagnostics/conversation-exports/prompt-snapshots`，避免继续和 runtime 归档混放
    - CLI 导出副本已复用 prompt snapshot retention 天数做自动清理，避免长期堆积
  - 已对当前本机 prompt snapshot 目录做一次性现场收口：
    - 已把根目录散落的 prompt snapshot 导出副本迁移到独立导出目录
    - 已按“仅保留最近 3 天”手工清理旧 runtime snapshot 与空目录，作为当前现场目录整理；环境变量中的默认 retention 仍保持 `7` 天未改
  - 已完成一轮隔离环境真实手测，当前三组结果符合预期：
    - `main` 会话命中 `mind-profile-runtime`：`agent:default:main / run=6abda34f-b9f6-4945-9203-265a74370de6`
    - `goal` 会话未命中 `mind-profile-runtime`：`goal:goal_alpha / run=d1dddb86-0b66-457b-a72c-71c6e6d67342`
    - `weak main` 会话未命中 `mind-profile-runtime`：`agent:default:main / run=09069023-9404-40d8-b287-a2df9d0c46d2`
    - 本轮手测使用隔离 `state dir + fake OpenAI` 只为稳定取证 prompt snapshot；结论针对的是 `mind-profile-runtime` gate 本身
- 当前边界：
  - 当前已从“只读摘要层”推进到“预算内、带 gate 的最小 runtime 消费边界”，但仍不是全局 prompt 注入系统
  - 当前 runtime prelude 只覆盖 `main` 会话；`goal / goal_node` 仍优先使用既有 `goal-session-context` 与 `learning-review-nudge`
  - 当前画像摘要仍以 `USER.md / MEMORY.md / resident digest` 为主，没有引入新的外部 memory provider
  - 当前只做预算内的简短 summary / snippet，不展开长块原文，也不做更深用户画像推理
- 当前阶段判定：
  - `H1` 当前已完成最小 `mind runtime digest + runtime prelude + gate` 闭环，且已通过一轮真实 prompt snapshot 手测
  - `H1` 现可按“已完成（当前阶段收口）”处理：后续不再继续主动扩 UI、external provider 或更深画像，只保留真实使用观察与最小 gate / budget 修补
  - 后续主线从 `H1` 切到 `H3 skill freshness / 过期检测 / 更新建议`
  - 当前阶段默认不继续扩 UI，也不提前接 external provider；若后续出现误判，优先做最小 gate / budget 修补
  - 当前阶段收口标准：
    - 已形成独立 `mind runtime digest`，而不是原样复用整份 snapshot 入 prompt
    - 已形成独立 gate，仅在少数明确场景注入，不做全局 prompt 注入
    - 已形成独立 `before_agent_start` hook，与 `H2 learning-review nudge` 分层清楚
    - 已补至少两组测试：`digest/budget` 与 `gate/prelude`
    - `system.doctor` 与 H2 现有行为保持兼容
  - 当前阶段不做：
    - 不新增 webchat 一级入口或新面板
    - 不直接接多个 external memory provider
    - 不做 Honcho 式更深用户画像
    - 不把 `H1` 扩成大而全的 prompt 注入系统
- 技术债决策：`split_task`

#### 10.3.2 H2 轻量自动学习闭环

- 目标：
  - 在不改变 `SS` 治理主线的前提下增强自动学习。
- 第一阶段最小落地：
  - 新增 memory / method / skill nudge 规则，提示 agent 在复杂任务后优先沉淀：
    - durable fact
    - method candidate
    - skill update suggestion
  - 新增 background review / post-run review 的最小 runner，但输出只写入 candidate / suggestion 层
  - 把学习闭环结果优先挂到现有 review inbox / memory governance / doctor 可见面
- 第二阶段再考虑：
  - 使用 usage / failure / replay 数据反哺学习优先级
- 当前进展：
  - 已先完成第一版 `learning/review input` 输入层，把 `H1` 的 `mind/profile snapshot` 接到现有学习/审阅消费面，而不是直接做自动发布或 prompt 注入
  - 当前第一版已新增统一 `learning/review input builder`，汇总：
    - `mindProfileSnapshot`
    - `taskExperienceDetail` 的来源任务/记忆/工具/产物信号
    - `experience candidate` 的来源任务/记忆/工具/产物证据
    - `goal review governance summary` 的 pending / overdue / accepted-unpublished / needs_revision 信号
  - 当前已接入的消费面：
    - `system.doctor`
    - `experience.candidate.get`
    - `goal.review_governance.summary`
    - web 侧现有 `doctor`、candidate detail、goal governance panel
  - 已新增独立 `learning-review-runner`，不再把 `H2` 主体逻辑继续塞进 `gateway / goals/manager`
  - 已完成第一版最小 runner 接线：
    - `post-run`：`gateway agent_end -> completeTaskCapture -> learning review runner`
    - `review scan`：`GoalManager.scanSuggestionReviewWorkflows / scanApprovalWorkflows -> learning review runner`
  - 已完成第一版最小 prompt/runtime nudge 输入面：
    - `gateway before_agent_start` 已新增独立 `learning-review nudge` hook
    - 当前会按 agent 视角的 memory / recent task / draft candidate / goal review queue 生成轻量 `prependContext + promptDeltas`
    - 当前提示只做“提醒优先沉淀或继续审阅”，不会自动调用 `memory_write / task_promote_method / task_promote_skill_draft / goal_* review` 工具
  - 已完成 `H2-1 doctor 可视化补面` 第一版：
    - `system.doctor` 与 web doctor 已显式补出 `learning/review nudge` runtime 摘要
    - 当前可见最近一次是否触发、触发来源、命中类型、会话类型与最近 turn preview
  - 已完成 `H2-2 long-goal channel context awareness` 第一版：
    - `gateway before_agent_start` 已新增独立 `goal-session-context` hook
    - 对 `goal:<goalId>` / `goal:<goalId>:node:<nodeId>:run:<runId>` 会话补最小 `goal session context` prelude / delta
    - 当前已显式暴露：
      - 会话 kind（`goal / goal_node`）
      - `goalId`、goal 标题、goal objective 摘要、goal status / phase
      - 当前焦点 node 或当前 node、node status / phase、`runId`
      - handoff `nextAction` 与 open checkpoint / blocker 计数
    - 目标是先稳定解决“Agent 知道自己当前正在做哪个长期任务 / 哪个 node / run”，不在这一步扩成完整 replay / takeover / workbench
  - 已完成 `H2-3a goal session start banner` 第一版：
    - `WebChat` 当前在每次进入 `goal:<goalId>` / `goal:<goalId>:node:<nodeId>:run:<runId>` 会话时，都会显示一次当前 `Goal` banner
    - 当前 banner 通过 `conversation.meta` 返回并在前端消息区以 system-style 提示临时渲染：
      - 用户每次进入 / 切回该长期任务会话时都能重新看到当前锚点
      - 不会继续写入会话历史，避免恢复/切换多次后把聊天记录刷满
    - 第一版内容包含：
      - goal 标题 / `goalId` / `status` / `phase`
      - goal objective 摘要
      - 当前 focus node 或当前 node / `runId`
      - handoff `nextAction`
    - 当前去重策略改为“当前 WebChat 进入该会话时显示一次”；切到普通会话后再进入 goal 会话，会再次显示
  - 已完成 `H2-3b goal runtime status event` 第一版：
    - `goal.update` 当前会对关键状态变化补一条持久化 runtime event，并写入对应长期任务会话历史
    - 当前只接两类关键变化：
      - `goal status`：`goal_resumed` / `goal_paused`
      - `active node status`：`task_node_claimed / pending_review / validating / completed / blocked / failed / skipped`
    - 当前表现为：
      - 在对应 `goal` / `goal_node` 会话中插入一条 system-style 状态事件
      - 若该会话当前正在 WebChat 打开，也会实时显示到消息区
      - Agent 后续继续在该会话中工作时，也能从会话历史里看到这条状态变化
    - 第一版刻意不播报普通字段更新、checkpoint 细节或 capability 变化，先避免刷屏
  - 已完成 `H2-3c goal status self-check guidance` 第一版：
    - 不新增新工具，先把 Agent 默认自查顺序补清楚
    - `goal-session-context` 当前已明确提示：
      - 默认先用 `goal_get` 核对 goal 级 runtime（`status / activeNode / lastRun`）
      - 若要进一步看节点状态、依赖关系与 checkpoint 分布，再用 `task_graph_read`
    - `goal_get` 已补成和 `task_graph_read` 一样可在 `goal` / `goal_node` 会话里自动推断当前 `goal_id`
    - 这一版目标是降低 Agent“明明在长期任务通道里，却不知道先查什么”的决策摩擦，不引入新的工具面
  - 当前第一版 runner 语义：
    - `post-run` 优先消费 `learningReviewInput + task signal`，只生成 `method / skill candidate`
    - `review scan` 仅在当前 goal 还没有 suggestion/review 记录时，补第一批 `method / skill / flow` suggestion
    - 全部继续走现有 `candidate / review / publish` 治理链，不做自动发布
  - 已补 runner / nudge / goal session context / goal session banner / goal runtime event / goal self-check guidance 单测，并通过定向 `vitest` 与全仓 `build`
- 当前边界：
  - 当前 runner 仍只做最小“生成候选 / suggestion”闭环，没有自动审阅、自动发布或优先级重排
  - 当前 nudge 仍是轻量 prompt/runtime 提示，不会按 usage / failure / freshness 做精细优先级重排
  - `post-run` 目前只先接 `method / skill candidate`；durable memory 仍停留在 `memory_write` 人工触发，不做自动写入
  - `review scan` 目前只在“review 为空时补第一批 suggestion”，不会在已有 review 队列上重复生成或重刷
  - `system.doctor / web doctor` 当前只补了最近一次 runtime nudge 摘要，还没有做历史趋势、采样对比或 prompt 长度归因
  - 长期任务通道当前只补了最小 `goal session context + start banner + status event`，还没有扩到更细的 checkpoint / capability / takeover / replay 级工作台
- 当前阶段判定：
  - `H2` 目前已经完成第一版最小闭环，可按“`v1` 主链已打通、进入观察与第二轮细化阶段”理解
  - 今天完成后，长期任务通道侧的核心缺口已经从“Agent 不知道当前 goal / node / run，也不知道该怎么自查”收敛为“已有最小闭环，后续主要看噪音、优先级与细化程度”
- 当前观察结论（已完成一轮手测）：
  - `H2-3a goal session start banner` 在进入 / 切换 / 恢复场景下表现稳定，当前未观察到错 `goal` / 错 `node` / 错 `run` 的锚点
  - `H2-3b goal runtime status event` 已完成一轮最小去噪修补；`completed / skipped` 当前仅保留在对应 active node/run 会话中显示，未再观察到它们在 `goal` 根会话或无关 node 会话中刷屏
  - `learning-review nudge` 已完成一轮最小观察：`explicit_user_intent` 触发边界正常，当前未见明显误触发，也未观察到其对主任务目标造成明显抢焦
- 当前完成情况：
  - `H2-3` 当前继续维持收口状态，不再把 banner / status event / nudge 去噪作为硬前置
  - `H2` 第二轮的 refresh / priority 主线已完成第一版收口，不再停留在“评估是否进入第二轮”
  - 当前已完成第二轮前两刀：
    - `goal runner refresh` 不再被“任意历史 review 记录”一刀切阻断，而是只在仍存在 actionable review / publish 项时跳过重复生成
    - `goal runner priority` 已补最小优先级提示：当前会结合 `cross-goal / checkpoint` 治理信号、历史 review 类型分布与 task-vs-memory signal，把 refresh 推荐优先级收敛到 `flow / method / skill` 之一
  - 当前已完成第二轮第三刀：
    - 已新增独立 `learning-review-refresh state`，把 `lastScanAt / lastRefreshFingerprint / lastGeneratedAt / lastOutcome / lastPriority` 收口到 goal runtime 侧，而不是继续散落在 scan 临时返回值里
    - `review scan` 已补 `refresh fingerprint gate`：当一个 goal 的 `done/approved node`、相关 `capability plan`、待处理 checkpoint 与 `lastRun/lastNode` 等关键运行信号自上次 refresh 后未变化时，当前会直接返回 `skipped=unchanged_signal`，不再每次 scan 都重跑 suggestion 生成
    - 已明确把“已收口但出现新运行信号”定义为再次 refresh 的最小触发条件；当前最小覆盖 `lastRun/lastNode` 变化、可进入 method 候选的 node 信号、影响 skill/flow 判断的 capability plan 信号、以及 actionable checkpoint 变化
- 本轮收口结论：
  - `H2-3` 当前可按“start banner 稳定、status event 去噪生效、learning-review nudge 非阻塞”口径继续维持收口
  - `H2` 当前已完成第二轮第一版收口：`refresh gate + priority hint + refresh state/fingerprint gate` 已形成闭环
  - 在当前口径下，`H2` 第二轮的 refresh 主链已经具备第一版收口条件：
    - 仍有 actionable review / publish 项时继续阻断重复生成
    - 已收口 goal 在无新运行信号时不会因 cron / approval scan 重复刷新 suggestion
    - 已收口 goal 在出现新 `run / node / capability / checkpoint` 信号后可再次触发 refresh
  - 当前不再把“更细 refresh 条件”继续作为阻塞项；若无真实使用回归，第二轮不再 reopen
  - 因此，`H2` 现可按“当前阶段收口完成”处理：后续不再作为主线开发任务推进，只在真实使用出现误判、噪音或回归时按观察项 reopen
- 后续计划：
  - 默认只保留真实使用下的规则观察与最小修补，不再继续扩新面板或扩 `H2-3` 事件面
  - 先观察 `refresh fingerprint` 的稳定性，重点看是否仍出现“该刷没刷 / 该跳没跳”的误判
  - 若出现误判，优先只调整当前指纹纳入的 `run / node / capability / checkpoint` 字段，不引入新的治理面或新的后台任务面
  - 若后续真实需求明确，再单独评估是否把 checkpoint / review / capability 事件纳入长期任务会话事件流
  - 若后续真实使用中仍频繁出现“还得自己组合多次读取”的摩擦，再评估是否补单独聚合工具；当前先以 `goal_get + task_graph_read` 作为默认自查组合
- 技术债决策：`fix_now`

#### 10.3.3 H3 skill freshness / 过期检测 / 更新建议

- 目标：
  - 不改变正式 skill 发布机制，但让 skill 的过期与缺口更早暴露。
- 第一阶段最小落地：
  - 定义 stale signal：
    - 近期多次失败
    - 多次 resume / takeover 后仍复用旧 skill
    - 高 usage 但低成功率
    - 显式人工标记过期
  - 新增 update suggestion / patch candidate 生成器
  - 在现有 review / doctor / skill detail 中显示 freshness 状态
- 当前实现进展（2026-04-10）：
  - 已新增独立 `skill freshness state`，把人工 stale mark 收口到状态文件，而不是改动 experience sqlite 结构
  - 已完成第一版 `skill freshness / gap` 评估：
    - 已覆盖 `近期多次失败`
    - 已覆盖 `高 usage 但低成功率`
    - 已覆盖 `显式人工 stale mark`
    - 已覆盖基于待审 `skill candidate` 的 `needs_patch / needs_new_skill` 判定
  - 已把 `skillFreshness` 接入现有链路：
    - `system.doctor`
    - `memory.task.get` 的 `usedSkills`
    - `experience.candidate.get / list`
    - `experience.usage.get / list / stats`
    - Web 端现有 `doctor`、`candidate detail`、`usage overview / usage detail`
  - 已新增独立手测文档：
    - `docs/h3-skill-freshness手测清单.md`
  - 已补一组模块单测与一组 `server` 集成测试，并已通过定向验证
  - 已完成本轮自动化验证（2026-04-10）：
    - `node .\\node_modules\\vitest\\vitest.mjs run packages/belldandy-core/src/skill-freshness.test.ts`
    - `node .\\node_modules\\vitest\\vitest.mjs run packages/belldandy-core/src/server.test.ts -t "server exposes skill freshness across doctor, candidate, usage, and task payloads"`
    - `node .\\node_modules\\vitest\\vitest.mjs run packages/belldandy-core/src/server.test.ts -t "usage-only manual stale"`
    - `corepack pnpm build`
  - 已完成一轮真实运行态手测与现场修补（2026-04-10）：
    - 真实数据中确认 `doctor` 已稳定显示 `Skill Freshness`
    - 真实数据中确认待审 `skill candidate` 可通过 `experience.candidate.list / get` 返回 `needs_new_skill`
    - 初次真实手测暴露出一个边界：当某个 `skill` 只有 usage、没有 accepted candidate 时，人工 stale mark 不会反映到 `doctor / usage / task`
    - 已补 usage-only fallback：对只有 usage 的历史 `skill`，人工 stale mark 现在也会生成 `warn_stale`
    - 修补后已用真实样本 `web-monitor` 复测：
      - `experience.skill.freshness.update(stale=true)` 后，`system.doctor` 由 `healthy 0 / warn 0 / patch 0 / new 71` 变为 `healthy 0 / warn 1 / patch 0 / new 71`
      - `experience.usage.stats / get` 与 `memory.task.get.usedSkills` 对同一 `web-monitor` 都返回 `warn_stale`
      - Web 端现有 `usage overview` 中，`web-monitor` 已出现 `快过期` 提示
      - 取消 stale mark 后，`doctor` 已回到 `healthy 0 / warn 0 / patch 0 / new 71`
  - 当前首批未纳入：
    - `resume / takeover` 关联信号
    - 自动 patch draft / 自动发布
    - `skills` 文本工具输出层的 freshness 展示
- 当前阶段判定：
  - `H3` 第一版现在可按“已完成（当前阶段收口）”处理
  - 当前阶段收口说明：
    - 已形成最小 `skill freshness state + freshness/gap evaluator + doctor/candidate/usage/task` 闭环
    - 真实运行态已确认 `needs_new_skill` 与 usage-only `manual stale mark -> warn_stale` 两条主链
    - 当前真实数据中没有自然存在的 accepted skill candidate，因此 `accepted -> needs_patch` 仍主要依赖定向自动化样本验证；这不再阻塞本阶段收口
    - 后续不再主动扩新面板、自动 patch draft 或自动发布，只保留真实使用观察与最小修补
- 第二阶段再考虑：
  - 半自动 patch draft
- 技术债决策：`fix_now`

#### 10.3.4 H4 定向 runtime resilience 增强

- 目标：
  - 只补对 `SS` 有价值的自我优化与韧性能力。
- 第一阶段最小落地：
  - 为 auxiliary 任务补更明确的 provider / model routing
  - 为主链补 one-shot fallback 与错误类型归类
  - 把 fallback / degrade 原因补进 explainability / doctor
  - 当前阶段实现口径：
    - 本轮 `H4-1` 先只做“现有 failover 能力的结构化可观测闭环”，不做新的 provider runtime 平台重构
  - 主链优先覆盖：
    - `packages/belldandy-agent/src/openai.ts`
    - `packages/belldandy-agent/src/tool-agent.ts`
    - 消费面优先复用：
      - `bdd doctor`
      - `system.doctor`
      - WebChat 现有 `settings -> doctor`
      - 现有 `launch explainability`
    - 当前 auxiliary 侧先收口到“routing / degrade 原因可见”，不在第一轮直接做 side-task executor 隔离或新的运行面
  - 当前进度：
    - `H4-1` 已完成第一版最小闭环：
      - `packages/belldandy-agent/src/failover-client.ts`
        - 已补结构化 `summary`
        - 已区分 `cooldown_skip / same_profile_retry / cross_profile_fallback / terminal_fail`
        - 已补 `FailoverExhaustedError`
      - `packages/belldandy-agent/src/openai.ts`
      - `packages/belldandy-agent/src/tool-agent.ts`
        - 已把主链与工具循环的 failover 运行信号回传到统一 runtime tracker
      - `packages/belldandy-core/src/runtime-resilience.ts`
        - 已新增轻量持久化 tracker
        - 已统一输出 routing / latest / totals / reasonCounts
        - 已落盘到 `stateDir/diagnostics/runtime-resilience.json`
      - `packages/belldandy-core/src/server.ts`
      - `packages/belldandy-core/src/cli/commands/doctor.ts`
      - `apps/web/public/app/features/doctor-observability.js`
      - `packages/belldandy-core/src/agent-launch-explainability.ts`
      - `apps/web/public/app/features/agent-launch-explainability.js`
        - 已接通 `bdd doctor / system.doctor / Web doctor / launch explainability`
      - 已补自动化验证：
        - `packages/belldandy-agent/src/failover-client.test.ts`
        - `packages/belldandy-core/src/cli/commands/doctor.test.ts`
        - `packages/belldandy-core/src/server.test.ts`
        - `apps/web/public/app/features/doctor-observability.test.js`
      - 已完成构建验证：`corepack pnpm build`
    - `H4-2` 已完成第一轮“更明确诊断 / 告警分级”收口：
      - `packages/belldandy-core/src/runtime-resilience-diagnostics.ts`
        - 已新增统一 diagnostics helper
        - 已输出 `alertLevel / alertCode / alertMessage`
        - 已输出 `dominantReason / recoveryHint`
        - 已输出 `reasonClusterSummary / mixedSignalHint`
        - 已区分：
          - `healthy`
          - `no_signal`
          - `stale`
          - `recent_degrade`
          - `repeated_degrade`
          - `recent_failure`
          - `repeated_failure`
        - 当前会按主因给出恢复提示，已覆盖：
          - `rate_limit`
          - `timeout`
          - `server_error`
          - `auth`
          - `billing`
          - `format`
          - `unknown`
        - 当前会识别高占比的混合信号簇，例如：
          - `server_error + timeout`
          - `rate_limit + server_error`
          - `rate_limit + timeout`
      - `packages/belldandy-core/src/agent-launch-explainability.ts`
      - `packages/belldandy-core/src/cli/commands/doctor.ts`
      - `packages/belldandy-core/src/server-methods/system-doctor.ts`
      - `apps/web/public/app/features/doctor-observability.js`
      - `apps/web/public/app/features/agent-launch-explainability.js`
        - 已统一接入 `bdd doctor / system.doctor / web doctor / launch explainability`
      - `system.doctor` 与 CLI JSON 当前会直接下发 `runtimeResilienceDiagnostics`
      - CLI / Web doctor / launch explainability 当前都可直接看到主因与恢复提示
      - Web doctor 当前优先消费统一 diagnostics，仅对旧 payload 保留最小 legacy fallback
      - 已补自动化验证：
        - `packages/belldandy-core/src/runtime-resilience-diagnostics.test.ts`
        - `packages/belldandy-core/src/cli/commands/doctor.test.ts`
        - `packages/belldandy-core/src/server.doctor.test.ts`
        - `apps/web/public/app/features/doctor-observability.test.js`
      - 已完成构建验证：`corepack pnpm build`
  - 文件级实现清单：
  - `packages/belldandy-agent/src/failover-client.ts`
    - 收窄错误分类
    - 增加结构化 fallback / degrade 摘要
    - 区分 same-profile retry、cross-profile fallback、cooldown skip、terminal fail
  - `packages/belldandy-agent/src/openai.ts`
    - 把 failover 过程摘要挂到运行结果元数据
    - 保留主链最小 one-shot fallback 证据
  - `packages/belldandy-agent/src/tool-agent.ts`
    - 同步接入 failover / degrade 元数据
    - 让主对话与工具循环共享同一份最小 resilience 视图
  - `packages/belldandy-core/src/agent-launch-explainability.ts`
    - 在现有 explainability 结构中补 runtime fallback / degrade 投影
  - `packages/belldandy-core/src/server.ts`
    - 为 `system.doctor` 增加最小 `runtime resilience` 摘要
    - 汇总最近一次主链 fallback / degrade 与 auxiliary routing 状态
  - `packages/belldandy-protocol/src/index.ts`
    - 为新的 doctor / explainability 字段补协议类型
  - `packages/belldandy-core/src/cli/commands/doctor.ts`
    - `bdd doctor` 接入 H4 摘要，保持与 `system.doctor` 同口径
  - `apps/web/public/app/features/doctor-observability.js`
    - 在现有 doctor 中补最小 `Runtime Resilience` 卡片
  - `apps/web/public/app/features/agent-launch-explainability.js`
    - 补前端 fallback / degrade explainability 文本格式化
  - `apps/web/public/app/i18n/zh-CN.js`
  - `apps/web/public/app/i18n/en-US.js`
    - 补 H4 doctor / explainability 文案
  - `packages/belldandy-agent/src/failover-client.test.ts`
    - 覆盖 same-profile retry、cross-profile fallback、cooldown skip、terminal fail
  - `packages/belldandy-core/src/server.test.ts`
    - 覆盖 `system.doctor` H4 payload 与 explainability 接线
  - `apps/web/public/app/features/doctor-observability.test.js`
    - 覆盖前端 doctor 卡片摘要渲染
- 建议执行顺序：
  - `1.` 先补 `failover-client` 的结构化结果与错误分类
  - `2.` 再接 `openai / tool-agent`，让运行态真正产出 H4 证据
  - `3.` 再接 `system.doctor / bdd doctor / protocol`
  - `4.` 最后补 Web doctor、前端 explainability 与测试
- 当前阶段收口标准：
  - 主链发生 fallback 时，能明确区分“同 profile 重试”与“跨 profile 切换”
  - `bdd doctor / system.doctor / web doctor` 都能看到同一份最小 resilience 摘要
  - explainability 中能说明最近一次 fallback / degrade 原因
  - auxiliary 至少能说明当前 routing/config 来源与 degrade 状态
  - 不新增一级产品面，不重构 provider 主链
- 第二阶段再考虑：
  - 更完整的 side-task isolation
  - 更精细的压缩与缓存策略
- 技术债决策：`split_task`

#### 10.3.5 H5 部署弹性增强

- 目标：
  - 在保留本地与 Windows 分发优势的同时，增强常驻云端、远程、隔离后端能力。
- 第一阶段最小落地：
  - 为执行面补统一 backend abstraction，先覆盖：
    - `local`
    - `docker`
    - `ssh`
  - 明确 backend config、credential boundary、workspace mount / sync、log / doctor 观测字段
  - 保持 `Portable / Single-Exe` 不受影响
- 当前进度：
  - `H5-1` 已完成第一版最小落地：
    - 已新增独立 `deployment-backends` 配置/诊断模块：`packages/belldandy-core/src/deployment-backends.ts`
    - 已统一 `stateDir/deployment-backends.json` profile schema，当前最小覆盖：
      - `local`
      - `docker`
      - `ssh`
    - gateway/server 启动时会自动确保默认 `local-default` profile 存在，避免配置文件不可发现
    - `system.doctor` 已新增 `deploymentBackends` payload 与 `deployment_backends` check
    - `bdd doctor` 已接入同一套 `deployment backends` 诊断输出，CLI / Web / gateway 三边口径已对齐
    - web 侧现有 `doctor` 已复用新增 `Deployment Backends` 摘要卡，不新增一级入口或新面板
    - 已补三组自动化验证：
      - `packages/belldandy-core/src/deployment-backends.test.ts`
      - `packages/belldandy-core/src/cli/commands/doctor.test.ts`
      - `packages/belldandy-core/src/server.test.ts` 中的 `system.doctor exposes deployment backend summary from unified profile config`
    - 已完成一轮真实手测起步：
      - 当前真实安装态 `bdd doctor --json` 已确认在 `deployment-backends.json` 尚未物化时返回 `config_missing=1` 与明确 fix 提示
      - 纯净临时实例已确认 gateway 启动后会自动补出默认 `local-default`
      - 在纯净临时实例中，干净 `local + docker + ssh` profile 集合下，`bdd doctor` 与 `system.doctor` 的 `selectedProfileId / selectedBackend / profileCount / warningCount / backendCounts` 一致
      - 在缺口样本下，`bdd doctor` 与 `system.doctor` 都能给出 `selected_missing / runtime.host / workspace.remotePath / credentials.ref / logMode file ref` 等针对性 warning
      - 已补完临时实例的 WebChat `doctor` 目视确认：现有 settings -> `doctor` 已真实显示 `Deployment Backends` 卡片，且与三 profile 干净样本一致显示 `3/3 profiles enabled`、`local 1 / docker 1 / ssh 1`、`selected docker-main (docker)`、`0 warning profiles` 与对应 `config path`
- 当前边界：
  - 当前第一轮只先收口“统一 profile config + doctor 可观测 + 默认配置可发现性”，还不是实际执行链路的 backend 切换系统
  - 当前不会把 `SS` 直接扩成 remote gateway / serverless / sandbox 平台，也不改动 `Portable / Single-Exe` 主链
  - 当前 `docker / ssh` 仍主要体现为统一配置与诊断面，不代表远程运行编排已经完成
- 当前阶段收口标准：
  - 已存在统一 `deployment-backends.json`，不再由分散脚本/文档各自表达 backend 配置
  - 已能在 `bdd doctor / system.doctor / web doctor` 中明确看到 selected profile、backend 分布、workspace/credential/log 关键字段与缺口告警
  - 已通过最小单测 + CLI doctor 断言 + `system.doctor` 集成断言，确认配置与诊断链路闭环成立
- 当前阶段收口说明：
  - `H5-1` 现已按“统一 profile config + 默认配置可发现 + CLI/Web/gateway 三边诊断一致 + WebChat doctor 目视确认完成”口径收口
  - 当前阶段不再主动扩成真正的 backend 执行切换、远程执行编排、serverless 平台或独立 deployment 管理面
- 后续计划：
  - 后续默认只观察真实 `docker / ssh` profile 的字段稳定性，只在出现明显缺口时做最小 schema / warning 修补
  - 若后续真实使用明确需要，再单独评估是否进入真正的 backend 选择/切换接线；当前不直接进入远程执行重构
  - 优先观察 `workspace.remotePath / credentials.ref / logMode` 三类字段是否还需要继续收窄，未出现真实误判前不继续扩面
- 第二阶段再考虑：
  - serverless / remote sandbox
  - 更强的云端常驻 agent 管理
- 技术债决策：`split_task`

### 10.4 与现有未完成计划的合并关系

1. `P2-1 Provider 元数据层`
   - 直接并入本轮最高优先级主线，优先完成。

2. `P2-2 认证感知 model picker`
   - 与 `P2-1` 作为同一工作流连续推进，优先完成。

3. `P2-3 会话作用域与群聊 key 归一`
   - 继续保留高优先级。
   - 原因：长期陪伴型 agent、渠道扩展、云端常驻 agent 都依赖稳定的 session scope 语义。

4. `P2-4 current conversation binding`
   - 与 `P2-3` 合并看待，仍属于高优先级。
   - 原因：多线程、多渠道、跨入口连续性是后续 memory mind / deployment elasticity 的前置。

5. `P2-5 统一媒体能力注册层 / 附件理解管线`
   - 继续保留，但优先级下调到上述主线之后。

6. `A5 continuation runtime 后置增强`
   - 保持后置，不阻塞本轮。
   - 仅在真实恢复需求继续升高时再推进。

7. `D0 / D1 / D2`
   - 继续保持后置。
   - 原因：这些属于产品化收口项，不应早于模型接口、session scope、学习闭环与部署弹性。

### 10.5 新的整体剩余优先级

以下排序用于覆盖当前“剩余未完成项 + 新增 HA 吸收项”的后续实施顺序：

`第一优先级：先完成模型接口主线`

1. `P2-1 Provider 元数据层`
2. `P2-2 认证感知 model picker`

`第二优先级：稳住长期连续性主线`

3. `P2-3 会话作用域与群聊 key 归一`
4. `P2-4 current conversation binding`

`第三优先级：开始补长期陪伴型 agent 内核`

5. `H1 统一心智入口与用户画像摘要层`
6. `H2 轻量自动学习闭环`
7. `H3 skill freshness / 过期检测 / 更新建议`

`第四优先级：增强未来云端常驻能力`

8. `H5 部署弹性增强`

`第五优先级：定向补强项`

9. `H4 定向 runtime resilience 增强`
10. `P2-5 统一媒体能力注册层 / 附件理解管线`

`第六优先级：后置增强与产品化收口`

11. `A5 continuation runtime 后置增强`
12. `D0 一行命令安装器 / bootstrap installer`
13. `D1 安装与配置向导 2.0`
14. `D2 独立 TUI 控制面`

### 10.6 当前建议的执行节奏

1. `P2-1 / P2-2 / P2-4` 已完成当前阶段收口，后续默认只保留回归修补与观察项。
2. `P2-3` 已完成本轮收口检查；canonical session key 与 group/channel key 的主要兼容边界已确认，后续默认只保留回归观察与最小修补。
3. `H1` 已完成当前阶段收口；`mind runtime digest + runtime prelude + gate` 已形成闭环，并已通过一轮真实 prompt snapshot 手测。
4. `H2` 已完成当前阶段收口，后续默认只保留真实使用下的观察与最小修补，不再作为主线开发任务继续推进。
5. `H3` 已完成当前阶段收口；第一版 `skill freshness / gap` 闭环已经落地，并完成一轮真实手测与 usage-only manual stale 边界修补。
6. `H5` 已完成当前阶段收口：统一 `deployment-backends.json` profile schema、默认 `local-default` 配置、`bdd doctor / system.doctor / web doctor` 三边诊断摘要、三组自动化验证与一轮真实 Web doctor 目视确认均已完成。
7. `H5` 后续默认只观察真实 `docker / ssh` profile 的字段稳定性与 warning 质量；未出现真实误判前，不继续扩成远程执行重构、新面板或 serverless 平台。
8. `H3` 后续默认只保留真实使用观察与最小修补，不再主动扩新面板、自动 patch draft 或自动发布。
9. `H4` 已完成 `H4-1` 与 `H4-2` 第一轮收口：failover 结构化摘要、runtime resilience tracker、更明确告警分级，以及 `bdd doctor / system.doctor / web doctor / launch explainability` 的统一 diagnostics 口径已接通；后续默认先观察真实 fallback / degrade 信号质量与告警文案，再决定是否继续细化更深策略。
10. `P2-5` 已完成 `v1` 当前阶段收口：统一媒体 capability registry、附件理解 runner/cache 与 `message.send` 主链接线已落地；后续默认只观察真实附件场景下的 capability 误判与降级提示质量。
11. `D0` 已完成第一阶段收口，主线正式从 `D0` 切走：installer 主链、install/start/health/lifecycle/rollback/build/upgrade-handoff、`pnpm approve-builds` 口径、缺能力提示与 optional capability doctor 已形成闭环；后续默认只保留观察与补盲，不再继续扩 `D0` 功能面。`D1` 继续维持“可用主链已成立，观察与小修”的口径，`H4` 也保持观察与最小修补。

### 10.7 一句话执行原则

后续吸收 `HA` 优点的核心，不是把 `SS` 改造成另一个 `HA`，而是优先补齐 `SS` 在长期陪伴型 agent、自动学习、技能维护、模型接口、部署弹性上的短板，同时继续保住 `SS` 在长期任务、治理、审计、WebChat 工作台上的现有优势。

---

## 11. 简版状态表

说明：

- 本表仅用于快速查看当前开发状态。
- 状态判定以本文当前记录为准：
  - `已完成`：已明确写明“已完成”或“已收口”
  - `进行中`：已形成明确后续草案或后置增强方案，但未进入完成态
  - `未开始`：已纳入计划，但本文尚未记录明确开工进展

| 状态 | 项目 | 当前说明 |
|---|---|---|
| 已完成 | `A1` 渐进式工具发现增强 | 主线已形成闭环，`P0-1 ~ P0-5` 已完成第一版最小落地 |
| 已完成 | `A2` PTC 落地 | 第一版最小能力已落地，已具备受控 runtime 与首批 helper |
| 已完成 | `A3` 子任务 steering / resume / continuation | 第一版最小落地已完成，WebChat 与服务端已有统一 continuation 工作集消费面 |
| 已完成 | `A4` 统一 continuation runtime | 已按“最小 shared ledger + 最小 replay/takeover 接线”正式收口 |
| 已完成 | `P1-1` 渠道安全配置产品化 | 已完成第三版最小落地，可按当前阶段口径收口 |
| 已完成 | `P1-2` 统一渲染感知长消息分段 | 第一版最小统一层已落地，已达到当前阶段可收口状态 |
| 已完成 | `P1-3` Webhook 入站保护层 | 第一版最小 ingress guard 已落地，已达到当前阶段可收口状态 |
| 已完成 | `P1-4` Cron 约束校验与 `stagger` | 第一版最小约束层已落地，已达到当前阶段可收口状态 |
| 已完成 | `P2-1` Provider 元数据层 | 已完成第一版最小只读 catalog 接线：provider/model catalog 与 `models.list` 外移已收口 |
| 已完成 | `P2-2` 认证感知 model picker | 已完成第一版最小 picker 产品化：auth-aware labels、`Manual Model...`、provider 分组/过滤与显式 preferred provider 配置均已收口 |
| 已完成 | `P2-3` 会话作用域与群聊 key 归一 | `v1` 已完成 canonical session key 与四渠道接线，并已补齐主动外发显式 `sessionKey` 的跨渠道误用边界；旧 `conversationId` 兼容继续保留 |
| 已完成 | `P2-4` current conversation binding | `v1` 已接入共享 binding store，`WebChat -> 飞书 / QQ / Community / Discord` 文本外发 `v1`、外发审计与 doctor/outbound failure diagnosis 第二版细化已收口；剩余仅保留多渠道手测观察 |
| 已完成（当前阶段收口） | `H1` 统一心智入口与用户画像摘要层 | 已落地 `mind/profile snapshot builder` + `system.doctor` 接线 + doctor 卡片，并已补齐 `mind runtime digest + runtime prelude + before_agent_start hook gate` 与两组测试；隔离环境下已完成一轮真实 prompt snapshot 手测，确认 `main` 命中、`goal` 不命中、`weak main` 不命中；当前阶段按“最小 runtime 摘要注入闭环已成立”收口，外部 provider adapter 与更深画像仍后置 |
| 已完成（当前阶段收口） | `H2` 轻量自动学习闭环 | `v1` 主链已打通；`H2-3` 已完成一轮手测收口并维持收口状态；`H2` 第二轮已完成第一版收口：最小 `refresh gate + priority hint + refresh state/fingerprint gate` 已形成闭环，goal runner 仅在仍存在 actionable review / publish 项时跳过重复生成；已收口 goal 在无新运行信号时会以 `unchanged_signal` 跳过重复 refresh，在出现新 `run / node / capability / checkpoint` 信号后才重新生成；当前阶段不再作为主线开发任务推进，后续默认只保留真实使用下的规则观察与最小修补，仍未做自动发布 |
| 已完成（当前阶段收口） | `H3` skill freshness / 过期检测 / 更新建议 | 第一版 `skill freshness state + freshness/gap evaluator + doctor/task/candidate/usage 接线 + Web 现有详情展示` 已落地；真实手测中已确认 `needs_new_skill` 与 usage-only `manual stale mark -> warn_stale` 闭环，并已补 usage-only manual stale 边界修补；`accepted -> needs_patch` 当前继续由定向自动化样本覆盖，后续默认只保留真实使用观察与最小修补 |
| 已完成（当前阶段收口） | `H5` 部署弹性增强 | `H5-1` 已完成第一版最小落地：已新增统一 `deployment-backends.json` profile schema、默认 `local-default` 配置，并打通 `bdd doctor / system.doctor / web doctor` 三边诊断摘要、三组自动化验证与一轮真实 Web doctor 目视确认；当前阶段按“配置与诊断闭环已成立”收口，后续默认只保留真实 `docker / ssh` profile 字段稳定性观察与最小修补，不进入远程执行主链重构 |
| 进行中 | `H4` 定向 runtime resilience 增强 | `H4-1` 已完成最小可观测闭环，`H4-2` 也已完成第一轮更明确告警分级与统一 diagnostics 口径：当前已区分 `no_signal / stale / recent_degrade / repeated_degrade / recent_failure / repeated_failure`，并统一下发到 `bdd doctor / system.doctor / web doctor / launch explainability`；后续默认只观察真实 degrade/failure 信号质量与告警文案，不进入 provider runtime 重构 |
| 已完成（当前阶段收口） | `P2-5` 统一媒体能力注册层 / 附件理解管线 | `P2-5-v1` 已完成最小闭环：已新增统一媒体 capability registry、附件理解 runner/cache，并完成 `message.send` 与 `models.list` 接线；已补 runner / server 两组验证，当前阶段按“能力声明与附件理解主链已成立”收口，后续默认只观察真实附件场景下的 capability 误判与降级提示质量 |
| 已完成（当前阶段收口） | `A5` continuation runtime 后置增强 | 已按“`A5-1 checkpoint replay` + `A5-2 background recovery runtime` + 受限版 `A5-3 safe-point takeover / handoff`”完成当前阶段收口；后续默认只观察真实 replay / recovery / takeover 信号并做最小修补，`A5-4 / A5-5 / A5-6` 继续后置 |
| 已完成（第一阶段收口） | `D0` 一行命令安装器 / bootstrap installer | 已完成源码包 installer 主链与“安装到启动”第一阶段收口：`install.ps1 / install.sh` 已覆盖 install/start/health/lifecycle/rollback/build/upgrade-handoff 主链，`install-state / install-journey / install-lifecycle / install-script-lifecycle / install-script-rollback / install-script-build / install-script-upgrade-handoff` 等 smoke 已在 Windows / WSL 形成闭环；`pnpm approve-builds` install/build 口径、`start/install/build` 缺能力提示、`bdd doctor / system.doctor` optional capability 摘要，以及升级后首次启动一次性 notice 也已补齐。后续默认只保留观察与补盲，不继续扩 installer 功能面；`macOS` 仍维持“未验证”标记，但不再作为当前阶段阻塞项。 |
| 进行中 | `D1` 安装与配置向导 2.0 | 已完成第一版 CLI setup 主流程、`Advanced` 模块化入口、四个模块第一轮增强、第二轮更强诊断/模板校验推进与第一版 WebChat 闭环：`bdd setup` 已支持 `QuickStart / Advanced`、`local / lan / remote`、已有配置 `reuse / modify / reset`，`bdd configure <module>` 已支持 `community / models / webhook / cron` 并补显式 completion banner；其中 `models` 已继续补到批量高级字段编辑、更强 provider/protocol 诊断与轻量 preferred provider 入口，当前整体按“可用主链已成立，转入观察与小修”口径推进 |
| 未开始 | `D2` 独立 TUI 控制面 | 后置产品化收口项，本文尚未记录明确开工进展 |
