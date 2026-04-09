# OC 与 SS 的系统功能对比

## 1. 对比范围与依据

本对比基于 2026-04-06 的两个仓库快照做静态代码与文档盘点，不是基于官网宣传页做的泛化判断。

对比对象：

- `OC`：`E:\project\star-sanctuary\tmp\openclaw\openclaw-main`
- `SS`：`E:\project\star-sanctuary`

主要依据：

- OC：
  - `README.md`
  - `package.json`
  - `openclaw.mjs`
  - `src/`、`extensions/`、`apps/`、`skills/` 目录结构
- SS：
  - `README.md`
  - `package.json`
  - `packages/`、`apps/` 目录结构
  - `apps/web/public/app/features`
  - `packages/belldandy-core/src`
  - `packages/belldandy-skills/src`

说明：

- 这里的“功能有/无”默认指“仓库内有明确实现或明显实现骨架”。
- 若某项只看到窄实现、实验态或较弱覆盖，会写成“有，但范围较窄”或“有基础实现”。
- 若某项在当前仓库未见明确模块，会写成“未见明确实现”。

---

## 2. 实现功能对比例表

### 2.1 产品定位与总体架构

| 功能子项 | OC 实现 | SS 实现 | 功能作用简述 | 对比判断 |
|---|---|---|---|---|
| 核心定位 | 个人 AI 助手 + 多渠道接入平台 + 设备节点生态 | 本地优先个人 AI 助手 + Agent 工作台 + 长期任务/记忆治理平台 | 决定系统优先服务的是“随处可达的助手”还是“长期工作流与治理闭环” | OC 更偏产品平台与多入口助手；SS 更偏工作台与长期执行治理 |
| 总体架构 | Gateway WS 控制面 + CLI + WebChat + macOS/iOS/Android 节点 + 多扩展 | Gateway + WebChat + CLI + Browser Relay + 渠道接入 + Goals/Memory/Review/Resident 体系 | 决定能力挂载方式与后续扩展边界 | OC 架构更大更外向；SS 架构更收敛但更聚焦执行与治理 |
| 控制平面 | README 明确为统一 Gateway control plane，服务 channels/tools/events/config/ui | README 与 `belldandy-core` 同样采用统一 Gateway，但更多围绕 WebChat、Goals、Memory、Webhook | 统一前后端、工具、会话、运维出口 | 两者都强；OC 更“平台总线化”，SS 更“工作台总线化” |

### 2.2 Gateway、CLI 与 Web 控制面

| 功能子项 | OC 实现 | SS 实现 | 功能作用简述 | 对比判断 |
|---|---|---|---|---|
| Gateway 服务 | 有，README 明确 WS control plane，`src/gateway` 模块完整 | 有，`belldandy-core` 为主服务核心 | 统一消息、会话、工具、配置与事件 | 两者都有成熟 Gateway |
| CLI 命令面 | 很强，含 `onboard`、`gateway`、`agent`、`message send`、`doctor`、`tui` 等 | 有，`bdd` 提供 `start/status/doctor/setup/pairing/config/community` 等 | 提供自动化、运维、调试、脚本接入 | OC CLI 更宽更产品化；SS CLI 偏核心运维与项目工作流 |
| Onboarding/向导 | 强，README 与 package 脚本都强调 `openclaw onboard` / wizard | 有 setup/首次配置说明，但仓库未体现同等级 onboarding 产品壳 | 降低首次安装配置门槛 | OC 明显更强 |
| Web 控制界面 | 有 Control UI + WebChat，且 UI 构建脚本独立 | 有 WebChat，并且已扩展为 memory/goals/tool settings/doctor/canvas 工作台 | 日常使用、配置与诊断的主入口 | SS 的 WebChat 更深耕 Agent 工作台；OC 的 Web UI 覆盖面更广 |
| TUI | `src/tui` 明确存在 | 当前未见独立 TUI | 终端交互与轻量控制面 | OC 更强 |

### 2.3 Agent 运行时与模型能力

| 功能子项 | OC 实现 | SS 实现 | 功能作用简述 | 对比判断 |
|---|---|---|---|---|
| Agent Runtime | 有，README 明确 Pi agent RPC runtime、tool/block streaming | 有，`belldandy-agent` 提供 agent runtime、prompt、compaction、多 Agent | 负责对话、工具调用、上下文构建与执行 | 两者都有完整 Agent runtime |
| 模型接入面 | 极强，`extensions/` 中有大量 provider 扩展与 gateway/provider 适配 | 以 OpenAI 兼容链路为主，支持 fallback 模型队列与模型配置 | 决定模型选择弹性、供应商切换与成本策略 | OC 明显更强 |
| 模型 failover | README 明确有 model failover | README 明确有 `models.json` fallback 模型队列 | 保障高可用与故障切换 | 两者都有；OC 生态覆盖更广 |
| 上下文压缩 | 有 session pruning、streaming/chunking 等 | 有 compaction，并与长期任务/记忆注入联动 | 控制 token 与长期会话稳定性 | 两者都有；SS 更强调工作区上下文与记忆耦合 |
| 结构化数据 PTC runtime | OC 已有更完整的 PTC/代码执行主路径 | SS 已新增 `ptc_runtime` 第一版最小受控运行面，并补了 `ptc.helpers.mcp / records / report` 与 3 个窄模板，可对声明过的本地文件做结构化脚本处理、归并结果并输出报表 | 降低复杂数据任务的文本拼接噪声，给后续 wrapper/helper 提供底座 | OC 仍更强；但 SS 已开始补齐这一执行层缺口 |
| 多 Agent / 多 Profile | 有 multi-agent routing、按渠道/peer 隔离 agent | 有 Agent Registry、多 Agent Profile、Resident Agent、子任务/委派链 | 支持不同 agent 人格、权限和工作区隔离 | 两者都有；SS 在 resident 状态/记忆/治理链上更深 |

### 2.4 会话、Resident Agent 与协同执行

| 功能子项 | OC 实现 | SS 实现 | 功能作用简述 | 对比判断 |
|---|---|---|---|---|
| 会话模型 | 有 main/group/isolation/queue/reply-back，会话模型成熟 | 有 session 持久化、resident 主通道、goal/subtask/session 绑定 | 管理直接聊天、群聊和任务上下文边界 | 两者都有；OC 更适配多渠道会话产品，SS 更适配任务型会话 |
| Agent-to-Agent / Session 协同 | 有 `sessions_list / sessions_history / sessions_send` | 有 `delegate_task / delegate_parallel / subtasks / result envelope / verifier handoff` | 跨 agent 协作与交接 | OC 更像会话级互发；SS 更像结构化委派与收束 |
| 子任务 steering / resume | 有更成熟的后台任务/会话继续交互能力 | 已新增 `subtask.update` 与 `subtask.resume`，并在 WebChat 现有 detail 区补 steering / resume 入口；当前可对运行中的子任务做 `accepted / delivered / failed` safe-point steering，也可对已结束子任务做 `accepted / delivered / failed` 的 same-task relaunch continuation。另已在 `subtask.get` / `goal.handoff.generate` 输出第一版最小 `continuationState`，统一 `summary / nextAction / checkpoints / progress / recommendedTarget` | 当子任务跑偏或提前结束时允许最小纠偏 / 续跑，而不是只能停掉或重开新 task | OC 仍更强；但 SS 已补第一版最小 steering + resume，并开始收敛 continuation state |
| Resident Agent 独立运行底座 | README 有 multi-agent routing，但未见像 SS 一样强调 resident 生命周期治理 | 已实现 resident runtime registry、独立 session/memory、workspaceBinding/stateDir 绑定、roster/doctor 联动 | 让多个常驻 agent 作为长期工作实体持续运作 | SS 明显更强 |
| 子任务详情与执行证据 | OC 有任务/会话工具，但未见像 SS 一样的 Web 详情收束面 | 已有 subtasks detail、launch explainability、result envelope、prompt snapshot、delegation protocol | 让委派执行过程可审计、可复盘 | SS 明显更强 |

### 2.5 记忆、知识与工作区

| 功能子项 | OC 实现 | SS 实现 | 功能作用简述 | 对比判断 |
|---|---|---|---|---|
| 工作区文件注入 | 有 `AGENTS.md / SOUL.md / TOOLS.md` workspace 注入 | 有 `AGENTS.md / SOUL.md / TOOLS.md / IDENTITY.md / USER.md / HEARTBEAT.md / BOOTSTRAP.md` | 将长期规则、人格、偏好、工具约束放入工作区 | SS 更丰富 |
| 记忆/知识持久化 | 有 memory 相关扩展与 memory host SDK | 有 `belldandy-memory`、SQLite + FTS5 + sqlite-vec、memory 文件与 SQLite 双层 | 长期知识沉淀与检索 | 两者都有；SS 当前暴露面更清晰 |
| 多 Agent 记忆隔离 | OC 有 multi-agent routing，但 README 未强调复杂 per-agent memory policy | SS 已有 resident memory policy、private/shared/hybrid、shared governance 审批链 | 支持不同 Agent 独立成长、共享与审批 | SS 明显更强 |
| 方法论/知识沉淀 | 主要是 skills/workspace；未见像 SS 的独立方法论体系被强调 | 有 Methods、经验 usage、方法创建/搜索/沉淀闭环 | 让“怎么做”成为可复用资产 | SS 明显更强 |
| FACET/人格模组 | 未见明确 FACET 机制 | 有 `facets/` 模组切换，支持不同人格/职责模组 | 把行为风格与职责从主工作区规则中拆出来 | SS 更强 |

### 2.6 长期任务、项目治理与审查流

| 功能子项 | OC 实现 | SS 实现 | 功能作用简述 | 对比判断 |
|---|---|---|---|---|
| 长期任务/Goal 系统 | 当前 README 未见类似 goal graph / checkpoint / reviewer workflow 的完整链 | 已有 Goals、节点、run、capability plan、orchestration、checkpoint、handoff | 支持长期项目拆解与阶段推进 | SS 明显更强 |
| Capability Planning / Orchestration | README 未见明确 capability planner / verifier handoff 体系 | 已有 `goal_capability_plan`、`goal_orchestrate`、sub-agent suggested/effective launch explainability | 在执行前规划能力与委派结构 | SS 明显更强 |
| 审批/Checkpoint | 有 pairing/DM 安全/部分审批扩展，但不是长期任务审查治理主线 | 已实现 checkpoint request/approve/reject/reopen/escalate 与 reviewer workflow | 高风险步骤可控、可审计 | SS 明显更强 |
| Shared Review 治理 | 未见对应的 shared review inbox / claim / reviewer 机制 | 已有 shared review、batch review、集中治理、resident 联动摘要 | 让多 Agent/多候选记忆进入人审闭环 | SS 明显更强 |

### 2.7 工具、浏览器、Canvas 与自动化

| 功能子项 | OC 实现 | SS 实现 | 功能作用简述 | 对比判断 |
|---|---|---|---|---|
| 基础工具执行 | 有大量 runtime/tool/plugin-sdk 模块 | 有 `belldandy-skills` 内置工具，含文件、补丁、命令、检索、图像等 | 为 Agent 提供执行能力 | 两者都强 |
| 浏览器自动化 | 很强，专门的 browser extension/core 与 dedicated Chrome/Chromium 流程 | 有 browser relay + browser extension + WebChat 浏览器工具 | 网页操作、抓取、自动化、测试 | OC 略强，产品化更成熟 |
| Canvas | 很强，Live Canvas + A2UI 是 OC 核心卖点之一 | 有画布工作区，且和 goals capability/context 已联动 | 可视化组织任务与状态 | 两者都有；OC 更平台化，SS 更偏与长期任务联动 |
| 自动化/定时 | 有 cron、wakeups、webhooks、Gmail Pub/Sub | 有 cron、heartbeat、webhook、community/http 集成 | 计划任务、外部事件驱动 | OC 自动化外部入口更广；SS 与内部工作流耦合更深 |
| 媒体/语音/图像 | 有 media pipeline、tts、realtime voice/transcription、image/video generation | 有 TTS/STT、图像生成、摄像头拍照，但仓库未见同等级语音节点体系 | 多模态交互与内容处理 | OC 更强 |

### 2.8 渠道与外部接入

| 功能子项 | OC 实现 | SS 实现 | 功能作用简述 | 对比判断 |
|---|---|---|---|---|
| 即时通信渠道数量 | 极广：WhatsApp、Telegram、Slack、Discord、Google Chat、Signal、iMessage/BlueBubbles、IRC、Teams、Matrix、LINE、Mattermost、Nostr、Twitch、WeChat 等 | 当前明确实现：WebChat、飞书、QQ、Discord、community、Webhook/HTTP API | 把 AI 助手接入用户已有沟通表面 | OC 明显更强 |
| 渠道路由 | 有多渠道路由、group routing、mention gating、per-channel chunking | 有 Channel Router，支持按规则路由到 agent | 让不同渠道/群聊/发言人映射到不同处理策略 | 两者都有；OC 覆盖更宽 |
| 社区/产品生态接入 | 有 ClawHub skills registry、remote gateway、广泛 channel/app 生态 | 有 community、Workshop、Homestead、官网社区房间与工坊/家园体系 | 把核心助手能力接到产品生态 | 两者都有，但方向不同：OC 偏开源生态；SS 偏自有社区生态 |
| HTTP/Webhook 集成 | 有 gateway、webhooks、多 remote surface | 有 `/api/message`、`/api/webhook/:id`、community HTTP API | 对接外部系统、自动化与服务编排 | 两者都有 |

### 2.9 平台应用、设备节点与语音交互

| 功能子项 | OC 实现 | SS 实现 | 功能作用简述 | 对比判断 |
|---|---|---|---|---|
| macOS 独立应用 | 有 `apps/macos` 与完整 runbook | 当前仓库未见独立 macOS companion app | 本地托盘、权限集成、节点控制 | OC 明显更强 |
| iOS/Android 应用/节点 | 有 `apps/ios`、`apps/android`，并带 device pairing、voice、camera、screen 等 | 当前仓库未见独立 iOS/Android app 目录 | 把手机作为 Agent 节点和控制面 | OC 明显更强 |
| 设备节点调用 | 有 `node.invoke`、camera/screen/location/notify/system.run | SS 当前工具里有 camera、browser、tts/stt，但未见同等级设备节点协议 | 把设备能力变成可调用工具 | OC 明显更强 |
| 语音唤醒/通话模式 | 有 Voice Wake + Talk Mode | 当前仓库未见同等级产品化语音唤醒体系 | 实现低摩擦的常驻语音助手体验 | OC 明显更强 |

### 2.10 扩展生态：Skills、Plugins、MCP

| 功能子项 | OC 实现 | SS 实现 | 功能作用简述 | 对比判断 |
|---|---|---|---|---|
| Skills 体系 | 有 bundled/managed/workspace skills，且有 ClawHub registry | 有 Skills，支持检索、安装、内置/工作区技能 | 把可复用能力做成可组合模块 | 两者都有；OC 生态面更广 |
| 插件/扩展 SDK | 极强，`plugin-sdk`、大量 extension 包、contracts、release/check 脚本完整 | 有 `belldandy-plugins` 与 marketplace/插件系统，但规模与成熟度较 OC 小 | 第三方扩展开发、发布、隔离与治理 | OC 明显更强 |
| MCP | 有 `src/mcp` 与相关扩展 | 有 `belldandy-mcp`，WebChat/doctor/tool settings 已打通；且第三阶段 `P0-1` 已补上“MCP 摘要发现 + workspace docs + deferred schema loading”的最小闭环 | 外接工具/资源与标准协议集成 | 两者都有；SS 正在把 MCP 从“直接桥接可调”推进到“渐进式发现” |
| 渠道/Provider 扩展包 | `extensions/` 下 provider/channel/speech/memory/browser 等大规模拆包 | SS 主要是 monorepo 内部 package + 少量插件扩展 | 扩展能力的工程边界与生态化程度 | OC 明显更强 |

### 2.11 安全、权限、诊断与观测

| 功能子项 | OC 实现 | SS 实现 | 功能作用简述 | 对比判断 |
|---|---|---|---|---|
| 配对/Allowlist/DM 安全默认值 | 很强，README 明确 DM pairing、allowlist、doctor 风险提示 | 有 pairing、allowlist、浏览器/社区/WebChat 配对与鉴权；第三阶段 `P1-1` 已补 `channel-security.json`、`discord/feishu/qq/community` 渠道安全 fallback、`channels.<channel>.accounts.<accountId>` 账号级覆盖、doctor 风险提示，以及 WebChat 侧最小 `pending sender -> allowFrom` 审批链，并补 `channel.security.pending` 实时提醒与一键跳转审批入口；`community HTTP /api/message` 也已支持显式 `accountId` 并走同一套 room mention / DM allowlist fallback | 降低未授权接入风险 | OC 仍更成熟；SS 已把底层积木推进到“渠道级默认值 + 账号级覆盖 + 最小审批闭环 + 轻量实时提醒” |
| 权限与工具治理 | 有 security model、permission map、gateway/node 权限、provider/channel 边界检查 | 有 tool settings、workspace-sensitive 边界、launch explainability、tool contract v2 | 约束高风险工具与执行边界 | SS 在“可解释治理”上更深；OC 在“平台安全面”更广 |
| Doctor/运维诊断 | 有 doctor、logging、operations/troubleshooting | 有 `bdd doctor`、`system.doctor`、resident/memory/tool/query runtime observability | 排障、系统状态体检、配置核验 | 两者都强；SS 当前在 resident/memory/goals explainability 更细 |
| Explainability/可解释执行 | README 有 runtime/usage/presence 等观测，但未见像 SS 一样的大量 explainability 收束面 | SS 已把 catalog default / effective launch / delegation reason / snapshot / subtask / goal 面打通 | 解释为什么这样选 agent/权限/交付 | SS 明显更强 |

### 2.12 部署、打包与工程成熟度

| 功能子项 | OC 实现 | SS 实现 | 功能作用简述 | 对比判断 |
|---|---|---|---|---|
| Docker / Nix / Remote | 有 Docker、Tailscale、SSH tunnels、Nix、remote gateway | 有 Docker、Tailscale、Nix | 适配不同部署场景 | OC 更强 |
| 桌面/移动端打包 | 有 macOS/iOS/Android 构建链 | SS 有 Portable / Single-Exe Windows 打包链，但无移动端/桌面 companion app | 面向终端用户的交付能力 | 各有优势；OC 平台端更广，SS Windows 便携包更聚焦 |
| 测试矩阵 | 非常大，package scripts 显示 vitest config、docker/live/e2e/extensions/contracts/perf 很全面 | 有 vitest 与构建验证，但测试矩阵规模明显小于 OC | 决定大规模演进时的稳定性 | OC 明显更强 |
| 代码生成/基线检查/工程约束 | 有大量 check/gen/lint/baseline 脚本、plugin-sdk/api/schema/runtime-sidecars 等 | 有 build/verify/doctor，但工程规范自动化面较收敛 | 影响大型平台项目的可持续维护性 | OC 更强 |

---

## 3. 功能模块与功能项优劣分析评估

### 3.1 模块级优劣评估表

| 模块 | OC 优势 | SS 优势 | 综合评估 |
|---|---|---|---|
| 产品平台广度 | 多渠道、多端节点、多 companion apps、多 provider、多 extension | 更聚焦工作台主线，功能密度高、心智更统一 | 如果目标是“全平台个人助手”，OC 更优；如果目标是“本地 Agent 工作台”，SS 更聚焦 |
| Gateway/CLI/Web 控制面 | onboard、doctor、tui、control UI、remote gateway 更成熟 | WebChat 已深度承载 memory/goals/tool settings/doctor/canvas/治理 | OC 胜在广和成熟度，SS 胜在工作流深度 |
| Agent/runtime/model | Provider 与插件生态明显更强 | Resident Agent、workspaceBinding、state scope、explainability 更深入 | OC 更适合平台扩展，SS 更适合长期执行治理 |
| 会话与协作 | 多渠道会话、session 工具、reply-back 更成熟 | subtasks/result envelope/verifier handoff/checkpoint 更结构化 | 若看“跨会话助手协作”，OC 更灵活；若看“项目执行链治理”，SS 更强 |
| 记忆与工作区 | 有 workspace + skills + memory 扩展能力 | memory policy、shared review、methods、facets、experience usage 明显更完整 | SS 明显更适合长期知识沉淀与治理 |
| 长期任务/项目治理 | 当前未见 SS 级别的长期任务治理链 | goals/capability/orchestration/checkpoint/shared review 是明显强项 | SS 明显胜出 |
| 浏览器/Canvas/自动化 | 浏览器、Canvas、Nodes、voice/device 自动化覆盖面很大 | Browser Relay 与 Canvas 已有，但更多围绕 WebChat/Goals 结合 | OC 在平台能力面更强；SS 在项目场景嵌入更紧 |
| 渠道与触达面 | 渠道数与移动/IM 生态覆盖远超 SS | 社区房间/工坊/家园等自有生态联动更产品化 | 对外触达 OC 胜；对内社区产品联动 SS 有特色 |
| 扩展生态 | plugin-sdk、extensions、ClawHub、provider/channel 扩展体系极强 | 有 skills/plugins/MCP，但更偏自用与当前主线配套 | OC 明显胜出 |
| 安全与诊断 | DM pairing、remote、ops/runbook、platform security 面广 | tool governance、launch explainability、resident/memory/goal observability 深 | 两者都强，但方向不同：OC 偏平台安全，SS 偏执行治理解释 |
| 部署与工程成熟度 | CI、lint、contracts、perf、docker/live/e2e 覆盖很全面 | 打包链和本地开发体验清晰，但大型平台工程化程度略弱 | OC 明显更强 |

### 3.2 关键功能项单点评估

1. 多渠道即时通信接入

- OC 明显更强。
- 原因：仓库内已有大量渠道扩展与对应 runbook，是真正的“多表面助手平台”。
- SS 当前更像“有部分渠道能力的本地 Agent 工作台”，不以渠道广覆盖为主线。

2. 长期任务/项目治理

- SS 明显更强。
- 原因：SS 现在已经形成 `goal -> capability plan -> orchestration -> checkpoint -> subtask -> review governance -> explainability` 的完整链路。
- OC 当前更像通用助手与节点平台，未见同等级项目治理主线。

3. Resident Agent 长期运行与隔离

- SS 更强。
- 原因：SS 已把 resident runtime、workspaceBinding、stateDir、sessions、memory policy、doctor/roster 摘要打通。
- OC 虽支持 multi-agent routing，但当前公开主叙事仍偏“多入口、多渠道、多设备”，不是“多 resident 治理”。

4. 记忆治理与共享审批

- SS 更强。
- 原因：SS 有 shared review、batch review、claim、治理摘要、experience usage 与长期任务联动。
- OC 在当前快照中未见对应的人审治理链。

5. Companion Apps / 节点 / 语音交互

- OC 明显更强。
- 原因：有 macOS、iOS、Android 三端节点与 Voice Wake/Talk Mode。
- SS 当前仓库未见同等级 companion app 与设备节点协议。

6. 插件 SDK 与第三方扩展生态

- OC 明显更强。
- 原因：`plugin-sdk`、大量 `extensions/`、合约测试、发布检查脚本都已经系统化。
- SS 虽有插件与 MCP，但整体仍更偏主仓自带能力扩展。

7. Web 工作台深度

- 两者侧重点不同。
- OC 的 Control UI 更像统一平台控制面。
- SS 的 WebChat 更像“执行工作台”，对 memory/goals/tool governance/subtasks/doctor 的纵深更强。

8. Explainability 与执行证据闭环

- SS 明显更强。
- 原因：当前仓库里已经把 `catalogDefault / effectiveLaunch / delegationReason / resultEnvelope / prompt snapshot / doctor / goals capability / subtasks detail` 收束成统一心智。
- OC 有丰富 runtime/doctor/usage，但当前快照未见同等级针对长期任务与委派链的 explainability 产品面。

9. Onboarding 与面向普通用户的开箱路径

- OC 更强。
- 原因：`openclaw onboard`、向导、平台应用、远程控制文档和脚本都很完整。
- SS 当前仍更适合懂配置与懂本地部署的高级用户。

10. 工程成熟度与演进支撑

- OC 更强。
- 原因：测试矩阵、合约检查、代码生成、基线同步、渠道/插件边界约束都更完整。
- SS 当前更像一个快速进化中的高密度产品仓，工程约束在加强，但还没到 OC 这种平台级规模。

---

## 4. 总结判断

### 4.1 如果从“功能广度”看

OC 明显更强。

原因：

- 渠道数量极多
- 有桌面/移动端 companion apps
- 有设备节点、语音唤醒、Talk Mode
- 有更成熟的 plugin-sdk 与 extension 生态
- 有更完整的 onboarding、remote gateway、运维工具链

它更像一个“全平台个人 AI 助手操作系统”。

### 4.2 如果从“长期执行与治理深度”看

SS 明显更强。

原因：

- 有长期任务/Goal 主线
- 有 capability planning / orchestration / checkpoint / verifier handoff
- 有 resident agent 运行底座与 state scope/memory scope 绑定
- 有 shared review / memory governance / experience usage / methods / facets
- 有比 OC 更成体系的 explainability 与执行证据闭环

它更像一个“本地优先的 Agent 工作台 + 长期任务治理系统”。

### 4.3 如果从“当前更适合做什么”看

OC 更适合：

- 做多渠道助手
- 做多端设备联动
- 做通用个人 AI 产品平台
- 做大规模 provider/channel/plugin 扩展

SS 更适合：

- 做长期任务执行
- 做多 Resident Agent 分工与治理
- 做记忆沉淀、方法论沉淀与经验复用
- 做可解释、可审计、可审批的 Agent 工作流

### 4.4 最终一句话结论

如果把两个项目放在同一坐标里看：

- `OC` 的优势是“平台广度、渠道广度、终端广度、扩展生态广度”
- `SS` 的优势是“长期任务治理深度、记忆治理深度、多 Resident Agent 深度、explainability 深度”

它们并不是简单的同类替代关系，而是：

- OC 更像“全渠道个人助手平台”
- SS 更像“本地优先 Agent 工作台与长期执行治理系统”

如果后续要继续做更细的专项对比，下一轮最值得继续拆的三个专题是：

1. `OC 多渠道/节点体系` vs `SS Resident/Goals/Review 治理体系`
2. `OC plugin-sdk/extensions` vs `SS skills/plugins/MCP/community 工坊`
3. `OC Control UI/WebChat` vs `SS WebChat 工作台`

---

## 5. 再次代码核对后的 SS 借鉴建议清单

### 5.1 评估口径

- 本节不是把 OC 的强项全部照搬，而是只保留“适合 SS 当前路线”的借鉴项。
- 判断依据改为再次阅读代码后的实现级对照，而不是上一节的总览结论重复表述。
- 工作量为静态粗估，默认按熟悉仓库的单人开发估算：
  - `S`：1-3 人日
  - `M`：4-7 人日
  - `L`：8-15 人日
  - `XL`：15+ 人日

### 5.2 优先借鉴项总表

| 优先级 | 借鉴项 | OC 代码依据 | SS 当前基线 | 可行性 | 风险性 | 工作量 | 实现后的作用 | 预期效果 |
|---|---|---|---|---|---|---|---|---|
| P3 | 安装与配置向导 2.0：`QuickStart/Advanced`、风险确认、远程/本地探测、按模块分步配置 | `OC/src/wizard/setup.ts`、`OC/src/commands/onboard.ts` 已具备 `QuickStart` / `Manual`、`accept-risk`、gateway probe、`setupChannels/setupSearch/setupSkills/setupPluginConfig` | `SS/packages/belldandy-core/src/cli/wizard/onboard.ts` 与 `SS/packages/belldandy-core/src/cli/commands/setup.ts` 仍主要覆盖 `openai|mock + host/auth` 的基础向导 | 高 | 低-中 | M | 把首次安装、基础安全确认、后续扩展配置统一到一个入口 | 明显降低上手门槛、误配率和“能跑但不会配”的支持成本，但更适合在核心流程稳定后再收口 |
| P1 | 渠道安全配置产品化：账号级 `dmPolicy/allowFrom/mention` 默认值、配对范围、配置警告 | `OC/extensions/telegram/src/setup-surface.ts`、`OC/src/plugin-sdk/channel-pairing.ts`、`OC/src/channels/mention-gating.ts` 已把 `pairing/allowlist/requireMention` 做成渠道向导与运行时策略 | `SS` 已完成第三版最小落地：新增 `channel-security.json`、`discord/feishu/qq/community` 渠道级 fallback、`channels.<channel>.accounts.<accountId>` 账号级安全覆盖、doctor 风险提示、WebChat 内最小 `pending sender -> allowFrom` 审批链，并补 `channel.security.pending` 实时提醒、设置面内自动刷新与一键跳转审批入口；`community HTTP /api/message` 现也已支持显式 `accountId` 并接入同一套 security fallback；当前完整 setup wizard 与独立 account 管理 UI 仍未做 | 中高 | 中 | M-L | 让 Discord / 飞书 / QQ / community 后续扩张时具备更稳的安全默认值，而不是依赖人工手写规则 | 降低误开放、误路由、群聊噪音与跨渠道鉴权混乱问题 |
| P1 | 统一的渲染感知长消息分段管线 | `OC/src/markdown/render-aware-chunking.ts`、`OC/src/plugin-sdk/reply-chunking.ts` 已把 Markdown/渲染长度限制抽象成通用分段层 | `SS/packages/belldandy-channels/src/discord.ts` 仅对 Discord 2000 字限制做按换行分段，其他渠道未见统一层 | 高 | 低 | S-M | 为所有渠道统一处理 Markdown、代码块、链接和平台消息长度限制 | 明显减少回复截断、代码块断裂、发送失败与跨渠道展示不一致 |
| P2 | Provider 接入插件化升级：向导元数据、模型选择器、能力范围声明 | `OC/src/plugin-sdk/provider-entry.ts`、`OC/src/plugins/provider-wizard.ts` 已把 provider onboarding、model picker、wizard grouping 做成标准入口 | `SS` 已完成 `P2-1 v1` 第一版最小接线：新增独立 provider/model catalog 模块与 `models.list` query-runtime 外移，开始统一返回 `providers/models/currentDefault/manualEntrySupported` 与最小 `providerId/providerLabel/onboardingScopes/authStatus/protocol/wireApi/capabilities`；并已把 `models.json` 在线编辑接入现有 WebChat settings，支持 `[REDACTED]` 保留旧密钥与保存后原地刷新 fallback runtime；当前仍未进入 provider setup wizard 或 plugin-sdk 式 onboarding | 中 | 中 | L | 给后续文本/搜索/语音/图像/视频 provider 扩展提供统一挂载方式 | 减少核心网关被 provider 分支污染，提升后续扩展速度、一致性与可维护性 |
| P3 | 独立 TUI 控制面 | `OC/src/tui/tui.ts` 已支持基于 Gateway 的会话、Agent、Model 切换与流式聊天控制 | `SS/package.json` 与 `SS/packages/belldandy-core/package.json` 当前无独立 `tui` 入口，主要依赖 WebChat 和命令式 CLI | 中 | 中 | M-L | 补齐 SSH / NAS / 无浏览器环境下的轻量控制面 | 提升远程运维和重度 CLI 用户体验，但对 SS 主线收益低于前四项 |

#### 5.2.1 四个功能项的实现级借鉴表

以下表格只对本轮新增核对的 4 个功能项做实现级借鉴评估，不替代上面的总表；重点是判断哪些 OC 的抽象层适合补到 SS 上。

| 功能项 | SS 可借鉴优化 | OC 代码依据 | SS 当前基线 | 可行性 | 风险性 | 工作量 | 收益判断 |
|---|---|---|---|---|---|---|---|
| 模型接入面 | `Provider` 元数据层：把 provider 的认证方式、向导分组、模型白名单、适用能力声明做成注册式描述 | `OC/src/plugin-sdk/provider-entry.ts`、`OC/src/plugins/provider-wizard.ts` 已把 `wizard choice/group/modelAllowlist/onboardingScopes/catalog` 收到统一 provider 入口 | `SS` 已完成 `P2-1 v1` 第一版最小接线：`models.list` 已外移为独立 query-runtime，开始统一输出 provider metadata 与模型目录；并已把 `models.json` 在线编辑接入现有 settings 面，支持最小 JSON 维护、密钥脱敏保留与 runtime 热刷新；当前仍未做到 provider setup wizard、完整 modelAllowlist 产品面或 provider 插件化 onboarding | 中 | 中 | L | 高；这是 SS 当前最明显的产品层缺口，补上后 provider 扩展、模型切换、向导一致性都会明显改善 |
| 模型接入面 | 认证感知的模型选择器：模型列表直接显示 `auth missing`、preferred provider、手动输入回退 | `OC/src/flows/model-picker.ts` 已把认证状态、preferred provider、手动录入、catalog 过滤统一到 picker 流程 | `SS` 已完成 `P2-2` 当前最小增强：WebChat 现有 `modelSelect` 已开始显示 `providerLabel` 与 `auth missing` 提示，并补 `Manual Model...` 入口与 `manual:<model>` override；当前还已补 provider 分组、catalog 过滤、settings 内显式 preferred provider 配置与即时排序刷新，且保持不重构消息发送主链 | 高 | 低 | M | 高；能直接改善配置体验，且不需要先做大规模 provider 平台重构 |
| 模型接入面 | failover 分类细化：把 provider 特定错误、冷却、重试策略做细 | OC failover 已拆成独立策略面，支持更细的错误归类与 fallback 行为 | `SS/packages/belldandy-agent/src/failover-client.ts` 现在主要按 HTTP 状态粗分类 | 中 | 中 | M-L | 中高；能提升稳定性，但优先级低于 provider 元数据层和 model picker |
| 会话模型 | 显式会话作用域策略：`main / per-peer / per-channel-peer / per-account-channel-peer` | `OC/src/routing/session-key.ts` 已把 DM/群聊会话作用域收进 session key 构建规则 | SS 更偏 `resident main conversation + goal/subtask/session` 绑定；`SS/packages/belldandy-channels/src/router/engine.ts` 目前仍以规则路由为主 | 中高 | 中 | M | 高；对 Discord / 飞书 / QQ / community 后续扩展都很有帮助 |
| 会话模型 | “当前会话绑定 / reply-back” 持久层：把外部线程继续回哪个 session 做成显式绑定 | `OC/src/infra/outbound/current-conversation-bindings.ts`、`OC/src/infra/outbound/session-binding-service.ts` 已有 current conversation binding 机制 | `SS` 已持续推进 `P2-4`：新增共享 current conversation binding store，把 `canonical sessionKey -> 当前回复目标` 持久化到独立状态文件，`discord / feishu / qq / community` 已开始更新 binding；`sendProactiveMessage()` 无显式目标时会优先回退到 binding store，且 `feishu / qq / discord` 已不再继续吃 `lastChatId / latestActiveChatId / defaultChannelId / lastChannelId` 这类旧兜底，Discord 的 `defaultChannelId / lastChannelId` 配置与状态面也已退场；`WebChat -> 外部渠道文本外发 v1` 与“记忆查看 -> 外发审计”已完成，且 `heartbeat / cron` 主动投递入口也已开始通过 sender registry 按已有 binding 顺序解析 canonical `sessionKey`，`community leave_room` 的 farewell 主动发送也已开始优先消费当前房间 canonical `sessionKey`，resolve 失败同样会进入外发审计；当前仍未扩展到独立 binding 管理面板或更完整的 reply-back 路由编排 | 中 | 中高 | L | 中高；能提升跨线程、多渠道回复连续性，但实现面比作用域策略更大 |
| 会话模型 | 群聊 key 规范化与旧渠道兼容归一 | `OC/src/config/sessions/group.ts` 对 `group/channel/webchat` 做了统一 key 生成与 legacy 兼容 | SS 目前更侧重 route rule 命中，缺少群聊会话 key 的统一抽象 | 高 | 低 | S-M | 中；是低风险整理项，适合作为会话模型优化的前置收口 |
| 自动化/定时 | Webhook 入站保护层：pre-auth body 限额、超时、并发限制、限流、Content-Type 校验 | `OC/src/plugin-sdk/webhook-request-guards.ts`、`OC/src/plugin-sdk/webhook-ingress.ts` 已把 request guard 做成统一层 | SS 当前主要有 `webhook/auth.ts` Bearer token 校验与 `webhook/idempotency.ts` 内存幂等 | 高 | 低 | S-M | 高；这是本轮 4 个功能项里最值得优先落地的低风险高回报项 |
| 自动化/定时 | Cron job 规范化与约束校验：`sessionTarget`、`delivery`、`failureDestination`、`stagger` | `OC/src/cron/service/jobs.ts` 已把 cron spec 的合法性校验前置化 | SS 当前 `cron/store.ts + cron/scheduler.ts` 比较轻量，更多是执行层而不是约束层 | 高 | 低-中 | M | 高；能减少后续 cron 行为漂移和配置歧义 |
| 自动化/定时 | 统一后台运行台账：把 cron / heartbeat / subtask 放到一个 shared ledger | `OC/src/tasks/task-registry.ts` 已把 background run 做成共享运行台账 | SS 现在 `task-runtime.ts` 更偏 subtask；cron/heartbeat 仍相对分离 | 中 | 中高 | L-XL | 很高；但属于结构性工程，不建议作为第一波优化 |
| 媒体/语音/图像 | 统一媒体能力注册层：TTS / STT / Image / Voice 不再只是分散工具，而是 capability/provider registry | `OC/src/plugin-sdk/realtime-voice.ts`、`OC/src/plugin-sdk/realtime-transcription.ts`、`OC/src/media-understanding/audio-transcription-runner.ts` 已体现统一 provider registry + capability runner | SS 当前 `tts.ts`、`stt-transcribe.ts`、`image.ts`、`camera.ts` 基本还是分散实现 | 中 | 中 | M-L | 高；补齐后可为后续语音、图片、附件理解扩展提供一致入口 |
| 媒体/语音/图像 | 统一附件理解管线：附件归一化、缓存、按 capability 跑识别 | OC 已把附件缓存、provider registry、`audio.transcription` 输出接到共享 runner | SS 当前 STT/TTS/Image 彼此独立，缺少共享附件管线 | 中高 | 中 | M | 高；尤其适合 SS 的审计说明、语音输入、附件处理场景 |
| 媒体/语音/图像 | 相机能力抽象化：把浏览器镜像页方案从工具逻辑中剥离成 runtime/capability | OC 的 voice/media runtime 分层更明确，能力不直接写死在单个工具里 | `SS/packages/belldandy-skills/src/builtin/multimedia/camera.ts` 现在直接依赖 `/mirror.html` 和 browser screenshot | 中 | 中 | M | 中高；能降低浏览器实现细节对工具层的耦合 |

实现级优先顺序建议：

1. `Webhook 入站保护层`
2. `Provider 元数据层 + 认证感知模型选择器`
3. `Cron 约束校验 + stagger`
4. `显式会话作用域策略`
5. `统一媒体能力注册层 / 附件理解管线`

### 5.3 为什么是这个优先级

1. `安装与配置向导 2.0` 不再建议作为当前阶段的第一优先级。

- 这项能力本身仍然有价值，但它更适合作为“已有能力形态基本稳定后的产品化收口项”。
- SS 当前仍处于持续优化和结构调整期，provider、channel、安全默认值、执行链与 WebChat 流程仍可能继续变化。
- 如果现在就把安装与配置向导做成高完成度产品面，后续大概率会因为底层流程变化而返工。
- 更合理的顺序是：先把核心执行链、provider/channel 抽象和安全默认值做稳，再统一回收到向导入口。

2. `渠道安全配置产品化` 应作为第二优先级。

- SS 现在已经有 Channel Router、mentionRequired、pairing/allowlist 基础能力，但粒度偏粗，仍更像“底层积木”，不像 OC 那样形成“渠道级安全默认值 + 向导 + 告警”的产品面。
- 如果后续 SS 继续扩渠道，而没有先补这层，会不断把风险和维护成本转嫁给手工配置。

3. `统一长消息分段` 是低风险高回报项。

- 它不改变 SS 的主架构，也不要求大规模重构。
- 但它会直接改善跨渠道回复质量，尤其是代码块、Markdown 链接、长审计说明、长治理摘要这类 SS 高频输出内容。

4. `Provider 接入插件化升级` 值得做，但不建议第一波就做成 OC 那么大。

- SS 现在已经有插件市场和 `models.json` fallback，所以不是从零开始。
- 更合理的做法是先补 provider onboarding 元数据、model picker、能力范围声明，再逐步演化，不要一口气复制 OC 全量 plugin-sdk 面。

5. `TUI` 有价值，但优先级应低于前四项。

- 它对 SSH / 服务器 / 低带宽环境很友好。
- 但 SS 当前最强的主线仍是 WebChat 工作台和长期任务治理，TUI 更适合作为补强，不应抢占核心能力升级预算。

### 5.4 当前不建议优先借鉴的 OC 能力

以下 OC 能力虽然强，但当前不建议作为 SS 的优先优化方向：

1. `Companion Apps / Device Nodes / Voice Wake`

- 对应 OC 的 `apps/macos`、`apps/ios`、`apps/android`、`voice-call`、device bootstrap 体系。
- 这类能力工作量通常是 `XL`，并且会把 SS 从“本地 Agent 工作台”拉向“全端个人助手平台”。
- 在 SS 还没有先补齐 setup、安全配置产品化、provider/channel 扩展抽象前，投入产出比偏低。

2. `渠道数量竞赛`

- OC 的优势之一是渠道覆盖极广，但 SS 当前最强的是 Goals / Resident / Review / Memory / Explainability 深度。
- 直接追求“渠道数接近 OC”容易稀释主线，也会显著增加运维、鉴权、分发与回归成本。
- 更合理的路线是：先把“渠道接入框架 + 安全默认值 + 回复分段”做稳，再挑高价值渠道扩。

3. `一次性复制 OC 全量 plugin-sdk / extension 平台`

- OC 的 plugin-sdk 和 contract/test/lint 边界是长期平台化演进结果。
- SS 当前更适合先抽最关键的两层：
  - provider onboarding / model picker 元数据
  - channel setup / pairing / allowlist / chunking 统一接口
- 这类工作更适合 `split_task`，不适合一次性做“大平台重构”。

### 5.5 最终建议

如果只按“对 SS 当前路线最有帮助，且考虑当前仍在优化调整期”来排，我建议的落地顺序是：

1. `渠道安全配置产品化`
2. `统一的渲染感知长消息分段`
3. `Provider 接入插件化升级`
4. `安装与配置向导 2.0`
5. `独立 TUI 控制面`

其中最值得尽快落地的，不是 OC 的多端节点或渠道数量，而是 OC 那套更成熟的：

- `安全默认值`
- `扩展抽象`
- `回复分发细节`

而 `上手路径 / 安装向导` 更适合在这一轮核心优化基本收敛后，再作为集中产品化工作来做。

这些能力补到 SS 上，不会冲淡 SS 的 Goals / Resident / Review 主线，反而会让 SS 现有强项更容易被真正稳定地用起来。

## 6. 开发规则

1. 每完成一项优化后，要进行 `OC与SS的系统功能对比.md` 的进度更新与后续计划说明，并要在 `2. 实现功能对比例表` 上进行已优化项的精简说明，以便后续查阅已实现的优化项。

2. 通用技术债规避要求

- 当某个代码文件已经超过 `3000` 行时，新增功能应优先考虑放到外部新文件，只在原文件保留最小接线、注册、转发或装配逻辑。
- 除非是确实无法避免的局部修补，否则尽量不要再把新的主体逻辑继续写进已经超过 `3000` 行的文件。
- 这条要求的目的很直接：
  - 先阻止大文件继续恶化
  - 让后续拆分从被动大重构变成新增功能自然外移

3. Webchat 复杂度控制

- 当前 `webchat` 的结构和内容已经较复杂，新增功能时必须克制 UI 膨胀。
- 非重要的新增内容，不要默认继续在 `webchat` 上增加新元素。
- 能减少的非重要内容应优先减少；能并入同类或近似模块的内容，应优先并入，而不是新增并列入口、并列面板或并列控件。
- 如果某项信息主要服务诊断、审计或调试，应优先复用已有区域，例如 `doctor`、长期任务详情、子任务详情、现有设置面板或已有二级弹窗，而不是新增一级导航入口。
