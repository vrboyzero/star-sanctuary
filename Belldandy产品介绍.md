## Belldandy 产品介绍

Belldandy 是一款面向开发者与创作者的 **本地优先的个人 AI 助手育成型工作站**。它通过 Gateway 控制平面 + WebChat 界面 + Skills 工具系统 + Memory 记忆引擎 + 渠道与插件生态 + 可视化 Canvas 工作区，为用户提供安全、可控、可进化的智能体体验。

---

## 一、已实现能力（当前可用）

### 1. 核心平台与 WebChat 实时对话（Phase 1–2）

- **功能**：提供基于 WebSocket 的 Gateway 服务和 WebChat 前端，支持流式对话、消息历史和 Markdown 渲染。默认支持 MockAgent 与 OpenAI 协议兼容 Provider，并可扩展到更多模型。
- **特色**：采用清晰的请求/事件协议（如 `message.send`、`chat.delta`、`chat.final`），前后端解耦，便于未来集成多种 UI 客户端与 Agent Runtime。
- **高可用（Failover）**：集成 `FailoverClient`（Phase 8 & 18），实现多 Profile / 多 Key 轮询、错误分类重试与熔断冷却机制（Cooldown），并完整接入日志系统，保障服务高可用、可观测。

### 2. 安全准入与 CLI 管理体系（Phase 3 & 3.1 & 19）

- **功能**：通过 Pairing + Allowlist 机制控制客户端接入，未配对设备默认无法触发 Agent 对话。统一 `bdd` CLI 工具集（`bdd pairing/doctor/config/relay/setup/start/dev`）提供一站式管理。
- **安全加固**：已完成系统级安全路线图（Phase 19），包括：
  - workspace 相关配对绕过修复、敏感文件黑名单；
  - WebSocket CSWSH 防护（Origin 白名单）；
  - 配置读取脱敏与更新白名单；
  - 危险工具 Opt-in（`BELLDANDY_DANGEROUS_TOOLS_ENABLED`）；
  - web_fetch SSRF 防护与 DNS Rebinding 防护。
- **特色**：遵循“默认安全”原则，将个人助手视为敏感资源；配对过程有明确可视反馈与命令提示，既安全又可运维。

### 3. Skills 工具系统 + 技能（Skills + SKILL.md）（Phase 4 & P2-3）

- **工具层（Tools）**：`@belldandy/skills` 提供统一的工具执行沙箱和审计日志，内置：
  - `web_fetch`：带域名白/黑名单、内网 IP 阻断、超时与大小限制；
  - `file_read` / `file_write`：支持 overwrite/append/replace/insert 多种写入模式，防目录遍历、敏感文件黑名单、工作区白名单等；
  - `run_command`、`process_manager` 等系统执行工具（受 Safe Mode 控制）；
  - Canvas、Cron、Memory、日志等一整套高层工具。
- **技能层（Skills）**：
  - 支持 SKILL.md（YAML frontmatter + Markdown SOP），实现 **“技能 = 经验 +套路”** 的 Prompt 级扩展；
  - 三来源 SkillRegistry（内置 / 用户 / 插件），配合 5 维 Eligibility Gating（env/bin/mcp/tools/files），自动判断技能何时可用；
  - `skills_list` / `skills_search` 工具 + 两级 Prompt 注入（always/high 直接注入，其他走按需检索），控制 Token 膨胀。
- **价值**：Tools 负责“手和脚”，Skills 负责“经验和套路”，再叠加方法论系统（见下），可以让 Agent 在复杂任务中按照 SOP 稳定执行。

### 4. 方法论系统（Methodology，Phase 14）

- **功能**：将 SOP/经验写入 `~/.belldandy/methods`，并通过 `method_list/method_search/method_read/method_create` 工具管理，System Prompt 中注入 Methodology Protocol，要求 Agent 在复杂任务前后查阅/沉淀方法。
- **特色**：在架构上与 Skills 并行——**Skills 决定“能做什么”，Methods 决定“遇到重复任务按什么套路去做”**；Agent 会先选择/更新方法，再在方法步骤里调用各类 Skills 与 Memory/Logs，让复杂工作流从即兴推理升级为有版本的 SOP。

### 5. Memory 记忆系统与向量检索（Phase 4 & 4.5 & 4.6 & 12 & M-Next）

- **基础内核**：
  - 基于 `better-sqlite3` + FTS5 + `sqlite-vec` 的混合检索内核，支持关键词（BM25）+ 向量语义检索；
  - `MEMORY.md` / `memory/YYYY-MM-DD.md` / `sessions/*.jsonl` 等多种来源，按 `memory_type`（core/daily/session/other）物理分层存储。
- **会话持久化与增量索引**（Phase 4.6）：
  - 会话实时写入 JSONL 文件，重启不丢上下文；
  - 自动监听 `sessions` 目录并进行增量向量索引。
- **M-Next 架构升级（已全部完成）**：
  - Embedding Cache（M-N0）、统一 MemoryManager（M-N1）；
  - 元数据过滤（按 channel/topic/time）（M-1）；
  - 规则重排序（MemoryType 权重 + 时间衰减 + 来源多样性惩罚）（M-3）；
  - L0 摘要层（每个 chunk 有短摘要，支持 summary/full 两种 detail_level）（M-N2）；
  - 会话记忆自动提取（将对话结论沉淀到 daily memory）（M-N3）；
  - 源路径聚合检索（自动拉全文件上下文）（M-N4）。
- **价值**：在本地实现高性能、大规模知识检索，兼顾“长程记忆 + 精准 recall + 成本可控”，为后续 Query Rewrite / LLM Rerank 等高级检索奠定基础。

### 6. 对话上下文管理与自动压缩（Phase 2.2 & 2.3）

- **功能**：通过 `ConversationStore` 管理会话生命周期，并引入 **三层渐进式压缩架构**（Working Memory → Rolling Summary → Archival Summary），配合模型摘要与降级兜底机制。
- **特色**：
  - 支持在 ReAct 工具链内触发压缩，避免长链路任务撑爆上下文；
  - 摘要状态持久化到独立文件，重启后摘要不丢失；
  - 与 Hook 系统联动（before_compaction/after_compaction），支持日志与外部监控。

### 7. SOUL 人格系统与 Facet 模组 + 多 Agent Workspace（Phase 5 & 2.10 & 27 系列）

- **功能**：
  - 通过 `~/.belldandy` 下的 `AGENTS.md / SOUL.md / IDENTITY.md / USER.md / TOOLS.md` 等文件定义人格与环境；
  - 支持 `switch_facet` 工具一键切换 FACET 模组，原子更新 SOUL.md；
  - AgentProfile + AgentRegistry 支持多 Agent 配置（模型、工具白名单、workspaceDir 等），配合 WebChat Agent 下拉选择器；
  - Per-Agent Workspace：非 default Agent 拥有独立的 SOUL/IDENTITY/facets 目录，缺失时回退到根目录。
- **特色**：人格完全“文件化”，支持多 Agent 拥有各自人格与工作区，Facet 与 AgentProfile 共存不冲突；配合身份/UUID 系统，可实现更细粒度的权限与人格规则。

### 8. 多 Agent 编排与协同（Sub-Agent Orchestration，Phase 16 & 25）

- **功能**：
  - `SubAgentOrchestrator` 管理子 Agent 会话生命周期，支持串行 spawn 与并行 `spawnParallel`；
  - 工具层提供 `delegate_task` / `delegate_parallel` / `sessions_spawn` / `sessions_history` 等；
  - 并发排队、最大并发、队列大小与嵌套深度全部可通过环境变量配置。
- **集成**：
  - 已接入 Hook 系统（子会话触发 session_start/session_end）；
  - Gateway 注入 Orchestrator 能力，配合日志与 Memory 形成完整调度闭环。
- **价值**：主 Agent 可以将复杂任务拆分给专业子 Agent 并行协作，提升复杂任务的完成质量与吞吐。

### 9. 插件与钩子系统（Phase 8 & 8.3）

- **功能**：
  - PluginRegistry 支持运行时动态加载 JS/MJS 插件；
  - HookRegistry 支持 13 种生命周期 Hook（Agent / Message / Tool / Session / Gateway），支持优先级与三种执行模式（并行 / 顺序 / 同步）；
  - 旧版 `AgentHooks` 自动桥接到新 Hook 系统。
- **特色**：完整对标 moltbot 的 Hook 体系，是构建 Belldandy 生态的关键基础设施；SkillRegistry 与 MCP 管理器也已接入日志与 Hook 系统。

### 10. 浏览器扩展与 Web 自动化（Phase 9 & 9.5）

- **功能**：
  - Relay Server + Chrome Extension (MV3) + Puppeteer 中继，使 Agent 能接管用户浏览器；
  - 提供 `browser_open/navigate/click/type/screenshot/get_content/snapshot` 等能力；
  - 支持 Enhanced Reading（Readability + Markdown 转换）与交互式 DOM 快照，显著降低 Token 消耗。
- **特色**：复用用户真实浏览器登录态，并通过快照 ID 机制简化交互，让 Agent“看得懂、点得准”网页。

### 11. 多媒体与多模态（TTS / 图片 / 视频 / 视觉）（Phase 13 & 13.5 & 13.6）

- **语音合成 (TTS)**：
  - Multi-Provider 架构，支持 OpenAI / Edge TTS 等；
  - Gateway 暴露 `/generated` 静态路由，WebChat 可直接播放音频；
  - 通过 `TTS_ENABLED` 文件信号热开关。
- **多模态视觉**：
  - Loopback Vision：通过 `/mirror.html` + 浏览器扩展复用摄像头；
  - Native Vision & Video：集成 Kimi K2.5，多模态协议升级，支持图片和视频（通过本地上传 + Moonshot 文件服务 + `ms://` 协议）。
- **特色**：在不依赖复杂流媒体协议的前提下，实现“看网页 + 看摄像头 + 看用户发来的视频”的多模态能力。

### 12. 实时文件感知与代码工作流支持（Phase 11）

- **功能**：
  - 使用 `chokidar` 监听工作区文件变化（新增/修改/删除）；
  - 自动触发 Memory 的增量索引与清理。
- **特色**：适合“AI 参与编码”的场景，Agent 能够几乎实时掌握代码库最新状态。

### 13. 定时调度与心跳机制（Heartbeat & Cron，Phase 7 & 7.5）

- **Heartbeat**：
  - 周期解析 `HEARTBEAT.md`，在活跃时段自动发起“自省”或提醒类对话；
  - 支持活跃时段配置与静默策略。
- **Cron System**：
  - 通用定时任务调度器，支持一次性 `at` 与周期 `every` 调度；
  - 工具 `cron list/add/remove/status` 可由 Agent 自主管理提醒和定时任务。
- **特色**：让 Agent 具备“时间感”，既能定期自查（Heartbeat），又能按计划执行任务（Cron）。

### 14. Canvas 可视化工作区（Phase P2-4 & P3-3）

- **功能**：
  - 自研 SVG 无限画布引擎（`apps/web/public/canvas.js/css`），支持平移/缩放/节点拖拽/连线；
  - 8 种节点类型（task/note/method/knowledge/agent-output/screenshot/session/group）；
  - dagre 自动布局，节点与连线样式高度可视化；
  - 10 个 Canvas 工具（`canvas_list/create/read/add_node/update_node/remove_node/connect/disconnect/auto_layout/snapshot`）；
  - 画布与方法论/记忆/会话/浏览器截图联动，支持双击跳转与 🔗 标记；
  - ReAct 流程可视化：工具调用链路映射为节点链路，支持一键 pin/清理。
- **特色**：从“纯文本对话”升级为“可视化工作区”，适合项目拆解、知识整理、任务编排与 Agent 思考过程可视化，是 Belldandy 的重要差异化能力之一。

### 15. MCP 支持（Phase 17）

- **功能**：
  - `@belldandy/mcp` 包提供 MCP 客户端（stdio/SSE）、配置解析与工具桥接；
  - 兼容 Claude/Cursor 等通用 mcpServers 格式与 Belldandy 自有 mcp.json 格式；
  - Gateway 启动时自动加载 `~/.belldandy/mcp.json` 并注册工具。
- **特色**：遵循 MCP 标准协议，为接入 Filesystem / GitHub / Notion / Slack 等生态工具提供统一入口。

### 16. 日志系统与自诊断（Phase 18）

- **功能**：
  - 统一 Logger 输出控制台 + 文件，支持按日期/大小轮转与自动清理；
  - Agent 工具 `log_read` / `log_search` 支持 Agent 自查调用链与错误；
  - CLI `bdd doctor` + Web 端 System Doctor 提供系统体检能力。
- **特色**：日志与方法论高度协同，形成“看日志 → 查问题 → 写方法 → 下次复用”的自进化闭环。

### 17. Docker 部署与远程 Gateway 工具链（Phase N）

- **功能**：
  - Multi-stage Dockerfile（deps → builder → runtime），.dockerignore 优化构建上下文；
  - `docker-compose.yml` 编排 `belldandy-gateway` / `belldandy-cli`，带健康检查与自动重启；
  - `.env.example` + `scripts/docker-build.sh` + `scripts/docker-deploy.sh` 实现一键构建与部署；
  - Gateway 提供 `/health` 健康检查端点；
  - flake.nix、Tailscale Sidecar、官方镜像 & CI/CD 等已在 IMPLEMENTATION_PLAN 中标记完成，支持远程部署与零信任访问场景。
- **特色**：显著降低部署门槛，支持从本地开发到家庭服务器/云主机的平滑过渡，为“多设备共享一个 Belldandy 实例”提供基础设施。

### 18. 渠道架构与飞书渠道（Phase 6 & 15 & office.goddess.ai 集成）

- **功能**：
  - 通用 `Channel` 接口与 `ChannelManager` 管理器，实现渠道标准化；
  - 已完成 Feishu 渠道（WebSocket 长连接），支持环境变量绑定特定 Agent；
  - 在 `office.goddess.ai` 项目中，已落地完整 Agent 社区后端与前端，对 Belldandy 的渠道能力进行了实战验证。
- **特色**：为 Telegram/Slack/Discord 等后续渠道接入打下统一抽象，预留跨项目协同的空间。

---

## 二、规划中 / 迭代中的能力（Roadmap 摘要）

> 本节为 **仍在规划或部分完成** 的能力，具体细项以 `IMPLEMENTATION_PLAN.md` 与 `Belldandy实现内容说明.md` 为准。

### 1. 多渠道扩展（Telegram / Slack / Discord 等）

- 在通用 Channel 接口与 Feishu 实现基础上，接入 Telegram、Slack、Discord 等一线 IM 渠道，形成真正的多渠道统一收件箱。
- 将沿用现有 Pairing、安全与 Methodology 机制，确保跨渠道共享人格、技能与记忆，同时保留各平台差异化能力。

### 2. Channels 路由引擎升级 & Webhooks

- 完善 mention gating、群聊路由规则，支持按房间/身份/关键词路由到不同 Agent 或不同工作流。
- 增补 Webhook 触发入口，将 CI / 监控告警 / 业务系统通知接入 Belldandy，配合 Cron/Methods 构建自动化运维与业务助手。

### 3. 记忆系统高级能力（Query Rewrite / LLM Rerank）

- 在 M-Next 架构已完成的基础上，进一步加入：
  - Query Rewrite：用 LLM 对含糊查询进行语义改写与消歧；
  - LLM Rerank：对初筛结果进行二次精排，提升复杂问题下的检索质量。
- 规划通过环境变量开启/关闭，对成本与延迟进行可控管理。

### 4. Nodes 风格知识图谱与更高阶 Canvas

- 在现有 Memory + Canvas 之上引入 nodes 概念（entities/relations），实现 `nodes.create/link/query` 等图结构操作。
- Canvas 将进一步向 “多节点视觉协同” 能力演进（多视角、多相机、多数据源视图），更好地支撑复杂项目管理与多 Agent 协同。

### 5. Apps & Nodes（macOS/iOS/Android 原生应用）

- 规划实现菜单栏 App、移动端节点与 Gateway 之间的 Node 协议桥接，暴露系统通知、摄像头、屏幕录制等本地能力。
- 目标是让 Belldandy 从“单机工作站”升级为“多终端统一助手”。

### 6. 本地 Embedding 与 Memory Flush

- 在现有 Embedding Provider 抽象基础上，进一步强化 LocalEmbedding 路线，引入稳定的本地向量模型（如 bge-m3 等）。
- 完成 Memory Flush 机制，将高频写入批处理化，在不牺牲记忆实时性的前提下降低磁盘写入压力，提升长期运行稳定性。

### 7. OS 计算机操作能力（Computer Use，Phase 10.5）

- 参考 UI-TARS 框架，在现有浏览器自动化与多模态视觉基础上，将能力扩展到桌面 GUI：
  - 高保真视觉（nut-js + Jimp / DPI 适配）；
  - Box-to-Pixel 坐标映射；
  - 拟人化键鼠操作；
  - ScreenMarker 透明高亮反馈。
- 目标是让 Belldandy 不仅能“看网页”，还可以“像人一样操作电脑”。

---

## 三、总结与项目完成度

从当前实现情况来看，Belldandy 已经完整打通了 **Gateway 控制平面、WebChat UI、Skills & 方法论系统、记忆与向量检索（含 M-Next 架构）、多 Agent 编排、浏览器与系统执行、多模态、Canvas 可视化工作区、MCP/日志/安全体系、Docker & 远程部署链路** 等一整条“个人 AI 工作站”的主干，并在 `office.goddess.ai` 工程中完成了社区级落地验证。  
结合 `IMPLEMENTATION_PLAN.md` 的 Phase 总览，**Phase 0–23 及 Phase N / M-Next 等核心阶段基本全部完成，仅剩本地 Embedding、OS 级 GUI 操作、Nodes 知识图谱、记忆 Query Rewrite / LLM Rerank、多渠道扩展等中长期能力处于规划或迭代中**。  
如果以对标 openclaw/moltbot 的能力清单为参照，可以认为 Belldandy 在“核心平台 + 工具链 + 记忆系统 + 多 Agent 编排 + 部署与安全”这些主干方向上已经完成了约 **80–85% 的整体 Roadmap**，后续工作将主要集中在多终端生态扩展、OS 级操作、多渠道覆盖与检索智能化等增量能力上。
