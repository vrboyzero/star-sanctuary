# MemOS 对比分析

## 1. 结论先行

如果把两边都称作“记忆系统”，其实它们解决的问题层级并不完全一样：

- **MemOS 框架本体**更像一个“Memory OS / 记忆基础设施平台”，目标是把记忆做成可管理、可调度、可审计的系统级能力。
- **MemOS `memos-local-openclaw`** 是这个方向在 OpenClaw 上的一个本地化产品落地，重点是“全量对话记住 + 任务抽象 + 技能演化 + 多 Agent 协作 + 可视化管理”。
- **Star Sanctuary / Belldandy 记忆系统** 更像“面向本地 Agent 工作流的工程化记忆层”，重点是“工作区文件 + 会话日志 + 结构化 daily/core memory + 混合检索 + 自动回忆 + 低心智负担接入”。

一句话判断：

- **MemOS 更强在“记忆平台化、任务化、协作化、产品化”。**
- **Belldandy 更强在“和本项目工作区深度耦合、实现更克制、使用路径更自然、工程维护成本更低”。**

---

## 2. 本次对比范围

本分析实际对比的是三层东西：

1. **MemOS 主仓库的通用记忆框架**
2. **MemOS 的 `apps/memos-local-openclaw` 本地插件实现**
3. **star-sanctuary / belldandy 的 `packages/belldandy-memory` 与 Gateway 接入**

之所以要分三层，是因为：

- 只看 `memos-local-openclaw`，会误以为 MemOS 只是一个 SQLite + RAG 插件；
- 只看 MemOS 根仓库，又会低估 Belldandy 当前“可直接落地到本项目”的实用性；
- 实际上，**MemOS 是平台，`memos-local-openclaw` 是产品落地，Belldandy 是项目内建能力**。

---

## 3. 证据来源

### 3.1 MemOS

- GitHub 页面：<https://github.com/MemTensor/MemOS/tree/main/apps/memos-local-openclaw>
- 根仓库 README：
  - `tmp/MemOS/README.md`
- Local 插件：
  - `tmp/MemOS/apps/memos-local-openclaw/README.md`
  - `tmp/MemOS/apps/memos-local-openclaw/index.ts`
  - `tmp/MemOS/apps/memos-local-openclaw/src/ingest/worker.ts`
  - `tmp/MemOS/apps/memos-local-openclaw/src/ingest/task-processor.ts`
- 框架层：
  - `tmp/MemOS/src/memos/__init__.py`
  - `tmp/MemOS/src/memos/mem_cube/general.py`
  - `tmp/MemOS/src/memos/templates/mos_prompts.py`
  - `tmp/MemOS/src/memos/graph_dbs/postgres.py`

### 3.2 Belldandy

- `packages/belldandy-memory/src/indexer.ts`
- `packages/belldandy-memory/src/store.ts`
- `packages/belldandy-memory/src/reranker.ts`
- `packages/belldandy-memory/src/manager.ts`
- `packages/belldandy-skills/src/builtin/memory.ts`
- `packages/belldandy-core/src/bin/gateway.ts`

说明：

- GitHub 页面与本地 `tmp/MemOS` 中 `apps/memos-local-openclaw` 的内容基本一致，本分析以本地源码为主、GitHub 页面作为交叉确认来源。

---

## 4. 两边“相同”的地方

虽然路线不同，但两边已经有不少共性：

| 维度 | MemOS Local | Belldandy | 结论 |
| --- | --- | --- | --- |
| 本地持久化 | SQLite 本地存储 | SQLite 本地存储 | 都是 local-first |
| 混合检索 | FTS5 + Vector + RRF | FTS5 + Vector + RRF | 检索底层思路接近 |
| 多样性重排 | MMR | MMR | 都在避免重复命中 |
| 时间信号 | Recency decay | Recency decay | 都考虑“新近性” |
| 自动召回 | `before_agent_start` 自动回忆 | `before_agent_start` 自动回忆 | 都是“静默注入上下文” |
| 会话沉淀 | 自动从对话写入记忆 | 自动从 session 抽取记忆 | 都不是纯手工记忆 |
| 多 Agent 隔离 | `owner` 隔离 + `public` 共享 | `agentId` 过滤 | 都已进入多 Agent 视角 |
| LLM 参与记忆加工 | 摘要、相关性过滤、任务判断、去重判定、技能演化 | 摘要、提取、自动召回 | 都不是纯向量库 |

这说明：**Belldandy 并不是“没有现代记忆能力”，而是已经具备了 MemOS Local 的一部分核心机制，只是抽象层级和产品完成度不同。**

---

## 5. 核心差异

## 5.1 系统定位不同

### MemOS

MemOS 根 README 直接把自己定义为 **Memory Operating System**，强调统一 store / retrieve / manage，并声明支持：

- graph 化记忆
- multi-modal memory
- multi-cube knowledge base
- scheduler / lifecycle / governance
- feedback 与 correction

从源码也能看到它不是单一文本记忆：

- `src/memos/templates/mos_prompts.py` 把记忆拆成 **参数记忆 / 激活记忆 / 明文记忆 / 生命周期**；
- `src/memos/mem_cube/general.py` 的 `GeneralMemCube` 同时装载 `text_mem / act_mem / para_mem / pref_mem`；
- `src/memos/graph_dbs/postgres.py` 说明它有图结构记忆后端。

### Belldandy

Belldandy 的定位更聚焦：

- 用 `MemoryManager` 统一索引 `sessions/` 与 `memory/` 文件；
- 记忆类型主要是 `core / daily / session / other`；
- 更像“工作区长期记忆层 + 检索层”，而不是完整的 Memory OS。

**结论**：

- **MemOS 的上限更高、抽象更大。**
- **Belldandy 的边界更清晰，更像为当前项目量身定制。**

## 5.2 写入策略不同

### MemOS Local：偏“full-write”

`memos-local-openclaw` README 明确写了：

- 每个 agent turn 自动 capture；
- user / assistant / tool message 都会写入；
- 写入后会走语义切块、摘要、向量化、去重；
- 它的口号就是 “Full-write local conversation memory”。

这意味着它更接近“**尽量不丢原始经验**”。

优点：

- 原始上下文保留更完整；
- 便于后续任务总结、技能演化、时间线回放；
- 更适合经验库沉淀。

缺点：

- 容易把很多“过程噪声”也记进去；
- 需要更强的 dedup / filter / task boundary / summarization 去兜底；
- 系统复杂度更高。

### Belldandy：偏“文件化 + 提炼写回”

Belldandy 主要有两条写入路径：

1. **索引现有文件**
   - `MEMORY.md`
   - `memory/YYYY-MM-DD.md`
   - `sessions/*.jsonl`
2. **会话结束后自动提取**
   - 将事实/偏好/决策提取后写回 `memory/YYYY-MM-DD.md`

`packages/belldandy-memory/src/manager.ts` 里可以看到，它会在 `agent_end` 后从对话中提取记忆，做相似度去重，然后追加到当天 memory 文件。

优点：

- 存储结果更“整理过”；
- 对使用者更可见、更可编辑；
- 与工作区文档体系天然一致。

缺点：

- 原始会话经验被进一步压缩，信息密度更高但细节损失也更大；
- 没有像 MemOS Local 那样把“任务全过程”作为一等对象保留下来。

## 5.3 记忆对象模型不同

### MemOS Local：chunk -> task -> skill

它不是停在 chunk 检索上，而是又往上抽了两层：

- **chunk**：基础记忆块
- **task**：把多轮对话聚成一个任务，产出结构化总结
- **skill**：把完成任务后的经验再抽成可复用技能，可升级、可发布、可安装

这条链路在 README 里写得很清楚：

- Memory Write Pipeline
- Task Generation Pipeline
- Skill Evolution Pipeline

源码里也有明确实现：

- `src/ingest/task-processor.ts`：任务边界检测、任务创建与结束
- `index.ts` / README：`task_summary`、`skill_search`、`skill_publish`、`skill_install`

### Belldandy：chunk / file / session 为主

Belldandy 目前的核心对象仍然是：

- 文件 chunk
- session chunk
- `memory_type`
- `channel/topic/date/agentId/category` 等元数据

它有摘要层、自动回忆、daily memory 写回，但还没有把“任务”与“技能”升级成一等记忆对象。

**结论**：

- **MemOS Local 更擅长把经验升维为可复用能力。**
- **Belldandy 更擅长把工作区知识和会话记忆统一为可检索上下文。**

## 5.4 多 Agent 协作模型不同

### MemOS Local：私有 + 公共双层

它的做法很明确：

- 每条记忆都有 `owner`
- 搜索默认是“当前 agent 私有记忆 + public 共享记忆”
- 提供 `memory_write_public`
- 技能也有 `public/private`
- 其他 Agent 可以通过 `skill_search` 发现公共技能

这是一个明显的“**团队协作记忆**”模型。

### Belldandy：隔离优先，兼容全局

Belldandy 的 `agentId` 过滤策略是：

- 子 Agent 默认只查自己 + 全局历史数据；
- `agentId = null` 时只查全局；
- `undefined` 时不过滤。

它更像“**防串记忆**”的隔离模型，而不是“共享协作知识市场”模型。

**结论**：

- **MemOS Local 在多 Agent 协作方面明显更完整。**
- **Belldandy 在多 Agent 隔离方面更保守，也更容易控制边界。**

## 5.5 检索后处理策略不同

### MemOS Local：更重的检索后加工

`memory_search` 不只是搜出来就返回，它还会做：

- owner 过滤
- LLM relevance filter
- sufficiency 判断
- excerpt dedup
- 提示继续调用 `task_summary / skill_get / memory_timeline`

自动召回也会做一轮 LLM 过滤，确定“相关且足够”才注入。

这是一种“**把 recall 当成小推理流程**”的设计。

### Belldandy：更轻、更规则化

Belldandy 的核心流程是：

- query embedding
- hybrid search
- rule-based rerank
- 可选 deep retrieval
- summary/full 两种输出级别

重排序信号主要是：

- `memory_type` 权重
- 时间衰减
- source diversity penalty
- MMR
- length normalization

它的思想是“**检索层尽量规则化、低成本、可控**”，而不是把每次 recall 都做成 LLM 流程。

**结论**：

- **MemOS Local 相关性上限更高，但更依赖模型质量与额外推理。**
- **Belldandy 稳定性和成本更可控，但复杂语义筛选能力稍弱。**

## 5.6 对工作区知识的耦合方式不同

### Belldandy：工作区原生

Belldandy 的强项非常明确：

- `memory/`、`MEMORY.md`、`sessions/` 都是同一套系统的一部分；
- `memory_type` 与文件来源直接对应；
- 对项目文档、运行日志、会话记录的组织是统一的。

也就是说，它天然适合“**项目持续开发助手**”。

### MemOS Local：对话经验原生

MemOS Local 的核心视角首先是：

- 对话记住
- 对话转任务
- 任务转技能

它不是以工作区文件为第一公民，而是以“对话中的行为经验”作为记忆主轴。

**结论**：

- **Belldandy 更贴合 star-sanctuary 当前的工作区驱动模型。**
- **MemOS Local 更贴合 agent 使用经验驱动模型。**

## 5.7 可观测性与产品化程度不同

### MemOS Local 更强

它有明显更完整的产品层：

- Memory Viewer
- 导入 OpenClaw 原生记忆
- 任务页、技能页、日志页
- 在线配置
- public skill 发布/取消发布

这说明它不仅是 memory engine，还是“可直接给用户看的 memory product”。

### Belldandy 相对偏底层

Belldandy 目前更像内建系统能力：

- 有 `memory_search`
- 有 auto-recall
- 有 memory 文件体系
- 也有 Nodes / Canvas 等相关能力

但“记忆系统本身”的独立可视化与运维界面，不如 MemOS Local 明确。

---

## 6. 优劣项总结

## 6.1 MemOS（框架 + Local 插件）的优势

- **抽象层级更高**：不是单纯 RAG，而是想做完整 Memory OS。
- **对象模型更完整**：chunk、task、skill、public skill、memory lifecycle 都是明确对象。
- **多 Agent 协作更成熟**：私有记忆、公共记忆、技能共享是闭环。
- **经验复用能力更强**：任务总结再升级成技能，是明显高于普通 memory search 的能力。
- **产品完成度更高**：Viewer、导入、管理面板、技能市场感都更强。
- **框架延展性更强**：multi-modal、graph、mem_cube、scheduler、feedback/correction 都预留了更大空间。

## 6.2 MemOS（框架 + Local 插件）的劣势

- **系统复杂度明显更高**：概念层次多，维护和理解成本都高。
- **LLM 依赖更重**：去重判断、任务边界、相关性过滤、技能演化都更依赖模型质量。
- **容易过工程化**：如果目标只是“让本地助手记住项目上下文”，这套系统可能偏重。
- **OpenClaw 插件形态有宿主耦合**：`memos-local-openclaw` 的产品能力强，但与宿主生命周期强绑定。
- **全量写入策略对噪声更敏感**：如果后处理策略不稳，容易积累冗余或错误抽象。

## 6.3 Belldandy 的优势

- **与项目结构天然一致**：`MEMORY.md + memory/*.md + sessions/*.jsonl` 的模型非常贴合当前仓库与工作流。
- **用户可见、可编辑**：daily memory 是文件，不是黑盒数据。
- **实现更克制**：混合检索、规则重排、auto-recall、summary/evolution 都有，但没有把系统拉到过高复杂度。
- **成本控制更好**：检索重排主要依靠规则，不需要每次 recall 都过 LLM 判断。
- **更容易维护**：MemoryManager / Store / Indexer / Gateway 集成关系清晰。
- **对开发类任务友好**：既能记会话，又能索引项目文件，适合“长期协作开发助手”。

## 6.4 Belldandy 的劣势

- **缺少 task 层抽象**：记忆仍以 chunk / file 为主，难以直接表达“完整任务经验”。
- **缺少 skill 演化层**：没有像 MemOS Local 那样把成功经验自动沉淀为可安装技能。
- **共享协作能力偏弱**：有隔离，没有“public memory / public skill”那种显式共享机制。
- **语义分类还不够丰富**：`memory_type` 更偏来源分类，不是事实/偏好/任务/经验这种内容语义分类。
- **产品化可视界面偏弱**：缺少独立的 memory viewer / task viewer / skill viewer。
- **反馈纠错链路不明显**：没有 MemOS 那种“自然语言反馈修正记忆”的成体系能力。

---

## 7. 哪一套更适合 star-sanctuary 现在的阶段

如果问题是“**谁更先进**”，答案偏向 **MemOS**。

如果问题是“**谁更适合 star-sanctuary 当前仓库和产品节奏**”，答案并不一定是 MemOS。

我会这样判断：

### 更适合 Belldandy 的场景

- 目标是做一个 **本地优先、项目工作区驱动** 的长期助手；
- 记忆主要服务于：
  - 代码协作
  - 文档协作
  - 日常项目推进
  - 多渠道会话回忆
- 希望系统保持：
  - 易理解
  - 易调试
  - 易维护
  - 低额外推理成本

### 更适合 MemOS Local 的场景

- 目标是做一个 **会自我积累经验、形成任务库、生成技能库** 的 Agent 产品；
- 需要多 Agent 协作记忆；
- 需要公共知识共享；
- 需要专门的记忆运营界面；
- 需要更强的“经验复用”而不只是“历史回忆”。

### 更适合 MemOS 框架本体的场景

- 目标是做“记忆基础设施平台”；
- 未来要上：
  - 图谱记忆
  - 多模态记忆
  - 企业级 KB
  - 生命周期治理
  - 异步调度
  - 反馈纠错

**结论**：

- **Belldandy 现在更像一个优秀的项目型记忆系统。**
- **MemOS 更像一个更大野心的 Agent Memory 平台。**

---

## 8. Belldandy 最值得借鉴 MemOS 的地方

如果只谈“抄作业价值”，我认为 Belldandy 最值得借鉴的不是整套 MemOS，而是以下 5 点：

### 8.1 增加 task 层，而不是只停留在 chunk/file 层

Belldandy 现在会“回忆片段”，但不太会“回忆一次完整任务的执行经验”。

建议：

- 在现有 memory 之上新增 `task` 对象；
- 自动把连续的会话块归成任务；
- 生成结构化 task summary；
- 搜索结果命中多个 chunk 时，可优先折叠返回 task 级结果。

这是 Belldandy 提升最大的一个点。

### 8.2 引入 public/shared memory 机制

Belldandy 已有 `agentId` 隔离，但还缺：

- 主 Agent 与子 Agent 的显式共享层；
- 可控的共享范围；
- 团队约定、通用规范、跨 Agent 决策的公共记忆池。

这会直接增强多 Agent 协作。

### 8.3 增加记忆可视化页

哪怕不做成 MemOS 那么完整，也建议补一个最小版：

- 搜索
- 最近记忆
- 记忆来源
- 每日记忆
- 会话记忆
- 按 agent / channel / date 过滤

这会明显提升可调试性与用户信任感。

### 8.4 从“来源分类”升级到“语义分类”

现在 `core/daily/session/other` 主要是物理来源分类。

建议增加内容语义标签，例如：

- fact
- preference
- decision
- task
- workflow
- convention
- issue

这样比单纯 `memory_type` 更利于精确召回。

### 8.5 为成功经验补一层“方法沉淀”

Belldandy 已经有 methods / skills / templates 体系，但还没有把记忆自动升维到这些对象。

建议：

- 对高价值任务自动生成方法草稿；
- 人工确认后沉淀为 method/skill；
- 形成“记忆 -> 方法 -> 执行模板”的闭环。

这点其实和 MemOS 的 skill evolution 思路最接近，但 Belldandy 可以做得更克制，不一定要全自动。

---

## 9. 不建议直接照搬 MemOS 的部分

不是 MemOS 的能力都适合当前项目，以下几项我反而建议谨慎：

- **不要一上来就全量引入复杂生命周期体系**：当前 Belldandy 还不需要 MemLifecycle / Governance 级别的治理复杂度。
- **不要把每次 recall 都改成 LLM filter**：Belldandy 现在的规则化检索更稳，先保留这个优点。
- **不要立即上全自动 skill 演化**：如果生成质量不可控，很容易污染方法库。
- **不要为“大而全”牺牲工作区原生体验**：Belldandy 最强的地方就是文件系统和项目上下文一致，这一点不该被弱化。

---

## 10. 最终判断

### 从“技术野心和系统上限”看

**MemOS > Belldandy**

因为它已经明显不只是记忆检索，而是：

- 记忆平台
- 任务经验库
- 技能演化系统
- 多 Agent 协作系统
- 可视化记忆产品

### 从“当前 star-sanctuary 的契合度”看

**Belldandy >= MemOS Local**

因为它：

- 更贴合项目工作区
- 更贴合文档/代码协作
- 更容易维护
- 更符合当前仓库的系统边界

### 从“下一步演进路线”看

Belldandy 最优路线不是“整体替换成 MemOS”，而是：

1. 保留当前 **workspace-native memory** 基座
2. 吸收 MemOS 的 **task abstraction**
3. 有选择地吸收 **public/shared memory**
4. 视产品需要补 **memory viewer**
5. 最后再考虑半自动的 **经验 -> method/skill** 演化

这条路线更稳，也更适合当前项目。

---

## 11. 关键依据摘录

为避免结论空泛，这里列出本次判断最关键的源码依据：

- **MemOS 是 Memory OS，而不是单纯 memory plugin**
  - `tmp/MemOS/README.md`：`Unified Memory API`、`Multi-Modal Memory`、`Multi-Cube Knowledge Base Management`、`Asynchronous Ingestion via MemScheduler`、`Memory Feedback & Correction`
  - `tmp/MemOS/src/memos/templates/mos_prompts.py`：参数记忆 / 激活记忆 / 明文记忆 / 生命周期
  - `tmp/MemOS/src/memos/mem_cube/general.py`：`text_mem / act_mem / para_mem / pref_mem`

- **MemOS Local 不是只做 recall，而是 chunk -> task -> skill**
  - `tmp/MemOS/apps/memos-local-openclaw/README.md`：三段 pipeline
  - `tmp/MemOS/apps/memos-local-openclaw/src/ingest/task-processor.ts`：任务创建与任务边界处理
  - `tmp/MemOS/apps/memos-local-openclaw/index.ts`：`task_summary`、`skill_search`、`memory_write_public`

- **MemOS Local 的多 Agent 共享比 Belldandy 更完整**
  - `tmp/MemOS/apps/memos-local-openclaw/index.ts`：`ownerFilter = [agent, public]`
  - `tmp/MemOS/apps/memos-local-openclaw/index.ts`：`memory_write_public`

- **Belldandy 的优势在工作区原生与规则化检索**
  - `packages/belldandy-memory/src/indexer.ts`：直接索引 `MEMORY.md` / `memory/*.md` / `sessions/*.jsonl`
  - `packages/belldandy-memory/src/store.ts`：FTS5 + vector + RRF + 元数据过滤
  - `packages/belldandy-memory/src/reranker.ts`：memoryType、recency、diversity、lengthNorm、MMR
  - `packages/belldandy-core/src/bin/gateway.ts`：`before_agent_start` 自动回忆、idle summaries、`agent_end` 自动提取

---

## 12. 我的建议

如果这份对比是为了指导后续设计，我建议 Belldandy 的记忆演进优先级按下面排：

1. **Task 层总结**
2. **Public / Shared Memory**
3. **Memory Viewer**
4. **语义分类标签**
5. **经验到 Method/Skill 的半自动沉淀**

这样可以吸收 MemOS 最有价值的部分，又不会把当前系统一下子推向过高复杂度。

---

## 13. MemOS Local 作为 Belldandy 插件接入的可行性

## 13.1 结论

`memos-local-openclaw` **不能直接作为 Belldandy 插件使用**，但可以在投入额外适配工作的前提下，改造成一个 **Belldandy 专用适配插件**，或者作为一个隔离的实验性能力模块接入。

更准确地说：

- **不能直接装上就用**
- **可以改造后局部接入**
- **不适合作为 Belldandy 的正式主记忆系统并行接管**

## 13.2 为什么不能直接使用

核心原因不是“功能不行”，而是**宿主接口不兼容**。

### 1. 插件入口协议不同

Belldandy 插件系统要求：

- 默认导出 `BelldandyPlugin`
- 入口形态是 `activate(context)`
- 通过 `context.registerTool()`、`context.registerHooks()`、`context.registerSkillDir()` 注册能力

而 `memos-local-openclaw` 的入口形态是：

- `register(api: OpenClawPluginApi)`
- 使用的是 OpenClaw 的 `plugin-sdk`

也就是说，它不是 Belldandy 当前插件加载器可以直接识别的插件格式。

### 2. 宿主 API 不同

`memos-local-openclaw` 依赖 OpenClaw 提供的宿主能力，例如：

- `api.registerTool(...)`
- `api.on("before_agent_start", ...)`
- `api.on("agent_end", ...)`
- `api.logger`
- Viewer 启动与配置逻辑

Belldandy 当前虽然也有插件系统和 HookRegistry，但并没有 OpenClaw 那套 `OpenClawPluginApi` 宿主对象。

### 3. 工具返回协议不同

Belldandy 工具执行器期待的是本项目 `Tool` / `ToolCallResult` 结构。

而 `memos-local-openclaw` 工具返回的是 OpenClaw 风格的：

- `content`
- `details`

这意味着即使强行加载，工具层也还需要适配。

### 4. 打包与加载方式也不同

Belldandy 目前插件目录只加载 `.js/.mjs` 文件；
而 `memos-local-openclaw` 包入口是 `index.ts`，设计时默认由 OpenClaw 宿主环境处理安装与运行。

因此它并不是“直接丢进 `~/.star_sanctuary/plugins/` 就能跑”的插件。

---

## 14. 如果做适配，会不会和 Belldandy 现有记忆系统冲突

## 14.1 不太会直接冲突的部分

### 存储文件层

两边默认数据库路径不同：

- Belldandy：`memory.sqlite`
- MemOS Local：`memos-local/memos.db`

所以不会天然出现“同一个 SQLite 文件被两套系统同时写入”的问题。

### 技术实现层

两边都各自维护自己的：

- 检索逻辑
- chunk / task / skill 结构
- viewer / state / embedding / dedup 状态

因此更多是“**行为冲突**”，不是“底层文件冲突”。

## 14.2 会明显冲突的部分

### 1. 工具名冲突

`memos-local-openclaw` 里包含这些工具：

- `memory_search`
- `memory_get`
- `memory_timeline`
- `task_summary`
- `skill_get`
- `skill_install`
- `memory_viewer`
- `memory_write_public`
- `skill_search`
- `skill_publish`
- `skill_unpublish`

其中 `memory_search`、`memory_get` 与 Belldandy 现有工具重名。

而 Belldandy 的 `ToolExecutor.registerTool()` 对重名工具的策略是：

- 记录 warning
- **直接覆盖**

这意味着如果直接接入，最先出问题的就是核心工具语义被替换。

### 2. 自动回忆冲突

Belldandy 当前在 `before_agent_start` 已经做了一套 auto-recall；
`memos-local-openclaw` 自己也会在 `before_agent_start` 自动检索和注入上下文。

如果两套同时打开，会出现：

- 双重记忆注入
- token 增长
- 语义回忆来源不一致
- 模型收到重复或冲突上下文

### 3. agent_end 自动写入冲突

Belldandy 当前在 `agent_end` 会做会话记忆提取；
MemOS Local 也会在 `agent_end` 进行对话 capture、切块、摘要、去重、任务归档。

更关键的是，Belldandy 的 `agent_end` void hook 是**并行执行**的，不是严格串行。

所以哪怕你看到了 priority，也不能简单假设“谁先谁后一定稳定”，双系统共存时行为会变得更难预测。

### 4. 技能目录混用

MemOS Local 的 `skill_install` 会把技能安装到工作区 `skills/` 目录；
Belldandy 本身也会扫描并加载工作区 `skills/`。

这会导致 MemOS 自动生成/安装的技能直接混入 Belldandy 正式技能集合。

这不是必然错误，但会让：

- 技能来源混杂
- 质量边界不清晰
- 维护与清理成本变高

### 5. 运行时附加面增加

MemOS Local 不是纯 memory engine，它还会带来：

- 独立 viewer
- 密码与 reset token 机制
- telemetry 配置与运行逻辑

这些会让 Belldandy 多出另一套“插件级子系统”，增加整体维护面。

---

## 15. 对“作为插件使用”的建议判断

## 15.1 不建议的用法

我不建议以下做法：

- 直接把 `memos-local-openclaw` 当 Belldandy 主记忆系统接入
- 与 Belldandy 当前记忆系统并行接管 `memory_search`
- 同时启用两套 auto-recall
- 同时启用两套 `agent_end` 记忆沉淀链路

原因很简单：这不是“互补”，而是“重复接管同一职责”。

## 15.2 可以考虑的用法

如果你真想验证 MemOS 的价值，我建议只做 **非侵入式实验接入**。

也就是：

- **不替换 Belldandy 原有记忆系统**
- **不覆盖原有 `memory_search` / `memory_get`**
- **不启用 MemOS 的自动 capture / 自动 recall 主链路**
- 只暴露它那些 Belldandy 暂时没有的高层能力

推荐只开放为“附加工具”：

- `memos_task_summary`
- `memos_memory_timeline`
- `memos_skill_search`
- `memos_skill_get`
- `memos_memory_viewer`

也就是说，把它降级成：

- “实验性任务经验模块”
- “实验性技能演化模块”
- “实验性可视化模块”

而不是第二套正式记忆系统。

---

## 16. 直接利用 MemOS 更好，还是继续优化 Belldandy 更好

## 16.1 对当前项目的判断

对于 `star-sanctuary / belldandy`，**继续优化 Belldandy 更好**。

原因：

- 你并不想把 Belldandy 变成 MemOS
- Belldandy 已经有稳定可用的本地记忆基座
- 当前真正缺的不是“再来一套记忆系统”，而是少数高价值能力层

换句话说，Belldandy 现在的问题不是：

- 没有 memory
- 没有 hybrid recall
- 没有 auto-recall
- 没有 session extraction

而是：

- 缺 task 层
- 缺共享层
- 缺 viewer
- 缺内容语义分类
- 缺经验到 method/skill 的升级通道

这正好对应前面总结的 5 点演进方向。

## 16.2 什么时候“直接利用 MemOS”更有价值

只有在你想重点验证下面这些问题时，MemOS 才更值得单独引入：

- 任务总结是否真的显著提升长期复用
- 技能自动演化是否能带来可观收益
- public/shared memory 是否明显改善多 Agent 协作
- 专门的 memory viewer 是否值得产品化

也就是说，**MemOS 更适合作为“能力灵感来源 + 小范围实验对象”**，
而不是当前阶段的主系统替代品。

---

## 17. 最终建议

我的最终建议是：

### 主线建议

继续以 **Belldandy 记忆系统** 为主线，不引入 MemOS 作为正式主记忆系统。

### 产品/架构建议

优先按前述 5 点去增强 Belldandy：

1. `Task` 层总结
2. `Public / Shared Memory`
3. `Memory Viewer`
4. 语义分类标签
5. 经验到 `Method / Skill` 的半自动沉淀

### 实验性建议

如果你仍想验证 MemOS 的价值，建议只做一个 **最小适配插件**，并且满足：

- 不覆盖 `memory_search`
- 不覆盖 `memory_get`
- 不启用 MemOS 的自动 recall 主链路
- 不启用 MemOS 的自动 capture 主链路
- 只接 `task_summary / memory_timeline / skill_search / skill_get / viewer` 这类高层附加能力

这样做的好处是：

- 保住 Belldandy 当前主链路稳定性
- 最小化冲突
- 能真实验证 MemOS 高层能力是否值得借鉴

### 一句话版本

**不建议把 `memos-local-openclaw` 直接作为 Belldandy 插件主用；建议以 Belldandy 为主线迭代，只把 MemOS 当作灵感来源或隔离实验模块。**

## 项目制作人决策
同意最终建议。

继续以 **Belldandy 记忆系统** 为主线，不引入 MemOS 作为正式主记忆系统。

### 按前述 5 点去增强 Belldandy：
1. `Task` 层总结
2. `Public / Shared Memory`
3. `Memory Viewer`
4. 语义分类标签
5. 经验到 `Method / Skill` 的半自动沉淀

### MemOS 作为“能力灵感来源 + 小范围实验对象” ，暂不实现
当准备验证下面这些问题时，再参考MemOS的实现：

- 任务总结是否真的显著提升长期复用
- 技能自动演化是否能带来可观收益
- public/shared memory 是否明显改善多 Agent 协作
- 专门的 memory viewer 是否值得产品化

---

## 18. 基于现有实现的 5 点增强评估

本节不是基于抽象设想，而是结合 `Star Sanctuary实现内容说明.md` 中已经落地的记忆相关实现做评估。

### 18.1 现有基础能力盘点

Belldandy 当前已经具备的基础，比“从零设计记忆增强方案”要扎实得多：

- **记忆主干完整**：
  - 混合检索（FTS5 + 向量 + RRF）
  - Embedding Cache
  - 元数据过滤
  - 规则重排
  - L0 摘要
  - M-N3 会话记忆自动提取
  - M-N4 源路径聚合检索
  - `agentId` 隔离
- **会话持久化与 Auto-Recall 已完成**：
  - `sessions/*.jsonl` 已统一归档并可检索
  - `before_agent_start` 自动做近期记忆注入 + 语义回忆
- **语义分类已具备底座**：
  - `MemoryCategory`
  - `chunks.category`
  - `MemorySearchFilter.category`
  - M-N3 提取 prompt 已输出 `category`
- **可视化与方法/技能体系也已存在**：
  - Canvas 可视化工作区
  - `methods/` 体系
  - `SkillRegistry`
  - `skills_search`

这意味着：后续 5 点增强，大部分不是“重做系统”，而是“在现有骨架上加高层对象与入口”。

---

## 19. 五项增强的冲突性、复杂性、风险性、可行性与成本评估

### 19.1 总览表

| 项目 | 现有基础 | 冲突性 | 复杂性 | 风险性 | 可行性 | Token 消耗变化 | 性能/耗时变化 | 工作量估算 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `Task` 层总结 | 已有 `agent_end`、M-N3 提取、Canvas `task` 节点、任务级 token counter | 中 | 高 | 中高 | 高 | 后台提取 token 增加；检索 token 有机会下降 | 写入链路增加后台任务；主链路可控 | 8-15 人日 |
| `Public / Shared Memory` | 已有 `agentId` 隔离、`chunks` 表与过滤框架 | 中 | 中 | 中 | 高 | 默认私有不变时几乎不增 | SQL 开销很小，加索引后接近无感 | 4-7 人日 |
| `Memory Viewer` | 已有 WebChat、Canvas、`workspace.read/write`、WS 事件桥 | 低 | 中高 | 低中 | 很高 | 对主对话几乎 0 | 主要是查询接口与前端渲染开销 | 6-10 人日 |
| 语义分类标签补完 | `category` 类型/列/索引/提取 prompt 已有 | 低 | 低中 | 低 | 很高 | 若只补查询与展示几乎不变 | 检索性能几乎不变，过滤更快收敛 | 2-4 人日 |
| 经验到 `Method / Skill` 半自动沉淀 | 已有 `methods`、`skills_search`、`SkillRegistry` | 中 | 高 | 高 | 中高 | 后台生成 token 最高 | 若异步化则主链路无感 | 8-14 人日 |

---

### 19.2 `Task` 层总结

#### 冲突性

冲突性为 **中**。

原因不是数据库结构冲突，而是系统中已经存在多种“任务”语义：

- M-N3 的“会话记忆提取”本身已经在做一种结论化沉淀
- Canvas 已有 `task` 节点
- 任务级 token counter 已支持自动任务边界检测

因此如果直接新增一个也叫 `task` 的对象，容易在概念上混淆：

- 这是画布任务？
- 这是会话任务？
- 这是记忆摘要任务？
- 还是计数器任务？

**建议**：

- 数据层命名为 `memory_task`
- 工具层命名为 `memory_task_search` / `memory_task_get`
- 不直接复用 Canvas 的 `task` 节点语义

#### 复杂性

复杂性为 **高**。

难点主要在两件事：

1. **任务边界判定**
2. **任务摘要是否进入主检索链路**

一旦边界切错，任务经验会变成伪知识；一旦主检索链路过早切换到 task，又可能破坏当前稳定的 chunk recall。

#### 风险性

风险性为 **中高**。

主要风险：

- 边界判错导致任务摘要失真
- 与现有 M-N3 自动提取重复，造成双重记忆沉淀
- 若在主链路同步执行，会拖慢 `agent_end`

#### 可行性

可行性为 **高**。

因为现有基础已经足够：

- `agent_end` hook 已有
- `sessionKey + messages` 已可获取
- Canvas 和 token counter 已证明项目内部对“任务对象”并不陌生

#### Token 消耗增减量

方向是：

- **写入阶段增加**
- **检索阶段有机会减少**

原因：

- 需要为任务生成结构化摘要
- 但将来回忆完整经验时，可以优先回忆 task summary，而不是拼接多个 chunk

粗略估计：

- 每个完成任务额外消耗 300-1200 token 的后台摘要成本
- 一次复杂 recall 有机会减少 40-80% 的注入 token

#### 运行性能与耗时变化

如果采用后台异步化：

- 主对话阶段几乎无明显变化
- `agent_end` 后增加一个后台任务
- 数据库写入略增，但可接受

如果错误地放到同步主链路：

- 主对话尾部延迟明显上升

#### 工作量

**8-15 人日**

取决于第一版是否：

- 只做规则切分
- 只做附加工具
- 暂不接管主检索

---

### 19.3 `Public / Shared Memory`

#### 冲突性

冲突性为 **中**。

当前系统已有 `agentId` 隔离，这是现有多 Agent 行为的基础。如果直接把共享机制做成默认打开，会破坏已有隔离边界。

**真正的冲突点**不是表结构，而是检索默认行为。

#### 复杂性

复杂性为 **中**。

因为复用当前 `chunks` 表和过滤体系即可，核心只是：

- 增加 `visibility`
- 调整过滤逻辑
- 补一个显式共享入口

#### 风险性

风险性为 **中**。

风险主要集中在：

- 共享边界设计不清
- 私有记忆被误共享
- 子 Agent 又重新“串记忆”

但只要默认仍然是 `private`，风险可控。

#### 可行性

可行性为 **高**。

因为现有系统已经支持：

- `agentId`
- SQL 级过滤
- 元数据列和索引

新增共享层是顺着现有方向扩展，而不是逆向重构。

#### Token 消耗增减量

- 默认私有保持不变时：**几乎无变化**
- 若主动启用 shared 检索：**小幅增加**

大致量级：

- 单次 recall 多出 0-2 条共享结果时，通常增加几十到几百 token，不会失控

#### 运行性能与耗时变化

- SQL 过滤增加一个条件，开销极小
- 加索引后几乎可忽略

#### 工作量

**4-7 人日**

这是五项中性价比较高的一项。

---

### 19.4 `Memory Viewer`

#### 冲突性

冲突性为 **低**。

因为它不需要替换现有链路，也不需要引入第二套 Viewer 服务。最合理的做法是直接利用现有 WebChat / Canvas / `workspace.read/write` / server RPC 扩展。

#### 复杂性

复杂性为 **中高**。

主要工作集中在：

- 后端查询接口
- 前端筛选与详情页
- 与现有模式切换/画布入口的整合

而不是算法本身。

#### 风险性

风险性为 **低中**。

只要 Viewer 走只读或受控写接口，不接入主链路，就很难破坏现有记忆系统稳定性。

#### 可行性

可行性为 **很高**。

现有系统已经有：

- WebChat
- WS 事件桥
- Canvas 模式切换
- `workspace.read/write`

所以 Viewer 不需要独立站点，也不需要额外鉴权面。

#### Token 消耗增减量

- 对主对话：**几乎 0**
- 只在用户打开页面、点击详情时发生普通查询开销

#### 运行性能与耗时变化

- 主链路几乎无影响
- 前端打开 Viewer 时会多出若干查询请求
- 大库场景下需要分页和过滤，否则前端渲染会卡

#### 工作量

**6-10 人日**

其中前端 UI/交互占比会高于后端。

---

### 19.5 语义分类标签补完

#### 冲突性

冲突性为 **低**。

因为它已经不是“新增能力”，而是“补完已实现但未完全产品化的能力”。

当前已具备：

- `MemoryCategory` 类型
- `chunks.category` 列与索引
- `MemorySearchFilter.category`
- M-N3 prompt 输出 category

#### 复杂性

复杂性为 **低中**。

主要剩余工作是：

- 工具参数暴露
- UI 筛选项
- 非 M-N3 来源数据的补标/回填
- 与 tags 的关系设计

#### 风险性

风险性为 **低**。

不会破坏主链路，也不需要引入新的重型对象模型。

#### 可行性

可行性为 **很高**。

这是五项里最容易快速出成果的一项。

#### Token 消耗增减量

变化很小。

- 如果只是筛选与展示：几乎不变
- 如果增加更细标签抽取：后台 token 小幅增加

#### 运行性能与耗时变化

- 基本无负担
- 过滤条件更精准后，反而可能减少无关 recall 结果

#### 工作量

**2-4 人日**

适合作为快收敛项。

---

### 19.6 经验到 `Method / Skill` 半自动沉淀

#### 冲突性

冲突性为 **中**。

当前 `methods/` 和 `skills/` 都是正式资产，且已有：

- `SkillRegistry`
- `skills_search`
- methodology 工具
- source 优先级和 eligibility gating

所以这项一旦直接自动发布，就不是“新增功能”，而是“污染现有资产”。

#### 复杂性

复杂性为 **高**。

因为它不是简单导出文件，而是要完成：

- 任务理解
- 经验归纳
- 模板化结构输出
- 质量控制
- 候选与正式资产分层

#### 风险性

风险性为 **高**。

这是五项里风险最高的一项。

主要风险：

- 自动生成内容质量不稳
- 方法和技能库被污染
- 用户难以区分“正式资产”和“机器草稿”

#### 可行性

可行性为 **中高**。

技术上完全能做，但产品策略必须保守：

- 只能先做候选草稿
- 不能直接进正式 `methods/` / `skills/`

#### Token 消耗增减量

这是五项里 token 增量最大的。

因为本质上要做：

- 摘要
- 提炼
- 结构化生成
- 可能还要二次评审

粗略估计：

- 每个候选可能消耗 800-3000+ token

但长期收益也大：

- 方法和技能复用后，可减少重复推理和重复搜索成本

#### 运行性能与耗时变化

若做成后台候选生成：

- 主链路基本无感

若误放入同步主链路：

- 明显拖慢会话完成时间

#### 工作量

**8-14 人日**

前提是只做“半自动候选层”，不做全自动发布闭环。

---

## 20. 综合判断

### 20.1 哪些项最容易做

最容易的两项：

1. **语义分类标签补完**
2. **Memory Viewer**

原因：

- 复用现有基础最多
- 对主链路最安全
- 用户可见价值明确

### 20.2 哪些项最有价值

价值最高的两项：

1. **Task 层总结**
2. **Public / Shared Memory**

原因：

- 直接补上当前 Belldandy 与 MemOS Local 的最大差距
- 对多 Agent 协作与长期经验复用提升最大

### 20.3 哪些项风险最高

风险最高的两项：

1. **经验到 Method / Skill 半自动沉淀**
2. **Task 层总结**

原因：

- 都涉及高层抽象正确性
- 都容易在“概念很好”与“实际污染系统”之间翻车

### 20.4 Token 与性能总体趋势

总体趋势不是“统一变贵”或“统一变便宜”，而是：

- **写入侧更贵**
- **检索侧更省**
- **主链路不应明显变慢**

前提是所有新增 LLM 加工都走：

- `agent_end` 异步
- idle/background 任务
- 或显式人工触发

而不是进入主对话同步链路。

### 20.5 总工作量判断

按“熟悉本仓库的一名全栈工程师”估算：

- **保守总工作量：28-50 人日**

更稳的拆法：

- **阶段 A**：`Task + Viewer + Shared`，约 `18-32 人日`
- **阶段 B**：`Category 补完 + Method/Skill 半自动沉淀`，约 `10-18 人日`

---

## 21. 收敛后的开发排期表

以下排期遵循三个原则：

1. **先补高价值对象层**
2. **不破坏现有主记忆链路**
3. **高 token / 高风险能力后置**

---

## 21.1 第一阶段：`Task` 层总结

### 目标

在现有 chunk/session 记忆之上增加 `memory_task` 对象，用于表达“完整任务经验”。

### 对应文件

- `packages/belldandy-memory/src/types.ts`
- `packages/belldandy-memory/src/store.ts`
- `packages/belldandy-memory/src/manager.ts`
- `packages/belldandy-memory/src/task-processor.ts`（新增）
- `packages/belldandy-skills/src/builtin/memory.ts`
- `packages/belldandy-core/src/bin/gateway.ts`

### 数据结构

建议新增：

- `tasks` 表
  - `id`
  - `agent_id`
  - `session_key`
  - `title`
  - `summary`
  - `status`
  - `started_at`
  - `ended_at`
  - `quality_score`
  - `metadata`
- `chunks.task_id` 列

### 接口 / 工具

新增：

- `memory_task_search`
- `memory_task_get`

保留现有：

- `memory_search`
- `memory_get`

### 验收点

- 同一会话中多个独立任务可分开落库
- `memory_task_get` 能返回目标/步骤/结果/关键细节
- 现有 `memory_search` 结果与排序无明显回归
- `agent_end` 不出现明显同步阻塞

### 风险控制

- 第一版只做规则切分，不上复杂 LLM 边界判断
- 第一版不接管主检索，只做附加对象与附加工具

---

## 21.2 第二阶段：`Memory Viewer`

### 目标

在现有 WebChat 中新增“记忆工作台”，而不是独立站点。

### 对应文件

- `packages/belldandy-core/src/server.ts`
- `apps/web/public/index.html`
- `apps/web/public/app.js`
- `apps/web/public/canvas.js`（如需复用节点跳转逻辑）
- `apps/web/public/*.css`（按现有页面结构选择）

### 数据结构

无必须新增表。

建议先复用：

- `chunks`
- `tasks`
- 现有 `memory` 文件

### 接口 / 工具

新增 server methods：

- `memory.search`
- `memory.recent`
- `memory.task.get`
- `memory.task.list`
- `memory.stats`
- `memory.timeline`

### 验收点

- 能按 `memory_type / category / agent / channel / date` 筛选
- 能查看原文、摘要、来源文件
- 能跳转到对应 memory 文件或 task 详情
- 大库场景下支持分页，不出现明显卡顿

### 风险控制

- 第一版只读
- 不做独立鉴权、独立端口、独立 viewer 服务

---

## 21.3 第三阶段：`Public / Shared Memory`

### 目标

在现有 `agentId` 隔离模型上增加显式共享层。

### 对应文件

- `packages/belldandy-memory/src/types.ts`
- `packages/belldandy-memory/src/store.ts`
- `packages/belldandy-memory/src/manager.ts`
- `packages/belldandy-skills/src/builtin/memory.ts`
- `packages/belldandy-core/src/bin/gateway.ts`

### 数据结构

建议新增：

- `chunks.visibility` 列
  - `private`
  - `shared`
  - `global`

### 接口 / 工具

新增：

- `memory_share_write`
- `memory_share_promote`
- `memory_search_shared` 或在现有搜索工具增加显式 `scope`

### 验收点

- 默认行为仍为私有隔离
- 显式共享后其他 Agent 可检索
- 非共享数据不会被其他 Agent 误召回
- 旧数据兼容，不会出现“记忆失忆”

### 风险控制

- 默认 `private`
- 共享必须显式触发
- 第一版不做自动 public/shared 提升

---

## 21.4 第四阶段：语义分类标签补完

### 目标

把现有 `category` 能力补成可用的检索和可视化能力。

### 对应文件

- `packages/belldandy-memory/src/types.ts`
- `packages/belldandy-memory/src/store.ts`
- `packages/belldandy-memory/src/manager.ts`
- `packages/belldandy-skills/src/builtin/memory.ts`
- `apps/web/public/app.js`

### 数据结构

现有结构可复用：

- `chunks.category`

可选增强：

- `metadata.tags`

### 接口 / 工具

增强现有：

- `memory_search` 增加 `category`
- 可选增加 `tags`

### 验收点

- 用户可按 category 搜索
- Viewer 可按 category 过滤
- M-N3 提取出的 category 在检索中实际生效
- 旧数据不报错，未分类数据仍可正常检索

### 风险控制

- 保持 `category` 为单值主分类
- 细粒度分类放入 tags，不要一次性图谱化

---

## 21.5 第五阶段：经验到 `Method / Skill` 的半自动沉淀

### 目标

把高质量任务经验转成候选方法/技能草稿，但不直接进入正式资产。

### 对应文件

- `packages/belldandy-memory/src/manager.ts`
- `packages/belldandy-memory/src/task-processor.ts`
- `packages/belldandy-skills/src/skill-registry.ts`
- `packages/belldandy-skills/src/builtin/methodology/create.ts`
- `packages/belldandy-skills/src/builtin/skills-tool.ts`
- `packages/belldandy-core/src/server.ts`

可新增：

- `packages/belldandy-memory/src/experience-promoter.ts`

### 数据结构

建议新增：

- `experience_candidates` 表
  - `id`
  - `task_id`
  - `type` (`method` | `skill`)
  - `status` (`draft` | `reviewed` | `accepted` | `rejected`)
  - `title`
  - `content`
  - `quality_score`
  - `created_at`
  - `reviewed_at`

### 接口 / 工具

新增：

- `task_promote_method`
- `task_promote_skill_draft`
- `experience_candidate_list`
- `experience_candidate_accept`
- `experience_candidate_reject`

### 验收点

- 候选只进入草稿区，不污染正式 `methods/` / `skills/`
- 审核通过后才能进入正式目录
- 生成内容能被 `method_search` / `skills_search` 正常发现
- 同一 task 不会无限重复生成候选

### 风险控制

- 第一版禁止自动发布
- 所有生成物都必须带 `source task_id`
- 候选与正式资产物理隔离

---

## 22. 推荐实施顺序

我建议的最终顺序是：

1. **`Task` 层总结**
2. **`Memory Viewer`**
3. **`Public / Shared Memory`**
4. **语义分类标签补完**
5. **经验到 `Method / Skill` 的半自动沉淀**

### 原因

- `Task` 层总结是最有价值的能力升级
- `Viewer` 能显著降低后续调试和验收成本
- `Shared Memory` 价值高，但需要在可观测基础上推进更稳
- `Category` 已有底座，可作为中低风险补完项
- `Method/Skill` 风险最高，必须最后做

---

## 23. 最终收敛结论

这 5 点增强方案中：

- **最值得优先做的是 `Task` 层总结**
- **最容易快速交付的是语义分类标签补完**
- **最适合作为产品化抓手的是 `Memory Viewer`**
- **最适合作为多 Agent 协作升级的是 `Public / Shared Memory`**
- **最应该最后做的是经验到 `Method / Skill` 的半自动沉淀**

从整体上看：

- **不存在不可行项**
- **真正需要防的是“概念重叠”和“主链路过载”**
- **只要坚持“新增高成本能力不进主对话同步链路”这个原则，这 5 点都可稳步落地**

---

## 24. 第一阶段详细实施单：`Task` 层总结

第一阶段的目的不是再造一套新任务系统，而是把 Belldandy 现有的：

- `conversation`
- `tool call`
- `token counter`
- `sub-agent orchestrator`
- `memory extraction`

收敛成一个**独立、可检索、可回看、可沉淀经验**的 `Task Summary Layer`。

### 24.1 第一阶段目标

第一阶段只解决 4 件事：

1. 让一次任务有结构化记录
2. 让任务可以被检索和查看
3. 让任务和记忆建立基础关联
4. 让高成本总结能力不进入主对话同步链路

### 24.2 第一阶段边界

第一阶段明确**不做**：

- 不替换现有 `chunks` 记忆检索主链路
- 不把所有 task summary 自动写回 `chunks`
- 不做复杂任务图 / DAG / step 事件流
- 不做自动方法论发布
- 不把 LLM 总结放进同步回复路径

### 24.3 收敛后的核心设计

第一阶段保留的关键设计只有这些：

- 独立 `tasks` 表
- 独立 `task_memory_links` 表
- 独立 `task_search / task_recent / task_get`
- `memory_read / memory_write`
- 异步 `TaskSummarizer`

其中：

- `tasks` 负责保存任务目标、状态、工具摘要、产物路径、token、duration、summary、reflection
- `task_memory_links` 负责保存任务与记忆的关系，第一阶段只用：
  - `used`
  - `generated`
  - `referenced`

### 24.4 关键实现原则

第一阶段只保留 5 条原则：

1. `tasks` 只做关键词检索，不上向量
2. `toolCalls` / `artifactPaths` 先存 JSON，不拆明细表
3. `after_tool_call` 只收集轻量摘要，不保存完整工具结果
4. `agent_end` 只负责落基础记录与排队异步总结，不同步等待
5. 第一版不把 task summary 自动写回长期记忆

### 24.5 接入点

第一阶段实际只接 3 个生命周期点：

- `before_agent_start`
  - 建立任务草稿
  - 记录 `objective`
  - 判定 `source`
- `after_tool_call`
  - 收集工具摘要
  - 抽取产物路径
- `agent_end`
  - 汇总 success / duration / token
  - 写入 `tasks`
  - 异步生成 `summary / reflection`

### 24.6 与现有能力的关系

第一阶段明确复用：

- `ConversationStore`
  - 提供最近会话历史给任务总结
- `Token Counter`
  - 提供任务级 token 基础统计
- `SubAgentOrchestrator`
  - 提供子任务会话 ID、父会话 ID、agentId、instruction

这里的原则是：

- **复用现有运行资产**
- **不平行造第二套任务上下文系统**

### 24.7 工具层保留项

第一阶段工具层只保留这 5 个：

- `task_search`
- `task_recent`
- `task_get`
- `memory_read`
- `memory_write`

其中：

- `task_search` 用于查类似历史任务
- `task_recent` 用于查看最近完成的任务
- `task_get` 用于查看单条任务详情
- `memory_read / memory_write` 用于补齐任务与记忆联动闭环

### 24.8 记忆联动策略

第一阶段的联动只保留最小闭环：

- `memory_search` 命中的 chunk 写入 `task_memory_links.used`
- `memory_write` 生成的 memory chunk 写入 `task_memory_links.generated`
- 会话记忆自动提取写入 daily memory 后，回挂 `task_memory_links.generated`

第一阶段仍然**不做**：

- 不把 task 结果混进 `memory_search`
- 不把所有 task 自动归档为长期记忆
- 不把 task summary 自动写回 `chunks`

### 24.9 验收标准

第一阶段只看以下结果是否成立：

- `tasks` / `task_memory_links` 能自动迁移
- 顶层任务结束后可生成 `tasks` 记录
- 子 Agent 任务可独立生成记录
- `task_recent / task_search / task_get` 可正常工作
- `memory_read / memory_write` 可正常工作
- `task_get` 能看到工具、产物、记忆关联
- 主对话延迟没有因 task summary 明显升高
- 原有 `memory_search` 行为不被破坏

### 24.10 当前结论

第一阶段的最稳落地版本就是：

1. 只保留 `tasks` + `task_memory_links`
2. 只保留 `task_*` 与 `memory_read / memory_write`
3. 只接 `before_agent_start / after_tool_call / agent_end`
4. LLM 总结只做异步补充，不进主链路
5. task summary 不自动写回 `chunks`

这已经足够支撑下一步进入第二阶段 `Memory Viewer`。

---

## 25. 第一阶段实施进度回写（已落地）

截至当前，本次第一阶段已不再停留在“实施方案”，而是已经完成了首轮工程落地。

### 25.1 已落地能力

#### 数据层

已完成：

- `memory.sqlite` 中新增 `tasks`
- `memory.sqlite` 中新增 `task_memory_links`
- `tasks` 已支持基础写入、更新、按关键词检索、按最近时间列出、按会话反查

#### 运行链路

已完成：

- `before_agent_start` 建立任务草稿
- `after_tool_call` 收集工具摘要与产物路径
- `agent_end` 落基础任务记录
- 异步 task summary / reflection 生成

#### 任务与记忆联动

已完成：

- `memory_search` 命中的 chunk 会写入 `task_memory_links.used`
- 会话记忆自动提取写入 daily memory 后，会回挂 `task_memory_links.generated`
- `memory_write` 写入记忆后，会回挂 `task_memory_links.generated`

#### 工具层

已完成：

- `task_search`
- `task_recent`
- `task_get`
- `memory_read`
- `memory_write`

#### 可读性

已完成：

- `task_get` 不再只返回原始 JSON
- 已提供可读详情视图：
  - 任务状态
  - 来源
  - 会话 ID
  - duration / token
  - objective / summary / reflection
  - tools
  - artifacts
  - memory links

---

### 25.2 当前开关项

当前第一阶段主要依赖以下环境变量：

- `BELLDANDY_TASK_MEMORY_ENABLED=true`
- `BELLDANDY_TASK_SUMMARY_ENABLED=false` 或 `true`
- `BELLDANDY_TASK_SUMMARY_MODEL=...`
- `BELLDANDY_TASK_SUMMARY_BASE_URL=...`
- `BELLDANDY_TASK_SUMMARY_API_KEY=...`
- `BELLDANDY_TASK_SUMMARY_MIN_DURATION_MS=15000`
- `BELLDANDY_TASK_SUMMARY_MIN_TOOL_CALLS=2`
- `BELLDANDY_TASK_SUMMARY_MIN_TOKEN_TOTAL=2000`

建议灰度方式：

1. 先开 `BELLDANDY_TASK_MEMORY_ENABLED=true`
2. 暂不开 `BELLDANDY_TASK_SUMMARY_ENABLED`
3. 先验证任务底账、task tools、memory links 是否稳定
4. 再开启 task summary

---

### 25.3 当前最小 Smoke 验证流程

建议按下面顺序做人工 smoke：

#### Step 1：启动条件

- `BELLDANDY_TOOLS_ENABLED=true`
- `BELLDANDY_TASK_MEMORY_ENABLED=true`

可选：

- `BELLDANDY_TASK_SUMMARY_ENABLED=false`

先关闭 summary，避免把验证复杂度和 LLM 质量问题混在一起。

#### Step 2：写入一条记忆

在 WebChat 中发起一个明确会调用工具的任务，例如：

```text
请把“用户偏好 TypeScript 严格模式”写入今天的记忆，并告诉我写入到了哪里。
```

预期：

- Agent 调用 `memory_write`
- `memory_write` 成功返回写入路径
- 本次任务会记录 `generated` memory link

#### Step 3：再检索这条记忆

在同一会话继续：

```text
请搜索 TypeScript 严格模式 相关记忆。
```

预期：

- Agent 调用 `memory_search`
- 命中刚才写入的 daily memory chunk
- 本次任务会记录 `used` memory link

#### Step 4：查看最近任务

调用：

```text
请执行 task_recent
```

预期：

- 能看到最近任务列表
- 至少包含刚才的记忆写入任务或检索任务

#### Step 5：查看任务详情

对最近返回的某个 task id 调用：

```text
请执行 task_get，查看 task_xxx 的详情
```

预期：

- 能看到 objective
- 能看到 toolCalls
- 能看到 artifacts
- 能看到 memory links
- 若开启了 summary，能看到 summary / reflection

#### Step 6：回归

再执行一次正常 `memory_search`

预期：

- 结果与未启用 task memory 前语义一致
- 不会因为 task 系统引入明显额外延迟

---

### 25.4 当前已验证项

目前已通过的工程验证包括：

- memory 包单元测试
  - `task-processor.test.ts`
  - `memory-files.test.ts`
- skills 包工具级 mock 测试
  - `memory_search`
  - `memory_read`
  - `memory_write`
  - `task_recent`
  - `task_get`
  - `memory_index`
- 定向 TypeScript build
  - `@belldandy/memory`
  - `@belldandy/skills`
  - `@belldandy/agent`
  - `@belldandy/core`

---

### 25.5 第一阶段已完成项与保留项

#### 已完成项

- `tasks` / `task_memory_links` 表
- `TaskProcessor`
- `TaskSummarizer`
- gateway hook 接入
- `task_search / task_recent / task_get`
- `memory_read / memory_write`
- `used / generated` 记忆关联
- 可读化 task 详情

#### 保留项

以下内容仍可算第一阶段后的“增强项”，但已不影响第一阶段交付：

- `parentTaskId` 自动补全
- `memory_index` 后的 chunk 级 generated 精确回挂
- `task_get` 中提供直接跳转文件的前端按钮
- `task_search` 增加按 `has_memory_links` / `has_artifacts` 过滤
- 为 `task_*` 提供 viewer 页面

---

### 25.6 当前结论

第一阶段现在已经满足“可交付”标准：

- **有数据底账**
- **有任务查询入口**
- **有任务与记忆的双向关联雏形**
- **对现有 Belldandy 记忆主链路干扰很小**

从制作人视角看，现阶段已经可以进入：

1. 一轮真实使用验证
2. 一轮体验反馈收集
3. 再决定是否推进第二阶段 `Memory Viewer`

---

## 26. 第二阶段最小落地方案：`Memory Viewer`

第二阶段采用最小落地策略：不新起服务、不新增独立鉴权、不改 Belldandy 记忆架构，只在现有 `WebChat + Gateway + memory.sqlite` 上做一个只读 `Memory Viewer`，用于验证第一阶段 `Task Memory` 的产品价值。

### 26.1 边界与范围

- 只读，不提供编辑/删除/批量操作
- 复用现有 `WebChat`、`Gateway RPC`、`SQLite`
- 页面收敛为 `Tasks / Memories` 双 Tab
- 重点展示：
  - `toolCalls`
  - `artifactPaths`
  - `memoryLinks`
  - `sourcePath`

### 26.2 当前落地结果

当前第二阶段最小版已完成：

- 后端只读 RPC：
  - `memory.search`
  - `memory.get`
  - `memory.recent`
  - `memory.stats`
  - `memory.task.list`
  - `memory.task.get`
  - `workspace.readSource`
- 前端已完成：
  - `Memory Viewer` 入口
  - `Tasks / Memories` 双 Tab
  - 搜索、基础筛选、列表、详情、统计卡片
  - 来源只读跳转与页面内通知
- 已完成基础验证：
  - `corepack pnpm --filter @belldandy/memory --filter @belldandy/core build`
  - `node .\node_modules\vitest\vitest.mjs run packages/belldandy-core/src/server.test.ts`

### 26.3 真实库与真实运行态验证结果

真实库副本验收已通过：

- `/health`、`memory.stats`、`memory.recent`、`memory.get`、`workspace.readSource`、`memory.task.list` 均正常
- `limit=20` 下首屏 RPC 大致在 `50ms` 量级
- 真实库快照规模：
  - `files=911`
  - `chunks=2621`
  - `vectorIndexed=2620`
  - `vectorCached=1312`

正式运行态现已确认：

- `taskMemory=true`
- `task memory hooks` 已注册
- 真实库已生成 `tasks / task_memory_links / tasks_fts`
- `toolCalls`、`artifactPaths`、`Task Summary` 均已真实落库

### 26.4 本轮测试结果与收口说明

本轮已新增两项最小安全改造：

1. `memory_read -> used`
2. 白名单 `file_read(MEMORY.md / memory/*) -> used`

对应测试已通过：

- `node .\node_modules\vitest\vitest.mjs run packages/belldandy-skills/src/builtin/memory.test.ts`
- `node .\node_modules\vitest\vitest.mjs run packages/belldandy-skills/src/builtin/file.test.ts`

真实任务验证结果收敛为：

- 新任务 `task_96190a3f` 已出现非空 `memoryLinks`
- `task_recent` 可稳定定位新任务
- `task_get` 可稳定展示：
  - `Summary`
  - `Reflection`
  - `Tools`
  - `Memory Links`
- 这说明第二阶段“任务可看、记忆可追溯、来源可回看”的主闭环已经成立

收口说明：

- 第二阶段现在已经不是“能力缺口”问题，而是“体验收口”问题
- 若后续还要继续验证，只需要做少量真实手测，不必继续扩接口或扩页面复杂度
- `memory_read / 白名单 file_read` 的独立建链是否要再做纯隔离样本验证，已经属于可选技术补充，不影响第二阶段进入下一阶段

### 26.5 当前下一步

第二阶段建议在这里收口，后续只保留两类动作：

1. **必要时做最后一轮 WebChat 真机体验修补**
   - 只处理真实手测里出现的 UI/信息密度问题
2. **进入下一阶段**
   - 不再继续扩展第二阶段方案说明
   - 将重心切换到下一阶段目标

---

## 27. 第三阶段最小落地方案：`Public / Shared Memory`

第三阶段的目标已经收敛为一句话：

- **在保持默认私有的前提下，为 Belldandy 增加“显式共享、显式检索、可追溯”的最小共享层。**

### 27.1 范围与边界

本阶段只做 3 件事：

1. 允许把记忆显式提升为 `shared`
2. 允许其他 Agent 通过显式 `scope` 检索共享记忆
3. 保持默认行为不变，不让私有记忆误泄漏

本阶段明确不做：

- 自动共享
- 复杂 ACL / 组织权限
- 独立共享库
- 共享治理后台

### 27.2 当前进度总览

第三阶段可以判定为：**已完成最小闭环**

- **P3-1 数据层**
  - `chunks.visibility` 已落地，支持 `private / shared`
  - 旧库迁移与默认值已打通
  - `memory_write -> index` 链路已补 `agentId` 归属

- **P3-2 检索层**
  - `memory_search` 已支持 `scope=private / shared / all`
  - 不传 `scope` 时保持原行为
  - 共享检索结果已可附带 `[shared]` 标记

- **P3-3 写入层**
  - `memory_share_promote` 已落地
  - 支持 `chunk_id` 或 `source_path`
  - promote 后可补 `referenced` / `memoryLinks`

- **P3-4 手测与灰度**
  - 首轮真实灰度暴露 2 个问题，已修复
  - 第二轮真实双 Agent 验证已通过
  - `task_get` 中 `memoryLinks` 已确认非空

- **P3-5 Viewer 标记**
  - `Memory Viewer` 已支持 `private/shared` 徽标
  - 详情已显示 `Visibility`
  - Viewer 已增加最小范围筛选

### 27.3 关键修复与重要说明

本阶段最关键的修复有 3 项：

1. **补齐写入归属**
   - 修复 `memory_write -> index` 默认丢失 `agentId` 的问题
   - 避免新写入记忆被错误当成系统级可见

2. **补齐当前任务挂链**
   - 修复按 `source_path` promote 时，运行中任务拿不到 `memoryLinks` 的问题
   - 现在会同时补当前 draft 与已落库任务记录

3. **补齐路径兼容**
   - `source_path` 同时兼容绝对路径与 `memory/...` 相对路径

额外说明：

- 无 embedding provider 时，向量链路现在会直接降级跳过
- 不再出现 `float[0]` 或批量 embedding 失败日志

### 27.4 Viewer 收口结果

Viewer 已完成最小收口：

- `Memories` 列表可显示 `private/shared`
- 详情面板可显示 `Visibility`
- 已补范围筛选，当前文案已收敛为：
  - `默认范围`
  - `私有层+系统层`
  - `共享层+系统层`
  - `全部层`

真实手测结论：

- 前端构建通过
- 真实页面可进入 `Memory Viewer -> Memories`
- 真实库数据可正常加载
- 当前真实库中仅看到 `private` 样本，尚未看到现成 `shared` 样本
- 因此已确认：
  - `private` 徽标展示正常
  - 范围切换正常，不报错
- 暂未在真实库里看到 `shared` 徽标实例，这属于当前数据现状，不是 Viewer 渲染失败

### 27.5 阶段结论

当前 Belldandy 已具备：

- 默认私有写入
- 显式 `memory_share_promote`
- 显式 `scope=shared / all`
- 任务级 `memoryLinks` 挂链
- Viewer 侧最小共享可视化

这已经足够支撑：

- “默认私有，必要时显式共享”的产品语义
- 对共享记忆做最小可观测与排查

当前不建议继续在第三阶段扩功能。更合理的动作是进入下一阶段目标设计。

### 27.6 下一步入口

若继续产品化，优先考虑：

1. Viewer 增加任务详情联动与来源跳转
2. 共享样本治理与回收机制
3. 更清晰的 Agent / 系统层记忆边界展示
