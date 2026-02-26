# Belldandy 实施计划

> **注意**：已完成的 Phase 详细实施记录已归档至 [`docs/archive/IMPLEMENTATION_LOG.md`](file:///e:/project/belldandy/docs/archive/IMPLEMENTATION_LOG.md)。
> 本文档仅保留 **架构总览**、**Roadmap**、**未完成规划** 与 **风险评估**。

## 1. 范围与约束

- **开发目录**：`e:\project\Belldandy`
- **参考目录（只读）**：`E:\project\belldandy\openclaw`（不修改、不编码）
- **参考目录（只读）**：`E:\project\belldandy\UI-TARS-desktop-main`（不修改、不编码）

## 1.1 技术栈与工程形态

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

> (✅ = 已完成并归档至 IMPLEMENTATION_LOG.md)

- **Phase 0**：文档与边界 ✅
- **Phase 1-3**：工程骨架、UI、配置工具 ✅
- **Phase 4**：Skills + Memory + 向量检索 ✅ (SQLite 引擎已迁移至 better-sqlite3，FTS5 全文索引开箱即用)
- **Phase 5**：SOUL / Persona 人格系统 ✅
- **Phase 6-7**：飞书、Heartbeat ✅
- **Phase 8-15**：高级能力 (Moltbot 对标、浏览器、多媒体、方法论) ✅
- **Phase 16**：子 Agent 编排 (Sub-Agent Orchestration) ✅
- **Phase 17-23**：MCP、日志、安全、WebChat增强、工具集 ✅
- **Phase 24**：自动更新机制（Self-Update Tool）[规划中]
- **Phase 25**：Agents 后续迭代 Step 1-3 ✅ | Step 4-5 [待实施]
- **Phase M**：记忆系统优化 ✅
- **Phase M-Next**：记忆系统架构升级 ✅
- **Phase N**：远程 Gateway 与部署工具链 ✅

---

## 3. Roadmap (基于 OpenClaw 对标)

> 依据 `openclawVSBelldandy实现对比说明.md` 规划的开发优先级。

### 3.1 近期（优先级 P1）

| 编号 | 主题 | 对应对比章节 | 主要目标 | 备注 |
|------|------|--------------|----------|------|
| P1-1 | 安全加固 ✅ | §10 安全 | 落实安全路线图中的 P0/P1/P2 项。 | **已完成 (Phase 19)** |
| P1-2 | CLI 命令树与 Onboarding Wizard ✅ | §1 核心平台 | 设计统一 CLI 入口及交互式向导。 | **Phase A-D 全部完成** |
| P1-3 | 渠道扩展（一线 IM 最小支撑） | §3 Channels | 新增 Telegram + Slack/Discord 渠道。 | 可先实现 MVP，后续补全路由。 |
| P1-4 | 定时任务 / Cron 工具 ✅ | §8 定时任务 | 通用 Cron 工具与配置。 | **方案 A (轻量 MVP) 已完成** |
| P1-5 | 会话模型梳理与多 Agent 预备 ✅ | §2 会话模型 | 梳理 Store 结构，为多 Agent 预留配置位。 | **已完成**：AgentProfile + AgentRegistry + ConversationStore 元数据扩展。 |

### 3.2 中期（优先级 P2）

| 编号 | 主题 | 对应对比章节 | 主要目标 | 备注 |
|------|------|--------------|----------|------|
| P2-1 | Multi-Agent 路由与 Session 编排 ✅ | §2 会话模型 | 引入多 Agent / 多 workspace 配置。 | **P2-1a/b/c/d 全部完成**。 |
| P2-2 | Channels 路由引擎升级 | §3 Channels | Mention gating、群聊路由规则。 | 结合安全策略。 |
| P2-3 | Skills 生态与「技能注册中心」 ✅ | §5 工具 / Skills | 设计 ClawHub 式技能 registry。 | **已完成**。详见 LOG §27。 |
| P2-4 | Canvas / 可视化工作区（基础版）✅ | §7 浏览器/Canvas | 基础 Canvas / Board 功能。 | **已完成**。详见 LOG §28。 |
| P2-5 | Webhooks 与外部触发 | §8 定时任务 | Webhook 入口和邮件/通知触发。 | 注意安全/鉴权。 |
| P2-6 | Nodes 风格的 Memory/Knowledge Graph | §6 记忆 | 增加知识图谱工具。 | 与方法论结合。 |

### 3.3 远期（优先级 P3）

| 编号 | 主题 | 对应对比章节 | 主要目标 | 备注 |
|------|------|--------------|----------|------|
| P3-1 | Apps & Nodes | §4 Apps & Nodes | 原生客户端 (macOS/iOS/Android)。 | 工程量大，暂缓。 |
| P3-2 | 远程 Gateway 与部署工具链 ✅ | §1 / §11 平台与运维 | Remote gateway, Docker, Tailscale。 | **已完成**。详见 LOG §29。 |
| P3-3 | 高阶 Canvas & 多节点视觉 ✅ | §7 浏览器/Canvas | 多节点协同视图，多相机流。 | **已完成**。详见 LOG §28。 |
| P3-4 | IDE 协议桥接（ACP 或等价） | §9 MCP/ACP | 评估 ACP/OpenClaw 协议桥接。 | 优先级较低。 |
| P3-5 | 自身自动更新机制 (Self-Update) | §11 平台与运维 | 自动 `git pull` + `pnpm install` + `restart`。 | 需解决文件锁问题。 |

---

## 4. 待实现/规划中的详细 Phase

### Phase 4.7：记忆检索增强 (Memory Retrieval Enhancement) [Proposed]
- **Context Injection**：每次对话开始时，自动注入最近对话摘要。
- **Auto-Recall**：NLP 检测关键词自动触发 `memory_search`。

### Phase 4.8：记忆系统深度优化 [部分完成]

- [x] **Metadata Filtering**：支持 `channel`/`topic` 过滤。✅
- [x] **Rule Rerank**：规则重排序。✅
- [ ] **Query Rewrite**：LLM 改写查询消歧。
- [ ] **LLM Rerank**：引入 Reranker 优化排序。

### Phase 10.5: OS 计算机操作能力 (OS Computer Use) [Planned]
- **High-Fidelity Vision**：`nut-js` + `Jimp`，处理 DPI。
- **Precision Control**：Box-to-Pixel 映射，拟人化键鼠。
- **Visual Feedback**：ScreenMarker 透明置顶窗口。

### Phase 25 Step 4-5 [待实施]
- **Step 4**：WebChat 前端展示子 Agent 状态（`sub_agent.status` 事件 + 状态卡片 UI）。
- **Step 5**：条件分支编排（`orchestrate` 工具，DAG 描述，拓扑排序 + 条件判断）。

### Phase 15+: 实时视觉流 (WebRTC) [低优先级]
- **Tech**：WebRTC + PeerJS，低延迟高帧率视觉流。

---

## 5. 风险点与应对

- **Prompt Injection**：System Prompt 分层，工具调用二次约束。
- **工具滥用风险**：严格白名单，敏感信息脱敏。
- **敏感信息泄露**：日志不回显 Token/Key。
- **错误处理不一致**：统一错误分级 (P0-P3)。

### 5.1 安全加固路线图（剩余项）

> P0-P2 大部分已在 Phase 19 完成。

- **P2**：web_fetch SSRF 细节修补 (DNS Rebinding 防护) ✅
- **P3**：浏览器自动化的域名/页面访问控制 ✅

---

## 6. 未来增强规划

- **高级语音**：ElevenLabs 集成，自动摘要优化。
- **高级图像**：提示词工程，画廊生成。

---

## 7. 后续开发需求汇总

> 整合自各文档中尚未完成的工作项，按所属项目分类，再按优先级排列。

### 7.1 Belldandy（核心 Agent 系统）

#### P1 — 近期

| 编号 | 项目 | 说明 | 来源 |
|------|------|------|------|
| B-P1-1 | 渠道扩展：Telegram + Slack/Discord | Channel 接口已就绪，需实现具体渠道适配 | Roadmap P1-3 |
| B-P1-3 | 记忆检索增强 (Phase 4.7) | Context Injection、Auto-Recall | Phase 4.7 |

#### P2 — 中期

| 编号 | 项目 | 说明 | 来源 |
|------|------|------|------|
| B-P2-2 | 记忆系统深度优化 (Phase 4.8) | Query Rewrite、LLM Rerank | Phase 4.8 |
| B-P2-3 | Channels 路由引擎升级 | Mention gating、群聊路由规则，结合安全策略 | Roadmap P2-2 |
| B-P2-5 | Webhooks & 外部触发 | Webhook 入口、邮件/通知触发，注意鉴权 | Roadmap P2-5 |
| B-P2-6 | Knowledge Graph (Nodes) | 知识图谱工具，与方法论系统结合 | Roadmap P2-6 |
| B-P2-7 | Cron 方案 B 升级 | cron 表达式（`croner`）、Session 隔离、渠道定向推送、执行历史 | 说明文档 §2.5 |
| B-P2-8 | Heartbeat 消息去重 | 防止 Agent 在无法执行操作时反复发送同一条提醒（24h 内重复内容静默） | 说明文档 §2 |
| B-P2-9 | Phase 25 Step 4 | WebChat 前端展示子 Agent 状态 | Phase 25 |

#### P3 — 远期

| 编号 | 项目 | 说明 | 来源 |
|------|------|------|------|
| B-P3-1 | OS 计算机操作能力 (Phase 10.5) | nut-js + Jimp 视觉层、Box-to-Pixel 控制层、ScreenMarker 反馈 | Phase 10.5 |
| B-P3-2 | 原生客户端 (macOS/iOS/Android) | 工程量大，暂缓 | Roadmap P3-1 |
| B-P3-3 | IDE 协议桥接 (ACP) | 评估 ACP/OpenClaw 协议桥接 | Roadmap P3-4 |
| B-P3-4 | 自动更新机制 (Phase 24) | git pull + pnpm install + restart，需解决文件锁 | Roadmap P3-5 |
| B-P3-5 | 实时视觉流 (WebRTC) (Phase 15+) | 低延迟高帧率视觉流，WebRTC + PeerJS | Phase 15+ |
| B-P3-6 | 高级语音 (ElevenLabs) | 更高质量 TTS Provider | §6 |
| B-P3-7 | 高级图像 | 提示词工程、画廊生成 | §6 |
| B-P3-8 | Phase 25 Step 5 | 条件分支编排（DAG orchestrate 工具） | Phase 25 |

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

## Phase M：记忆系统优化

- **M-1 元数据过滤 (Metadata Filtering)**: ✅ 已完成
- **M-2 查询重写 (Query Rewrite)**: ⏳ 待实现
- **M-3 规则重排序 (Rule Rerank)**: ✅ 已完成
- **M-3 LLM 重排序 (LLM Rerank)**: ⏳ 待实现

## Phase M-Next：记忆系统架构升级

- **M-N0 启用 Embedding Cache**: ✅ 已完成
- **M-N1 统一 MemoryStore 实例**: ✅ 已完成
- **M-N2 L0 摘要层**: ✅ 已完成
- **M-N3 会话记忆自动提取 (Memory Evolution)**: ✅ 已完成
- **M-N4 源路径聚合检索**: ✅ 已完成
- **自适应检索 / 噪声过滤 / Task-aware Embedding / 长度归一化 / 内容语义分类 / MMR 去重 / Scope 隔离**: ✅ 已完成（2026-02-25/26）

## Phase N：远程 Gateway 与部署工具链

- ✅ Docker 容器化（Dockerfile + docker-compose.yml + 部署脚本 + 文档）
- ✅ Tailscale 集成（Sidecar 模式）
- ✅ Nix 支持（flake.nix）
- ✅ 官方 Docker Hub 镜像 + CI/CD 自动构建
