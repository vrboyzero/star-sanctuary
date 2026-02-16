## Belldandy 产品介绍

Belldandy 是一款面向开发者与创作者的 **本地优先个人 AI 助手 / 工作站**。它通过 Gateway 控制平面 + WebChat 界面 + Skills 工具系统 + Memory 记忆引擎 + 渠道与插件生态，为用户提供安全、可控、可进化的智能体体验。

---

## 一、已实现能力（当前可用）

### 1. 核心平台与 WebChat 实时对话（Phase 1–2）
- **功能**：提供基于 WebSocket 的 Gateway 服务和 WebChat 前端，支持流式对话、消息历史和 Markdown 渲染。默认支持 MockAgent 与 OpenAI 协议兼容 Provider，并可扩展到更多模型。
- **特色**：采用清晰的请求/事件协议（如 `message.send`、`chat.delta`、`chat.final`），前后端解耦，便于未来集成多种 UI 客户端与 Agent Runtime。

### 2. 安全准入与 Pairing 机制（Phase 3 & 3.1 & 3S）
- **功能**：通过 Pairing + Allowlist 机制控制客户端接入，未配对设备默认无法触发 Agent 对话。提供 `pairing:list/pending/approve/cleanup/export/import` 等完整 CLI 工具管理授权与迁移。
- **特色**：遵循“默认安全”原则，将个人助手视为敏感资源；配对过程有明确可视反馈与命令提示，既安全又可运维。

### 3. Skills 工具系统（Phase 4）
- **功能**：`@belldandy/skills` 提供统一的工具执行沙箱和审计日志，内置 `web_fetch`、`file_read`、`file_write` 等核心工具，并支持 ToolEnabledAgent 的 function calling 循环。
- **特色**：工具层做了细粒度安全控制——协议/域名/内网 IP 限制、路径遍历防护、敏感文件黑名单、白名单写入目录等，让“能干活”的同时保持“可控”；在复杂任务中，Skills 提供原子能力，是方法论执行的“动作库”。

### 4. 方法论系统（Methodology，Phase 14）
- **功能**：将 SOP/经验写入 `~/.belldandy/methods`，提供 `method_list/method_search/method_read/method_create` 工具，并在 System Prompt 中注入 Methodology Protocol，要求 Agent 在复杂任务前后查阅与沉淀方法。
- **特色**：在架构上与 Skills 并行——**Skills 决定“能做什么”，Methods 决定“遇到重复任务按什么套路去做”**；Agent 会先选择/更新方法，再在方法步骤里调用各类 Skills 与 Memory/Logs，让复杂工作流从即兴推理升级为有版本的 SOP。

### 5. Memory 记忆系统与向量检索（Phase 4 & 4.5 & 12）
- **功能**：基于 SQLite + FTS5 + `sqlite-vec` 的混合检索内核，支持关键词（BM25）+ 向量语义检索，以及对 `MEMORY.md` 与 `memory/YYYY-MM-DD.md` 的长期/日常记忆分层管理。
- **特色**：采用 `memory_type` 字段区分 core/daily/other，配合可插拔 Embedding Provider（OpenAI 兼容接口），在本地即可实现高性能、大规模知识检索，为长期陪伴场景打下基础。


### 6. 对话上下文分层与 Prompt Injection 防护（Phase 2.2）

- **功能**：通过 `ConversationStore` 管理会话生命周期与历史，并在构建 Prompt 时严格分层：System 层、History 层、User 层，避免用户输入覆盖系统指令。
- **特色**：在架构层面预防 Prompt Injection，而不是单靠“提示语约定”；为之后的多 Agent、工具调用等复杂场景提供安全的语境基础。

### 7. SOUL 人格系统与 Workspace 文档（Phase 5）

- **功能**：通过 `~/.belldandy` 内的 `AGENTS.md/SOUL.md/IDENTITY.md/USER.md/TOOLS.md/HEARTBEAT.md/BOOTSTRAP.md` 等文件定义人格、身份、用户档案与心跳任务，启动时自动加载并注入 System Prompt。
- **特色**：人格完全“文件化”，用户可以像写世界观设定一样编辑 markdown 文档塑造角色；首次使用还有 Bootstrap 引导仪式，增强情感连接。

### 8. 插件与钩子系统（Phase 8 & 8.3）

- **功能**：提供 PluginRegistry 与 13 种生命周期 Hook（如 `before_agent_start`、`message_sending`、`before_tool_call` 等），支持 JS/MJS 插件动态扩展 Agent 能力与行为。
- **特色**：完整对标 moltbot 的 Hook 体系，支持优先级与多执行模式（并行/顺序/同步），同时保持与旧版 `AgentHooks` 的向后兼容，是构建 Belldandy 生态的关键基础设施。

### 9. 浏览器扩展与 Web 自动化（Phase 9）

- **功能**：通过 Relay Server + Chrome Extension (MV3) + Puppeteer 中继，实现 `browser_open`、`browser_screenshot`、`browser_get_content`、`browser_snapshot` 等浏览器控制工具。
- **特色**：采用可控的“中继 + 扩展”架构而非直接远程浏览器，支持复用用户真实浏览器登录态，配合 DOM 快照压缩显著降低 Token 消耗，同时保留精细交互能力。

### 10. 系统级操作（System Execution，Phase 10）
- **功能**：提供 `run_command`、`process_manager`、`terminal` 等系统命令工具，支持执行构建脚本、管理进程和交互式 Shell。
- **特色**：运行在严格的 Consumer Safe Mode 下——多层 Blocklist/Safelist、危险参数拦截、非交互保护、超时强杀，并对敏感文件访问做额外限制，实现“能跑 npm/pnpm/git，又不至于 rm -rf 自爆”。

### 11. 实时文件感知（Phase 11）
- **功能**：整合 `chokidar` 对工作区文件进行实时监听，自动触发 Memory 的增量索引与删除清理，让记忆与代码库保持几乎同步。
- **特色**：通过轻量防抖和增量更新策略，在保证实时性的同时控制系统开销，特别适合“边写代码边当知识库”的开发场景。

### 12. 双向语音交互 (TTS + STT)（Phase 13+）
- **语音合成 (TTS)**: 重构 `text_to_speech` 为多 Provider 架构，支持 OpenAI / Edge TTS / DashScope，并通过 `/generated` 静态路由向前端暴露音频文件。
  - **特色**：利用 Edge TTS 获得高质量中文语音（如晓晓）且零额外 API 成本，并通过文件信号 `TTS_ENABLED` 支持热切换语音模式，无需重启服务。
- **语音识别 (STT)**:
  - 支持 OpenAI Whisper / Groq / DashScope Paraformer
  - WebChat 前端录音 (MediaRecorder) + 离线兜底 (Web Speech API)
  - 飞书语音消息自动转录

### 13. 视觉感知（Loopback Vision，Phase 13.5）
- **功能**：通过浏览器扩展 + `/mirror.html` 回环页面获取摄像头画面，使用 `browser_navigate` + `browser_screenshot` 为模型提供视觉输入。
- **特色**：不额外引入 WebRTC/媒体服务器，仅复用现有浏览器链路完成“看世界”，在复杂度和隐私之间取得平衡，是未来多模态交互的第一步。

### 14. 极速启动与可视化配置/管理（Phase 1.5 & 2.5 & 2.6）

- **功能**：提供 `start.bat`/`start.sh` 一键启动脚本（含自动安装依赖、重启环），并在 WebChat 中集成 Settings 配置面板、System Doctor 健康检查与 Tool Settings 工具管理。
- **特色**：
    - **Doctor & Settings**：Lenient Mode 引导新手完成配置，一键体检 Node 环境与向量库状态。
    - **Tool Manager (Phase 2.6)**：赋予用户对 Agent 能力的微观控制权——通过可视化开关实时启停任意 MCP 服务或插件，兼顾灵活性与安全性。

### 15. 渠道架构升级与飞书渠道（Phase 6 & 15）
- **功能**：实现 `Channel` 通用接口与 `ChannelManager` 管理器，并已完成 Feishu 渠道实现，可通过飞书自建应用 + WebSocket 长连接与 Belldandy 聊天。
- **特色**：渠道层抽象良好，新渠道只需实现少量接口即可接入；飞书方案无需公网 IP 或内网穿透，适合国内生产环境落地。

### 16. Heartbeat 定时任务（Phase 7）
- **功能**：通过 Heartbeat Runner 按配置周期解析 `HEARTBEAT.md`，在设定的活跃时段内周期性触发心跳对话与提醒。
- **特色**：支持活跃时间段配置与 `HEARTBEAT_OK` 静默响应，可用于日程检查、定期规划等轻量自动化，而不会打扰用户休息时间。

### 17. MCP 支持（Phase 17）
- **功能**：`@belldandy/mcp` 包实现 MCP 客户端（stdio/SSE）、配置加载、工具桥接与多服务管理，Gateway 启动时自动加载 `~/.belldandy/mcp.json` 中声明的 MCP 服务器及工具。
- **特色**：对接 Anthropic Model Context Protocol 标准，无需改动核心代码即可挂接 Filesystem 等任意 MCP 服务器，为 1Password/GitHub/Notion/Slack 等生态工具打开通路。

### 18. 日志系统（Phase 18）
- **功能**：统一的 Logger 支持控制台 + 文件双输出、按日期与大小轮转、自动清理，并提供 `log_read`/`log_search` 工具给 Agent 自查使用。
- **特色**：日志结构化程度高且与方法论系统紧密结合，支持“看日志 → 找问题 → 写方法”的闭环，让系统与 Agent 都具备可观测性和自我改进能力。

### 19. 安全加固（Phase 19）
- **功能**：围绕 workspace 配对绕过、WS CSWSH、防配置泄露、危险工具、SSRF、防浏览器滥用等风险进行了系统加固，并新增 `BELLDANDY_ALLOWED_ORIGINS`、`BELLDANDY_DANGEROUS_TOOLS_ENABLED`、浏览器域名白/黑名单等环境变量。
- **特色**：以 P0–P3 分级方式系统梳理风险，并给出对应补丁实现与行号索引，便于审计和后续迭代，是将 Belldandy 从“实验玩具”提升为“可上线系统”的关键阶段。

### 20. Windows 兼容性增强
- **功能**：补齐 `run_command` 在 Windows 环境下的常用命令 Safelist（如 `copy/del/type/ipconfig/tasklist` 等），并对 `del /s /q` 等危险参数做专门拦截与测试验证。
- **特色**：不再默认以 Linux 思维设计 CLI，确保在 Windows PowerShell/CMD 中同样有良好体验，让 Belldandy 真正成为跨平台的开发助手。

---

## 二、规划中 / 迭代中的能力

> 以下为 `IMPLEMENTATION_PLAN.md` 中 Roadmap 部分列出的中长期规划，部分已经有架构预留或初步实现。

### 1. 多渠道扩展（Telegram / Slack / Discord 等）
- **功能规划**：在现有 Channel 接口与 Feishu 实现基础上，接入 Telegram、Slack、Discord 等一线 IM 渠道，形成多渠道统一收件箱。
- **特色预期**：复用现有 Pairing、安全与 Methodology 机制，让所有渠道都能共享同一套人格、技能与记忆，同时保留各自平台特性。

### 2. CLI 命令树与 Onboarding Wizard
- **功能规划**：提供统一的 `belldandy` CLI 入口（如 `belldandy gateway/agent/send/config/doctor`），并实现类似 `openclaw onboard` 的交互式配置向导。
- **特色预期**：为偏命令行用户提供“一站式控制平面”，同时将 GUI Settings/Doctor 能力抽象到 CLI 中，便于脚本化和自动化运维。

### 3. 通用 Cron 工具与 Webhooks
- **功能规划**：在 Heartbeat 之上抽象通用定时任务系统（如 `cron.list/set`），并补充 Webhook 触发入口，将 Belldandy 接入更多外部事件源（邮件、CI、业务系统）。
- **特色预期**：与 Methodology/Skills/Memory 组合使用，构建“会自己按时检查并处理事项”的自动化运营助手。

### 4. Multi-Agent 路由与 Session 编排
- **功能规划**：引入多 Agent / 多 Workspace 配置，支持 `sessions_list/history/spawn` 等工具，实现主助手 + 子 Agent 团队协作。
- **特色预期**：在保持安全隔离的前提下，让不同 persona 和工具组合负责不同任务，适合复杂项目管理与多角色协作场景。

### 5. Channels 路由引擎升级
- **功能规划**：完善 mention gating、群聊路由规则、allowFrom/allowlist 组合，针对群聊和多账号场景做精细控制。
- **特色预期**：对标 openclaw 的 group routing 能力，让 Belldandy 在群聊中也能优雅地“知进退、懂分寸”。

### 6. Canvas / 可视化工作区
- **功能规划**：实现基础版 Canvas/Board 功能，可在 Web 中创建卡片、连线和标注，承载任务拆解、知识结构与多模态内容。
- **特色预期**：与浏览器扩展和 Methodology 系统结合，逐步向 A2UI 一类“Agent 驱动界面”演进。

### 7. Nodes 风格的知识图谱
- **功能规划**：在现有 Memory 之上引入 nodes 概念，支持 `nodes.create/link/query` 等图结构操作，用于管理实体、概念与关系。
- **特色预期**：相比纯向量检索，知识图谱更适合策略、流程和多步推理，能让 Belldandy 在复杂项目中表现得更“像一个有脑子的协调者”。

### 8. Apps & Nodes（macOS/iOS/Android 原生应用）
- **功能规划**：设计自有的 macOS 菜单栏 app 与 iOS/Android 节点，暴露系统通知、摄像头、屏幕录制等本地能力，并通过 Node 协议与 Gateway 通信。
- **特色预期**：形成真正的“多终端助手”，既能在桌面上陪伴写代码，又能在手机上处理日程与通知，实现全场景协同。

### 9. 远程 Gateway 与部署工具链
- **功能规划**：对标 openclaw 的 remote gateway + Tailscale + Docker/Nix 支持，提供官方 Docker 镜像与远程访问方案。
- **特色预期**：让 Belldandy 能安全地部署在家庭服务器或云主机上，通过隧道/零信任网络被多设备共享。

### 10. 高阶 Canvas 与多节点视觉
- **功能规划**：在基础 Canvas 与 Loopback Vision 上扩展多节点视觉协同和更复杂的可视化操作（多相机、屏幕流、多视角监控等）。
- **特色预期**：配合多 Agent/Nodes，构建可视化控制面板，为创作、运维和监控场景提供“所见即所得”的智能界面。

### 11. IDE 协议桥接（ACP 或等价方案）
- **功能规划**：评估在 MCP 之外是否需要 ACP/OpenClaw 风格的 IDE 协议桥接命令（如 `belldandy acp`），直接服务编辑器与开发工具。
- **特色预期**：与现有 Skills/File/Browser 能力结合，实现从 IDE 内部驱动 Belldandy 进行代码修改、重构和运行。

### 12. Local Embedding、本地推理与 Memory Flush
- **已完成（Local Embedding）**：已接入本地 Embedding 模型（基于 fastembed + bge 系列），通过配置 `BELLDANDY_EMBEDDING_PROVIDER=local` 与 `BELLDANDY_LOCAL_EMBEDDING_MODEL` 实现本地向量生成。
- **规划中（本地推理 + Memory Flush）**：后续将接入本地推理库（如 node-llama-cpp）并补齐 Memory Flush 机制，进一步优化写入压力与长期运行时的性能与稳定性。

---

## 三、总结

Belldandy 目前已经完成了从 Gateway 控制平面、WebChat UI、Skills 工具、Memory 记忆、插件与浏览器扩展、MCP/日志/安全体系等一整条“个人 AI 工作站”的主干实现；未来将继续在多渠道、多 Agent 编排、Canvas/Nodes 可视化工作区、原生 Apps & Nodes 以及本地化推理上持续迭代，逐步对齐乃至超越 openclaw/moltbot 等同类项目的能力上限。