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

#### A4. 统一 continuation runtime

- 来源文档：
  - `LA与SS`
  - `OC与SS`
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

#### P0-3 loaded deferred tools 回收机制

- 来源文档：`LA与SS`
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

#### P0-4 轻量 PTC runtime

- 来源文档：`LA与SS`
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

#### P0-5 PTC wrapper / helper 首批能力

- 来源文档：`LA与SS`
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

#### P0-6 子任务 steering

- 来源文档：`LA与SS`
- 目标：
  - 支持运行中纠偏
- 前置依赖：
  - 无
- 直接任务：
  - subtask runtime 支持 update / steering 输入
  - WebChat 侧补轻量入口，复用现有详情区域或二级入口
- 完成标志：
  - 运行中的子任务可被明确纠偏

#### P0-7 子任务 resume / continuation

- 来源文档：`LA与SS`
- 目标：
  - 支持中断后续跑、完成后续跑、换 Agent 承接
- 前置依赖：
  - `P0-6`
- 直接任务：
  - checkpoint / handoff / recovery 结构统一
  - resume API 与 UI 状态入口补齐
- 完成标志：
  - 子任务不再只是一次性执行单元

#### P0-8 continuation runtime 最小状态统一

- 来源文档：
  - `LA与SS`
  - `OC与SS`
- 目标：
  - 为 resident / main / subtask / long-goal 建立统一最小恢复状态
- 前置依赖：
  - `P0-7`
- 直接任务：
  - 定义 continuation state 最小字段
  - 统一 handoff / checkpoint 结构
  - 打通 compaction / summary / handoff 链
- 完成标志：
  - 多运行面间可以基于同一最小工作集稳定切换

### 6.2 P1 任务

#### P1-1 渠道安全配置产品化

- 来源文档：`OC与SS`
- 目标：
  - 给多渠道扩展提供稳的安全默认值
- 前置依赖：
  - 无
- 直接任务：
  - `dmPolicy / allowFrom / mention` 默认值
  - pairing 范围
  - 配置警告
- 完成标志：
  - 渠道安全配置不再主要依赖手工拼规则

#### P1-2 统一渲染感知长消息分段

- 来源文档：`OC与SS`
- 目标：
  - 改善跨渠道长消息、Markdown、代码块发送稳定性
- 前置依赖：
  - 无
- 直接任务：
  - 抽象统一 chunking 层
  - 为 Discord 之外的渠道复用
- 完成标志：
  - 截断、断块、跨渠道表现不一致明显下降

#### P1-3 Webhook 入站保护层

- 来源文档：`OC与SS`
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
- 完成标志：
  - webhook guard 形成统一层，不再散落在局部实现里

#### P1-4 Cron 约束校验与 stagger

- 来源文档：`OC与SS`
- 目标：
  - 让 cron 配置与执行行为更可预测
- 前置依赖：
  - 无
- 直接任务：
  - spec 校验
  - `sessionTarget / delivery / failureDestination / stagger`
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
