# LangAlpha 与 Star Sanctuary 系统功能对比

## 目的

本文基于 `E:\project\star-sanctuary\tmp\LangAlpha-main` 的当前代码实现，对比 Star Sanctuary 当前仓库能力，重点评估以下 6 类能力：

1. 渐进式工具发现
2. 程序化工具调用（PTC）
3. 持久工作区
4. 代理群
5. 实时导航
6. 中间件堆栈
7. 安全与工作区保险库

结论只基于当前代码与配置，不基于宣传文案推断。

## 主要结论

| 能力 | LangAlpha | Star Sanctuary | 借鉴优先级 |
|---|---|---|---|
| 渐进式工具发现 | 已形成完整链路 | 具备部分能力 | 高 |
| 程序化工具调用（PTC） | 是核心架构能力 | 目前不是核心范式 | 高 |
| 持久工作区 | 强，且和专属沙箱强绑定 | 强，但偏本地文件工作区 | 中 |
| 代理群 | 强，且支持中途 steering / resume | 已有并行子任务，但弱于 LangAlpha | 高 |
| 实时导航 | 强 | 目前偏 resume，不是 mid-run steering | 高 |
| 中间件堆栈 | 强，且高度集中 | 有类似横切能力，但实现更分散 | 中 |
| 安全与工作区保险库 | 强，且围绕沙箱/密钥隔离设计 | 有治理和防泄漏，但缺少 workspace vault | 中 |

---

## 1. 渐进式工具发现

### LangAlpha 的实现

LangAlpha 这部分不是一句“工具按需发现”，而是完整的三段式设计：

1. Prompt 中只注入 MCP 摘要，而不是完整工具签名。
   - `src/ptc_agent/agent/prompts/formatter.py`
   - `src/ptc_agent/agent/prompts/templates/components/tool_guide.md.j2`
   - `src/ptc_agent/agent/agent.py`

2. 完整 MCP 文档和 Python wrapper 被生成到工作区。
   - `src/ptc_agent/core/sandbox/ptc_sandbox.py`
   - 关键行为：
     - 生成 `tools/{server}.py`
     - 生成 `tools/docs/{server}/{tool}.md`
     - Prompt 只告诉模型去 `Glob("tools/docs/...")` 和 `Read(...)` 再决定怎么用

3. Skill 侧做了真正的“隐藏工具面”控制。
   - `src/ptc_agent/agent/middleware/skills/middleware.py`
   - `src/ptc_agent/agent/middleware/skills/registry.py`
   - `src/ptc_agent/agent/middleware/skills/discovery.py`
   - 关键点：
     - skill 工具全部预注册，但 `awrap_model_call()` 会按已加载 skill 过滤工具可见性
     - PTC 模式下读取 `SKILL.md` 会自动激活 skill
     - Flash 模式下通过 `LoadSkill` 激活
     - hidden skill 不出现在列表里，只能被额外上下文或程序化方式激活
     - 还做了 `skills-lock.json` / `known_skills` / `skills_manifest`，避免每次都重新下载 `SKILL.md`

### Star Sanctuary 的现状

Star Sanctuary 已经有“按需发现 skill”的一部分能力，但链路和 LangAlpha 不一样：

1. MCP 工具是直接桥接到工具系统里的，不是先生成到工作区再让代理去读文档。
   - `packages/belldandy-mcp/src/tool-bridge.ts`
   - 当前做法是把 MCP 工具直接变成 Belldandy tool，Agent 直接可调

2. Skill 已有“部分直接注入 + 其余走搜索”的设计。
   - `packages/belldandy-agent/src/system-prompt.ts`
   - `packages/belldandy-skills/src/skill-registry.ts`
   - `packages/belldandy-skills/src/builtin/skills-tool.ts`
   - 当前机制：
     - `always/high` priority skill 会直接注入 prompt
     - 其余 eligible skill 走 `skills_search` / `skill_get`

3. 运行时可以全局禁用 builtin / MCP / plugin / skill。
   - `packages/belldandy-core/src/tools-config.ts`

### 差异判断

Star Sanctuary 已有“按需发现 skill”，但还没有 LangAlpha 这种更完整的组合：

- 没有把 MCP 工具摘要和完整文档分层暴露给代理
- 没有把 MCP server 自动生成成本地 SDK / wrapper 文件供代码执行直接 import
- 没有“skill 激活后才显示对应隐藏工具集”的机制

### 可借鉴项

建议优先借鉴两层：

1. `高优先级`
   为 MCP 增加“摘要进 prompt + 完整文档落工作区”的双层暴露方式。
   这会显著降低大工具集对上下文的污染。

2. `高优先级`
   为高复杂度或高风险工具增加“skill 绑定后才可见”的 tool gating。
   特别适合 office / automation / browser / long-goal 等复杂工具簇。

3. `中优先级`
   给 skill 增加 manifest / lock / eligibility cache，减少每轮都把技能正文塞进 prompt。

---

## 2. 程序化工具调用（PTC）

### LangAlpha 的实现

LangAlpha 的 PTC 不是普通 code interpreter，而是“让代理用 Python 操作 MCP 工具”：

- `src/ptc_agent/agent/tools/code_execution.py`
- `src/ptc_agent/agent/prompts/templates/components/tool_guide.md.j2`
- `src/ptc_agent/core/sandbox/ptc_sandbox.py`

关键链路：

1. Agent 调 `ExecuteCode`
2. Python 代码里直接 `from tools.{server} import {tool}`
3. 批量取 MCP 原始数据
4. 在沙箱里做清洗、计算、画图、建模
5. 只把摘要和产物路径回传给 LLM

配套还有：

- `CodeValidationMiddleware` 防止代码直接碰 `_internal/`、`.mcp_tokens`、`.vault_secrets`
- `LeakDetectionMiddleware` 在工具输出进入 LLM 前做脱敏
- `SummarizationMiddleware` 和大结果淘汰，避免把长输出直接塞回上下文

这使得 LangAlpha 适合金融时序、多 ticker、多步骤量化分析。

### Star Sanctuary 的现状

Star Sanctuary 目前有代码执行能力，但不是 LangAlpha 这种 PTC 架构：

1. 有通用代码解释器。
   - `packages/belldandy-skills/src/builtin/code-interpreter/index.ts`

2. 有更底层的命令执行工具。
   - `packages/belldandy-skills/src/builtin/system/exec.ts`

3. MCP 长结果会做持久化或截断，避免一次性塞爆上下文。
   - `packages/belldandy-mcp/src/client.ts`
   - `packages/belldandy-mcp/src/manager.ts`

但当前缺口也很明确：

- MCP 工具仍是“直接工具调用”范式，不是“代码里 import MCP wrapper”
- `code_interpreter` 目前是通用 Python/JS 运行器，不天然知道 MCP schema
- 没有形成“原始数据落工作目录，LLM 只看摘要”的标准数据处理工作流

### 差异判断

Star Sanctuary 有代码执行能力，但还没有把它升级成“MCP 数据编排层”。

也就是说：

- 当前能“执行代码”
- 也能“调用 MCP”
- 但还不能像 LangAlpha 一样，让代理稳定地把这两者组合成一个低 token、高数据密度的分析范式

### 可借鉴项

建议这是 Star Sanctuary 最值得借鉴的能力之一：

1. `高优先级`
   基于 MCP schema 生成可供 `code_interpreter` 使用的本地 SDK / wrapper。

2. `高优先级`
   建立统一约定：
   - 原始数据写入工作区文件
   - 代码做处理
   - 模型只接收摘要、统计和产物路径

3. `中优先级`
   为数据类 skill 预置 PTC 模板，例如：
   - 批量财务数据拉取
   - 多股票比较
   - 图表生成
   - 回归 / 估值 / 指标计算

这是 Star Sanctuary 从“会调工具”升级到“会做复杂分析流水线”的关键一步。

---

## 3. 持久工作区

### LangAlpha 的实现

LangAlpha 的工作区是“DB workspace + 专属 sandbox + agent.md”的组合体：

- `src/server/services/workspace_manager.py`
- `src/ptc_agent/core/sandbox/ptc_sandbox.py`
- `src/ptc_agent/agent/prompts/templates/components/workspace_paths.md.j2`
- `src/ptc_agent/agent/prompts/templates/components/workspace_context.md.j2`

关键点：

1. 每个 workspace 都对应一个 `sandbox_id`
2. 创建 workspace 时就初始化专属沙箱，并写入 `agent.md`
3. 停止后可以按 `sandbox_id` 恢复，同一工作区上下文持续存在
4. `agent.md` 被定义为跨线程长期上下文，要求代理持续维护
5. 工作区目录结构也是被 prompt 明确规范的

### Star Sanctuary 的现状

Star Sanctuary 的持久工作区是强项，但设计哲学不同：

- `packages/belldandy-agent/src/workspace.ts`
- `packages/belldandy-agent/src/system-prompt.ts`
- `packages/belldandy-agent/src/agent-profile.ts`

当前特征：

1. 自动维护核心工作区文件：
   - `AGENTS.md`
   - `SOUL.md`
   - `IDENTITY.md`
   - `USER.md`
   - `TOOLS.md`
   - `HEARTBEAT.md`
   - `MEMORY.md`

2. 支持 `agents/{workspaceDir}` 子工作区
3. Agent profile 自带 `workspaceDir` / `memoryMode` / `handoffStyle`
4. 整体更偏本地文件工作区和本地长期记忆，而不是“远程专属沙箱”

### 差异判断

两者都重视持久工作区，但重点不同：

- LangAlpha：工作区 = 研究沙箱 + 会话恢复 + `agent.md`
- Star Sanctuary：工作区 = 本地人格/规则/记忆文件系统 + 多 Agent 子工作区

Star Sanctuary 在“本地长期人格与记忆”上更重，LangAlpha 在“研究型沙箱工作区”上更重。

### 可借鉴项

1. `中优先级`
   可考虑补一个轻量 `agent.md` 或等价“研究索引文件”，专门承担：
   - 线程索引
   - 研究产物索引
   - 可复用脚本索引

2. `低到中优先级`
   不建议直接照搬“每 workspace 一个远程沙箱”。
   Star Sanctuary 当前是 local-first 架构，强行引入会明显改变系统重心。

更合理的借鉴方式是：

- 保留现有本地工作区体系
- 增加“研究型 task index / artifact index”
- 让多 Agent / 长任务更容易复盘和承接

---

## 4. 代理群

### LangAlpha 的实现

LangAlpha 的子代理系统非常完整：

- `src/ptc_agent/agent/middleware/background_subagent/middleware.py`
- `src/ptc_agent/agent/middleware/background_subagent/registry.py`
- `src/ptc_agent/agent/middleware/background_subagent/subagent.py`
- `src/ptc_agent/agent/middleware/background_subagent/orchestrator.py`
- `src/ptc_agent/agent/subagents/compiler.py`
- `docs/api/10-chat/subagent-status.yml`

关键特征：

1. 子代理有隔离的 context 和 `checkpoint_ns`
2. 可以后台并行运行
3. 可以 `update` 正在运行的任务
4. 可以 `resume` 已完成任务，并从 checkpoint 接着干
5. 前端能看到子代理实时状态和工具调用进度
6. 子代理可预编译不同工具集和角色 prompt

这已经不是“简单并发调用”，而是接近真正的 agent swarm runtime。

### Star Sanctuary 的现状

Star Sanctuary 已经有较强的并行委派基础：

- `packages/belldandy-skills/src/builtin/session/delegate.ts`
- `packages/belldandy-skills/src/builtin/session/delegate-parallel.ts`
- `packages/belldandy-core/src/task-runtime.ts`
- `packages/belldandy-core/src/worktree-runtime.ts`
- `apps/web/public/app/features/subtasks-overview.js`

当前已有能力：

1. `delegate_task` / `delegate_parallel`
2. 子任务运行时注册表与状态存储
3. 子任务输出、通知、stop/archive
4. 子任务可选 worktree 隔离
5. UI 有专门的 subtasks 面板

### 差异判断

Star Sanctuary 已有“并行子任务编排”，但比 LangAlpha 少三块关键能力：

1. 运行中的子任务 steering
2. 基于 checkpoint 的 resume / continuation
3. 子代理级上下文恢复与长生命周期管理

所以当前 Star Sanctuary 更像：

- 有子任务 runtime
- 有状态面板
- 有工作树隔离

但还不是 LangAlpha 那种“长期可交互的后台子代理群”。

### 可借鉴项

1. `高优先级`
   为 subtask 增加 `update/resume` 语义，而不是只有 spawn/stop/archive。

2. `高优先级`
   为子任务建立独立 continuation state，至少要支持：
   - 上次摘要
   - 当前阶段
   - 可恢复输入

3. `中优先级`
   把“角色 + 技能 + 工具族 + handoff 风格”进一步固化到子任务模板里，减少委派质量波动。

4. `中优先级`
   对长任务 / goal runtime 和 subtask runtime 做更强耦合，让子任务成为长期任务图的一等执行单元。

---

## 5. 实时导航

### LangAlpha 的实现

LangAlpha 在“运行中纠偏”这件事上做得很深：

- `src/ptc_agent/agent/middleware/steering.py`
- `src/ptc_agent/agent/middleware/background_subagent/steering.py`
- `src/server/app/threads.py`
- `docs/api/20-workflow/soft-interrupt.yml`
- `web/src/pages/ChatAgent/hooks/useChatMessages.ts`

关键能力：

1. 主代理支持 soft interrupt
2. 运行中可以发 steering message
3. 子代理也能在运行中接收 follow-up instruction
4. 前端明确区分 steering message 与正常 turn
5. 如果 steering 没被消费，还能回填到输入框

### Star Sanctuary 的现状

Star Sanctuary 目前更偏“恢复”和“切换通道”，不是 LangAlpha 这种 mid-run steering：

- `packages/belldandy-core/src/goals/manager.ts`
- `packages/belldandy-skills/src/builtin/goals/goal-resume.ts`
- `apps/web/public/app/features/goals-detail.js`
- `apps/web/public/app/features/subtasks-overview.js`

当前已具备：

1. 长期任务 goal 可 resume
2. 可恢复到 goal channel / node channel
3. 子任务可查看、停止、归档

但我没有在当前仓库里看到与 LangAlpha 等价的这类能力：

- 给“正在运行的主代理”发送 mid-run follow-up
- 给“正在运行的子任务”发送 mid-run follow-up
- 同一运行内接收 steering 并继续向前

### 差异判断

Star Sanctuary 目前偏：

- 任务切换
- 任务恢复
- 任务观察

而 LangAlpha 还多了一层：

- 任务执行中的即时纠偏

### 可借鉴项

1. `高优先级`
   给长任务和 subtask 增加 steering channel。

2. `高优先级`
   WebChat 若要承接更长时长、更强 agentic 任务，这项能力非常关键。
   否则用户每次纠偏都只能“停掉重来”或“等这一轮结束”。

3. `中优先级`
   若不想先做完整 checkpoint resume，至少先做：
   - mid-run follow-up queue
   - safe-point interrupt
   - task-level accepted/delivered UI

---

## 6. 中间件堆栈

### LangAlpha 的实现

LangAlpha 这部分非常工程化：

- `src/ptc_agent/agent/agent.py`
- `README.md`

代码里能看到它把横切逻辑集中放进 middleware stack：

- tool argument parsing
- protected path
- code validation
- tool error handling
- leak detection
- tool result normalization
- file/todo SSE
- multimodal
- skills
- steering
- background subagent
- HITL
- plan mode
- ask user
- summarization
- model resilience
- prompt caching
- patch tool calls
- workspace context
- runtime context

README 里称为 24 层，代码里也确实体现出“顺序化、可组合的横切治理”。

### Star Sanctuary 的现状

Star Sanctuary 也有大量横切能力，但分布更散：

- prompt section injection：`packages/belldandy-agent/src/system-prompt.ts`
- 对话压缩：`packages/belldandy-agent/src/compaction.ts`
- tool governance / runtime policy：`packages/belldandy-skills/src/runtime-policy.ts`
- MCP result persistence：`packages/belldandy-mcp/src/client.ts`
- extension / plugin / skills：`packages/belldandy-core/src/extension-host.ts`
- memory / shared-memory guard：`packages/belldandy-memory/src/team-memory.ts`

### 差异判断

Star Sanctuary 并不缺这些能力本身，缺的是一个更统一的“中间件式执行面”。

LangAlpha 的好处是：

- 横切逻辑集中
- 执行顺序稳定
- 易于为主代理和子代理复用

Star Sanctuary 当前的问题是：

- 能力多，但落点分散
- 新增横切规则时，容易在 gateway / skill / memory / prompt 多处补丁式插入

### 可借鉴项

1. `中优先级`
   不一定要照搬 LangChain middleware，但建议抽象出更统一的 execution pipeline。

2. `中优先级`
   优先把这些横切能力收敛到统一顺序层：
   - tool governance
   - result truncation / persistence
   - secret redaction
   - context injection
   - compaction
   - subtask / goal orchestration hooks

3. `低优先级`
   如果近期重点仍是功能交付，而不是 agent runtime 重构，这项可以后置。

---

## 7. 安全与工作区保险库

### LangAlpha 的实现

LangAlpha 的安全链条比较完整：

- `migrations/versions/001_initial_schema.py`
- `migrations/versions/003_add_vault_secrets.py`
- `src/server/database/vault_secrets.py`
- `src/ptc_agent/core/sandbox/vault_helper.py`
- `src/ptc_agent/core/sandbox/ptc_sandbox.py`
- `src/ptc_agent/agent/middleware/tool/leak_detection.py`
- `src/ptc_agent/agent/middleware/tool/code_validation.py`
- `src/server/utils/secret_redactor.py`

关键点：

1. DB 侧用 `pgcrypto` 做静态加密
2. 每个 workspace 有独立 vault secrets
3. secret 会被同步到 sandbox 内部 helper
4. tool output 进入 LLM 前会被 leak detection 脱敏
5. workspace 文件下载/预览也会做 redaction
6. 代码执行层禁止访问内部 token / vault 文件

### Star Sanctuary 的现状

Star Sanctuary 的安全更多体现在本地治理和路径约束上：

- `packages/belldandy-skills/src/builtin/system/exec.ts`
- `packages/belldandy-skills/src/tool-contract-v2-profiles.ts`
- `packages/belldandy-memory/src/team-memory.ts`
- `packages/belldandy-core/src/tools-config.ts`
- `packages/belldandy-core/src/server.ts`

当前已有：

1. 工具契约、风险等级、权限模式
2. exec safelist / blocklist / 路径保护
3. team shared memory 的 secret guard
4. 配置与部分输出的脱敏/隐藏

但和 LangAlpha 相比，缺少的是：

- per-workspace encrypted vault
- vault 到执行环境的标准注入接口
- workspace 级 secret 生命周期管理

### 差异判断

Star Sanctuary 当前安全重点是：

- 本地执行约束
- 共享记忆防泄漏
- 工具治理

LangAlpha 当前安全重点是：

- 远程/沙箱执行中的 secret 生命周期与隔离

### 可借鉴项

1. `中优先级`
   如果未来 Star Sanctuary 会增强远程执行、浏览器代理托管、团队协作或多工作区隔离，建议补 workspace vault 抽象。

2. `中优先级`
   即便暂时不做 DB 加密，也可以先统一 secret provider 接口，让工具和子任务不要直接依赖 `.env`。

3. `低优先级`
   对 purely local-first 的默认场景，不必急着引入 LangAlpha 那套完整 vault 复杂度。

---

## 对 Star Sanctuary 的整体评估

### 已经具备且不弱的部分

Star Sanctuary 在这些方向已经有自己的体系，不是明显落后：

- 本地长期工作区文件体系
- 多 Agent profile / agents 子工作区
- 子任务 runtime 与 worktree 隔离
- 三层对话压缩
- runtime tool governance
- 技能库检索与方法库检索
- MCP 结果持久化 / 截断治理

### 明显值得借鉴的部分

最值得借鉴的是这 4 项：

1. 渐进式 MCP 工具发现
2. PTC：代码层直接调用 MCP wrapper
3. 子代理 mid-run steering + resume
4. 子代理 / 长任务 continuation runtime

### 不建议直接照搬的部分

以下能力不建议原样迁移：

1. 每 workspace 一个远程沙箱
   - Star Sanctuary 当前是 local-first
   - 硬搬会引入架构重心变化和运维复杂度

2. `agent.md` 替代现有工作区文件
   - Star Sanctuary 已有 `AGENTS.md` / `TOOLS.md` / `MEMORY.md` / `SOUL.md`
   - 更合理的是补“研究索引层”，不是替换现有文件体系

---

## 建议的落地顺序

### 第一阶段：高价值、低架构冲击

1. 为 MCP 增加“摘要注入 + 完整文档按需读取”能力
2. 为复杂 skill 增加“激活后才暴露工具”的 gating
3. 给数据类场景补 PTC wrapper 生成能力

### 第二阶段：强化子任务系统

1. 给 subtask 增加 `update/resume`
2. 给 WebChat 增加运行中 steering
3. 把 long-goal / subtask / resident agent 的上下文恢复链打通

### 第三阶段：统一横切执行面

1. 收敛 context / compaction / tool governance / persistence / secret guard
2. 建立更一致的 runtime pipeline

---

## 最终判断

LangAlpha 的优势不在“功能点更多”，而在于它把以下几件事做成了闭环：

- MCP 工具不是直接堆给 LLM，而是分层暴露
- 代码执行不是附属能力，而是数据处理主路径
- 子代理不是一次性 spawn，而是可观测、可恢复、可纠偏
- 沙箱、工作区、checkpoint、vault 彼此联动

Star Sanctuary 当前更强的是：

- 本地优先工作区体系
- Agent persona / workspace 文档系统
- 工具治理与长期任务体系

如果从“可借鉴价值 / 与现有架构兼容性 / 产出收益”综合排序，我建议优先吸收 LangAlpha 的是：

1. 渐进式工具发现
2. PTC
3. 子任务 steering / resume
4. continuation-oriented subtask runtime

这四项最有机会在不推翻 Star Sanctuary 现有 local-first 架构的前提下，显著提高复杂任务执行质量。
