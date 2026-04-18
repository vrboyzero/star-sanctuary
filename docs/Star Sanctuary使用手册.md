# Star Sanctuary 使用手册

本手册是当前版本的实用说明，重点覆盖：

- Agent 的配置与使用
- 工具系统与 MCP 的配置与使用
- Agent Teams 的配置、进入条件、触发方式与观测方法

如果你要看更细的专项文档，建议同时参考：

- [agents.json配置说明.md](./agents.json%E9%85%8D%E7%BD%AE%E8%AF%B4%E6%98%8E.md)
- [工具分级指南.md](./%E5%B7%A5%E5%85%B7%E5%88%86%E7%BA%A7%E6%8C%87%E5%8D%97.md)
- [Agent工具调用与Agent指挥调用提示词机制.md](./Agent%E5%B7%A5%E5%85%B7%E8%B0%83%E7%94%A8%E4%B8%8EAgent%E6%8C%87%E6%8C%A5%E8%B0%83%E7%94%A8%E6%8F%90%E7%A4%BA%E8%AF%8D%E6%9C%BA%E5%88%B6.md)
- [长期任务使用指南.md](./%E9%95%BF%E6%9C%9F%E4%BB%BB%E5%8A%A1%E4%BD%BF%E7%94%A8%E6%8C%87%E5%8D%97.md)

---

## 1. 先理解几个核心概念

### 1.1 Agent 是什么

在 Star Sanctuary 里，Agent 是一个有独立配置边界的运行单元。一个 Agent 可以拥有：

- 独立的模型配置
- 独立的角色倾向
- 独立的工具权限边界
- 独立的工作区文件覆盖
- 独立的身份标签与 authority profile

常见的 Agent 角色分工：

- `default`
  - 通用主 Agent
  - 最适合做日常对话和 manager
- `coder`
  - 实现、修复、重构、补测试
- `researcher`
  - 调研、搜索、归纳资料
- `verifier`
  - 审查、验证、找问题、做 fan-in review

### 1.2 工具是什么

工具是 Agent 的执行能力，解决的是“能不能做”。

当前常见工具来源：

- Builtin tools
  - 文件读写、补丁、命令、日志、记忆、委派等
- MCP tools
  - 通过 `mcp.json` 接入的外部标准工具
- Plugin tools
  - 插件注册的工具

要特别区分：

- 工具：解决“做什么”
- 技能：解决“怎么做更好”

技能不是执行器，而是提示词化的经验与 SOP。

### 1.3 Agent Teams 是什么

Agent Teams 不是一个单独的“按钮模式”，而是一种运行态协作状态。

当当前会话中的主 Agent 开始：

- 委派子 Agent
- 并行拆分多个 lane
- 对多个 lane 做 handoff、fan-in、completion gate

系统就会进入 Team-aware 的工作方式。

最重要的一点：

- 没有单独的 “Agent Teams 开关”
- Agent Teams 是通过多 Agent 配置 + 工具可用 + 委派行为触发出来的

---

## 2. 配置文件在哪里

### 2.1 先确认当前配置目录

Star Sanctuary 当前使用“实际 envDir”加载配置。

你可以先执行：

```bash
corepack pnpm bdd config path
corepack pnpm bdd doctor
```

一般你最常用的几个位置是：

- 当前实际 `envDir/.env.local`
  - 运行时环境变量
- `~/.star_sanctuary/agents.json`
  - 多 Agent Profile
- `~/.star_sanctuary/models.json`
  - 模型目录
- `~/.star_sanctuary/mcp.json`
  - MCP 服务器配置
- `~/.star_sanctuary/`
  - 根工作区文件，如 `SOUL.md`、`IDENTITY.md`、`USER.md`、`AGENTS.md`、`TOOLS.md`、`MEMORY.md`
- `~/.star_sanctuary/agents/<agentId>/`
  - 各 Agent 的专属工作区覆盖文件

### 2.2 修改后何时生效

大多数和 Agent / 工具 / Team 相关的配置，修改后都建议重启 Gateway。

尤其是：

- `agents.json`
- `models.json`
- `mcp.json`
- Agent 专属工作区文件
- `IDENTITY.md`

---

## 3. Agent 配置与使用

### 3.1 最小前置条件

如果你想开始使用多 Agent，最低建议有这些配置：

```env
BELLDANDY_TOOLS_ENABLED=true
```

如果你还要让 Agent 使用 MCP：

```env
BELLDANDY_TOOLS_ENABLED=true
BELLDANDY_MCP_ENABLED=true
```

如果你想让多 Agent 有共享记忆前置条件：

```env
BELLDANDY_TEAM_SHARED_MEMORY_ENABLED=true
```

说明：

- `BELLDANDY_TOOLS_ENABLED=true` 是 Agent 委派、MCP、很多执行能力的前提
- `BELLDANDY_TEAM_SHARED_MEMORY_ENABLED=true` 不是 Team 模式的硬前提，但对长期协作很有帮助

### 3.2 `agents.json` 的推荐最小配置

推荐至少准备一个 manager 和两个以上专项 Agent。

示例：

```json
{
  "agents": [
    {
      "id": "default",
      "displayName": "Belldandy",
      "model": "primary",
      "kind": "resident",
      "memoryMode": "hybrid",
      "defaultRole": "default",
      "toolsEnabled": true
    },
    {
      "id": "coder",
      "displayName": "代码专家",
      "model": "primary",
      "kind": "resident",
      "workspaceDir": "coder",
      "memoryMode": "hybrid",
      "defaultRole": "coder",
      "defaultPermissionMode": "confirm",
      "defaultAllowedToolFamilies": [
        "workspace-read",
        "workspace-write",
        "patch",
        "command-exec",
        "memory"
      ],
      "defaultMaxToolRiskLevel": "high",
      "toolsEnabled": true
    },
    {
      "id": "researcher",
      "displayName": "调研助手",
      "model": "primary",
      "kind": "resident",
      "workspaceDir": "researcher",
      "memoryMode": "hybrid",
      "defaultRole": "researcher",
      "defaultPermissionMode": "plan",
      "defaultAllowedToolFamilies": [
        "network-read",
        "workspace-read",
        "browser",
        "memory"
      ],
      "defaultMaxToolRiskLevel": "medium",
      "toolsEnabled": true
    },
    {
      "id": "verifier",
      "displayName": "验证审查员",
      "model": "primary",
      "kind": "resident",
      "workspaceDir": "verifier",
      "memoryMode": "hybrid",
      "defaultRole": "verifier",
      "defaultPermissionMode": "confirm",
      "defaultAllowedToolFamilies": [
        "workspace-read",
        "command-exec",
        "browser",
        "memory"
      ],
      "defaultMaxToolRiskLevel": "high",
      "toolsEnabled": true
    }
  ]
}
```

### 3.3 关键字段怎么理解

最常用字段如下：

- `id`
  - Agent 唯一 ID
- `displayName`
  - 在 UI 和日志里显示的名称
- `model`
  - `primary` 表示走主模型
  - 也可以引用 `models.json` 里的模型 ID
- `kind`
  - `resident`：适合直接在 WebChat 中切换和使用
  - `worker`：更偏委派子 Agent，不一定需要作为主对话入口
- `workspaceDir`
  - Agent 专属工作区目录名
- `memoryMode`
  - 常用 `hybrid`
- `defaultRole`
  - 建议值：`default / coder / researcher / verifier`
- `defaultPermissionMode`
  - 建议用来约束该 Agent 的默认执行风格
- `defaultAllowedToolFamilies`
  - 用工具族控制能力面，而不是给所有工具
- `defaultMaxToolRiskLevel`
  - 控制该 Agent 默认能碰到多高风险的工具
- `toolsEnabled`
  - Agent 层是否允许使用工具
- `toolWhitelist`
  - 按工具名进一步收缩

### 3.4 Agent 专属工作区

推荐结构：

```text
~/.star_sanctuary/
├── SOUL.md
├── IDENTITY.md
├── USER.md
├── AGENTS.md
├── TOOLS.md
├── MEMORY.md
└── agents/
    ├── coder/
    │   ├── SOUL.md
    │   ├── IDENTITY.md
    │   └── AGENTS.md
    ├── researcher/
    │   ├── SOUL.md
    │   └── IDENTITY.md
    └── verifier/
        ├── SOUL.md
        └── IDENTITY.md
```

继承规则：

- 非 `default` Agent 优先读取自己的 `agents/<workspaceDir>/` 文件
- 如果该文件不存在，则自动回退到根工作区同名文件

因此很适合这样用：

- 根目录保留共用人格、共用守则、共用用户信息
- `coder` 只覆盖工程相关提示
- `researcher` 只覆盖检索风格
- `verifier` 只覆盖审查与验证风格

### 3.5 在 WebChat 中如何使用 Agent

常见用法：

- 在顶部 Agent 选择器里切换当前对话使用的 Agent
- 把 `default` 当主入口 Agent
- 让 `default` 决定是否要再委派给 `coder / researcher / verifier`

推荐使用方式：

- 日常对话、复杂任务入口：`default`
- 你明确知道任务只属于某个角色：可直接切到 `coder` 或 `researcher`

---

## 4. 工具系统：怎么配置、怎么用

### 4.1 工具系统的启用前提

最低需要：

```env
BELLDANDY_TOOLS_ENABLED=true
```

如果全局工具系统关闭：

- Agent 不会真正进入完整的执行态
- 委派工具不可用
- MCP 工具也不会形成有效执行面

### 4.2 工具权限是怎么决定的

一个工具是否真正可见、可执行，通常要同时通过这几层：

1. 全局工具系统已开启
2. 工具已经注册
3. 工具没有被运行时 Tool Settings 禁掉
4. 当前 Agent 的 `toolsEnabled` 允许
5. 如果配置了 `toolWhitelist`，工具名必须在白名单里
6. 当前 Agent / 当前 run 的权限模式、工具族和风险级别允许

你可以把它理解成：

- 全局开关决定“系统里有没有手”
- Agent 配置决定“这个 Agent 有哪些手”
- runtime policy 决定“这只手现在让不让用”

### 4.3 `toolWhitelist` 什么时候用

如果你已经把 Agent 职责分清楚了，强烈建议给专项 Agent 加白名单。

例如：

- `coder`
  - 读写文件、补丁、命令、日志、记忆
- `researcher`
  - 搜索、浏览器、网页读取、记忆
- `verifier`
  - 读取、测试、日志、浏览器、记忆

如果某个 Agent 的 `toolWhitelist` 不写，当前实现默认是不限制。

### 4.4 MCP 怎么接进工具系统

最小配置：

```env
BELLDANDY_TOOLS_ENABLED=true
BELLDANDY_MCP_ENABLED=true
```

然后在 `~/.star_sanctuary/mcp.json` 中定义 MCP 服务器。

最小示例：

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "E:\\"]
    },
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest"]
    }
  }
}
```

MCP 工具接入后，会以类似下面的名字出现：

- `mcp_filesystem_*`
- `mcp_chrome-devtools_*`

如果你希望某个 Agent 也能使用这些 MCP 工具，需要：

- 该 Agent 自身 `toolsEnabled=true`
- 对应工具没有被运行时禁掉
- 如果用了白名单，要把对应工具名放进去

### 4.5 Tool Settings 面板怎么理解

WebChat 里的 Tool Settings 更像“运行时开关”和“临时治理面板”。

它适合：

- 临时禁用某些工具
- 观察当前工具是否可见
- 观察 Builtin / MCP / Plugin 的实际注册状态

它不等于长期配置文件：

- 想做长期 Agent 边界，优先改 `agents.json`
- 想做长期 MCP 配置，优先改 `mcp.json`
- 想做全局启停，优先改 `.env.local`

### 4.6 技能不是工具，但会影响 Agent 的工具使用质量

技能会告诉 Agent：

- 面对某类任务时，应该优先走什么步骤
- 什么时候该搜、什么时候该改、什么时候该验证

所以你经常会看到：

- 工具决定“能做”
- 技能决定“怎么更稳地做”

---

## 5. Agent Teams：如何配置、如何进入

### 5.1 先说结论

当前版本里，Agent Teams 没有单独的“进入按钮”。

要进入 Agent Teams 状态，通常需要这三件事同时成立：

1. 你已经配置了多个 Agent
2. 当前会话的主 Agent 可以使用委派工具
3. 主 Agent 真的发起了委派，尤其是并行委派

最重要的一条：

- 真正稳定进入 Team 状态的最佳触发方式，是让主 Agent 调用 `delegate_parallel`

因为一旦形成并行 lane，系统就会自动生成：

- `team.id`
- `team.mode`
- `team.sharedGoal`
- `team.memberRoster`
- `team.currentLaneId`

这时 UI、prompt snapshot、subtask 详情里都会进入可观测的 Team mode。

### 5.2 Agent Teams 的前置条件

建议按这个清单准备：

1. 全局工具系统开启

```env
BELLDANDY_TOOLS_ENABLED=true
```

2. 至少配置 2 个以上专项 Agent

- 推荐：`coder / researcher / verifier`

3. manager Agent 可用

- 通常建议用 `default` 作为 manager

4. 各 worker 有合适的默认角色与工具边界

- `coder -> defaultRole: coder`
- `researcher -> defaultRole: researcher`
- `verifier -> defaultRole: verifier`

5. 如果想让 Team 协作有共享记忆前置条件，可选开启：

```env
BELLDANDY_TEAM_SHARED_MEMORY_ENABLED=true
```

6. 如果你希望启用 IDENTITY-aware Team Governance，再补：

- 根工作区或 Agent 专属工作区中的 `IDENTITY.md`
- 可验证用户 UUID / sender identity 的运行环境

### 5.3 推荐的 Team 配置

推荐组合：

- `default`
  - 作为 manager
  - 不必过度收紧工具面，但要保留 delegation 能力
- `coder`
  - 专注实现与改动
- `researcher`
  - 专注资料检索、文档、网页、搜索
- `verifier`
  - 专注检查、测试、证据、风险、fan-in review

如果你想让某个 Agent 只作为子 Agent 使用，可以把它设成 `worker`。

如果你希望它也能被你手动切换使用，则保留 `resident` 更方便。

### 5.4 没有独立开关，那到底怎么“开始 Team”？

最直接的方式是在 WebChat 中对当前主 Agent 明确表达：

- 这是一个复杂任务
- 需要多个角色分工
- 需要并行
- 需要最后由主 Agent 整合

推荐说法：

```text
把这个任务拆成多 Agent 协作：
让 researcher 先调研方案，
让 coder 实现改动，
让 verifier 最后审查风险和验证结果，
你负责整合最终结论。
```

更强一点的说法：

```text
请进入多 Agent 协作方式：
并行让两个 coder 分别处理不同文件，
让 verifier 在 fan-in 阶段统一审查，
你不要自己直接改，先完成拆分、委派、回收和整合。
```

如果你希望更明确地逼近结构化 delegation，可以这样说：

```text
请并行委派：
1. coder-A 只改 packages/belldandy-core/src 下的运行时逻辑
2. coder-B 只改 apps/web/public/app/features 下的 UI
3. verifier 只负责检查回归风险
完成标准是：输出 Changes、Verification、Open Risks 三段。
```

这类表达会显著提高主 Agent 触发 `delegate_parallel`、产出结构化 ownership / acceptance / deliverable contract 的概率。

### 5.5 哪些情况更容易进入 Team 状态

更容易触发 Team mode 的任务：

- 跨文件、跨模块的复杂任务
- 需要“调研 + 实现 + 审查”的链路
- 明确要求并行处理不同部分
- 明确要求主 Agent 做 fan-in / 最终整合

不太容易触发 Team mode 的任务：

- 很小的单文件修改
- 纯聊天问题
- 主 Agent 自己几步就能完成的操作
- 你没有明确提出拆分或并行需求

### 5.6 Team mode 一旦开始，系统会做什么

当前实现里，主 Agent 通常会通过这些内置工具发起协作：

- `delegate_task`
  - 单个子 Agent 委派
- `delegate_parallel`
  - 并行委派多个 lane
- `sessions_spawn`
  - 底层子 Agent 拉起

当 `delegate_parallel` 成功创建多个 lane 时，系统会自动给本轮协作打上 team metadata。

当前常见自动推断的 team mode：

- `parallel_patch`
  - 并行编码/改补丁
- `research_grid`
  - 并行调研
- `verify_swarm`
  - 并行验证/审查
- `parallel_subtasks`
  - 混合型并行子任务

说明：

- `plan_execute_verify` 目前属于高级 team metadata 模式
- 它不是普通聊天里最常见的自动推断结果

### 5.7 如何判断现在已经进入 Team 状态

最直观的观察方式有三个：

1. 看 Subtask / Delegation 详情

你会看到：

- `teamId`
- `mode`
- `managerAgentId`
- `currentLaneId`
- roster
- `dependsOn`
- `handoffTo`
- completion gate

2. 看 Prompt Snapshot Detail

你会看到：

- `Team Coordination`
- Active Prompt Sections / Deltas
- `Identity Authority`（如果 authority profile 生效）

3. 看 delegated result 的输出

主 Agent 回收结果后，通常会出现：

- lane-aware 的聚合摘要
- acceptance gate
- retry / blocker / accept 的 triage

### 5.8 Team Shared Memory 要不要开

不是硬前提，但推荐在长期协作里开启：

```env
BELLDANDY_TEAM_SHARED_MEMORY_ENABLED=true
```

当前作用：

- 把 `stateDir/team-memory/` 作为共享记忆前置条件接入
- 适合多 Agent 持续协作、长期项目

当前不等于：

- 完整远端同步
- 团队云协作平台

### 5.9 如何让 Team 协作更稳

推荐做法：

1. 给不同 Agent 明确默认角色

- `coder`
- `researcher`
- `verifier`

2. 给不同 Agent 明确工具边界

- 不要所有 Agent 都拥有同样的高风险工具

3. 在需求里直接说清楚 ownership

推荐说法：

```text
coder 只负责实现，不要改 UI。
researcher 只负责找资料和现有实现。
verifier 只负责检查风险、测试和证据。
```

4. 在需求里直接说清楚 deliverable format

推荐说法：

```text
请让 verifier 的输出包含：
Findings
Evidence
Merge recommendation
```

5. 在需求里说清楚完成标准

推荐说法：

```text
完成标准是：
代码改动完成、
关键测试通过、
审查结果明确说明是否可合并。
```

---

## 6. IDENTITY 与 Team Governance

### 6.1 `IDENTITY.md` 现在不只是人格文本

当前版本中，`IDENTITY.md` 不只是显示名字和头像。

如果你填写了这些字段，系统会把它结构化成 authority profile：

- `当前身份标签`
- `上级身份标签`
- `下级身份标签`
- `主人UUID`

示例：

```md
## 【IDENTITY | 身份标签】

- **当前身份标签**：首席执行官 (CEO)
- **上级身份标签**：董事会成员
- **下级身份标签**：CTO、项目经理、员工
- **主人UUID**：a10001
```

### 6.2 多 Agent 时怎么放

推荐方式：

- 根工作区 `IDENTITY.md`
  - 放默认 Agent / manager 的身份
- `agents/coder/IDENTITY.md`
  - 放 coder 的身份
- `agents/researcher/IDENTITY.md`
  - 放 researcher 的身份
- `agents/verifier/IDENTITY.md`
  - 放 verifier 的身份

例如：

- `default`
  - `当前身份标签：首席执行官 (CEO)`
- `coder`
  - `当前身份标签：CTO`
- `researcher`
  - `当前身份标签：项目经理`
- `verifier`
  - `当前身份标签：审计官`

### 6.3 IDENTITY 什么时候会真正影响 Team 行为

只有同时满足下面两个条件，authority rule 才会从“文字设定”升级为“运行态约束”：

1. authority profile 已存在
2. 当前运行环境能验证用户 UUID 或 sender identity

否则：

- 身份标签仍会出现在 prompt / roster 中
- 但不会作为真正的 authority decision rule 生效

### 6.4 生效后你能看到什么

在 Team 协作与 inspect 中，你会看到：

- `managerIdentityLabel`
- lane 的 `identityLabel`
- `authorityRelationToManager`
- `reportsTo`
- `mayDirect`
- `Identity Authority`

这意味着：

- 现在不仅能看“谁负责什么”
- 还能看“谁和谁是什么 authority relation”

---

## 7. 常见使用配方

### 7.1 调研 + 实现 + 审查

适合：

- 需要先查资料，再改代码，再统一 review

推荐说法：

```text
请用多 Agent 协作完成这个任务：
researcher 先调研现有实现和外部资料，
coder 再完成改动，
verifier 最后审查风险和验证结果，
你负责整合结论。
```

### 7.2 并行编码

适合：

- 不同模块能平行修改

推荐说法：

```text
请并行拆分成两个 coder lane：
一个只改 core runtime，
一个只改 web UI，
最后再由 verifier 汇总检查。
```

### 7.3 验证群

适合：

- 你已经有了实现，只想并行做 review / verify

推荐说法：

```text
请进入 verify swarm：
并行让多个 verifier 从测试、风险、回归三个角度审查，
最后汇总为一份结论。
```

### 7.4 强化结构化交付

适合：

- 你想提高委派结果可验收性

推荐说法：

```text
请让子 Agent 的输出至少包含：
Changes
Verification
Open Risks
```

或者：

```text
请让 verifier 按以下结构交付：
Findings
Evidence
Merge recommendation
Done Definition Check
```

---

## 8. 常见问题与排查

### 8.1 为什么我配了多个 Agent，但看起来没有进入 Team 状态

优先排查：

1. `BELLDANDY_TOOLS_ENABLED` 是否为 `true`
2. 当前 manager Agent 是否真的可用 delegation 工具
3. `agents.json` 修改后是否已经重启 Gateway
4. 任务是否太小，主 Agent 直接自己完成了
5. 你是否明确提出了并行/拆分/整合需求

### 8.2 为什么只有子 Agent，没有明显 Team UI

因为：

- `delegate_task` 更偏单子任务委派
- 最容易形成完整 Team roster / lane state 的是 `delegate_parallel`

如果你想更稳定看到 Team 视图，建议明确要求：

- 并行
- 多角色
- 最终 fan-in

### 8.3 为什么 `IDENTITY.md` 填了，但 authority 没生效

优先排查：

1. `IDENTITY.md` 是否真的放在根目录或 Agent 专属工作区
2. 是否填写了结构化字段，而不只是自然语言描述
3. 当前环境是否提供了可验证 UUID 或 sender identity
4. 你看到的是不是只有人格文本，而不是 `Identity Authority` 观测块

### 8.4 为什么某个 Agent 看不到工具

优先排查：

1. 全局工具系统是否开启
2. 该 Agent 的 `toolsEnabled` 是否为 `true`
3. 工具是否被 Tool Settings 临时禁用
4. 是否被 `toolWhitelist` 挡住
5. 是否被 `defaultAllowedToolFamilies` / risk level 挡住
6. MCP 是否真的连接成功

### 8.5 我应该从哪里观察 Team 当前状态

推荐顺序：

1. WebChat 的 subtask / delegation 详情
2. Prompt Snapshot Detail
3. 启动日志与 doctor

---

## 9. 推荐的最小上手顺序

如果你想尽快开始正确使用 Agent、工具和 Agent Teams，建议按这个顺序：

1. 配好模型与 `.env.local`
2. 打开 `BELLDANDY_TOOLS_ENABLED=true`
3. 配好 `agents.json`
4. 先保证 `default / coder / researcher / verifier` 四类 Agent 能正常加载
5. 可选开启 `BELLDANDY_MCP_ENABLED=true`
6. 可选开启 `BELLDANDY_TEAM_SHARED_MEMORY_ENABLED=true`
7. 给每个 Agent 补自己的 `SOUL.md` / `IDENTITY.md`
8. 重启 Gateway
9. 在 WebChat 中先让 `default` 做一次“调研 + 实现 + 审查”的并行委派
10. 到 subtask / prompt snapshot 里确认是否真的进入 Team mode

做到这一步，说明你的 Agent、工具系统和 Agent Teams 已经基本打通。
