# Star Sanctuary 实现内容说明

最后更新时间：2026-04-14  
适用范围：当前仓库主干实现（workspace version `0.2.4`）

## 1. 文档目标与范围

这份文档用于说明 **Star Sanctuary 当前已经落地并在仓库中可定位的功能模块**，重点回答三件事：

1. 项目现在有哪些核心模块。
2. 每个模块解决什么问题、从哪里进入。
3. 这些能力主要落在仓库哪些目录。

本次重整后，本文不再把历史阶段编号、对标分析、旧路线图混写进主体说明。历史方案、竞品对比和已过期的阶段性材料仍保留在 `docs/archive/` 或 `docs/*.md` 中，但不再作为“当前实现现状”来描述。

## 2. 当前项目定位

Star Sanctuary 当前已经不是单纯的“本地聊天网页”，而是一个 **本地优先、可治理、可长期运行的 Agent 工作台**。它的主线能力可以概括为：

- 以 `Gateway + WebChat + CLI` 为主入口。
- 以 `Agent Runtime + Tools + Memory` 为执行内核。
- 以 `Goals / Subtasks / Review Governance` 为长期任务主线。
- 以 `Channels / Browser Relay / Webhook / Community` 为外部接入面。
- 以 `Doctor / Prompt Snapshot / Logs / Distribution` 为运维与交付支撑。

## 3. 仓库模块总览

| 模块域 | 主要位置 | 当前职责 |
| --- | --- | --- |
| 基础入口与协议 | `packages/belldandy-core` `packages/belldandy-protocol` | Gateway、CLI、RPC/事件协议、状态目录约定、HTTP/WebSocket 入口 |
| WebChat 前端 | `apps/web/public` | 聊天、设置、记忆面板、长期任务面板、子任务面板、Doctor、Prompt/Voice/Canvas 等工作台能力 |
| Agent 运行时 | `packages/belldandy-agent` | 模型调用、System Prompt 装配、工作区文档、对话存储、压缩、转录、Failover |
| 记忆与 Resident | `packages/belldandy-memory` `packages/belldandy-core/src/resident-*` | 长期记忆、任务记忆、durable extraction、resident private/shared/hybrid 记忆治理 |
| 工具、技能、方法论 | `packages/belldandy-skills` | 内置工具、工具契约、安全矩阵、技能加载/发布、方法论、会话委派、Canvas 工具 |
| 渠道与社区 | `packages/belldandy-channels` `packages/belldandy-core/src/community` `packages/belldandy-core/src/webhook` | 飞书、QQ、Discord、Community、路由、安全兜底、Webhook、社区 HTTP API |
| 浏览器与多媒体 | `packages/belldandy-browser` `apps/browser-extension` | Browser Relay、Chrome 扩展桥接、浏览器工具、多媒体输入输出 |
| 扩展与 MCP | `packages/belldandy-mcp` `packages/belldandy-plugins` `packages/belldandy-core/src/extension-*` | MCP 客户端、插件注册、扩展市场第一阶段、运行时扩展宿主 |
| 分发与部署 | `packages/star-sanctuary-distribution` `install.ps1` `install.sh` | Portable、Single-Exe、安装升级、运行时抽取、生命周期校验 |

## 4. 基础运行架构与入口

### 4.1 Gateway 与协议层

当前服务端主入口位于 `packages/belldandy-core/src/server.ts`，对外提供两类接口：

- WebSocket Gateway：承担 WebChat / CLI / 其他客户端的 RPC 与事件流。
- HTTP 路由：承担健康检查、Webhook、Community API 等补充入口。

协议定义集中在 `packages/belldandy-protocol/src/index.ts`，当前协议已经覆盖：

- 连接握手与 `hello-ok`
- 鉴权模式 `none / token / password`
- Pairing 配对挑战
- 聊天增量与最终消息事件
- Agent / Model 选择
- 附件上传
- Tool Settings 确认事件
- UUID、发送者信息、房间上下文
- `system.doctor` 等运行时诊断返回结构

### 4.2 CLI 体系

CLI 主链位于 `packages/belldandy-core/src/cli/`，当前已经不只是简单启动脚本，而是完整的控制面。已落地命令族包括：

- 服务管理：`start` `stop` `status` `dev`
- 首次配置与向导：`setup` `configure` `community`
- 配置管理：`config`
- 配对管理：`pairing`
- 会话与导出：`conversation`
- Relay 管理：`relay`
- 诊断：`doctor`
- 扩展市场：`marketplace`

### 4.3 状态目录与运行时路径

当前已经形成稳定的状态目录体系，相关实现分布在：

- `packages/belldandy-protocol/src/state-dir.ts`
- `packages/star-sanctuary-distribution/src/runtime-paths.ts`
- `packages/belldandy-core/src/cli/shared/env-migration.ts`

这套机制已经支持：

- 默认状态目录与旧目录兼容
- Windows / WSL 分离状态目录
- 运行时 `envDir` 解析
- legacy 根目录配置向状态目录迁移
- 发布版运行时路径与源码运行时路径统一

### 4.4 WebChat 工作台

当前 WebChat 已拆成模块化前端，而不是旧版单文件脚本。核心入口是 `apps/web/public/app.js`，功能模块位于 `apps/web/public/app/features/`。已落地的主要工作台能力包括：

- 基础聊天、流式消息、附件上传
- Agent / Model 切换
- 工作区树、编辑器、环境文件入口
- 记忆查看器与记忆详情
- 长期任务总览、详情、治理、能力面板
- 子任务总览、续跑、接管、归档态查看
- Prompt 观测、Session Digest、会话导航
- Doctor 观测摘要
- Tool Settings、渠道设置
- Voice、Theme、Locale、Canvas 上下文

这意味着当前 WebChat 已经是一个高密度执行工作台，而不只是聊天 UI。

## 5. Agent 运行时

### 5.1 模型调用与执行链

`packages/belldandy-agent` 提供当前 Agent 运行时主链，核心能力包括：

- `OpenAIChatAgent` 与工具增强 Agent
- 多模态输入结构（文本 / 图片 / 视频 URL）
- Tool Call / Tool Result 事件模型
- 对话历史回放
- Token 计数
- 模型容灾与失败切换

当前用户侧主配置文档仍以 **OpenAI-compatible 调用链** 为核心；同时仓库内也保留了 `anthropic.ts` 等 provider 适配文件。

### 5.2 Workspace 文档体系

当前工作区人格与长期行为约束已经不是单一 `SOUL.md` 文件，而是一整套模板化文档：

- `AGENTS.md`
- `SOUL.md`
- `IDENTITY.md`
- `USER.md`
- `TOOLS.md`
- `HEARTBEAT.md`
- `BOOTSTRAP.md`

相关实现集中在 `packages/belldandy-agent/src/workspace.ts` 与 `system-prompt.ts`。当前运行时支持：

- 自动检查并补齐工作区模板
- 解析 frontmatter 与正文
- 按角色拼装 System Prompt 分段
- 根据 Agent / 用户 / 工作区上下文动态注入
- per-agent workspace 装配

### 5.3 对话存储、压缩与转录

当前对话层已经形成较完整的可追溯体系，核心文件包括：

- `conversation.ts`
- `compaction.ts`
- `compaction-runtime.ts`
- `prompt-snapshot.ts`
- `session-transcript.ts`
- `session-transcript-export.ts`
- `session-timeline.ts`
- `session-restore.ts`

已落地能力包括：

- 对话持久化
- 历史压缩与 microcompact
- Prompt Snapshot
- transcript bundle 导出
- timeline 轻量投影
- restore 诊断视图
- Session Digest

### 5.4 多 Agent 与 Resident 基础

多 Agent 配置与注册仍由 `agent-profile.ts`、`agent-registry.ts` 承担，但当前实现已经进一步与 core 层的 resident 运行态打通，支持：

- 多 Agent Profile
- per-agent workspace / session namespace
- `shared / isolated / hybrid` 记忆模式
- resident agent 运行态观测
- agent launch explainability

## 6. 记忆、Resident 与学习闭环

### 6.1 记忆存储与检索

记忆核心位于 `packages/belldandy-memory`。当前主链已经包含：

- `MemoryStore`
- `MemoryIndexer`
- `MemoryManager`
- `ResultReranker`
- `TaskProcessor`
- `TaskSummarizer`
- `sqlite-vec` 支撑
- OpenAI embedding provider

结合 README 与现有配置文档，当前记忆链路已经覆盖：

- 长期记忆索引
- 对话与任务级记忆沉淀
- 向量召回与重排
- 噪声过滤
- adaptive retrieval

### 6.2 Durable Extraction 与经验沉淀

当前记忆不再只是“手工写 MEMORY.md”，还包含自动化抽取链：

- `durable-extraction.ts`
- `durable-extraction-policy.ts`
- `durable-extraction-surface.ts`
- `experience-promoter.ts`
- `experience-types.ts`
- `experience-usage` 相关链路

这部分能力已经支撑：

- 从对话与任务结果中提取 durable memory candidate
- 形成 experience candidate / usage 记录
- 为 methods / skills 发布链提供输入

### 6.3 Resident 与共享治理

当前 resident 不是旧文档里零散存在的概念，而是长期任务与记忆治理主线的一部分。相关实现主要位于 `packages/belldandy-core/src/`：

- `resident-agent-runtime.ts`
- `resident-conversation-store.ts`
- `resident-memory-managers.ts`
- `resident-memory-policy.ts`
- `resident-memory-result-view.ts`
- `resident-shared-memory.ts`
- `resident-state-binding.ts`

当前已经落地的 resident 能力包括：

- resident agent 运行态注册
- resident 状态绑定视图
- private / shared / hybrid 记忆治理
- shared review 积压与审批视图
- 与长期任务、子任务、experience usage 的联动

### 6.4 Mind Profile、Learning Review、Skill Freshness

这是旧文档中缺少系统梳理、但当前仓库已经实际存在的一组运行时观测能力：

- `mind-profile-runtime-digest.ts`
- `mind-profile-runtime-prelude.ts`
- `mind-profile-snapshot.ts`
- `learning-review-*`
- `skill-freshness.ts`
- `runtime-resilience.ts`

当前这些能力已被 `system.doctor` 和 WebChat 观测面板消费，用于回答：

- resident 当前带了哪些记忆与 usage 上下文
- 最近是否需要 learning review
- 哪些技能出现 freshness 风险
- 当前运行时是否有 resilience / recovery 信号

## 7. 长期任务、子任务与编排

### 7.1 Goals 主线

长期任务当前已经是 Star Sanctuary 的核心主线之一，主要实现位于：

- `packages/belldandy-core/src/goals/`
- `packages/belldandy-core/src/server-methods/goals.ts`
- `packages/belldandy-skills/src/builtin/goals/`
- `apps/web/public/app/features/goals-*.js`

当前 Goals 能力已覆盖：

- Goal 创建、暂停、恢复
- Goal 文档脚手架与索引
- NORTHSTAR / 目标说明维护
- capability plan
- method / skill candidate 生成
- flow pattern / cross-goal flow pattern
- retrospective / handoff 生成
- review governance
- checkpoint 审批链
- task graph 结构化推进

### 7.2 子任务与多 Agent 委派

当前子任务体系已经不是简单的“spawn 一个子 agent”，而是完整的编排链。相关实现包括：

- `packages/belldandy-skills/src/builtin/session/`
- `packages/belldandy-core/src/query-runtime-subtask.ts`
- `packages/belldandy-core/src/subtask-*`
- `apps/web/public/app/features/subtasks-*.js`

已落地能力包括：

- spawn / delegate / parallel delegate
- 子任务状态追踪
- 子任务结果封装
- 已结束子任务续跑
- takeover / safe-point takeover
- 关联会话与摘要展示

### 7.3 后台续跑、恢复与隔离工作树

当前仓库已出现一整套旧文档未充分整理的“恢复 / 续跑 / worktree”运行时：

- `background-continuation-runtime.ts`
- `background-recovery-runtime.ts`
- `continuation-state.ts`
- `subtask-background-continuation-ledger.ts`
- `worktree-runtime.ts`

这部分当前负责：

- 对长执行链保存续跑状态
- 在启动恢复时重建关键信息
- 为子任务准备隔离 worktree
- 在 WebChat 中展示续跑建议、恢复目标、工作树状态

### 7.4 当前边界

当前长期任务仍然是 **复用 Gateway + WebChat 主工作台** 运行，不存在一个独立的“Goals 专属后台产品面”。这一点与使用手册中的当前描述一致。

## 8. 工具系统、技能系统、扩展与 MCP

### 8.1 工具执行与安全契约

`packages/belldandy-skills` 已经形成成熟的工具执行层，当前包括：

- `ToolExecutor`
- `tool-contract.ts`
- `tool-contract-v2.ts`
- `tool-behavior-contract.ts`
- `tool-pool-assembler.ts`
- `security-matrix.ts`
- `runtime-policy.ts`

当前工具层已经支持：

- 工具分组加载
- `tool_search` 驱动的延迟曝光
- 工具行为契约与 V2 合同摘要
- 运行时安全矩阵与 safe scope 判断
- 工具审计与可观测性
- Tool Settings 临时禁用 / confirm 模式

### 8.2 当前内置工具族

当前内置工具远多于旧文档中的基础文件工具，已落地工具族包括：

- 文件与补丁：`file_*` `list_files` `apply_patch`
- 网络与搜索：`fetch` `web_search`
- 系统执行：`exec` `process` `terminal` `pty`
- 代码解释器：`code_interpreter`
- 浏览器控制：`browser_*`
- 多媒体：图像、TTS、STT、camera
- 会话与委派：`sessions_*` `delegate_*`
- 对话读取：`conversation_*`
- 方法论：`method_*`
- 长期任务与 task graph：`goal_*` `task_graph_*`
- 记忆与经验：`memory_*` `task_*` `experience_*`
- Canvas：`canvas_*`
- 社区与房间：`community` 相关工具
- 定时器、Cron、FACET 切换、服务重启、Token Counter、Tool Settings Control
- UUID / sender info / room members 等上下文工具

### 8.3 技能系统

当前技能系统已经不是简单的“读取 `SKILL.md`”，而是完整的目录加载与准入链：

- `skill-loader.ts`
- `skill-eligibility.ts`
- `skill-registry.ts`
- `skill-publisher.ts`
- `bundled-skills/`

当前技能来源包括：

- 内置技能
- bundled skills
- 用户技能目录
- 插件提供的技能
- marketplace 安装的 skill-pack

并且已经支持：

- eligibility 检查
- 优先级覆盖
- 技能候选发布
- 与 goals / experience 链联动

### 8.4 插件与扩展市场第一阶段

当前扩展体系由三层组成：

1. `packages/belldandy-plugins`：插件 manifest / registry 基础层  
2. `packages/belldandy-core/src/extension-*`：运行时扩展宿主与 marketplace 账本  
3. CLI `bdd marketplace`：安装、启用、禁用、更新、卸载入口

当前状态可以概括为：

- 已有最小可用的 marketplace 安装链路
- 已有安装账本、已知 marketplace 账本、source cache、materialized extension 目录
- 已有运行时 enable / disable / governance 链路

但它仍然是 **第一阶段轻量扩展分发层**，不是重平台化的插件生态系统。

### 8.5 MCP 支持

`packages/belldandy-mcp` 已经提供完整的 MCP 客户端能力，包含：

- 配置文件读写
- stdio / SSE 传输
- MCPClient 与 MCPManager
- 工具桥接与资源读取
- logger adapter

这意味着当前 Agent 可以把外部 MCP 服务器纳入自身工具池和资源访问链。

## 9. 渠道、社区与对外集成

### 9.1 渠道管理器

当前外部渠道实现在 `packages/belldandy-channels`，已经落地：

- Feishu
- QQ
- Discord
- Community

并补齐了配套基础能力：

- 渠道管理器
- session key 归一
- current conversation binding
- reply chunking

### 9.2 路由与安全兜底分层

当前渠道层已经明确分成两套配置：

- `channels-routing.json`：回答“路由到哪个 Agent”
- `channel-security.json`：回答“这条消息能不能进系统”

这两层的实现分别位于：

- `packages/belldandy-channels/src/router/`
- `packages/belldandy-core/src/channel-security-*`

当前安全兜底已经支持：

- DM allowlist
- mention required
- account/channel 级覆盖
- approval 存储与诊断

### 9.3 Community、Webhook 与外部调用

当前对外集成面已经形成三条主链：

- Community 房间连接与房间协作
- Community HTTP API：`/api/message`
- Webhook API：`/api/webhook/:id`

相关实现包括：

- `packages/belldandy-core/src/community/`
- `packages/belldandy-core/src/webhook/`
- `packages/belldandy-protocol/src/token-usage-upload.ts`
- `packages/belldandy-skills/src/builtin/community/`

当前已经支持：

- 社区房间 join / leave
- 多 Agent 接入社区房间
- Webhook 鉴权与幂等
- token usage 上报
- Office / Homestead / Workshop 生态工具对接

### 9.4 外发确认与审计

当前仓库已经存在专门的对外主动发送运行时，而不是把外发逻辑散落在各渠道文件中：

- `external-outbound-sender-registry.ts`
- `external-outbound-confirmation-store.ts`
- `external-outbound-audit-store.ts`
- `external-outbound-doctor.ts`

这部分能力目前主要用于：

- WebChat 请求外发前确认
- 最近外发记录审计
- 失败诊断
- 渠道目标核对

## 10. 浏览器自动化、多媒体与可视化工作区

### 10.1 Browser Relay

浏览器自动化当前依赖两部分：

- `packages/belldandy-browser/src/relay.ts`：本地 Relay Server
- `apps/browser-extension/`：Chrome 扩展桥接

当前链路已经支持：

- 扩展连接 Relay
- Relay 向 Agent 暴露 CDP 风格能力
- 复用真实浏览器标签页与登录态

### 10.2 浏览器工具

浏览器控制工具位于 `packages/belldandy-skills/src/builtin/browser/`，当前已落地：

- 打开 / 跳转页面
- 点击
- 输入
- 截图
- 页面内容抓取
- 结构化快照

### 10.3 多媒体

多媒体能力位于 `packages/belldandy-skills/src/builtin/multimedia/`，当前已经覆盖：

- STT 转写
- TTS 合成
- 图像生成
- camera 快照

WebChat 同时已经接入了 `voice.js`，可作为前端语音入口。

### 10.4 Canvas 与可视化上下文

Canvas 相关能力当前主要落在：

- `packages/belldandy-skills/src/builtin/canvas.ts`
- `apps/web/public/canvas.js`
- `apps/web/public/app/features/canvas-context.js`

当前作用不是新增独立产品线，而是为复杂任务提供：

- 可视化拆解
- 节点上下文注入
- ReAct 过程辅助观察

## 11. 安全、观测、运维与分发

### 11.1 当前安全主线

当前安全体系已经从单点鉴权，发展为多层防线：

- Host + Auth 组合约束
- Pairing 新设备配对
- Tool Policy 与 Tool Settings Confirm
- 渠道安全兜底
- 外发确认
- 浏览器域名限制
- 受保护状态路径阻写
- Webhook / Community API 鉴权

相关实现散布在：

- `packages/belldandy-core/src/security/`
- `packages/belldandy-core/src/tool-control-*`
- `packages/belldandy-core/src/channel-security-*`
- `packages/belldandy-core/src/webhook/`
- `packages/belldandy-core/src/server.workspace-conversation.test.ts`

### 11.2 Doctor、Prompt 观测与日志

当前观测能力已经形成比较完整的“静态 + 运行时”双层：

- `bdd doctor`：静态配置与环境检查
- `system.doctor`：运行时观测与结构化摘要

`system.doctor` 当前已经覆盖或汇总：

- cron runtime
- background continuation runtime
- resident agents
- mind profile snapshot
- learning review input
- skill freshness
- runtime resilience
- external outbound runtime
- prompt observability
- extension governance

日志体系位于 `packages/belldandy-core/src/logger/`，支持 console / file transport。

### 11.3 会话复盘与导出

当前会话复盘能力已经具备独立入口，不再只是从日志猜状态：

- `bdd conversation ...`
- Prompt Snapshot
- transcript bundle
- timeline projection
- 最近导出索引

这也是当前实现相较旧文档最需要补充说明的部分之一。

### 11.4 分发、安装与生命周期

当前项目已同时支持多种交付形态：

- 源码运行
- Docker / Compose
- Nix
- Windows Portable
- Windows Single-Exe

分发主链位于 `packages/star-sanctuary-distribution`，已经实现：

- 运行时目录解析
- Portable 运行时确保
- Single-Exe payload 抽取
- 版本目录管理
- 运行时清理
- 依赖预取与校验
- 安装生命周期 smoke / verify 脚本

配套安装入口为：

- `install.ps1`
- `install.sh`
- `start.bat`
- `start.sh`

## 12. 当前能力边界与文档导航

### 12.1 当前能力边界

截至当前仓库状态，以下边界需要明确：

- 扩展市场已可用，但仍属于第一阶段轻量分发层。
- 长期任务是主线能力，但仍复用现有 Gateway / WebChat 工作台，不是独立后台产品。
- 浏览器自动化依赖本地 Relay 与浏览器扩展同时在线。
- 当前公开配置文档仍主要围绕 OpenAI-compatible 模型链与 `models.json` fallback。
- 历史阶段编号、竞品对比、旧规划不再作为本文主体维护对象。

### 12.2 推荐配套文档

如果要继续深入具体模块，建议优先查看：

- `README.md`
- `Star Sanctuary使用手册.md`
- `docs/长期任务使用指南.md`
- `docs/agents.json配置说明.md`
- `docs/channel-security配置说明.md`
- `docs/channels-routing.md`
- `docs/webhook.md`
- `docs/记忆与token变量配置建议方案.md`
- `docs/安全变量配置建议方案.md`
- `docs/用户版本升级手册.md`

### 12.3 本次重整结果

本次文档重整后的主体结论是：

- Star Sanctuary 当前主线已经从“本地聊天 + 工具”扩展为“长期任务治理型 Agent 工作台”。
- 当前仓库的真实核心模块应以 `Gateway / WebChat / Agent Runtime / Memory / Goals / Tools / Channels / Browser / Distribution` 来理解。
- 旧文档中大量阶段编号、竞品对比和已变更规划，会继续保留在其他文档中，但不再混入这份“当前实现说明”。
