## Belldandy 产品介绍

Belldandy 是一款面向开发者与创作者的 **本地优先个人 AI 助手 / 工作站**。它通过 Gateway 控制平面 + WebChat 界面 + Skills 工具系统 + Memory 记忆引擎 + 渠道与插件生态，为用户提供安全、可控、可进化的智能体体验。

---

## 一、已实现能力（当前可用）

### 1. 核心平台与 WebChat 实时对话（Phase 1–2）
- **功能**：提供基于 WebSocket 的 Gateway 服务和 WebChat 前端，支持流式对话、消息历史和 Markdown 渲染。默认支持 MockAgent 与 OpenAI 协议兼容 Provider，并可扩展到更多模型。
- **特色**：采用清晰的请求/事件协议（如 `message.send`、`chat.delta`、`chat.final`），前后端解耦，便于未来集成多种 UI 客户端与 Agent Runtime。
- **高可用（Failover）**：集成 `FailoverClient` (Phase 8)，实现多 Key 轮询、错误分类重试与熔断冷却机制（Cooldown），确保服务高可用。

### 2. 安全准入与 CLI 管理体系（Phase 3 & 3.1 & 3S）
- **功能**：通过 Pairing + Allowlist 机制控制客户端接入，未配对设备默认无法触发 Agent 对话。统一 `bdd` CLI 工具集（`bdd pairing/doctor/config`）提供一站式管理。
- **特色**：遵循“默认安全”原则，将个人助手视为敏感资源；配对过程有明确可视反馈与命令提示，既安全又可运维。

### 3. Skills 工具系统（Phase 4）
- **功能**：`@belldandy/skills` 提供统一的工具执行沙箱和审计日志，内置 `web_fetch`、`file_read`、`file_write` 等核心工具，并支持 ToolEnabledAgent 的 function calling 循环。
- **特色**：工具层做了细粒度安全控制——协议/域名/内网 IP 限制、路径遍历防护、敏感文件黑名单、白名单写入目录等，让“能干活”的同时保持“可控”；在复杂任务中，Skills 提供原子能力，是方法论执行的“动作库”。

### 4. 方法论系统（Methodology，Phase 14）
- **功能**：将 SOP/经验写入 `~/.belldandy/methods`，提供 `method_list/method_search/method_read/method_create` 工具，并在 System Prompt 中注入 Methodology Protocol，要求 Agent 在复杂任务前后查阅与沉淀方法。
- **特色**：在架构上与 Skills 并行——**Skills 决定“能做什么”，Methods 决定“遇到重复任务按什么套路去做”**；Agent 会先选择/更新方法，再在方法步骤里调用各类 Skills 与 Memory/Logs，让复杂工作流从即兴推理升级为有版本的 SOP。

### 5. Memory 记忆系统与向量检索（Phase 4 & 4.5 & 12）
- **功能**：基于 SQLite + FTS5 + `sqlite-vec` 的混合检索内核，支持关键词（BM25）+ 向量语义检索，以及对 `MEMORY.md` 与 `memory/YYYY-MM-DD.md` 的长期/日常记忆分层管理。
- **会话持久化**：实现 `.jsonl` 会话持久化与实时增量向量索引，重启不丢失上下文，且可通过 `memory_search` 检索历史对话。
- **特色**：采用 `memory_type` 字段区分 core/daily/session/other，配合可插拔 Embedding Provider（OpenAI 兼容接口），在本地即可实现高性能、大规模知识检索。

### 6. 上下文自动压缩与防护（Phase 2.2 & 2.3）
- **功能**：通过 `ConversationStore` 管理会话生命周期，并引入**三层渐进式压缩架构**（Working Memory / Rolling Summary / Archival Summary）。
- **特色**：不依赖机械截断，而是通过 LLM 生成高质量摘要与归档，确保长时间自动化任务（如 Cron/Heartbeat）中关键信息不丢失；同时在架构层面预防 Prompt Injection。

### 7. SOUL 人格系统与 Facet 模组（Phase 5 & 2.10）
- **功能**：通过 `~/.belldandy` 内的 `AGENTS.md/SOUL.md/IDENTITY.md` 等文件定义人格。支持 **Facet 模组热切换**（`switch_facet` 工具）与 **Per-Agent Workspace**（不同 Agent 拥有独立设定）。
- **特色**：人格完全“文件化”，用户可以像写世界观设定一样编辑 markdown 文档塑造角色；支持多 Agent 拥有不同人格与记忆空间。

### 8. 多 Agent 编排与协同（Sub-Agent Orchestration，Phase 16）
- **功能**：实现 `SubAgentOrchestrator` 与 `delegate_task`/`delegate_parallel` 工具，支持主 Agent 将复杂任务分发给子 Agent 并行执行。
- **特色**：具备完整的生命周期管理（Spawn/Wait/Cleanup）、并发排队控制与独立的上下文隔离，适合处理复杂的多步骤任务。

### 9. 插件与钩子系统（Phase 8 & 8.3）
- **功能**：提供 PluginRegistry 与 13 种生命周期 Hook（如 `before_agent_start`、`message_sending`、`before_tool_call` 等），支持 JS/MJS 插件动态扩展 Agent 能力与行为。
- **特色**：完整对标 moltbot 的 Hook 体系，支持优先级与多执行模式（并行/顺序/同步），同时保持与旧版 `AgentHooks` 的向后兼容，是构建 Belldandy 生态的关键基础设施。

### 10. 浏览器扩展与 Web 自动化（Phase 9 & 9.5）
- **功能**：通过 Relay Server + Chrome Extension (MV3) + Puppeteer 中继，实现 `browser_open`、`browser_screenshot`、`browser_get_content`、`browser_interactive_snapshot` 等工具。
- **特色**：支持复用用户真实浏览器登录态，配合可以点击的 **DOM 交互快照** 与 **Readability 阅读模式**，显著降低 Token 消耗并提升阅读/操作成功率。

### 11. 系统级操作（System Execution，Phase 10）
- **功能**：提供 `run_command`、`process_manager`、`terminal` 等系统命令工具，支持执行构建脚本、管理进程和交互式 Shell。
- **特色**：运行在严格的 Consumer Safe Mode 下——多层 Blocklist/Safelist、危险参数拦截、非交互保护、超时强杀，并对敏感文件访问做额外限制，实现“能跑 npm/pnpm/git，又不至于 rm -rf 自爆”。

### 12. 实时文件感知（Phase 11）
- **功能**：整合 `chokidar` 对工作区文件进行实时监听，自动触发 Memory 的增量索引与删除清理，让记忆与代码库保持几乎同步。
- **特色**：通过轻量防抖和增量更新策略，在保证实时性的同时控制系统开销，特别适合“边写代码边当知识库”的开发场景。

### 13. 双向语音交互 (TTS + STT)（Phase 13+）
- **语音合成 (TTS)**: 重构 `text_to_speech` 为多 Provider 架构，支持 OpenAI / Edge TTS / DashScope，并通过 `/generated` 静态路由向前端暴露音频文件。支持通过 `TTS_ENABLED` 文件信号热切换。
- **语音识别 (STT)**: 支持 OpenAI Whisper / Groq / DashScope Paraformer，WebChat 前端录音 + 飞书语音消息自动转录。
- **特色**：利用 Edge TTS 获得高质量中文语音且零额外成本，打造拟人化交互体验。

### 14. 视觉与视频感知（Native Vision & Video，Phase 13.5 & 13.6）
- **功能**：
    - **Loopback Vision**: 通过浏览器扩展 + `/mirror.html` 获取摄像头画面。
    - **Native Vision & Video**: 集成 Kimi K2.5 等多模态模型，支持直接上传图片与视频（`ms://` 协议），实现原生视觉理解。
- **特色**：不仅能“看”网页和摄像头，还能直接理解用户发送的视频文件内容，实现真正的多模态交互。

### 15. 极速启动与可视化配置/管理（Phase 1.5 & 2.5 & 2.6）
- **功能**：提供 `start.bat`/`start.sh` 一键启动脚本，并在 WebChat 中集成 Settings 配置面板、System Doctor 健康检查与 **Tool Settings 工具管理**。
- **特色**：
    - **Doctor & Settings**：Lenient Mode 引导新手完成配置，一键体检 Node 环境与向量库状态。
    - **Tool Manager**：可视化启停 MCP 服务或插件，赋予用户对 Agent 能力的微观控制权。
    - **Service Restart**：支持通过 `service_restart` 工具实现配置修改后的自动重启。

### 16. 渠道架构升级与飞书渠道（Phase 6 & 15）
- **功能**：实现 `Channel` 通用接口与 `ChannelManager` 管理器，支持 **Feishu 渠道**（WebSocket 长连接）与 **Agent 绑定**（不同群聊/场景可绑定不同 Agent）。
- **特色**：渠道层抽象良好，新渠道只需实现少量接口即可接入；飞书方案无需公网 IP 或内网穿透，适合国内生产环境落地。

### 17. 定时调度与心跳机制（Heartbeat & Cron，Phase 7 & 7.5）
- **功能**：
    - **Heartbeat**: 周期性解析 `HEARTBEAT.md`，在活跃时段主动触发心跳对话。
    - **Cron System**: 通用定时任务调度器，支持 `cron_add/remove/list` 工具，实现精确的一次性或周期性任务（如会议提醒、健康打卡）。
- **特色**：让 Agent 具备时间感知能力，既能“日三省吾身”（Heartbeat），也能“按时办事”（Cron）。

### 18. MCP 支持（Phase 17）
- **功能**：`@belldandy/mcp` 包实现 MCP 客户端（stdio/SSE）、配置加载、工具桥接与多服务管理，Gateway 启动时自动加载 `~/.belldandy/mcp.json` 中声明的 MCP 服务器及工具。
- **特色**：对接 Anthropic Model Context Protocol 标准，无需改动核心代码即可挂接 Filesystem 等任意 MCP 服务器，为 1Password/GitHub/Notion/Slack 等生态工具打开通路。

### 19. 日志系统（Phase 18）
- **功能**：统一的 Logger 支持控制台 + 文件双输出、按日期与大小轮转、自动清理，并提供 `log_read`/`log_search` 工具给 Agent 自查使用。
- **特色**：日志结构化程度高且与方法论系统紧密结合，支持“看日志 → 找问题 → 写方法”的闭环，让系统与 Agent 都具备可观测性和自我改进能力。

### 20. 安全加固（Phase 19）
- **功能**：围绕 workspace 配对绕过、WS CSWSH、防配置泄露、危险工具、SSRF、防浏览器滥用等风险进行了系统加固，并新增 `BELLDANDY_ALLOWED_ORIGINS`、`BELLDANDY_DANGEROUS_TOOLS_ENABLED` 等环境变量。
- **特色**：以 P0–P3 分级方式系统梳理风险，并给出对应补丁实现与行号索引，便于审计和后续迭代。

### 21. Windows 兼容性增强
- **功能**：补齐 `run_command` 在 Windows 环境下的常用命令 Safelist，并对破坏性命令做拦截验证。
- **特色**：确保在 Windows PowerShell/CMD 中同样有良好体验，让 Belldandy 真正成为跨平台的开发助手。

---

## 二、规划中 / 迭代中的能力

> 以下为 `IMPLEMENTATION_PLAN.md` 中 Roadmap 部分列出的中长期规划，部分已经有架构预留或初步实现。

### 1. 多渠道扩展（Telegram / Slack / Discord 等）
- **功能规划**：在现有 Channel 接口与 Feishu 实现基础上，接入 Telegram、Slack、Discord 等一线 IM 渠道，形成多渠道统一收件箱。
- **特色预期**：复用现有 Pairing、安全与 Methodology 机制，让所有渠道都能共享同一套人格、技能与记忆，同时保留各自平台特性。

### 2. Webhooks 与外部触发
- **功能规划**：补充 Webhook 触发入口，将 Belldandy 接入更多外部事件源（如邮件、CI 通知、业务系统告警）。
- **特色预期**：与 Methodology/Skills/Cron 组合使用，构建“会接收外部信号并自动处理”的自动化运营助手。

### 3. Channels 路由引擎升级
- **功能规划**：完善 mention gating、群聊路由规则、allowFrom/allowlist 组合，针对群聊和多账号场景做精细控制。
- **特色预期**：对标 openclaw 的 group routing 能力，让 Belldandy 在群聊中也能优雅地“知进退、懂分寸”。

### 4. Canvas / 可视化工作区
- **功能规划**：实现基础版 Canvas/Board 功能，可在 Web 中创建卡片、连线和标注，承载任务拆解、知识结构与多模态内容。
- **特色预期**：与浏览器扩展和 Methodology 系统结合，逐步向 A2UI 一类“Agent 驱动界面”演进。

### 5. Nodes 风格的知识图谱
- **功能规划**：在现有 Memory 之上引入 nodes 概念，支持 `nodes.create/link/query` 等图结构操作，用于管理实体、概念与关系。
- **特色预期**：相比纯向量检索，知识图谱更适合策略、流程和多步推理，能让 Belldandy 在复杂项目中表现得更“像一个有脑子的协调者”。

### 6. Apps & Nodes（macOS/iOS/Android 原生应用）
- **功能规划**：设计自有的 macOS 菜单栏 app 与 iOS/Android 节点，暴露系统通知、摄像头、屏幕录制等本地能力，并通过 Node 协议与 Gateway 通信。
- **特色预期**：形成真正的“多终端助手”，既能在桌面上陪伴写代码，又能在手机上处理日程与通知，实现全场景协同。

### 7. 远程 Gateway 与部署工具链
- **功能规划**：对标 openclaw 的 remote gateway + Tailscale + Docker/Nix 支持，提供官方 Docker 镜像与远程访问方案。
- **特色预期**：让 Belldandy 能安全地部署在家庭服务器或云主机上，通过隧道/零信任网络被多设备共享。

### 8. 高阶 Canvas 与多节点视觉
- **功能规划**：在基础 Canvas 与 Loopback Vision 上扩展多节点视觉协同和更复杂的可视化操作（多相机、屏幕流、多视角监控等）。
- **特色预期**：配合多 Agent/Nodes，构建可视化控制面板，为创作、运维和监控场景提供“所见即所得”的智能界面。

### 9. IDE 协议桥接（ACP 或等价方案）
- **功能规划**：评估在 MCP 之外是否需要 ACP/OpenClaw 风格的 IDE 协议桥接命令（如 `belldandy acp`），直接服务编辑器与开发工具。
- **特色预期**：与现有 Skills/File/Browser 能力结合，实现从 IDE 内部驱动 Belldandy 进行代码修改、重构和运行。

### 10. 本地推理与 Memory Flush
- **规划中**：计划接入本地推理库（如 node-llama-cpp）并补齐 Memory Flush 机制，进一步优化写入压力与长期运行时的性能与稳定性。

---

## 三、总结

Belldandy 目前已经完成了从 Gateway 控制平面、WebChat UI、Skills 工具、Memory 记忆、插件与浏览器扩展、**多 Agent 编排 (Orchestration)**、**定时调度 (Cron)**、**多模态感知 (Vision/Video)** 以及 MCP/日志/安全体系等一整条“个人 AI 工作站”的主干实现；未来将继续在多渠道、Canvas/Nodes 可视化工作区、原生 Apps & Nodes 以及本地化推理上持续迭代，逐步对齐乃至超越 openclaw/moltbot 等同类项目的能力上限。