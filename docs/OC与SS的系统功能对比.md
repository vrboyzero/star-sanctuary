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
| 多 Agent / 多 Profile | 有 multi-agent routing、按渠道/peer 隔离 agent | 有 Agent Registry、多 Agent Profile、Resident Agent、子任务/委派链 | 支持不同 agent 人格、权限和工作区隔离 | 两者都有；SS 在 resident 状态/记忆/治理链上更深 |

### 2.4 会话、Resident Agent 与协同执行

| 功能子项 | OC 实现 | SS 实现 | 功能作用简述 | 对比判断 |
|---|---|---|---|---|
| 会话模型 | 有 main/group/isolation/queue/reply-back，会话模型成熟 | 有 session 持久化、resident 主通道、goal/subtask/session 绑定 | 管理直接聊天、群聊和任务上下文边界 | 两者都有；OC 更适配多渠道会话产品，SS 更适配任务型会话 |
| Agent-to-Agent / Session 协同 | 有 `sessions_list / sessions_history / sessions_send` | 有 `delegate_task / delegate_parallel / subtasks / result envelope / verifier handoff` | 跨 agent 协作与交接 | OC 更像会话级互发；SS 更像结构化委派与收束 |
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
| MCP | 有 `src/mcp` 与相关扩展 | 有 `belldandy-mcp`，WebChat/doctor/tool settings 已打通 | 外接工具/资源与标准协议集成 | 两者都有 |
| 渠道/Provider 扩展包 | `extensions/` 下 provider/channel/speech/memory/browser 等大规模拆包 | SS 主要是 monorepo 内部 package + 少量插件扩展 | 扩展能力的工程边界与生态化程度 | OC 明显更强 |

### 2.11 安全、权限、诊断与观测

| 功能子项 | OC 实现 | SS 实现 | 功能作用简述 | 对比判断 |
|---|---|---|---|---|
| 配对/Allowlist/DM 安全默认值 | 很强，README 明确 DM pairing、allowlist、doctor 风险提示 | 有 pairing、allowlist、浏览器/社区/WebChat 配对与鉴权 | 降低未授权接入风险 | OC 更成熟，SS 也有实装 |
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
