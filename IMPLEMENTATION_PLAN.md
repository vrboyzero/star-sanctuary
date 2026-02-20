# Belldandy 实施计划

> **注意**：已完成的 Phase 详细实施记录已归档至 [`docs/archive/IMPLEMENTATION_LOG.md`](file:///e:/project/belldandy/docs/archive/IMPLEMENTATION_LOG.md)。
> 本文档仅保留 **架构总览**、**Roadmap**、**未完成规划** 与 **风险评估**。

## 1. 范围与约束

- **开发目录**：`e:\project\Belldandy`
- **参考目录（只读）**：`E:\project\belldandy\openclaw`（不修改、不编码）
- **参考目录（只读）**：`E:\project\belldandy\UI-TARS-desktop-main`（不修改、不编码）

## 1.1 技术栈与工程形态（建议）

- Runtime：Node.js
- 语言：TypeScript（ESM）
- 包管理：pnpm workspace
- 测试：vitest

## 2. 总体架构草图

```mermaid
flowchart TB
  subgraph Channels
    WebChat[WebChat UI]
    TG[Telegram Bot (phase 2)]
  end

  WebChat -->|WS| GW[Gateway]
  TG -->|inbound/outbound| GW

  GW -->|RPC/Invoke| AG[Agent Runtime]
  AG -->|tools| SK[Skills/Tools]
  AG -->|retrieve| MEM[Memory Index]

  GW -->|events chat/agent/presence| WebChat
```

## 2.5 Phase 总览与索引

> (✅ = 已完成并归档)

- **Phase 0**：文档与边界 ✅
- **Phase 1-3**：工程骨架、UI、配置工具 ✅
- **Phase 4**：Skills + Memory + 向量检索 ✅ (SQLite 引擎已迁移至 better-sqlite3，FTS5 全文索引开箱即用)
- **Phase 5**：SOUL / Persona 人格系统 ✅
- **Phase 6-7**：飞书、Heartbeat ✅
- **Phase 8-15**：高级能力 (Moltbot 对标、浏览器、多媒体、方法论) ✅
- **Phase 16**：子 Agent 编排 (Sub-Agent Orchestration) ✅ (MVP: Orchestrator + delegate_task + sessions 工具 + Gateway 集成)
- **Phase 17-23**：MCP、日志、安全、WebChat增强、工具集 ✅
- **Phase 24**：自动更新机制（Self-Update Tool）[规划中]
- **Phase 25**：Agents 后续迭代 Step 1-3 ✅ (并发排队 + delegate_parallel + 生命周期钩子集成)

---

## 3. Roadmap (基于 OpenClaw 对标)

> 依据 `openclawVSBelldandy实现对比说明.md` 规划的开发优先级。

### 3.1 近期（优先级 P1）

| 编号 | 主题 | 对应对比章节 | 主要目标 | 备注 |
|------|------|--------------|----------|------|
| P1-1 | 安全加固 ✅ | §10 安全 | 落实安全路线图中的 P0/P1/P2 项。 | **已完成 (Phase 19)** |
| P1-2 | CLI 命令树与 Onboarding Wizard ✅ | §1 核心平台 | 设计统一 CLI 入口及交互式向导。 | **Phase A-D 全部完成**：`bdd` 统一入口、pairing/doctor/config/relay/setup 子命令、旧脚本已清理。 |
| P1-3 | 渠道扩展（一线 IM 最小支撑） | §3 Channels | 新增 Telegram + Slack/Discord 渠道。 | 可先实现 MVP，后续补全路由。 |
| P1-4 | 定时任务 / Cron 工具 ✅ | §8 定时任务 | 通用 Cron 工具与配置。 | **方案 A (轻量 MVP) 已完成** |
| P1-5 | 会话模型梳理与多 Agent 预备 ✅ | §2 会话模型 | 梳理 Store 结构，为多 Agent 预留配置位。 | **已完成**：AgentProfile + AgentRegistry + ConversationStore 元数据扩展。 |

### 3.2 中期（优先级 P2）

| 编号 | 主题 | 对应对比章节 | 主要目标 | 备注 |
|------|------|--------------|----------|------|
| P2-1 | Multi-Agent 路由与 Session 编排 | §2 会话模型 | 引入多 Agent / 多 workspace 配置。 | **P2-1a/b 已完成**：agents.list API + WebChat Agent 选择器 + 实例缓存 + 会话隔离 + Feishu 渠道绑定。**P2-1c (Phase 16 MVP) 已完成**。**P2-1d (Phase 25 Step 1-3) 已完成**：并发排队 + delegate_parallel + 钩子集成。 |
| P2-2 | Channels 路由引擎升级 | §3 Channels | Mention gating、群聊路由规则。 | 结合安全策略。 |
| P2-3 | Skills 生态与「技能注册中心」 ✅ | §5 工具 / Skills | 设计 ClawHub 式技能 registry。 | **已完成**：SkillRegistry + SKILL.md 解析 + 5 维 Eligibility Gating + 两级 Prompt 注入 + skills_list/skills_search 工具 + Plugin Hooks 桥接。 |
| P2-4 | Canvas / 可视化工作区（基础版） | §7 浏览器/Canvas | 基础 Canvas / Board 功能。 | 初期静态画布+快照。 |
| P2-5 | Webhooks 与外部触发 | §8 定时任务 | Webhook 入口和邮件/通知触发。 | 注意安全/鉴权。 |
| P2-6 | Nodes 风格的 Memory/Knowledge Graph | §6 记忆 | 增加知识图谱工具。 | 与方法论结合。 |

### 3.3 远期（优先级 P3）

| 编号 | 主题 | 对应对比章节 | 主要目标 | 备注 |
|------|------|--------------|----------|------|
| P3-1 | Apps & Nodes | §4 Apps & Nodes | 原生客户端 (macOS/iOS/Android)。 | 工程量大，暂缓。 |
| P3-2 | 远程 Gateway 与部署工具链 | §1 / §11 平台与运维 | Remote gateway, Docker, Tailscale。 | 高级用户需求。 |
| P3-3 | 高阶 Canvas & 多节点视觉 | §7 浏览器/Canvas | 多节点协同视图，多相机流。 | 依赖 P3-1。 |
| P3-4 | IDE 协议桥接（ACP 或等价） | §9 MCP/ACP | 评估 ACP/OpenClaw 协议桥接。 | 优先级较低。 |
| P3-5 | 自身自动更新机制 (Self-Update) | §11 平台与运维 | 自动 `git pull` + `pnpm install` + `restart`。 | 需解决文件锁问题。 |

---

## 4. 待实现/规划中的详细 Phase

### Phase 4.7：记忆检索增强 (Memory Retrieval Enhancement) [Proposed]
- **Goal**: 让 Agent 更主动、更智能地使用长期记忆。
- **Core Features**:
    - **Context Injection**: 每次对话开始时，自动注入最近对话摘要。
    - **Auto-Recall**: NLP 检测关键词自动触发 `memory_search`。

### Phase 4.8：记忆系统深度优化 [Planned]

> **前置完成**（2026-02-15）：SQLite 引擎从 `node:sqlite` 迁移至 `better-sqlite3`，FTS5 全文索引已完全可用（BM25 排名），不再降级为 LIKE 查询。涉及文件：`store.ts`、`sqlite-vec.ts`、`package.json`。

- [ ] **Auto-Summarization**: 定期生成 High-Level Summary。
- [ ] **Metadata Filtering**: 支持 `channel`/`topic` 过滤。
- [ ] **Query Rewrite**: LLM 改写查询消歧。
- [ ] **Rerank Model**: 引入 Reranker 优化排序。

### Phase 10.5: OS 计算机操作能力 (OS Computer Use) [Planned]
- **Goal**: 赋予 Agent 像人一样操作 OS 的能力（突破浏览器限制）。
- **Core Components**:
    - **High-Fidelity Vision**: `nut-js` + `Jimp`，处理 DPI。
    - **Precision Control**: Box-to-Pixel 映射，拟人化键鼠。
    - **Visual Feedback**: ScreenMarker 透明置顶窗口。

### Phase 16: 子 Agent 编排 (Sub-Agent Orchestration) ✅ (MVP)
- **Goal**: 将复杂任务分发给独立的子 Agent。
- **已完成**: SubAgentOrchestrator 核心类、delegate_task 工具、sessions_spawn/history 升级、Gateway 集成、17 个测试用例。
- **迭代项（P2）**: 并行编排策略优化（spawnParallel 已实现基础版）、Session 池排队机制。

### Phase 15+: 实时视觉流 (WebRTC) [低优先级]
- **Goal**: 低延迟、高帧率的实时视觉流。
- **Tech**: WebRTC + PeerJS。

---

## 5. 风险点与应对

- **Prompt Injection**：System Prompt 分层，工具调用二次约束。
- **工具滥用风险**：严格白名单，敏感信息脱敏。
- **敏感信息泄露**：日志不回显 Token/Key。
- **错误处理不一致**：统一错误分级 (P0-P3)。

### 5.1 安全加固路线图 (剩余项)

> P0-P2 大部分已在 Phase 19 完成，以下为剩余或需持续关注项。

- **P2**: web_fetch SSRF 细节修补 (DNS Rebinding 防护) [已完成]
- **P3**: 浏览器自动化的域名/页面访问控制 [已完成]

---

## 6. 未来增强规划 (参考 Moltbot)

- **高级语音**: ElevenLabs 集成，自动摘要优化。
- **高级图像**: 提示词工程，画廊生成。

---

## 7. 后续开发需求汇总

> 整合自 `IMPLEMENTATION_PLAN.md`、`Belldandy实现内容说明.md`、`office.goddess.ai/WORKSHOP-PLAN.md` 三份文档中尚未完成的工作项。
> 按所属项目分类，再按优先级排列。

### 7.1 Belldandy（核心 Agent 系统）

#### P1 — 近期

| 编号 | 项目 | 说明 | 来源 |
|------|------|------|------|
| B-P1-1 | 渠道扩展：Telegram + Slack/Discord | Channel 接口已就绪，需实现具体渠道适配 | Roadmap P1-3 |
| B-P1-2 | 会话模型梳理 & 多 Agent 预备 ✅ | AgentProfile 配置体系 + AgentRegistry 注册表 + ConversationStore 元数据（agentId/channel）+ 协议层 agentId 预留 | Roadmap P1-5 |
| B-P1-3 | 记忆检索增强 (Phase 4.7) | Context Injection（对话开始时自动注入最近摘要）、Auto-Recall（NLP 关键词触发 `memory_search`） | Phase 4.7 |

#### P2 — 中期

| 编号 | 项目 | 说明 | 来源 |
|------|------|------|------|
| B-P2-1 | Multi-Agent 路由 & Session 编排 (Phase 16) ✅ | Session 池、Router、Inter-Agent Protocol，子 Agent 任务分发 | Roadmap P2-1 / Phase 16 | **MVP 已完成**：SubAgentOrchestrator + delegate_task + sessions 工具升级 + Gateway 注入。迭代项：并行编排策略优化、Session 池排队。 |
| B-P2-2 | 记忆系统深度优化 (Phase 4.8) | Auto-Summarization、Metadata Filtering（channel/topic）、Query Rewrite、Rerank Model | Phase 4.8 |
| B-P2-3 | Channels 路由引擎升级 | Mention gating、群聊路由规则，结合安全策略 | Roadmap P2-2 |
| B-P2-4 | Skills 生态 & 技能注册中心 | 类 ClawHub 的技能 registry，优先本地 + MCP 映射 | Roadmap P2-3 |
| B-P2-5 | Canvas / 可视化工作区（基础版） | 基础画布 + 快照 | Roadmap P2-4 |
| B-P2-6 | Webhooks & 外部触发 | Webhook 入口、邮件/通知触发，注意鉴权 | Roadmap P2-5 |
| B-P2-7 | Knowledge Graph (Nodes) | 知识图谱工具，与方法论系统结合 | Roadmap P2-6 |
| B-P2-8 | Cron 方案 B 升级 | cron 表达式（`croner`）、Session 隔离、agentTurn Payload、渠道定向推送、执行历史 | 说明文档 §2.5 |
| B-P2-9 | Heartbeat 消息去重 | 防止 Agent 在无法执行操作时反复发送同一条提醒（24h 内重复内容静默） | 说明文档 §2 |

#### P3 — 远期

| 编号 | 项目 | 说明 | 来源 |
|------|------|------|------|
| B-P3-1 | OS 计算机操作能力 (Phase 10.5) | nut-js + Jimp 视觉层、Box-to-Pixel 控制层、ScreenMarker 反馈 | Phase 10.5 |
| B-P3-2 | 原生客户端 (macOS/iOS/Android) | 工程量大，暂缓 | Roadmap P3-1 |
| B-P3-3 | 远程 Gateway & 部署工具链 | Docker、Tailscale、Remote Gateway | Roadmap P3-2 |
| B-P3-4 | 高阶 Canvas & 多节点视觉 | 多节点协同视图，多相机流，依赖原生客户端 | Roadmap P3-3 |
| B-P3-5 | IDE 协议桥接 (ACP) | 评估 ACP/OpenClaw 协议桥接 | Roadmap P3-4 |
| B-P3-6 | 自动更新机制 (Phase 24) | git pull + pnpm install + restart，需解决文件锁 | Roadmap P3-5 |
| B-P3-7 | 实时视觉流 (WebRTC) (Phase 15+) | 低延迟高帧率视觉流，WebRTC + PeerJS | Phase 15+ |
| B-P3-8 | 高级语音 (ElevenLabs) | 更高质量 TTS Provider | §6 |
| B-P3-9 | 高级图像 | 提示词工程、画廊生成 | §6 |

#### 低优先级 — 锦上添花

| 编号 | 项目 | 说明 |
|------|------|------|
| B-L1 | Local Embedding | 本地向量计算（node-llama-cpp / transformers.js），摆脱 API 依赖 |
| B-L2 | SOUL_EVIL 彩蛋 | 特定条件下加载反转人格，趣味性 |
| B-L3 | Memory Flush 缓冲机制 | 写入 Buffer + 空闲 Compaction，当前数据量下收益不大 |

---

### 7.2 office.goddess.ai（主页 / Workshop 模组工坊 / Agent 社区）

#### Agent 社区 ✅ 已完成

> 详见 `office.goddess.ai/COMMUNITY-PLAN.md`，25 项任务全部完成。

| Phase | 内容 | 状态 |
|-------|------|------|
| Phase 1 | 基础设施：5 张新表 + 迁移、屏蔽词过滤、配置常量、Agent API Key 认证中间件 | ✅ |
| Phase 2 | Agent CRUD + API Key 管理 + Agent 登录接口 + 前端管理页 | ✅ |
| Phase 3 | 房间 CRUD + 加入/离开 + HTTP 消息发送 + 前端社区大厅 + 创建房间弹窗 | ✅ |
| Phase 4 | WebSocket 实时通信 + 消息广播 + 心跳 + 前端聊天页 + 消息气泡组件 | ✅ |
| Phase 5 | 成员侧栏 + Agent 模式禁言 + 屏蔽词提示 + 断线重连 + 历史消息分页 | ✅ |

#### 待验证

| 编号 | 项目 | 说明 |
|------|------|------|
| W-V1 | Workshop 全流程联调 | 发布 → 列表 → 搜索 → 详情 → 下载 → 编辑 → 删除，需启动前后端手动验证 |
| C-V1 | Agent 社区全流程联调 | Agent 注册 → API Key 生成 → 创建房间 → 加入 → WebSocket 聊天 → 屏蔽词拦截，需启动前后端手动验证 |

#### 后续迭代

| 编号 | 项目 | 说明 | 优先级 |
|------|------|------|--------|
| W-1 | 支付流程接入 | 收益分成系统，对接支付网关 | P2 |
| W-2 | 作品评分与评论 | 用户评价体系 | P2 |
| W-3 | 作品版本历史 | 支持多版本管理与回滚 | P2 |
| W-4 | Markdown 描述渲染 | 引入 Markdown 渲染库替代纯文本 | P2 |
| W-5 | 作品封面图上传 | 提升视觉吸引力 | P2 |
| W-6 | 下载去重 | 同用户不重复计数 | P3 |
| W-7 | 全文搜索优化 (FTS5) | 提升搜索质量与性能 | P3 |
| W-8 | 作品审核流程 | 发布前审核机制，内容安全 | P3 |




---

## 8. B-P1-5 完成记录：会话模型梳理 & 多 Agent 预备

> 已实施，详见 git log。以下为变更摘要。

**新增文件：**
- `packages/belldandy-agent/src/agent-profile.ts` — AgentProfile 类型、agents.json 加载、模型引用解析
- `packages/belldandy-agent/src/agent-registry.ts` — AgentRegistry 注册表（替代单一 agentFactory 闭包）

**修改文件：**
- `packages/belldandy-agent/src/conversation.ts` — Conversation/ConversationMessage 增加可选 agentId/channel
- `packages/belldandy-protocol/src/index.ts` — MessageSendParams 增加可选 agentId
- `packages/belldandy-core/src/bin/gateway.ts` — 加载 agents.json → 构建 AgentRegistry → 保留兼容 agentFactory
- `packages/belldandy-core/src/server.ts` — message.send 支持 agentId 路由，消息持久化携带 agentId

**设计决策：**
- 配置文件：独立 `~/.belldandy/agents.json`（不污染 models.json）
- 密钥管理：AgentProfile 通过 `model` 字段引用 ModelProfile.id，不重复存储密钥
- 前端：仅协议层预留 agentId，WebChat 不改动
- 向后兼容：无 agents.json 时行为与改动前完全一致

---

## 9. 多 Agent 后续开发路线图

> 基于 B-P1-5 打下的地基（AgentProfile + AgentRegistry + ConversationStore 元数据），后续多 Agent 能力按以下阶段推进。

### 阶段 1：Agent 选择与前端集成 (P2-1a)

| 项目 | 说明 |
|------|------|
| WebChat Agent 选择器 | 设置面板或对话框中增加 Agent 下拉选择，发送 message.send 时携带 agentId |
| agents.json 管理 UI | WebChat 中可视化编辑 Agent Profile（新增/修改/删除） |
| Agent 列表 API | 新增 `agents.list` 方法，返回已注册的 AgentProfile 列表 |
| Per-Agent 系统提示词 | 实现 Per-Agent Workspace 目录加载（见阶段 4 目录结构），与 Facet 模组机制共存（各 Agent 可有独立的锚点和模组插槽） |
| Per-Agent 工具白名单 | 实现 AgentProfile.toolWhitelist，限制特定 Agent 可用的工具子集 |

### 阶段 2：多 Agent 路由与会话隔离 (P2-1b)

| 项目 | 说明 |
|------|------|
| 渠道级 Agent 绑定 | Feishu/Telegram 等渠道可配置默认 agentId，不同群/频道走不同 Agent |
| 会话级 Agent 切换 | 同一 conversationId 下切换 Agent 时的上下文处理策略（清空/标记分界/摘要衔接） |
| Agent 上下文隔离 | 通过 agentId 隔离 ConversationStore，防止多 Agent 共享会话时的上下文污染 |
| Per-Agent FailoverClient | AgentRegistry 为每个 profile 维护独立的 FailoverClient 实例（共享 cooldown 状态） |

### 阶段 3：子 Agent 编排 (Phase 16) ✅ MVP

| 项目 | 说明 | 状态 |
|------|------|------|
| Agent 间委托协议 | 主 Agent 可通过 `delegate_task` / `sessions_spawn` 工具将子任务委托给其他 Agent | ✅ 已完成 |
| Session 池 | SubAgentOrchestrator 管理并发子 Agent 会话的生命周期、超时、资源回收 | ✅ 已完成（并发限制 + 超时 + cleanup） |
| 结果聚合 | 子 Agent 结果回传主 Agent，Batch 模式（不污染父 ReAct 上下文）+ Event Hook（实时推送前端） | ✅ 已完成 |
| 编排策略 | 支持串行（spawn）和并行（spawnParallel）两种模式 | ✅ 基础版已完成，条件分支待迭代 |

### 阶段 4：Facet 模组 × AgentProfile 共存方案 (P2+) ✅

> Facet 模组插槽（switch_facet）是 Belldandy 的核心创新设计——通过 SOUL.md 锚点实现全局人格扩展热替换。AgentProfile.soulFile 解决的是不同 Agent 之间的人格差异化。两者互补，不应互相替代。

已实现 Per-Agent Workspace 目录加载 + switch_facet 多 Agent 适配。每个非 default Agent 在 `~/.belldandy/agents/{id}/` 下拥有独立 workspace（SOUL.md / IDENTITY.md / facets/ 等），缺失文件自动 fallback 到根目录。默认 Agent 行为不变。

改动文件：
- `packages/belldandy-agent/src/agent-profile.ts` — AgentProfile 新增 `workspaceDir?: string` 字段，`soulFile` 标记 deprecated
- `packages/belldandy-agent/src/workspace.ts` — 新增 `ensureAgentWorkspace()` 创建 `agents/{id}/` + `facets/` 目录，`loadAgentWorkspaceFiles()` 按优先级从 agent 目录加载、缺失 fallback 到根目录
- `packages/belldandy-agent/src/index.ts` — 导出新函数，`AgentRunInput` 新增 `agentId`
- `packages/belldandy-skills/src/types.ts` — `ToolContext` 新增 `agentId?: string`
- `packages/belldandy-skills/src/executor.ts` — `execute()` 接受并注入 `agentId` 到 context
- `packages/belldandy-agent/src/tool-agent.ts` — 将 `input.agentId` 传递给 `toolExecutor.execute()`
- `packages/belldandy-skills/src/builtin/switch-facet.ts` — 新增 `resolveAgentPaths()`，根据 agentId 定位对应 agent 目录的 SOUL.md 和 facets/
- `packages/belldandy-core/src/bin/gateway.ts` — 启动时创建 `agents/` 目录，预加载每个非 default agent 的 workspace 并构建独立 system prompt（缓存到 `agentWorkspaceCache`）
- `packages/belldandy-core/src/server.ts` — `runInput` 携带 `agentId` 传入 agent

### P2-1a/b 全部完成 ✅

agents.list API + WebChat Agent 选择器 + 实例缓存 + 会话隔离 + Feishu 渠道绑定。详见归档。


### Phase 16：子 Agent 编排 (Sub-Agent Orchestration) ✅

> MVP + Phase 25 Step 1-3 全部完成。24 tests 通过。

核心能力：SubAgentOrchestrator（spawn / spawnParallel / 排队 / 深度限制 / 超时 / cleanup）、delegate_task / delegate_parallel / sessions_spawn / sessions_history 工具、Gateway 集成、OrchestratorHookRunner（session_start / session_end）。

环境变量：`BELLDANDY_SUB_AGENT_MAX_CONCURRENT`（默认 3）、`BELLDANDY_SUB_AGENT_TIMEOUT_MS`（默认 120000）、`BELLDANDY_SUB_AGENT_MAX_DEPTH`（默认 2）、`BELLDANDY_SUB_AGENT_MAX_QUEUE_SIZE`（默认 10）。

#### Agents后续迭代

| 项目 | 优先级 | 说明 |
|------|--------|------|
| 并发排队 ✅ | P2 | 超出 `maxConcurrent` 时排队等待，队列满才拒绝。新增 `BELLDANDY_SUB_AGENT_MAX_QUEUE_SIZE` 环境变量。 |
| `delegate_parallel` 工具 ✅ | P2 | 接受 tasks 数组，一次并行委托多个子 Agent，超出并发自动排队。 |
| 生命周期钩子集成 ✅ | P2 | 子 Agent session 触发 `session_start` / `session_end` 钩子，通过 `OrchestratorHookRunner` 接口注入。 |
| WebChat 前端展示 | P2 | `onEvent` → Gateway 转发 → WebSocket → 前端 UI 展示子 Agent 状态 |
| 条件分支编排 | P3 | 根据子 Agent 结果决定后续分支（if/switch 语义） |


## 实施计划说明

### Phase 25: Agents 后续迭代

> 基于现有 `SubAgentOrchestrator`（Phase 16 MVP）的增强。
> 参考框架：Inngest AgentKit（Network/Router）、OpenAI Agents JS（生命周期钩子）、LangGraph（Orchestrator-Worker + 条件分支）。

#### Step 1-3 已完成 ✅

并发排队、`delegate_parallel` 工具、生命周期钩子集成已实现并通过测试（24 cases）。

改动文件：
- `packages/belldandy-agent/src/orchestrator.ts` — 排队机制 + `OrchestratorHookRunner` 集成
- `packages/belldandy-skills/src/builtin/session/delegate-parallel.ts` — 新增并行委托工具
- `packages/belldandy-skills/src/types.ts` — `AgentCapabilities.spawnParallel`
- `packages/belldandy-core/src/bin/gateway.ts` — 注册 + 绑定
- 新增环境变量：`BELLDANDY_SUB_AGENT_MAX_QUEUE_SIZE`（默认 10）

#### Step 4: WebChat 前端展示子 Agent 状态 [待实施]

改动范围 3 层：

**4a. Gateway 层** (`packages/belldandy-core/src/bin/gateway.ts`)：
- 创建 Orchestrator 时设置 `onEvent` 回调
- 回调内通过 `server.broadcast()` 或按 `parentConversationId` 定向推送
- 新增 WebSocket 事件类型 `sub_agent.status`

**4b. Protocol 层** (`packages/belldandy-protocol/src/index.ts`)：
- `DEFAULT_EVENTS` 增加 `"sub_agent.status"`
- 定义 payload 结构：`{ parentConversationId, sessionId, agentId, type, delta?, output?, error? }`

**4c. 前端层** (`apps/web/public/app.js`)：
- 监听 `sub_agent.status` 事件
- 在消息流中显示子 Agent 状态卡片（started / thought_delta / completed）
- 样式：用缩进或折叠卡片区分主/子 Agent 输出

#### Step 5: 条件分支编排（P3）[待实施]

新增 `orchestrate` 工具，接受简单的 DAG 描述：

```typescript
{
  name: "orchestrate",
  parameters: {
    steps: [
      { id: "research", instruction: "...", agent_id: "researcher" },
      { id: "code", instruction: "...", agent_id: "coder", depends_on: ["research"] },
      { id: "review", instruction: "...", depends_on: ["code"],
        condition: { field: "code.success", equals: true } }
    ]
  }
}
```

核心逻辑：拓扑排序 → 同层并行（复用 `spawnParallel`）→ `condition` 简单判断 → 聚合结果。
复杂度较高，建议作为独立 Phase 实施。

---

## 阶段 4：Facet 模组 × AgentProfile 共存方案 ✅

> 已实施并通过构建 + 97 个测试用例验证。详见上方「阶段 4」完成记录。

---

## P2-3：Skills 生态与「技能注册中心」 ✅

> 已完成。构建通过 + 全部 13 个测试用例通过。

### 实现摘要

Skill 是纯 prompt 注入（不执行代码），告诉 Agent 如何使用已有工具/MCP 完成特定任务。三来源加载：bundled → plugin → user（用户覆盖内置）。

### 新增文件

| 包 | 文件 | 说明 |
|----|------|------|
| `belldandy-skills` | `src/skill-types.ts` | 类型定义（SkillDefinition, SkillEligibility, EligibilityContext） |
| `belldandy-skills` | `src/skill-loader.ts` | SKILL.md 解析器（YAML frontmatter + Markdown，轻量无外部依赖） |
| `belldandy-skills` | `src/skill-eligibility.ts` | 5 维准入检查（env/bin/mcp/tools/files），含批量优化 |
| `belldandy-skills` | `src/skill-registry.ts` | 三来源注册表，namespace 防冲突，搜索 API |
| `belldandy-skills` | `src/builtin/skills-tool.ts` | `skills_list` + `skills_search` Agent 工具 |
| `belldandy-skills` | `src/bundled-skills/commit-style/SKILL.md` | 内置示例 skill |

### 改动文件

| 包 | 文件 | 改动 |
|----|------|------|
| `belldandy-skills` | `src/index.ts` | 导出 skill 模块 |
| `belldandy-agent` | `src/system-prompt.ts` | 新增 P7 Skills 注入段（两级发现 + 4000 chars 降级） |
| `belldandy-plugins` | `src/types.ts` + `src/registry.ts` | 新增 `registerSkillDir` / `getPluginSkillDirs` |
| `belldandy-core` | `src/bin/gateway.ts` | SkillRegistry 初始化 + eligibility 检查 + prompt 注入 + plugin hooks 桥接 |

### 关键设计决策

- **两级发现**：`priority: always/high` 直接注入 system prompt；其余走 `skills_search` 按需查询，控制 token 膨胀
- **Namespace**：内部 `source:name` 唯一键，查询按 user > plugin > bundled 优先级
- **Plugin Hooks 桥接**：旧 4-hook AgentHooks → 新 13-hook HookRegistry（beforeRun→before_agent_start, afterRun→agent_end, beforeToolCall→before_tool_call, afterToolCall→after_tool_call）
- **Eligibility 批量优化**：bin 检查结果缓存，避免重复 `where`/`which` 调用

---

## B-P2-4 / P3-3：Canvas 可视化工作区 ✅ 全部完成

> **对应 Roadmap**：P2-4 (基础版) + P3-3 (高阶 Canvas & 多节点视觉)
> **设计标准**：按 P3-3 目标一步到位，不做两阶段拆分。

### 技术选型

自研 SVG + `<foreignObject>` 无限画布，dagre.js 自动布局，零第三方渲染依赖，零构建步骤。

### 实施步骤完成度

| Step | 内容 | 状态 |
|------|------|------|
| 1 | 数据模型 + canvas.ts Agent 工具（10 个工具，纯后端） | ✅ |
| 2 | SVG 画布引擎核心：渲染、平移、缩放、节点拖拽 | ✅ |
| 3 | 节点模板（8 种类型）+ 连线渲染 + dagre 自动布局 | ✅ |
| 4 | 持久化（workspace.read/write）+ 画布列表 UI | ✅ |
| 5 | WS 事件桥：canvas.update 实时推送 + 增量更新 | ✅ |
| 6 | 侧边栏入口 + switchMode 三态 + 工具栏 | ✅ |
| 7 | Methodology / Memory / Session 关联（双击跳转、资源选择器、Agent 自动填充） | ✅ |
| 8 | A2UI 进阶：画布上下文注入、ReAct 可视化 | ✅ |

### 文件清单

| 文件 | 说明 |
|------|------|
| `apps/web/public/canvas.js` (~1200 行) | 前端画布引擎：BoardManager + CanvasRenderer + CanvasApp |
| `apps/web/public/canvas.css` (~500 行) | Ethereal 主题适配：节点/连线/工具栏/选择器/ReAct 样式 |
| `apps/web/public/index.html` | canvasSection DOM、dagre CDN、工具栏 |
| `apps/web/public/app.js` | switchMode 三态、事件处理、画布上下文注入、桥接函数 |
| `packages/belldandy-skills/src/builtin/canvas.ts` (~690 行) | 10 个 Agent 工具 + 数据模型 + autoPopulateContent |
| `packages/belldandy-skills/src/index.ts` | 导出 createCanvasTools |
| `packages/belldandy-core/src/bin/gateway.ts` | 注册 canvas 工具组 |
| `packages/belldandy-core/src/server.ts` | tool_call/tool_result 事件转发 |

### 核心能力

- **8 种节点类型**：task / note / method / knowledge / agent-output / screenshot / session / group
- **10 个 Agent 工具**：canvas_list / canvas_create / canvas_read / canvas_add_node / canvas_update_node / canvas_remove_node / canvas_connect / canvas_disconnect / canvas_auto_layout / canvas_snapshot
- **资源关联**：method/knowledge/session 创建时弹出资源选择器，双击按 ref 类型跳转（编辑器/聊天/新窗口），有 ref 节点显示 🔗 badge
- **画布上下文注入**：画布视图发消息自动注入摘要，"分析画布"按钮一键填入输入框
- **ReAct 可视化**：tool_call → 黄色节点(pulse) → tool_result → 绿/红 → chat.final → 紫色总结节点，自动链式连线，可 pin 保留
- **其他**：undo/redo(50步)、右键菜单、内存互斥锁、自动保存、视口状态恢复

---
## Phase M: 记忆系统优化 — 元数据过滤 + 查询重写与重排序

> 对应 `Belldandy实现内容说明.md` §4.记忆系统优化 中的第 2、3 项。

### 实施进度

- **M-1 元数据过滤 (Metadata Filtering)**: ✅ 已完成
- **M-2 查询重写 (Query Rewrite)**: ⏳ 待实现
- **M-3 规则重排序 (Rule Rerank)**: ✅ 已完成
- **M-3 LLM 重排序 (LLM Rerank)**: ⏳ 待实现

---

## Phase M-Next：记忆系统架构升级

> 借鉴 OpenViking 设计的记忆系统改进，在现有 TypeScript 单栈架构上进行。
>
> **实施状态**：所有计划内的架构升级已全面完成。

### 实施进度

- **M-N0 启用 Embedding Cache**: ✅ 已完成
- **M-N1 统一 MemoryStore 实例 (消除双库问题)**: ✅ 已完成
- **M-N2 L0 摘要层（渐进式上下文加载）**: ✅ 已完成
- **M-N3 会话记忆自动提取 (Memory Evolution)**: ✅ 已完成
- **M-N4 源路径聚合检索 (模仿目录递归)**: ✅ 已完成

> *(注：有关 Phase M 及 Phase M-Next 的详细技术方案、架构重构逻辑、影响分析等细节已整体归档清除，以保持当前文档精简并降低上下文负担。)*
