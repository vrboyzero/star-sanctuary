# SS 的 Agent 记忆实现情况与记忆机制

最后更新：2026-04-20  
分析范围：基于当前仓库代码的真实实现，不以说明文档表述代替代码事实。  
参考说明文档：`Star Sanctuary实现内容说明.md`

## 结论先看

当前 Star Sanctuary 的 Agent 记忆不是单一 `MEMORY.md` 机制，而是由以下几层共同组成：

1. 会话级：`session digest` + `session memory`
2. 任务级：`task activities` + `work recap` + `resume context`
3. 长期文件：`memory/YYYY-MM-DD.md`、`memory/*.md`、`MEMORY.md`
4. 检索/结构化层：各 state scope 下的 `memory.sqlite`
5. resident 多 Agent 治理：`shared / hybrid / isolated` + scoped memory manager + resident conversation store

需要牢牢记住的三个结论：

1. 当前自动 durable extraction 的主落点是 `memory/YYYY-MM-DD.md`，不是直接写 `MEMORY.md`。
2. 多 Agent 不是共享一个大库后靠 `agentId` 粗隔离，而是按 resident policy 分 scope、分 store、分 manager。
3. 后续 dream 最适合做成“位于现有摘要治理之上的反思整理层”，而不是另起一套记忆系统。

## 一、文档用途

这份文档现在主要服务三个目的：

1. 帮实现者快速理解 SS 当前记忆链路
2. 保留 dream / Obsidian 方案所需的关键参考点
3. 提供第 15 章的完整实施稿，作为后续开发依据

因此，前 1-14 章只保留：

- 真实实现要点
- 必要边界
- 关键参考文件
- dream 设计的关键前提

详细计划、模块清单、开发顺序全部保留在第 15 章。

## 二、当前记忆实现最小全景

### 2.1 会话级记忆

核心文件：

- `packages/belldandy-agent/src/conversation.ts`
- `packages/belldandy-agent/src/tool-agent.ts`
- `packages/belldandy-core/src/server.ts`

要点：

- 产物是 `*.digest.json` 和 `*.session-memory.json`
- `DEFAULT_SESSION_DIGEST_THRESHOLD = 6`
- `message.send` / `message.error` 后会触发 digest 刷新链
- `before_agent_start` 会把 digest/session memory 相关上下文注入 prompt

### 2.2 任务级记忆

核心文件：

- `packages/belldandy-memory/src/task-processor.ts`
- `packages/belldandy-memory/src/task-recap.ts`
- `packages/belldandy-core/src/bin/gateway.ts`

要点：

- 记录 `tasks`、`task_activities`、`task_memory_links`
- 生成 `workRecap` 和 `resumeContext`
- 这是当前最像“工作日志/运行日记”的一层

### 2.3 长期记忆层

核心文件：

- `packages/belldandy-memory/src/manager.ts`
- `packages/belldandy-memory/src/memory-files.ts`
- `packages/belldandy-core/src/memory-index-paths.ts`

要点：

- 主载体：`memory/YYYY-MM-DD.md`、`memory/*.md`、`MEMORY.md`、`memory.sqlite`
- MemoryManager 的主索引面是：
  - `sessions/`
  - `memory/`
  - `MEMORY.md`

## 三、当前“触发日记”的真实拆分

“触发日记”不是单一模块，而是三层叠加：

1. 会话摘要式日记
   - `session digest`
   - `session memory`
2. 任务活动式日记
   - `task activities`
   - `workRecap`
   - `resumeContext`
3. 每日长期记忆式日记
   - `memory/YYYY-MM-DD.md`

dream 不应该替代这三层，而应该建立在它们之上。

## 四、`memory/YYYY-MM-DD.md` 与 `MEMORY.md` 的写入边界

### 4.1 `memory/YYYY-MM-DD.md`

有两类写入路径：

1. 自动写入
   - 走 durable extraction 链
   - 主入口：`packages/belldandy-memory/src/manager.ts`
   - 最终落盘：`appendToTodayMemory(...)`

2. 显式写入
   - `memory_write` 不传 `path`，默认写今天
   - `memory_write path=memory/YYYY-MM-DD.md`
   - `file_write` 直接写对应路径

### 4.2 `MEMORY.md`

当前只有显式写入，没有自动写入链。

显式写入方式：

1. `memory_write path=MEMORY.md`
2. `file_write` 直接写 `MEMORY.md`
3. 人工直接编辑

明确排除：

- durable extraction 不会自动写 `MEMORY.md`
- `ensureWorkspace` 不会默认强制创建 `MEMORY.md`

## 五、多 Agent 记忆处理的最小结论

核心文件：

- `packages/belldandy-agent/src/agent-profile.ts`
- `packages/belldandy-core/src/resident-memory-policy.ts`
- `packages/belldandy-core/src/resident-memory-managers.ts`
- `packages/belldandy-core/src/resident-state-binding.ts`
- `packages/belldandy-core/src/resident-conversation-store.ts`

最小结论：

1. memory mode 只有三种：`shared / hybrid / isolated`
2. 默认是 `hybrid`
3. conversation store 按 resident scope 路由
4. MemoryManager 是 scoped manager，不是简单共库
5. shared memory 有 promote / claim / review / revoke 治理

## 六、子 Agent 记忆归属的最小结论

核心文件：

- `packages/belldandy-agent/src/orchestrator.ts`
- `packages/belldandy-core/src/bin/gateway.ts`

要点：

1. `sub_*` 子 Agent 会话是独立 conversation
2. 不直接复用父会话
3. 任务关系通过 `parentConversationId` / subtask runtime 回挂
4. 子 Agent 的长期记忆归属由其 `agentId` 对应的 resident policy 和 scoped manager 决定

## 七、对后续实现最重要的参考文件

### 7.1 记忆主链

- `packages/belldandy-agent/src/conversation.ts`
- `packages/belldandy-agent/src/tool-agent.ts`
- `packages/belldandy-memory/src/manager.ts`
- `packages/belldandy-memory/src/memory-files.ts`
- `packages/belldandy-memory/src/durable-extraction.ts`
- `packages/belldandy-memory/src/task-processor.ts`
- `packages/belldandy-memory/src/task-recap.ts`

### 7.2 resident / 多 Agent

- `packages/belldandy-agent/src/agent-profile.ts`
- `packages/belldandy-core/src/resident-memory-policy.ts`
- `packages/belldandy-core/src/resident-memory-managers.ts`
- `packages/belldandy-core/src/resident-state-binding.ts`
- `packages/belldandy-core/src/resident-conversation-store.ts`
- `packages/belldandy-core/src/resident-shared-memory.ts`
- `packages/belldandy-core/src/resident-agent-observability.ts`

### 7.3 摘要、上下文、复盘

- `packages/belldandy-core/src/context-injection.ts`
- `packages/belldandy-core/src/mind-profile-snapshot.ts`
- `packages/belldandy-core/src/learning-review-input.ts`
- `packages/belldandy-memory/src/task-work-surface.ts`
- `packages/belldandy-core/src/memory-runtime-introspection.ts`

### 7.4 记忆查看 / 共享审批

- `apps/web/public/app/features/memory-viewer.js`
- `packages/belldandy-core/src/server-methods/memory-experience.ts`
- `packages/belldandy-core/src/server.ts`

最关键的共享审批方法：

- `memory.share.queue`
- `memory.share.promote`
- `memory.share.claim`
- `memory.share.review`

## 八、dream 设计的关键前提

### 8.1 dream 的定位

dream 应定义为：

- 后台、低频、跨会话的反思整理任务
- 位于现有摘要治理之上的第二层整理 runtime
- 负责“再想清楚”，不是“第一次记下来”

### 8.2 dream 最该复用的现有输入

dream 的输入优先级建议固定为：

1. `mindProfileSnapshot`
2. `session digest`
3. `session memory`
4. `workRecap`
5. `resumeContext`
6. 最近新增 durable memories
7. `learningReviewInput`

不建议第一阶段直接全量扫 transcript。

### 8.3 dream 与现有记忆层的关系

建议分层：

1. `memory/YYYY-MM-DD.md`
   - durable extraction 自动沉淀层
2. `MEMORY.md`
   - 显式长期记忆层
3. `dreams/*.md`
   - 每次 dream 的完整结果
4. `DREAM.md`
   - dream 层入口与索引

第一阶段不让 dream 自动改 `MEMORY.md`。

## 九、Obsidian 对接的关键前提

### 9.1 主路径建议

推荐主路径：

1. 文件系统直写 vault
2. Local REST API 作为增强层
3. Obsidian URI 作为打开/跳转层

### 9.2 为什么文件系统直写优先

结合 `tmp/obsidian-tools` 和现有经验：

1. 不依赖 Obsidian 正在运行
2. 不依赖插件在线
3. 中文/UTF-8 更稳
4. 最适合后台自动镜像

### 9.3 Obsidian 永不反向直接覆盖 SS 内部 shared memory

这是硬约束：

- Obsidian 只做镜像、公共知识面和外部参考区
- 不做 SS 内部 shared memory 的事实源
- 不做反向直接覆盖

## 十、Obsidian 公共租界（Commons）的关键前提

结合飞书文档当前可读内容与 SS 现有治理，建议把 Obsidian Commons 定义为：

- 多 Agent 共享知识的外部公共图书馆
- 只承接已通过 SS 内部治理确认的共享内容

最重要的边界：

1. private dream 不自动进入 Commons
2. pending/rejected 不进入 Commons
3. 只有 approved / active shared memory 才进入 Commons
4. Commons 不替代 SS 内部 shared review

## 十一、为什么现有摘要治理会显著帮助 dream

结论：帮助很大，而且 dream 应该依赖这些能力。

最重要的帮助点：

1. `session digest` 降低会话输入噪声
2. `session memory` 提供当前工作、下一步、约束
3. `workRecap` 提供任务事实压缩
4. `resumeContext` 提供停点与阻塞
5. `learningReviewInput` 提供已压缩的复盘输入
6. `mindProfileSnapshot` 提供心智快照
7. `resident observability` 提供 per-agent gate 数据
8. `memory viewer` 已经提供共享审批与来源追溯界面

一句话：

dream 不需要自己重新发明“如何理解近期工作”，SS 已经把这层基础做出来了。

## 十二、当前实现中的风险提醒

实现 dream / Obsidian 时需要特别注意：

1. 不要绕开 resident scope
2. 不要绕开现有 shared review
3. 不要让 dream 自动改 `MEMORY.md`
4. 不要让 Obsidian 反向覆盖 SS 内部 shared memory
5. 不要让 dream 默认全量扫 transcript

## 十三、可直接执行的产品结论

如果从产品视角压缩成最短表述：

1. 先做每个 Agent 私有 dream
2. 再做 Obsidian 私有镜像
3. 再把 approved shared memory 发布到 Commons
4. 不做 Obsidian 反向覆盖

## 十四、外部与本地参考来源

### 14.1 Claude Code / Auto-dream

- `docs/archive/claude-code特别功能评估.md`
- `tmp/claude-code-source/src/services/autoDream/autoDream.ts`
- `tmp/claude-code-source/src/services/autoDream/consolidationPrompt.ts`
- `tmp/claude-code-source/src/tasks/DreamTask/DreamTask.ts`

可借鉴点：

- 时间门槛 + 会话数量门槛
- lock 防并发
- 独立后台 dream task
- 用户可见状态

### 14.2 Obsidian 对接

- `tmp/obsidian-tools/README.md`
- `tmp/obsidian-tools/SKILL.md`
- `tmp/obsidian-tools/tools/note.ts`
- `tmp/obsidian-tools/MIGRATION.md`

可借鉴点：

- 文件系统直写优先
- Local REST API 作为增强层
- Obsidian URI 作为跳转层

### 14.3 飞书文档

- `https://ocnko0ovs8al.feishu.cn/docx/YAf2dqMx6oKF09xFvpNckZ4Yndg`

当前公开可读到的关键方向：

1. 记忆默认是孤岛
2. 多 Agent 共享知识需要共同参考源
3. 方案 B：利用 Obsidian 作为“公共租界”
4. 核心知识沉淀在 Obsidian 中，可作为所有 Agent 的共同参考源

---

## 十五、实施稿：Phase 1 + Phase 2 + Commons 落地清单与开发计划

本节把前面的设计方案收束成可执行实施稿，只覆盖以下范围：

1. Phase 1：每个 Agent 的私有 dream
2. Phase 2：Obsidian 私有 dream 镜像
3. Commons：Obsidian 公共租界

本节同时明确一条硬约束：

> Obsidian 永远不反向直接覆盖 SS 内部 `shared memory`。  
> Obsidian 只作为外部镜像、公共知识面和可搜索参考区，不作为 SS 内部共享事实源。

### 15.1 本轮实施目标

本轮要做出的最小可用闭环是：

1. 每个 resident Agent 都可以拥有自己的 dream 运行状态
2. 每个 resident Agent 都可以生成自己的 dream 文档
3. dream 输入优先复用现有摘要、任务复盘、长期记忆增量
4. dream 结果可以镜像到本地 Obsidian 的 Agent 私有区
5. 已通过 SS 共享审批的 shared memory 可以镜像到 Obsidian Commons
6. WebChat / Doctor 能看到 dream 和 Obsidian sync 的运行状态

本轮不做：

1. dream 自动改写 `MEMORY.md`
2. Obsidian -> SS 的反向自动导入
3. 未审批内容进入 Commons
4. 跨 Agent 联合做一个 dream

### 15.2 实施边界与关键原则

#### 原则 1：dream 是后台 runtime，不是自由工具面

dream runtime 应和 durable extraction 一样，属于 internal-restricted 运行面：

- 能读受控输入
- 不能继承主线程任意工具面
- 写回动作由 runtime 负责

#### 原则 2：摘要优先，原文追溯后置

dream 输入顺序固定为：

1. `mindProfileSnapshot`
2. `session digest`
3. `session memory`
4. `workRecap`
5. `resumeContext`
6. 最近 durable memory
7. `learningReviewInput`

只有必要时才追溯 source conversation / task detail。

#### 原则 3：内部治理优先于 Obsidian

共享事实的权威来源始终在 SS 内部：

- private memory
- shared review queue
- approved / active shared memory

Obsidian 只做镜像和外部知识面，不改变这条主线。

#### 原则 4：先 private，再 mirror，再 commons

功能顺序必须是：

1. Agent 私有 dream
2. Agent 私有 dream 镜像到 Obsidian
3. approved shared memory 镜像到 Commons

不要一开始把 private dream 和 Commons 混在一起。

### 15.3 Phase 1 实施清单：每个 Agent 的私有 dream

#### 15.3.1 目标

让每个 resident Agent 在自己的 private scope 下拥有：

- dream runtime 状态
- dream 文档产物
- dream 索引页
- 手动触发入口
- 自动触发门槛
- 基础 observability

#### 15.3.2 建议新增状态目录

在每个 Agent 的 `managerStateDir` 下新增：

```text
dreams/
  2026/
    04/
      2026-04-19--dream-0001.md
DREAM.md
dream-runtime.json
```

语义：

- `dreams/...md`：每次 dream 结果
- `DREAM.md`：当前 Agent 的 dream 索引
- `dream-runtime.json`：运行状态、门槛、最近同步状态

#### 15.3.3 建议新增后端模块

建议新增：

- `packages/belldandy-memory/src/dream-runtime.ts`
- `packages/belldandy-memory/src/dream-store.ts`
- `packages/belldandy-memory/src/dream-input.ts`
- `packages/belldandy-memory/src/dream-prompt.ts`
- `packages/belldandy-memory/src/dream-writer.ts`
- `packages/belldandy-memory/src/dream-types.ts`
- `packages/belldandy-memory/src/dream-runtime.test.ts`

各模块职责建议如下：

- `dream-types.ts`
  - 定义 dream record、dream input snapshot、dream output、sync status

- `dream-store.ts`
  - 管理 `dream-runtime.json`
  - 提供 lastDreamAt、cooldownUntil、failureBackoff、lastObsidianSyncAt 等状态读写

- `dream-input.ts`
  - 收集各类高信噪比输入
  - 聚合：
    - `mindProfileSnapshot`
    - `session digest`
    - `session memory`
    - `recentTasks`
    - `workRecap`
    - `resumeContext`
    - `recent durable memories`
    - `learningReviewInput`

- `dream-prompt.ts`
  - 生成 dream 的结构化 prompt
  - 明确输出格式，区分：
    - stable insights
    - corrections
    - pending questions
    - share candidates

- `dream-writer.ts`
  - 负责写入 `dreams/*.md` 和 `DREAM.md`
  - 不直接改 `MEMORY.md`

- `dream-runtime.ts`
  - 负责 gate、lock、queue、cooldown、backoff、run
  - 负责调用模型
  - 负责协调 writer 与后续 sync

#### 15.3.4 建议复用的现有模块

这一阶段不应重复造轮子，建议直接复用：

- `packages/belldandy-core/src/resident-memory-managers.ts`
- `packages/belldandy-core/src/resident-memory-policy.ts`
- `packages/belldandy-core/src/resident-state-binding.ts`
- `packages/belldandy-memory/src/task-work-surface.ts`
- `packages/belldandy-core/src/mind-profile-snapshot.ts`
- `packages/belldandy-core/src/learning-review-input.ts`
- `packages/belldandy-agent/src/conversation.ts`
- `packages/belldandy-memory/src/manager.ts`

直接复用点：

1. 按 resident scope 解析当前 Agent 的私有 stateDir
2. 读取当前 Agent 主会话的 digest / session memory
3. 读取 recent tasks / workRecap / resumeContext
4. 读取 recent durable memories
5. 读取当前 Agent 的 memory stats / shared governance 概览

#### 15.3.5 手动触发接口

建议新增 RPC：

- `dream.run`
- `dream.status.get`
- `dream.history.list`
- `dream.get`

最小参数建议：

`dream.run`

```json
{
  "agentId": "coder",
  "mode": "manual",
  "inputWindowHours": 72,
  "force": false
}
```

返回：

- task id
- status
- dream file path
- skip reason（如果未运行）

#### 15.3.6 自动触发方式

建议第一版先挂在现有 background runtime / heartbeat / cron 链路上，但做成独立 gate。

推荐做法：

1. 在 `gateway.ts` 初始化 dream runtime
2. 由 heartbeat 或 cron 在空闲窗口调用 `maybeRunDream(agentId)`
3. dream runtime 内部做 gate 判断

建议默认 gate：

- 距上次 dream 至少 `12h`
- 最近 `>= 2` 个更新过的 digest
- 或最近 `>= 3` 个完成任务
- 或最近 `>= 5` 条新 durable memory
- 当前 Agent 不 busy
- 当前无运行中的 dream

#### 15.3.7 dream 输出格式

建议固定 frontmatter 和正文结构。

Frontmatter：

```yaml
---
dream_id: dream_2026_04_19_0001
agent_id: coder
scope: private
window_start: 2026-04-16T00:00:00.000Z
window_end: 2026-04-19T00:00:00.000Z
source_counts:
  conversations: 3
  tasks: 4
  durable_memories: 6
status: completed
obsidian_sync: pending
share_candidate_count: 2
---
```

正文结构建议固定为：

1. 本次 dream 主题
2. 新形成的稳定认识
3. 需要修正的旧认识
4. 尚未定论但值得关注的问题
5. 建议共享的候选
6. 来源摘要

#### 15.3.8 `DREAM.md` 的更新策略

`DREAM.md` 只做索引和入口，不做大段正文堆积。

建议内容：

- 最近 dream 列表
- 当前长期关注点
- 最近修正的旧判断
- 最近新增的共享候选

更新策略：

- 每次 dream 完成后重建 `DREAM.md`
- 仅保留最近 N 条索引
- 每条索引尽量一行

#### 15.3.9 Phase 1 验收标准

至少满足：

1. 可手动对指定 Agent 运行一次 dream
2. 会在该 Agent 私有 scope 生成 `dreams/*.md`
3. 会更新 `DREAM.md`
4. 不会修改 `MEMORY.md`
5. 不会改动 shared memory
6. 失败会记录 skip / error / backoff 状态
7. Doctor 或最小状态接口能看到最近一次 dream 状态

### 15.4 Phase 2 实施清单：Obsidian 私有 dream 镜像

#### 15.4.1 目标

把每个 Agent 的 dream 结果稳定镜像到本地 Obsidian vault 的私有区。

#### 15.4.2 推荐对接路径

主路径：

- 直接写 Obsidian vault 文件系统

增强路径：

- Local REST API 用于 health check / open / patch

跳转路径：

- Obsidian URI 用于打开 dream note

#### 15.4.3 建议新增模块

建议新增：

- `packages/belldandy-memory/src/dream-obsidian-sync.ts`
- `packages/belldandy-memory/src/obsidian-sync-paths.ts`
- `packages/belldandy-memory/src/dream-obsidian-sync.test.ts`

职责：

- `obsidian-sync-paths.ts`
  - 统一计算 vault 中目标路径

- `dream-obsidian-sync.ts`
  - 写入 Agent 私有 dream note
  - 写入 Agent 私有 `DREAM.md`
  - 记录 sync state
  - 可选探测 REST API 是否可用

#### 15.4.4 Obsidian 私有区建议路径

```text
<vault>/Star Sanctuary/Agents/<agentId>/DREAM.md
<vault>/Star Sanctuary/Agents/<agentId>/Dreams/YYYY/MM/YYYY-MM-DD--dream-0001.md
```

#### 15.4.5 建议新增配置项

- `BELLDANDY_DREAM_OBSIDIAN_ENABLED`
- `BELLDANDY_DREAM_OBSIDIAN_VAULT_PATH`
- `BELLDANDY_DREAM_OBSIDIAN_ROOT_DIR`

当前实现只用了以上三个文件系统镜像配置项。

以下能力保留为未来扩展，不在当前最小闭环内：

- Obsidian Local REST API
- Obsidian URI 打开

第一阶段默认：

- `OBSIDIAN_SYNC_ENABLED=false`
- `OBSIDIAN_ROOT=Star Sanctuary`

#### 15.4.6 sync 触发规则

建议触发时机：

1. dream 成功写入 SS 内部文件后
2. Obsidian sync 开启时
3. 写入失败不回滚 SS 内部 dream，只记录 sync failed

状态建议：

- `pending`
- `synced`
- `failed`
- `disabled`
- `skipped_missing_vault`

#### 15.4.7 Web / Doctor 建议

需要最小可见性：

1. 当前 Agent 是否开启 Obsidian dream sync
2. 最近一次 sync 状态
3. 最近同步路径
4. 失败原因

Doctor 建议新增卡片：

- `Dream Obsidian Sync`

#### 15.4.8 Phase 2 验收标准

至少满足：

1. dream 成功后能在 vault 中看到对应私有 dream 文件
2. 能看到对应 Agent 的 `DREAM.md`
3. 中文内容不乱码
4. SS 内部 dream 文件是源，Obsidian 只是镜像
5. sync 失败不会破坏 SS 内部产物

### 15.5 Commons 实施清单：Obsidian 公共租界

#### 15.5.1 目标

在 Obsidian 中建立一个所有 Agent 都能参考的公共知识区，但它只承接经过 SS 内部治理确认的共享内容。

#### 15.5.2 Commons 目录建议

```text
<vault>/Star Sanctuary/Commons/INDEX.md
<vault>/Star Sanctuary/Commons/Agents/default.md
<vault>/Star Sanctuary/Commons/Agents/coder.md
<vault>/Star Sanctuary/Commons/Topics/*.md
<vault>/Star Sanctuary/Commons/Decisions/*.md
<vault>/Star Sanctuary/Commons/Shared-Memory/approved/*.md
<vault>/Star Sanctuary/Commons/Shared-Memory/revoked/*.md
```

#### 15.5.3 Commons 的数据来源

第一阶段只允许以下来源：

1. `shared memory` 中 `approved / active` 的条目
2. 用户明确要求公开到 Commons 的内容
3. dream 产生的共享候选，经过现有 shared review 审批通过后进入

禁止直接进入 Commons 的来源：

1. private dream
2. pending review
3. rejected review
4. 未确认的推断

#### 15.5.4 建议新增模块

建议新增：

- `packages/belldandy-memory/src/commons-exporter.ts`
- `packages/belldandy-memory/src/commons-index-writer.ts`
- `packages/belldandy-memory/src/commons-topic-router.ts`
- `packages/belldandy-memory/src/commons-exporter.test.ts`

职责：

- `commons-exporter.ts`
  - 把 approved shared memory 导出为 Commons note

- `commons-index-writer.ts`
  - 更新 `Commons/INDEX.md`

- `commons-topic-router.ts`
  - 根据 memory type / category / topic 把内容路由到 `Topics/` 或 `Decisions/`

#### 15.5.5 与现有 shared review 的衔接方式

不要新增第二套审批。

建议沿用现有流程：

1. 用户或 Agent 发起 `memory.share.promote`
2. reviewer 通过 `memory.share.claim/review`
3. 当状态变为 `approved` 或 `active`
4. 触发 commons export

这一步可以有两种实现：

1. 事件式
   - shared review 完成时直接触发 export

2. 扫描式
   - 后台定期扫描最近状态变化的 approved shared memory

建议第一版先做扫描式，更稳。

#### 15.5.6 Commons note 格式建议

每个 approved shared memory 的导出 note 建议有 frontmatter：

```yaml
---
source: star-sanctuary
source_scope: shared
source_agent_id: coder
shared_status: approved
shared_reviewed_at: 2026-04-19T10:00:00.000Z
shared_chunk_id: shared:coder:abc123
category: project
topic: dream-runtime
---
```

正文建议包含：

1. 核心共享内容
2. 简要说明
3. 来源 Agent
4. 审批状态
5. 对应 SS source path / chunk id

#### 15.5.7 Commons 与私有 dream 的边界

必须明确：

1. `Agents/<agentId>/...` 是私有镜像区
2. `Commons/...` 是公共租界
3. 两者不能混写
4. private dream 不能自动进入 Commons
5. 只有 approved shared memory 才能进入 Commons

#### 15.5.8 Commons 验收标准

至少满足：

1. approved shared memory 会导出到 Commons
2. pending/rejected/revoked 不会误入 approved 区
3. `Commons/INDEX.md` 会更新
4. 各 Agent 都可以把 Commons 当作公共参考区
5. Obsidian 侧改动不会反向覆盖 SS shared memory

### 15.6 建议新增 RPC / 事件 / Doctor 输出

#### RPC

- `dream.run`
- `dream.status.get`
- `dream.history.list`
- `dream.get`
- `dream.obsidian.sync_now`
- `dream.commons.export_now`

#### 事件

- `dream.updated`
- `dream.completed`
- `dream.failed`
- `dream.obsidian_sync.updated`
- `dream.commons.updated`

#### Doctor 输出

建议在 `system.doctor` 新增：

1. `dreamRuntime`
2. `dreamObsidianSync`
3. `dreamCommons`

每个 Agent 侧建议新增：

1. 最近 dream 状态
2. 最近 dream 时间
3. 最近 dream 输入计数
4. 最近 Obsidian sync 状态
5. 最近 Commons export 状态

### 15.7 WebChat 最小实现清单

第一版不需要重做复杂页面，但至少要有：

1. Agent 设置里 dream 开关
2. `Run dream now`
3. 最近 dream 状态
4. 最近 dream 文件路径
5. Obsidian sync 状态
6. Commons export 状态

可以优先复用：

- 现有 memory viewer detail 样式
- 现有 doctor observability 卡片结构
- 现有 resident agent observability 摘要区

### 15.8 开发顺序建议

建议按下面顺序推进，避免多线并发把边界搞乱。

#### Step 1：后端 state 与类型

先做：

- `dream-types.ts`
- `dream-store.ts`
- `dream` 状态目录约定

产出：

- 可以读写 `dream-runtime.json`
- 可以生成标准 dream 文件路径

#### Step 2：dream 输入聚合

先把 dream 的输入层做稳：

- 聚合 digest / session memory / workRecap / resumeContext / recent memories / learningReviewInput / mindProfileSnapshot

产出：

- 一个稳定的 `DreamInputSnapshot`
- 先不调用模型

#### Step 1 / Step 2 当前进度（2026-04-19）

当前已完成：

1. 已新增 `packages/belldandy-memory/src/dream-types.ts`
2. 已新增 `packages/belldandy-memory/src/dream-store.ts`
3. 已新增 `packages/belldandy-memory/src/dream-input.ts`
4. 已新增 `packages/belldandy-memory/src/dream-store.test.ts`
5. 已新增 `packages/belldandy-memory/src/dream-input.test.ts`
6. 已在 `packages/belldandy-memory/src/index.ts` 补出导出

当前 Step 1 实现状态：

1. 已落出 `dream-runtime.json` 对应的状态类型与持久化读写
2. 已落出 dream 标准路径约定：
   - `dream-runtime.json`
   - `DREAM.md`
   - `dreams/YYYY/MM/YYYY-MM-DD--dream-id.md`
3. 已支持 recent runs、last input、last dream time、last failure time、obsidian sync 状态摘要

当前 Step 2 实现状态：

1. 已落出 `buildDreamInputSnapshot(...)`
2. 已支持聚合：
   - `session digest`
   - `session memory`
   - recent tasks
   - recent work items
   - `workRecap`
   - `resumeContext`
   - recent durable memories
   - recent experience usages
   - 注入式 `mindProfileSnapshot`
   - 注入式 `learningReviewInput`
3. 当前实现刻意保持为“纯输入聚合层”，尚未进入模型调用和写回

当前明确未做：

1. 还未实现 `dream-runtime.ts`
2. 还未实现 `dream-prompt.ts`
3. 还未实现 `dream-writer.ts`
4. 还未实现 `dream.run` / `dream.status.get` / `dream.history.list`
5. 还未实现 Obsidian sync 与 Commons exporter
6. 仍然没有任何 dream 自动写 `MEMORY.md` 的链路

当前验证状态：

1. 已做代码级静态自检与结构收口
2. 已执行依赖修复：
   - 通过 `CI=true corepack pnpm install` 重建本地 `node_modules`
3. 已完成标准验证：
   - `corepack pnpm --filter @belldandy/memory build`
   - `corepack pnpm --filter @belldandy/memory test -- src/dream-store.test.ts src/dream-input.test.ts`
4. 当前验证结果：
   - `@belldandy/memory` build 通过
   - `dream-store.test.ts` 通过
   - `dream-input.test.ts` 通过
5. 当前已知环境现象：
   - 在当前机器上，沙箱内直接访问 `node_modules/.pnpm/.../vitest` 会出现 `EPERM`
   - 该问题通过沙箱外执行定向测试已绕过，不属于本次 dream 代码逻辑错误

当前结论：

- Step 1 与 Step 2 已进入“代码已落地、已完成最小标准验证”的状态。
- 但 M1 仍未完成，因为 Step 3 的 runtime / prompt / writer / 手动 `dream.run` 还没有落地。

#### Step 3：dream 运行与写回

实现：

- `dream-runtime.ts`
- `dream-prompt.ts`
- `dream-writer.ts`
- 手动 `dream.run`

产出：

- 能生成私有 `dreams/*.md`
- 能更新 `DREAM.md`

#### Step 4：观测与 UI 最小接线

实现：

- `dream.status.get`
- `dream.history.list`
- doctor 最小输出
- WebChat 最小按钮与状态

#### Step 5：自动触发 gate

实现：

- heartbeat/cron 接入
- cooldown / backoff / lock

#### Step 6：Obsidian 私有镜像

实现：

- 文件系统镜像
- sync state
- 可选 open URI

#### Step 7：Commons exporter

实现：

- 扫描 approved shared memory
- 导出到 Commons
- 更新 `INDEX.md`

### 15.9 里程碑计划

建议里程碑如下：

#### M1：Dream Core Ready

完成条件：

- 可手动 dream
- 可写私有 dream 文件
- 不碰 `MEMORY.md`

#### M2：Dream Observable

完成条件：

- WebChat/Doctor 可看到 dream 状态
- 可看到 skip / fail / cooldown

#### M3：Dream Mirror Ready

完成条件：

- 可把私有 dream 镜像到 Obsidian
- sync 状态可见

#### M4：Commons Ready

完成条件：

- approved shared memory 可导出到 Commons
- Commons 索引可更新
- 不发生反向覆盖

### 15.10 测试与验证计划

#### 单元测试

建议补：

- `dream-store.test.ts`
- `dream-input.test.ts`
- `dream-writer.test.ts`
- `dream-runtime.test.ts`
- `dream-obsidian-sync.test.ts`
- `commons-exporter.test.ts`

#### 集成测试

建议补：

1. resident agent 私有 scope 下 dream 生成路径正确
2. `MEMORY.md` 未被改动
3. Obsidian vault 镜像路径正确
4. approved shared memory 导出到 Commons
5. pending shared memory 不导出到 Commons

#### 手测清单

至少覆盖：

1. 对单个 Agent 手动运行 dream
2. 查看 dream 文件
3. 查看 `DREAM.md`
4. 打开 Obsidian 中对应私有镜像
5. 对一个 shared memory 执行 approve
6. 查看 Commons 是否出现对应文档
7. 确认修改 Obsidian 文件不会回写覆盖 SS 内部 shared memory

### 15.11 本轮实施结论

如果按工程优先级排序，最合理的推进顺序是：

1. 先实现 private dream core
2. 再做可观测性
3. 再做 Obsidian 私有镜像
4. 最后做 Commons 导出

这样推进的原因是：

- private dream 是能力核心
- observability 决定后续调试成本
- Obsidian 镜像是外部落地
- Commons 是共享知识的发布层

一句话总结本节实施稿：

> 先把 dream 做成每个 Agent 私有 scope 下、依赖现有摘要治理的后台整理 runtime，再把结果稳定镜像到 Obsidian，最后把 SS 内部审批通过的 shared memory 发布到 Commons；Obsidian 永远不反向直接覆盖 SS 内部 shared memory。

#### Step 3 补充工程决策（2026-04-19）

关于 `tmp/obsidian-tools`，本轮明确追加一个工程决策：

1. `tmp/obsidian-tools` 只作为参考实现来源，不改造成 Star Sanctuary 的正式生产接入层。
2. Star Sanctuary 的 Obsidian 对接能力，统一直接实现到项目自己的 runtime / writer / exporter 链路中。
3. `tmp/obsidian-tools` 当前只保留这些参考价值：
   - 本地文件写入与目录组织模式
   - Obsidian note 模板与索引组织思路
   - Local REST API / 搜索类接入思路
   - 中文与 UTF-8 文件处理注意点
4. 当前明确不做的事：
   - 不把 `tmp/obsidian-tools` 作为运行时依赖
   - 不从项目内部直接调用 `tmp/obsidian-tools` 的脚本当生产链路
   - 不让 Obsidian 反向覆盖 SS 内部 shared memory

这个决策的目的，是把 dream / Obsidian / Commons 三条线的边界固定住：

- SS 内部才是事实源和治理源
- Obsidian 是镜像层与公共租界
- `tmp/obsidian-tools` 只是参考，不是产品边界的一部分

#### Step 3 当前进度（2026-04-19）

本轮已完成 Step 3 的“手动运行链路”：

1. 已新增 `packages/belldandy-memory/src/dream-prompt.ts`
2. 已新增 `packages/belldandy-memory/src/dream-writer.ts`
3. 已新增 `packages/belldandy-memory/src/dream-runtime.ts`
4. 已新增 `packages/belldandy-memory/src/dream-writer.test.ts`
5. 已新增 `packages/belldandy-memory/src/dream-runtime.test.ts`
6. 已在 `packages/belldandy-memory/src/index.ts` 补出对应导出
7. 已新增 `packages/belldandy-core/src/server-methods/dreams.ts`
8. 已新增 `packages/belldandy-core/src/server-methods/dreams.test.ts`
9. 已在 `packages/belldandy-core/src/server.ts` 接入手动 dream runtime resolver 与 RPC 分发
10. 已在 `packages/belldandy-core/src/server-websocket-runtime.ts` 补入 dream 方法 allowlist
11. 已在 `packages/belldandy-core/src/server-websocket-dispatch.ts` 补入 dream runtime resolver 的请求上下文字段

当前 Step 3 实现结果：

1. 已支持 `dream.run`
2. 已支持 `dream.status.get`
3. 已支持 `dream.history.list`
4. 已支持 `dream.get`
5. `dream.run` 当前链路为：
   - 解析目标 Agent
   - 解析默认 conversation
   - 聚合 `DreamInputSnapshot`
   - 构造 dream prompt
   - 调用模型生成结构化 JSON
   - 写入私有 `dreams/YYYY/MM/YYYY-MM-DD--dream-*.md`
   - 更新私有 `DREAM.md`
   - 更新 `dream-runtime.json`
6. 当前 dream 写回范围仍然严格限定为：
   - `dream-runtime.json`
   - `DREAM.md`
   - `dreams/**/*.md`
7. 当前仍然明确不会：
   - 自动写 `MEMORY.md`
   - 自动写 `memory/YYYY-MM-DD.md`
   - 自动做 Obsidian sync
   - 自动做 Commons exporter

当前多 Agent 处理方式：

1. dream runtime 按 `agentId` 分开缓存与解析
2. 每个 Agent 优先绑定自己的 resident memory manager / stateDir
3. 每个 Agent 默认使用自己的 resident main / last conversation 作为手动 dream 的默认 conversation
4. 因此当前 Step 3 已经具备“每个 Agent 有自己的私有 dream 文件与 dream 状态”的基础

当前验证状态：

1. `corepack pnpm --filter @belldandy/memory build` 通过
2. `corepack pnpm --filter @belldandy/memory test -- src/dream-store.test.ts src/dream-input.test.ts src/dream-writer.test.ts src/dream-runtime.test.ts` 通过
3. `corepack pnpm --filter @belldandy/core build` 通过
4. `corepack pnpm --filter @belldandy/core test -- src/server-methods/dreams.test.ts` 已执行通过

当前已知实现边界：

1. 这还是手动链路，不是自动 dream
2. 当前模型调用沿用 OpenAI chat-completions 风格调用方式
3. 当前只写 SS 内部私有 dream 文件，还没有开始 Obsidian 镜像
4. `dream.status.get` / `history.list` / `dream.get` 已可用于后续 WebChat / doctor 最小接线

#### Step 4 当前进度（2026-04-19）

本轮已完成 Step 4 的“最小观测 / UI 接线”，范围仍只覆盖可见状态和手动触发，不扩到自动 dream、Obsidian sync、Commons exporter。

当前已完成的接线点：

1. `system.doctor` 已补出 `dreamRuntime` 摘要载荷
2. doctor observability 已新增 `Dream Runtime` 卡片
3. WebChat 的 `memoryViewerSection` 已补入最小 dream 状态条
4. 状态条已接 `dream.status.get`
5. 状态条已接手动 `dream.run`
6. Agent 切换时会清空并刷新当前 memory viewer 的 dream 状态
7. 已补 `server.doctor.test.ts` 的 dream runtime 覆盖
8. 已补 `doctor-observability.test.js` 的 Dream Runtime 卡片覆盖

当前 Step 4 观测范围：

1. Dream runtime 是否可用
2. 当前 runtime 状态
3. 默认 conversation
4. 最近一次 dream 的时间 / 摘要 / 错误
5. 手动运行按钮是否可点

当前验证状态：

1. `corepack pnpm --filter @belldandy/core build` 通过
2. `corepack pnpm exec vitest run packages/belldandy-core/src/server.doctor.test.ts packages/belldandy-core/src/server-methods/dreams.test.ts apps/web/public/app/features/doctor-observability.test.js` 通过
3. 目标测试共 3 个文件、37 个测试通过

验证说明：

1. 根脚本 `corepack pnpm test -- ...` 会把整仓套件一起带起，不适合作为本轮 Step 4 的定向验证入口
2. 本轮已改用 `pnpm exec vitest run <targets>` 做精确定向验证

当前仍未进入的范围：

1. 自动 dream 触发策略
2. Dream 历史列表 UI
3. Obsidian 私有镜像
4. Commons 导出

#### 当前阶段结论（截至 Step 4）

到这里，Phase 1 的“private dream core + minimal observability”已经基本成立：

1. 每个 Agent 都已有自己的 dream 状态、dream 文件和手动运行入口
2. Gateway / doctor / WebChat 三层都已经能看到 dream runtime 的基本状态
3. 现在还没有进入“自动产生梦境”与“外部镜像发布”，因此系统边界仍然清晰

#### 最新进度（2026-04-19）

本轮已完成 Phase 2 的第一步：Obsidian 私有镜像最小闭环。

已完成：

1. 新增 `packages/belldandy-memory/src/obsidian-sync-paths.ts`
   - 负责解析 Obsidian 私有镜像路径
   - 固定输出到 `<vault>/Star Sanctuary/Agents/<agentId>/Dreams/YYYY/MM/...`
   - 同时镜像 Agent 私有 `DREAM.md`
2. 新增 `packages/belldandy-memory/src/dream-obsidian-sync.ts`
   - 在 SS 内部 dream 文件写入成功后，把 markdown 和索引镜像到 Obsidian vault
   - 写入失败不回滚 SS 内部 dream，只把 sync 状态记为 `failed`
3. 已在 `packages/belldandy-memory/src/dream-runtime.ts` 接入私有镜像
   - `dream.run` 完成内部写回后自动尝试 Obsidian sync
   - sync 结果会回写到 `DreamRecord.obsidianSync`
   - `dream-runtime.json` 的 `lastObsidianSync` 会同步更新
4. 已在 `packages/belldandy-core/src/server.ts` 接入环境配置
   - `BELLDANDY_DREAM_OBSIDIAN_ENABLED=true`
   - `BELLDANDY_DREAM_OBSIDIAN_VAULT_PATH=<你的 Obsidian vault 路径>`
   - `BELLDANDY_DREAM_OBSIDIAN_ROOT_DIR=<可选，默认 Star Sanctuary>`
5. `doctor` 已具备读取 `lastObsidianSync` 的最小显示能力，因此本轮无需额外 doctor 改动即可显示 stage / targetPath
6. `memory viewer` 当前仍未单独显示 Obsidian sync stage；这不阻塞私有镜像闭环，但属于后续可选补线项

边界仍然保持：

1. Obsidian 只做镜像，不反向写回 SS 内部 `shared memory`
2. `tmp/obsidian-tools` 继续只作为参考，不进入生产依赖
3. 本轮技术债处理决策是 `fix_now` 仅覆盖私有镜像闭环，不顺手扩到 Commons / 自动触发

本轮验证：

1. `corepack pnpm --filter @belldandy/memory test -- src/dream-obsidian-sync.test.ts src/dream-runtime.test.ts` 通过
2. `corepack pnpm --filter @belldandy/memory build` 通过
3. `corepack pnpm --filter @belldandy/core build` 通过
4. `corepack pnpm exec vitest run packages/belldandy-core/src/server.doctor.test.ts packages/belldandy-core/src/server-methods/dreams.test.ts` 通过

#### 后续计划（更新后）

当前顺序调整为：

1. 先进入 Commons：共享公共租界导出
2. 自动 dream 触发放到 Commons 之后

下一步建议直接做：

1. Commons exporter
   - 只导出经过 SS 内部审批通过的 shared memory
   - 输出到 Obsidian 公共租界目录
   - 维护公共索引，但不建立 Obsidian -> SS 的反向同步
2. 自动 dream 触发
   - 明确 heartbeat / cron / manual 的触发边界
   - 接入 cooldown / backoff / signal gate
   - 继续保持 conservative rollout

#### Step 7 当前进度（2026-04-19）

本轮已完成 Commons exporter 的最小闭环。

已完成：

1. 新增 `packages/belldandy-memory/src/commons-exporter.ts`
   - 负责把 SS 内部已审批 shared memory 导出为 Obsidian Commons markdown
   - 当前会写入：
     - `<vault>/Star Sanctuary/Commons/INDEX.md`
     - `<vault>/Star Sanctuary/Commons/Agents/<agentId>.md`
     - `<vault>/Star Sanctuary/Commons/Shared-Memory/approved/*.md`
     - `<vault>/Star Sanctuary/Commons/Shared-Memory/revoked/*.md`
2. 新增 `packages/belldandy-core/src/obsidian-commons-runtime.ts`
   - 负责扫描 shared layer 中 `approved` / `active` / `revoked` 的 shared chunk
   - 导出状态会写入 `obsidian-commons-runtime.json`
3. 已在 `packages/belldandy-core/src/server-methods/dreams.ts` 接入 `dream.commons.export_now`
4. 已在 `packages/belldandy-core/src/server.ts`、`server-websocket-dispatch.ts`、`server-websocket-runtime.ts` 接入 Commons runtime resolver 与方法放行
5. 已在 `packages/belldandy-core/src/server-methods/system-doctor.ts` 接入 `dreamCommons` 摘要，供 doctor 读取导出状态

当前工程边界：

1. Commons 只承接 SS 内部 shared review 已通过的 shared memory
2. private dream 不自动进入 Commons
3. Obsidian 永不反向覆盖 SS 内部 shared memory
4. `tmp/obsidian-tools` 继续只作为参考，不进入生产链路
5. 当前不做 `Topics/` / `Decisions/` 自动路由，技术债决策为 `split_task`

当前配置方式：

1. `BELLDANDY_COMMONS_OBSIDIAN_ENABLED=true`
2. `BELLDANDY_COMMONS_OBSIDIAN_VAULT_PATH=<Obsidian vault 路径>`
3. `BELLDANDY_COMMONS_OBSIDIAN_ROOT_DIR=<可选，默认 Star Sanctuary>`
4. 若 Commons 专用配置未提供，当前实现会回退复用：
   - `BELLDANDY_DREAM_OBSIDIAN_ENABLED`
   - `BELLDANDY_DREAM_OBSIDIAN_VAULT_PATH`
   - `BELLDANDY_DREAM_OBSIDIAN_ROOT_DIR`

当前验证：

1. `corepack pnpm --filter @belldandy/memory build` 通过
2. `corepack pnpm --filter @belldandy/core build` 通过
3. `corepack pnpm --filter @belldandy/memory test -- src/commons-exporter.test.ts src/dream-obsidian-sync.test.ts src/dream-runtime.test.ts` 通过
4. `corepack pnpm exec vitest run packages/belldandy-core/src/obsidian-commons-runtime.test.ts packages/belldandy-core/src/server-methods/dreams.test.ts packages/belldandy-core/src/server.doctor.test.ts` 通过

当前阶段结论：

1. 现在已经具备“SS 内部审批通过的 shared memory -> Obsidian Commons”最小发布链路
2. 这条链路仍然是手动触发优先，入口是 `dream.commons.export_now`
3. Commons 目前是镜像发布层，不是新的审批层，也不是反向同步源

后续计划（Commons exporter 之后）：

1. 进入自动 dream 触发
   - 明确 manual / heartbeat / cron 的触发边界
   - 接入 cooldown / backoff / lock / signal gate
2. 视需要补最小 UI
   - doctor 或 memory viewer 显示 Commons 最近导出状态
   - 仍不把 UI 扩成单独 Commons 大页面

#### Step 5 当前进度（2026-04-19）

本轮已完成自动 dream 触发的第一版接线，当前属于 conservative rollout。

当前边界已经固定为：

1. `manual`
   - 入口仍是 `dream.run`
   - 手动运行不会走自动 gate
   - 手动运行当前仍只受：
     - runtime 可用性
     - 当前是否已有运行中的 dream
2. `heartbeat`
   - 只有当：
     - `BELLDANDY_HEARTBEAT_ENABLED=true`
     - `BELLDANDY_DREAM_AUTO_HEARTBEAT_ENABLED=true`
     - 某次 heartbeat 实际完成且状态为 `ran`
   - 才会向 automatic dream runtime 发起一次触发请求
3. `cron`
   - 只有当：
     - `BELLDANDY_CRON_ENABLED=true`
     - `BELLDANDY_DREAM_AUTO_CRON_ENABLED=true`
     - 某次 cron job 实际完成且状态为 `ok`
   - 才会向 automatic dream runtime 发起一次触发请求

当前自动触发链路：

1. `gateway.ts` 在启动后创建 `DreamAutomationRuntime`
2. heartbeat / cron 完成后把 finalized run 结果回调给 automation runtime
3. automation runtime 会按 `lastDreamAt` 较旧优先的顺序挑选 resident agent
4. 对候选 agent 调用 `DreamRuntime.maybeAutoRun(...)`
5. 是否真的执行，由 `DreamRuntime` 内部 gate 最终决定

当前 `DreamRuntime` 自动 gate：

1. runtime 必须可用
2. 当前不能已有运行中的 dream
3. `failureBackoffUntil` 未生效
4. `cooldownUntil` 未生效
5. signal gate 已升级为基于 baseline 的 freshness 判定
   - baseline 优先取 `lastDreamAt`
   - 若当前还没有 dream 记录，则退回 `snapshot.windowStartedAt`
6. 信号门槛满足以下任一条件：
   - 有新的 `workRecap.updatedAt > baseline`
   - 有新的 `sessionDigest.lastDigestAt > baseline`，且同时存在新的 work / resume context / completed task 更新
   - 有新的 `sessionMemory.updatedAt > baseline`，且同时存在新的 work / resume context 更新
   - 有新的 completed task 时间 `finishedAt | updatedAt > baseline`
   - 有新的 `resumeContext.updatedAt > baseline`
   - 有新的 durable memory `updatedAt > baseline`

当前状态写回规则：

1. 自动触发实际执行成功后：
   - 正常写 `dream-runtime.json`
   - 正常写 `DREAM.md`
   - 正常写 `dreams/**/*.md`
   - 同时把 `cooldownUntil` 写入 `dream-runtime.json`
2. 自动触发实际执行失败后：
   - 记录失败 run
   - 同时把 `failureBackoffUntil` 写入 `dream-runtime.json`
3. 自动触发若被 gate 拦下：
   - 当前不会生成新的 dream 文件
   - 当前不会额外生成 failed run
   - 直接返回 skip 结果

本轮新增代码：

1. `packages/belldandy-core/src/dream-automation-runtime.ts`
2. `packages/belldandy-core/src/dream-automation-runtime.test.ts`
3. `packages/belldandy-memory/src/dream-runtime.ts`
   - 已新增 `maybeAutoRun(...)`
4. `packages/belldandy-memory/src/dream-store.ts`
   - 已真正接入 `cooldownUntil` / `failureBackoffUntil`
5. `packages/belldandy-core/src/bin/gateway-background-runtime.ts`
   - heartbeat / cron 已补 finalized callback
6. `packages/belldandy-core/src/bin/gateway.ts`
   - 已接入 automatic dream runtime 与环境变量开关
7. `packages/belldandy-core/src/server.ts`
   - 已把 dream runtime resolver 暴露给 gateway 启动链复用

本轮验证：

1. `corepack pnpm --filter @belldandy/memory build` 通过
2. `corepack pnpm --filter @belldandy/core build` 通过
3. `corepack pnpm exec vitest run packages/belldandy-memory/src/dream-runtime.test.ts packages/belldandy-core/src/dream-automation-runtime.test.ts` 通过
4. `corepack pnpm exec vitest run packages/belldandy-core/src/server-methods/dreams.test.ts packages/belldandy-core/src/server.doctor.test.ts packages/belldandy-core/src/obsidian-commons-runtime.test.ts` 通过

当前阶段结论：

1. automatic dream 已经接入 heartbeat / cron 的后台完成事件
2. automatic dream 当前默认仍是显式开关控制，不会因为已有 heartbeat / cron 就自动启用
3. manual / heartbeat / cron 三条边界已经拆开：
   - manual 是显式执行面
   - heartbeat / cron 是触发源
   - dream runtime 内部 gate 才是最终执行判定面

后续计划（Step 5 之后）：

1. 补最小观测
   - doctor 或 memory viewer 增加自动 trigger / skip / cooldown / backoff 摘要
2. 视运行效果再决定是否补更细的 signal gate
   - 例如真正的 digest 更新计数
   - 而不是当前的 proxy gate

Step 5 进度补充（2026-04-19，当日晚些时候）：

1. automatic trigger 的最近一次 attempt 现在已正式写回 `dream-runtime.json`
   - 字段为 `state.lastAutoTrigger`
   - 记录范围包括：
     - `executed=true` 的真实执行
     - `executed=false` 的 skip
2. 当前 `lastAutoTrigger` 已覆盖的关键信息：
   - `triggerMode`
   - `attemptedAt`
   - `executed`
   - `runId`
   - `status`
   - `skipCode`
   - `skipReason`
   - `signal`
3. 这意味着 automatic dream 现在不再只有“真正跑了才可观察”
   - 即使被 `runtime_unavailable`
   - `already_running`
   - `cooldown_active`
   - `failure_backoff_active`
   - `insufficient_signal`
   - 拦下，也会把最近一次 automatic skip 写回状态
4. `system.doctor` 的 `dreamRuntime` 现已补出 `autoSummary`
   - 对外汇总最近一次 automatic trigger 的执行或 skip 结果
   - 同时带出 `cooldownUntil` / `failureBackoffUntil`
5. WebChat 当前最小观测已补齐到两个现有位置：
   - doctor observability 的 `Dream Runtime` 卡片
   - memory viewer 顶部的 dream runtime bar
6. 当前两处 UI 都已经能直接看到：
   - 最近 automatic trigger 来源（`heartbeat` / `cron`）
   - 最近一次是 executed 还是 skip
   - 最近 skip code / skip reason
   - 当前 cooldown / backoff 截止时间

本轮补充验证：

1. `corepack pnpm --filter @belldandy/memory build` 通过
2. `corepack pnpm --filter @belldandy/core build` 通过
3. `corepack pnpm exec vitest run packages/belldandy-memory/src/dream-runtime.test.ts packages/belldandy-core/src/server.doctor.test.ts apps/web/public/app/features/doctor-observability.test.js` 通过
4. `node -e "import('./apps/web/public/app/features/memory-viewer.js').then(() => console.log('memory-viewer ok'))"` 通过

当前后续计划收口为：

1. automatic dream 的 signal gate 已从 proxy 条件升级为更真实的 digest/work 更新判定
2. 若需要更强观测，再考虑补：
   - automatic trigger 时间线
   - per-agent 自动触发统计
   - skip code 聚合计数

Step 5 进度再补充（2026-04-19，signal gate 升级）：

1. `DreamRuntime` 的 automatic signal gate 已不再依赖“仅看数量”的 proxy 条件
2. 当前 automatic gate 的核心判断已经变成：
   - 自上次 `lastDreamAt` 之后，是否真的出现了新的 digest / session memory / work recap / resume context / completed task / durable memory 更新
3. 这次调整解决的核心问题是：
   - 旧逻辑下，只要窗口内一直有较多 task/work/memory，cooldown 结束后就可能反复自动 dream
   - 新逻辑下，如果没有发生新的有效更新，即使 cooldown 已结束，也会因为 `insufficient_signal` 被跳过
4. 当前 `lastAutoTrigger.signal` 也已经带出 freshness 观察字段，便于后续 doctor / UI / 调试继续复用：
   - `baselineAt`
   - `latestWorkAt`
   - `latestWorkRecapAt`
   - `latestResumeContextAt`
   - `latestCompletedTaskAt`
   - `latestDurableMemoryAt`
   - `sessionDigestAt`
   - `sessionMemoryAt`
   - `fresh*SinceBaseline`
5. 已新增验证：
   - 首次 automatic run 仍可正常通过 freshness gate
   - cooldown 结束后，如果 snapshot 中没有任何新 digest/work 更新，则 automatic run 会被 `insufficient_signal` 拦下

本轮追加验证：

1. `corepack pnpm --filter @belldandy/memory build` 通过
2. `corepack pnpm exec vitest run packages/belldandy-memory/src/dream-runtime.test.ts packages/belldandy-memory/src/dream-store.test.ts packages/belldandy-memory/src/dream-input.test.ts` 通过
3. `corepack pnpm --filter @belldandy/core build` 通过
4. `corepack pnpm exec vitest run packages/belldandy-core/src/dream-automation-runtime.test.ts packages/belldandy-core/src/server.doctor.test.ts` 通过

Step 5 进度再补充（2026-04-19，Phase A cursor + budget 主驱动）：

1. automatic dream 的主 signal gate 已从“时间 freshness 为主”升级为“cursor + change budget 为主”
2. 当前已经落地的 Phase A 驱动字段：
   - `digestGeneration`
   - `taskChangeSeq`
   - `memoryChangeSeq`
   - dream state 内的 `lastDreamCursor`
3. 当前 dream input 快照已聚合出 `changeCursor`：
   - `digestGeneration`
   - `sessionMemoryMessageCount`
   - `sessionMemoryToolCursor`
   - `taskChangeSeq`
   - `memoryChangeSeq`
4. 当前 automatic gate 的真实判定顺序已变为：
   - 若 `digestGenerationDelta >= 1`，直接通过
   - 若 `sessionMemoryRevisionDelta >= 1`，直接通过
   - 否则要求 `changeBudget >= 4`
   - 只有 cursor 尚未建立时，才退回旧 freshness 逻辑兜底
5. `lastDreamCursor` 只会在 completed dream 后推进
   - failed run 不推进
   - skipped auto trigger 也不推进
6. 这次调整后，automatic dream 不再主要依赖“过了多久”
   - heartbeat / cron 仍然只是检查机会
   - 是否真正执行，主要取决于 digest / session memory / task / durable memory 是否真的发生了新的累计变化

当前最小可观察面（已更新）：

1. doctor observability 的 `Dream Runtime` 卡片现在已能看到：
   - `auto signal`
   - `auto cursor`
   - `cooldown / backoff`
2. 其中 `auto signal` 当前显示：
   - `digestGenerationDelta`
   - `sessionMemoryMessageDelta`
   - `sessionMemoryToolDelta`
   - `sessionMemoryRevisionDelta`
   - `taskChangeSeqDelta`
   - `memoryChangeSeqDelta`
   - `changeBudget`
3. `auto cursor` 当前显示：
   - `lastDreamCursor -> currentCursor`
4. memory viewer 顶部 dream runtime bar 当前已补紧凑版信号摘要：
   - `digestΔ`
   - `sessionRevΔ`
   - `taskΔ`
   - `memoryΔ`
   - `budget`

本轮补充验证：

1. `node .\\node_modules\\vitest\\vitest.mjs run packages/belldandy-agent/src/conversation.test.ts packages/belldandy-memory/src/store.test.ts packages/belldandy-memory/src/dream-input.test.ts packages/belldandy-memory/src/dream-store.test.ts packages/belldandy-memory/src/dream-runtime.test.ts --reporter verbose` 通过
2. `node .\\node_modules\\vitest\\vitest.mjs run apps/web/public/app/features/doctor-observability.test.js --reporter verbose` 通过
3. `node -e "import('./apps/web/public/app/features/memory-viewer.js').then(() => console.log('memory-viewer ok'))"` 通过

当前后续计划收口为：

1. 若下一步继续补观测，优先做 skip code / signal gate 的聚合统计
2. 若下一步继续补自动化，优先考虑把更多真实“内容修订序列”纳入 Phase A/B，而不是重新回到时间主驱动

Step 5 进度再补充（2026-04-19，skip code / signal gate 聚合统计）：

1. `dream-runtime.json` 现已新增持久化累计统计：`state.autoStats`
2. 当前 `autoStats` 已记录：
   - `attemptedCount`
   - `executedCount`
   - `skippedCount`
   - `skipCodeCounts`
   - `signalGateCounts`
3. 当前统计写入规则：
   - 每次 automatic attempt 都会累加 `attemptedCount`
   - 真正执行则累加 `executedCount`
   - 被跳过则累加 `skippedCount`
   - 有 `skipCode` 时写入 `skipCodeCounts`
   - 有 `signalGateCode` 时写入 `signalGateCounts`
4. 当前 `signalGateCode` 已结构化区分：
   - `digest_generation`
   - `session_memory_revision`
   - `change_budget`
   - `fresh_work_recap`
   - `fresh_digest_and_work`
   - `fresh_session_memory_and_work`
   - `fresh_completed_task`
   - `fresh_resume_context`
   - `fresh_durable_memory`
   - `insufficient_signal`
5. 这意味着现在不只知道“最近一次为什么跑/没跑”
   - 也能知道最近一段时间 automatic dream 主要被什么 gate 驱动
   - 以及主要卡在哪些 skip code 上

当前可观察面（更新后）：

1. doctor observability 的 `Dream Runtime` 卡片新增：
   - `auto stats`
   - `auto skip stats`
   - `auto gate stats`
2. memory viewer 顶部 dream runtime bar 新增累计摘要：
   - `attempted / executed / skipped`
   - `skipCodeCounts`
   - `signalGateCounts`
3. 当前仍然不新增单独页面
   - 继续复用 doctor 与 memory viewer 两个现有观测入口

本轮追加验证：

1. `node .\\node_modules\\vitest\\vitest.mjs run packages/belldandy-memory/src/dream-store.test.ts packages/belldandy-memory/src/dream-runtime.test.ts --reporter verbose` 通过
2. `node .\\node_modules\\vitest\\vitest.mjs run apps/web/public/app/features/doctor-observability.test.js --reporter verbose` 通过
3. `node .\\node_modules\\vitest\\vitest.mjs run packages/belldandy-core/src/server-methods/dreams.test.ts packages/belldandy-core/src/server.doctor.test.ts --reporter verbose` 通过
4. `node -e "import('./apps/web/public/app/features/memory-viewer.js').then(() => console.log('memory-viewer ok'))"` 通过

当前后续计划收口为：

1. 若再继续补观测，优先考虑按 agent / triggerMode 细分统计
2. 若再继续补自动化，优先考虑把更多真实 revision 源纳入 `signalGateCode`，而不是扩写更多单次明细

Step 5 进度再补充（2026-04-19，按 agent / triggerMode 细分统计）：

1. 当前“按 agent”维度已经天然成立
   - 因为每个 agent 自己维护独立的 `dream-runtime.json`
   - 也就是说 `state.autoStats` 本身就是 agent-scoped 统计
2. 本轮新增的是 `triggerMode` 细分统计：
   - `state.autoStats.byTriggerMode.heartbeat`
   - `state.autoStats.byTriggerMode.cron`
3. 每个 triggerMode 细分桶当前都记录：
   - `attemptedCount`
   - `executedCount`
   - `skippedCount`
   - `skipCodeCounts`
   - `signalGateCounts`
4. 这意味着现在已经能同时回答三类问题：
   - 这个 agent 的 automatic dream 总体跑了多少次、跳了多少次
   - 这个 agent 的 automatic dream 主要卡在哪些 `skipCode`
   - `heartbeat` 与 `cron` 两条触发线各自贡献了多少执行、多少 skip、主要命中哪些 gate

当前可观察面（更新后）：

1. doctor observability 的 `Dream Runtime` 卡片已新增：
   - `auto mode stats`
2. memory viewer 顶部 dream runtime bar 的累计摘要里已包含：
   - `mode heartbeat[...]`
   - `mode cron[...]`
3. 当前不再需要继续补新的单次明细页，现有 doctor + memory viewer 已能覆盖 Phase A 排查

本轮追加验证：

1. `node .\\node_modules\\vitest\\vitest.mjs run packages/belldandy-memory/src/dream-store.test.ts packages/belldandy-memory/src/dream-runtime.test.ts --reporter verbose` 通过
2. `node .\\node_modules\\vitest\\vitest.mjs run apps/web/public/app/features/doctor-observability.test.js --reporter verbose` 通过
3. `node -e "import('./apps/web/public/app/features/memory-viewer.js').then(() => console.log('memory-viewer ok'))"` 通过

当前阶段结论：

1. Phase A automatic dream 的运行驱动与观测链路，到这里可以收口
2. 当前已经具备：
   - cursor + change budget 主驱动
   - last auto trigger 单次观察
   - skip code / signal gate 聚合统计
   - per-agent / per-triggerMode 细分统计
3. 后续若继续做，性质已经从“补关键缺口”转为“增强项”，优先级可以明显下降

## 十六、2026-04-20 补充：dream 生成方式评估与 Phase B 规划

### 16.1 当前真实实现结论

先把当前 dream 的真实形态说清楚：

1. dream 现在不需要单独配置一套专用 dream 模型
   - `packages/belldandy-core/src/server.ts` 中，`DreamRuntime` 直接复用 `primaryModelConfig.model/baseUrl/apiKey`
2. 但 dream 现在也不是“直接把已有摘要拼起来落盘”
   - `packages/belldandy-memory/src/dream-input.ts` 负责聚合现有治理产物
   - `packages/belldandy-memory/src/dream-runtime.ts` 仍会构造 prompt 并调用一次模型
3. 所以当前准确表述应为：
   - dream 是“复用现有摘要治理输入 + 复用主模型做最后生成”的结构

### 16.2 对当前架构的评估

这个方向是对的，而且比“纯 transcript 驱动 dream”明显更稳。

原因有三点：

1. 输入侧已经高度治理化
   - 已复用 `session digest`
   - 已复用 `session memory`
   - 已复用 `recent tasks / work recap / resume context`
   - 已复用 durable memories
   - 已复用 `learning review input`
2. 自动触发侧已经有真实内容变化 gate
   - 当前 Phase A 已落地 `digestGeneration`
   - `sessionMemory` revision
   - `taskChangeSeq`
   - `memoryChangeSeq`
   - `lastDreamCursor + changeBudget`
3. dream 的 LLM 调用现在更像“二次整理层”
   - 不是第一次理解工作
   - 而是对已治理输入做再归纳、再命名、再压缩

### 16.3 工程决策

这里明确一个工程决策：

1. 不做“去 LLM 化”
2. 也不继续把 dream 做成“模型自由发挥”
3. 后续 dream 的正确方向应是：
   - 规则骨架优先
   - LLM 负责整合表达
   - 模型不可用时提供无模型 fallback

换句话说，dream 后续不是要减少治理输入，而是要继续压缩 LLM 的职责边界。

### 16.4 Phase B 的定义

当前文档里，Phase A 已经基本完成，但还没有一段正式的 Phase B 实施定义。

这里补一版正式定义：

Phase A：

- 解决“什么时候触发 dream”
- 解决“怎么观察 automatic dream”
- 解决“每个 Agent 各自如何跑、如何记状态”

Phase B：

- 解决“dream 输出本身如何更稳、更可解释、更可降级”
- 重点不再是增加更多 trigger
- 而是把 dream 产物做成“规则骨架 + LLM 生成 + 无模型 fallback”的稳定产线

因此，若问“接下来是不是该做 Phase B 了”，结论是：

1. 是，应该进入 Phase B
2. 但这里的 Phase B 不应理解成“继续扩 automatic gate”
3. 应理解成“收紧 dream 生成链路，让输出侧更稳”

### 16.5 Phase B 实施稿：规则骨架 + LLM 生成 + 无模型 fallback

#### 16.5.1 目标

在不改变现有 trigger/runtime/Obsidian/Commons 基础结构的前提下，把 dream 输出链升级为三层：

1. 规则骨架层
2. LLM 生成层
3. 无模型 fallback 层

#### 16.5.2 规则骨架层要做什么

规则骨架层不负责写“文学化梦境”，只负责产出稳定事实骨架。

建议固定生成以下结构：

1. `topicCandidates`
   - 从 `focusTask`、`recentWorkItems`、`sessionMemory.currentWork/nextStep` 中提炼 1-3 个主题候选
2. `confirmedFacts`
   - 只收录已在 digest/session memory/work recap/durable memory 中出现过的明确事实
3. `openLoops`
   - 当前未完成项、阻塞项、待验证项
4. `carryForwardCandidates`
   - 值得沉淀到后续 dream 或 Commons 评估面的线索
5. `sourceSummary`
   - 本次 dream 主要来自哪些输入面，数量和覆盖情况如何
6. `confidence`
   - 按输入覆盖度给出简单等级，例如 `high / medium / low`

规则骨架层的要求：

1. 只做抽取、归并、去重、排序
2. 不创造新事实
3. 尽量复用现有 `dream-input.ts` 输出，不另起一套扫描链

#### 16.5.3 LLM 生成层要做什么

LLM 层的职责要收窄为：

1. 基于规则骨架产出 dream 标题
2. 把 `confirmedFacts + openLoops + carryForwardCandidates` 组织成自然语言 dream
3. 输出当前 dream 的“主题 / tension / next watch”
4. 保持结构化 JSON 或稳定 markdown 区块，便于后续 writer 使用

LLM 层不再负责：

1. 自己从大段原始材料里重新找事实
2. 自己决定输入范围
3. 自己重新发明 source priority

#### 16.5.4 无模型 fallback 要做什么

当 dream runtime 缺少 `model/baseUrl/apiKey`，或者模型调用失败时，不要直接让 dream 整体失效。

最小 fallback 输出建议为：

1. 固定 frontmatter
2. 固定标题
   - 例如：`Dream Fallback - <agentId> - <date>`
3. 固定四段正文：
   - 本次主题候选
   - 已确认事实
   - 未闭环事项
   - 建议继续观察
4. 末尾明确标记：
   - `generation_mode: fallback`
   - `reason: missing_model_config` 或 `reason: llm_call_failed`

fallback 的定位不是替代 dream，而是保证：

1. 自动链不断
2. Obsidian 镜像不断
3. Doctor / UI 仍有可观察结果

#### 16.5.5 建议改造点

后续若实现，建议只动 dream 输出链，不动现有 automatic trigger 主链。

建议改造点如下：

1. `packages/belldandy-memory/src/dream-types.ts`
   - 增加 `DreamRuleSkeleton`
   - 增加 `generationMode: llm | fallback`
   - 增加 `fallbackReason`
2. `packages/belldandy-memory/src/dream-input.ts`
   - 在现有 snapshot 之上补一个规则骨架构造函数，尽量不改已有输入聚合契约
3. `packages/belldandy-memory/src/dream-prompt.ts`
   - 改成“骨架入 prompt”，而不是让 LLM 直接消费松散 snapshot
4. `packages/belldandy-memory/src/dream-runtime.ts`
   - 调整为：
     - 先生成规则骨架
     - 模型可用则走 LLM
     - 模型不可用或失败则走 fallback writer
5. `packages/belldandy-memory/src/dream-writer.ts`
   - 明确写入 `generationMode`、`fallbackReason`、`sourceSummary`

#### 16.5.6 Phase B 验收标准

Phase B 完成后，至少应满足：

1. dream 产物能明确区分 `llm` 与 `fallback`
2. 即使模型不可用，也能稳定写出结构化 dream 文件
3. Obsidian 私有镜像与 Commons exporter 不需要知道底层是 `llm` 还是 `fallback`
4. Doctor / memory viewer 能看到最近一次 `generationMode`
5. dream 标题、主题、未闭环项比当前更稳定，且更容易解释来源

### 16.6 当前 Phase B 进度判断

基于当前文档与代码状态，Phase B 现在的真实进度应判断为：

1. 已具备进入 Phase B 的前置条件
   - Phase A automatic gate 已收口
   - private dream / Obsidian mirror / Commons exporter 已有基础链路
2. 但 Phase B 目前还未正式开始
   - 文档里此前没有独立的 Phase B 实施段
   - 代码里也还没有“规则骨架层”和“fallback 产物模式”
3. 因此当前最准确的状态是：
   - `Phase A completed for now`
   - `Phase B not started`

### 16.7 后续开发计划

这里把后续计划收成一版工程顺序，暂缓实现，仅作为下一轮开发依据。

#### Plan

Goal

把 dream 从“已有治理输入 + 单次 LLM 生成”升级为“规则骨架 + LLM 生成 + fallback”的稳定输出链。

Constraints

- 不改现有 automatic trigger 主链
- 不让 dream 自动写 `MEMORY.md`
- 不让 Obsidian 反向覆盖 SS 内部 shared memory
- 不额外引入第二套 dream 专用模型配置

Steps

1. Phase B Step 1：定义 `DreamRuleSkeleton`、`generationMode`、`fallbackReason`
2. Phase B Step 2：在 `dream-input.ts` 上补规则骨架构建函数，并给出最小单测
3. Phase B Step 3：重写 `dream-prompt.ts` 输入契约，让 prompt 吃骨架而不是直接吃松散 snapshot
4. Phase B Step 4：在 `dream-runtime.ts` 接入 `llm -> fallback` 双通道执行
5. Phase B Step 5：在 `dream-writer.ts`、doctor、memory viewer 上补 `generationMode` 可观察字段
6. Phase B Step 6：补集成验证，确认 manual / auto / Obsidian / Commons 在 fallback 下都不断链

Validation

- `dream-runtime.test.ts`
- `dream-writer.test.ts`
- `dream-obsidian-sync.test.ts`
- `obsidian-commons-runtime.test.ts`
- `server.doctor.test.ts`
- `apps/web/public/app/features/doctor-observability.test.js`
- `apps/web/public/app/features/memory-viewer*.test.js`

### 16.8 当前建议

当前建议很明确：

1. 进入 Phase B 是合理的
2. 但不建议继续优先扩 automatic signal 源
3. Phase B 的首要目标应是“输出链稳定化”，不是“再补更多触发条件”
4. 等 Phase B 完成后，再决定是否继续往更细的 revision source 细拆
