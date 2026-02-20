# Belldandy 实现内容说明

本文档详细介绍了 Belldandy 项目已完成的功能模块及后续规划，旨在帮助开发者和使用者深入理解系统设计与能力。同时，为了方便对比与参考，附录部分详细列出了参考目标 **openclaw** 的完整能力清单。

## 1. 范围与约束

- **开发目录**：`e:\project\Belldandy`
- **参考目录（只读）**：`E:\project\belldandy\openclaw`（不修改、不编码）
- **参考目录（只读）**：`E:\project\belldandy\UI-TARS-desktop-main`（不修改、不编码）

## ✅ 已完成功能模块

### 1. 基础架构与 WebChat (Phase 1-2)

- **目标**：搭建最小可用、端到端的实时对话系统闭环。
- **实现内容**：
    - **Gateway**：基于 WebSocket 的消息总线，处理客户端连接、鉴权与消息路由。
    - **Agent Runtime**：支持流式输出（Streaming）的 Agent 运行环境，默认集成 MockAgent（本地测试）与 OpenAI 协议兼容 Provider。
    - **WebChat**：轻量级 Web 前端，支持自动重连、Markdown 渲染、实时消息流展示。
    - **协议**：定义了 `message.send`、`chat.delta`、`chat.final` 等标准事件格式。
- **价值**：作为系统的骨架，确保了“输入-处理-输出”核心链路的稳定与即时响应。

### 2. 安全准入与 Pairing 机制 (Phase 3 & 3.1)

- **目标**：遵循"默认安全"原则，保护 Agent 不被未授权的设备或用户访问。
- **实现内容**：
    - **强制配对**：所有未知来源的连接请求会被拒绝，并触发 Pairing 流程。
    - **Allowlist**：基于 ClientId 的白名单机制，只有授权设备才能与 Agent 对话。
    - **CLI 管理工具**（已迁移至统一 `bdd` CLI）：
        - `bdd pairing list` / `bdd pairing pending`：查看授权状态与待处理请求。
        - `bdd pairing approve <CODE>`：批准配对请求。
        - `bdd pairing cleanup [--dry-run]`：清理过期的请求。
        - `bdd pairing export` / `bdd pairing import`：配置数据的备份与恢复。
        - 所有命令支持 `--json` 机器可读输出和 `--state-dir` 覆盖。
    - **旧入口已清理**：Phase D 已删除旧 `pairing-*.ts` 散装脚本及 `pnpm pairing:*` 别名，统一使用 `bdd pairing <sub>`。
- **价值**：确保个人 AI 助手的私密性，防止被局域网内的其设备意外调用或恶意扫描。

### 3. Skills 工具系统 (Phase 4)

- **目标**：赋予 Agent 操作外部世界的能力，突破 LLM 的知识截止限制。
- **实现内容**：
    - **工具沙箱**：`@belldandy/skills` 包提供了安全的工具执行环境与审计日志功能。
    - **内置工具**：
        - `web_fetch`：受控的网页抓取工具（含域名白/黑名单、内网 IP 阻断、超时与大小限制）。
        - `file_read` / `file_write`：受控的文件读写工具（防目录遍历、敏感文件黑名单、显式写入许可）。
            - **写入模式**：`overwrite/append/replace/insert`，支持按行号或正则进行局部替换。
            - **项目感知**：默认自动创建父目录；支持跨工作区根目录（`BELLDANDY_EXTRA_WORKSPACE_ROOTS`）。
            - **格式策略**：允许扩展名白名单、点文件、base64（二进制）写入策略化控制。
            - **脚本权限**：非 Windows 下写入 `.sh` 自动 `chmod +x`。
    - **Function Calling**：实现了 `ToolEnabledAgent`，支持“思考-调用工具-获取结果-再思考”的 ReAct 循环。
- **价值**：让 Agent 可以联网搜索最新信息、阅读本地文档、甚至协助编写代码文件，极大地扩展了其实用性。

### 4. Memory 记忆系统 (Phase 4 & 4.5 & M-Next)

- **目标**：赋予 Agent 长期记忆，使其随着使用越来越了解用户，并能回忆起过去的对话与知识。
- **实现内容**：
    - **混合检索内核**：基于 **`better-sqlite3`** 实现，结合了 **FTS5 关键词检索**（BM25）与 **`sqlite-vec` 向量语义检索**（Native C++ KNN）。
        - **SQLite 引擎迁移**（2026-02-15）：从 Node.js 内置 `node:sqlite`（`DatabaseSync`）迁移至 `better-sqlite3`。原因是 `node:sqlite` 编译时未包含 FTS5 模块，导致关键词检索只能降级为 LIKE 查询（无 BM25 排名）。`better-sqlite3` 默认编译 FTS5，迁移后全文索引开箱即用。
        - 迁移范围：仅涉及 `store.ts` 和 `sqlite-vec.ts` 两个文件，API 高度兼容，改动量约 10 行。
    - **智能索引**：
        - `Chunker`：基于 Token 估算的智能文本分块。
        - `MemoryIndexer`：增量式文件索引，自动扫描 `~/.belldandy/memory/` 目录，支持 `.md`、`.txt`、`.jsonl`（会话历史）格式。
    - **物理分层存储**：
        - **数据库层**：SQLite 中 `chunks` 表新增 `memory_type` 字段 (`core` | `daily` | `session` | `other`)，实现物理隔离与差异化检索。
        - **文件映射**：
            - `MEMORY.md` ➜ `core` (长期记忆/事实)
            - `memory/YYYY-MM-DD.md` ➜ `daily` (短期流水/日志)
            - `sessions/*.jsonl` ➜ `session` (会话历史)
    - **Embedding 集成**：支持对接 OpenAI 兼容的 Embedding API 生成向量，或使用本地 Embedding 模型（`LocalEmbeddingProvider`）。
    - **Embedding Cache** (M-N0 ✅)：
        - 基于内容哈希的 Embedding 缓存表（`embedding_cache`），避免重复计算相同内容的向量。
        - 缓存命中率可达 30-50%（重复内容场景），显著降低 API 成本与索引时间。
    - **统一 MemoryStore** (M-N1 ✅)：
        - 全局单例 `MemoryManager`，通过 `registerGlobalMemoryManager` / `getGlobalMemoryManager` 实现跨包共享。
        - 避免多实例导致的数据库锁竞争与内存浪费。
    - **元数据过滤** (Phase M-1 ✅)：
        - `chunks` 表新增 `channel`、`topic`、`ts_date` 列，支持按渠道/主题/时间范围过滤检索结果。
        - 索引优化：为元数据列创建 B-Tree 索引，加速过滤查询。
    - **规则重排序** (Phase M-3 ✅)：
        - `ResultReranker`：零成本纯计算重排，基于三大信号：
            1. **Memory Type 权重**：`core` (1.3) > `daily` (1.0) > `session` (0.9) > `other` (0.8)
            2. **时间衰减**：指数衰减，半衰期默认 30 天（可配置）
            3. **来源多样性惩罚**：同一文件的多个 chunk 降权（默认 15% 惩罚）
        - 可通过 `RerankerOptions` 自定义权重与衰减参数。
    - **L0 摘要层** (M-N2，基础设施已完成)：
        - `chunks` 表新增 `summary`、`summary_tokens` 列，为每个 chunk 生成简短摘要（100-200 token）。
        - 配置项：`BELLDANDY_MEMORY_SUMMARY_ENABLED`、`BELLDANDY_MEMORY_SUMMARY_MODEL`。
        - 摘要生成逻辑已预留，支持批量处理与最小内容长度阈值（默认 500 字符）。
    - **会话记忆自动提取** (M-N3，基础设施已完成)：
        - 会话结束时自动提取关键信息（事实、偏好、决策）并写入 `memory/YYYY-MM-DD.md`。
        - 配置项：`BELLDANDY_MEMORY_EVOLUTION_ENABLED`、`BELLDANDY_MEMORY_EVOLUTION_MIN_MESSAGES`（默认 4 条消息）。
        - 提取逻辑已预留，支持相似度去重与人工可审查。
    - **源路径聚合检索** (M-N4，基础设施已完成)：
        - 当检索结果中同一 `source_path` 出现多个 chunk 时，自动拉取该文件的所有相关 chunk 进行二次检索。
        - 配置项：`BELLDANDY_MEMORY_DEEP_RETRIEVAL`。
        - 适用于"找到一个相关段落后，想看完整上下文"的场景。
    - **Memory Tools**：提供了 `memory_search`、`memory_get`、`memory_index` 工具，让 Agent 能自主发起检索与索引。
- **价值**：
    - 解决了 LLM 上下文窗口限制问题。
    - 实现了长期核心记忆、短期流水、会话历史的结构化分离与差异化检索。
    - 通过 Embedding Cache、规则重排、元数据过滤等优化，显著提升检索质量与性能。
    - 为未来的 L0 摘要、自动记忆提取、LLM 重排等高级能力奠定基础。

### 5. 对话上下文与防注入 (Phase 2.2)

- **目标**：在保持对话连续性的同时，严格防御 Prompt Injection 攻击，确保 Agent 人格不被覆盖。
- **实现内容**：
    - **ConversationStore**：会话管理器，支持内存缓存 + JSONL 文件持久化，处理会话 TTL（自动过期）与最大历史长度限制。
    - **分层 Prompt 架构**：严格隔离数据层级：
        1. **System Layer**：系统指令与人格设定（最高优先级，用户不可见）。
        2. **History Layer**：过往对话历史（支持自动压缩，详见第 16 节）。
        3. **User Layer**：当前用户输入（被视为普通内容而非指令）。
    - **上下文自动压缩**：三层渐进式压缩（Archival Summary → Rolling Summary → Working Memory），支持模型摘要与降级兜底，详见第 18 节。
- **价值**：增强了系统的健壮性与安全性，避免用户通过恶意指令（如"忽略前面所有指令"）篡改 Agent 的核心行为准则。

### 6. SOUL 人格系统 (Phase 5)

- **目标**：赋予 Agent 独特、连续且可配置的个性，使其不仅仅是一个问答机器。
- **实现内容**：
    - **Workspace 引导体系**：系统启动时自动加载 `~/.belldandy/` 下的定义文件
    - **动态注入**：Gateway 在每一轮对话中都会将这些设定动态组合进 System Prompt
- **价值**：提供了高度的可玩性与定制化空间，用户可以像写小说一样塑造自己专属 AI 的性格。

#### Workspace 文件读取时机机制

| 文件 | 创建时机 | 读取时机 | 注入到 System Prompt | 说明 |
|------|---------|----------|---------------------|------|
| **AGENTS.md** | 启动时缺失则创建 | ✅ 每次会话 | ✅ 是（第一个） | 工作空间使用指南 |
| **SOUL.md** | 启动时缺失则创建 | ✅ 每次会话 | ✅ 是 | 核心人格定义 |
| **TOOLS.md** | 启动时缺失则创建 | ✅ 每次会话 | ✅ 是 | 本地工具/环境说明 |
| **IDENTITY.md** | 启动时缺失则创建 | ✅ 每次会话 | ✅ 是 | Agent 身份信息 |
| **USER.md** | 启动时缺失则创建 | ✅ 每次会话 | ✅ 是 | 用户档案 |
| **HEARTBEAT.md** | 启动时缺失则创建 | ✅ 定时读取 | ❌ 否 | 定时任务配置 |
| **BOOTSTRAP.md** | **仅全新工作区** | ⚠️ 仅存在时 | ✅ 是 | 首次引导仪式 |

#### 文件创建规则

- **全新工作区**（所有核心文件都不存在）：创建全部 7 个文件，包括 BOOTSTRAP.md
- **已有工作区**：只创建缺失的核心文件，**不**创建 BOOTSTRAP.md

#### BOOTSTRAP.md 生命周期

1. 全新工作区启动时自动创建
2. Agent 读取后开始"苏醒对话"
3. 引导完成后 Agent 更新 IDENTITY.md、USER.md
4. Agent 删除 BOOTSTRAP.md，结束引导阶段

---


### 7. 插件系统 (Plugin System) Phase 8

- **目标**：建立标准化的扩展机制，允许通过外部 JS/MJS 文件动态扩展 Agent 能力。
- **实现内容**：
    - **PluginRegistry**：插件加载的核心注册表，支持运行时动态加载。
    - **AgentHooks**：实现了生命周期钩子（`beforeRun`, `beforeToolCall`, `afterToolCall`, `afterRun`），允许插件干预 Agent 决策流程。
    - **Tool Extension**：插件可以注册新的 Tool 到 Agent 的工具箱中。
    - **Skill Dir Extension**：插件可通过 `context.registerSkillDir(dir)` 声明附带的技能目录，由 SkillRegistry 统一加载。
    - **Legacy Hooks 桥接**：插件注册的旧 4-hook `AgentHooks` 会自动桥接到新的 13-hook `HookRegistry`（beforeRun→before_agent_start, afterRun→agent_end, beforeToolCall→before_tool_call, afterToolCall→after_tool_call），确保插件 hooks 真正生效。
- **价值**：为未来的生态扩展打下基础（如接入 1Password, Linear 等第三方服务）。

### 7.1 钩子系统扩展 (Hook System Extension) Phase 8.3

- **目标**：对标 moltbot 实现完整的 13 种生命周期钩子，支持优先级、双执行模式、错误处理。
- **实现内容**：
    - **HookRegistry**：钩子注册表，支持按来源注册/注销、优先级排序（priority 越高越先执行）。
    - **HookRunner**：钩子执行器，支持三种执行模式：
        - **并行执行 (runVoidHook)**：适用于日志、审计等无返回值场景
        - **顺序执行 (runModifyingHook)**：适用于需要修改参数或取消操作的场景
        - **同步执行 (runToolResultPersist)**：用于热路径中的工具结果持久化
    - **13 种钩子**：
        | 类别 | 钩子名称 | 执行模式 | 用途 |
        |------|---------|---------|------|
        | Agent | `before_agent_start` | 顺序 | 注入系统提示词/上下文 |
        | Agent | `agent_end` | 并行 | 分析完成的对话 |
        | Agent | `before_compaction` | 并行 | 上下文压缩前处理 |
        | Agent | `after_compaction` | 并行 | 上下文压缩后处理 |
        | 消息 | `message_received` | 并行 | 消息接收日志 |
        | 消息 | `message_sending` | 顺序 | 修改或取消即将发送的消息 |
        | 消息 | `message_sent` | 并行 | 消息发送日志 |
        | 工具 | `before_tool_call` | 顺序 | 修改参数或阻止调用 |
        | 工具 | `after_tool_call` | 并行 | 结果审计 |
        | 工具 | `tool_result_persist` | 同步 | 修改持久化的工具结果 |
        | 会话 | `session_start` | 并行 | 初始化会话级资源 |
        | 会话 | `session_end` | 并行 | 清理会话级资源 |
        | 网关 | `gateway_start` | 并行 | 服务初始化 |
        | 网关 | `gateway_stop` | 并行 | 服务清理 |
    - **向后兼容**：保留原有的 `AgentHooks` 简化接口，内部转换为新的注册机制。
- **关键文件**：
    ```
    packages/belldandy-agent/src/
    ├── hooks.ts          # 完整类型定义 + HookRegistry
    ├── hook-runner.ts    # 钩子执行器（新增）
    ├── tool-agent.ts     # 集成新版 hookRunner
    └── index.ts          # 导出新增类型
    ```
- **价值**：与 moltbot 完全对标，为插件系统提供完整的生命周期干预能力。

### 7.2 技能系统 (Skills System) P2-3

- **目标**：建立"经验库"机制，让 Agent 不仅知道有哪些工具可用，还知道如何组合使用这些工具来完成特定任务。
- **核心概念**：Skill 是纯 prompt 注入（不执行代码），本质是一份 Markdown 格式的操作指南（SOP）。与 Tool（代码执行）互补：Tool 是"手和脚"，Skill 是"经验和套路"。
- **实现内容**：
    - **SKILL.md 格式**：每个技能是一个目录，包含一个 `SKILL.md` 文件（YAML frontmatter 元数据 + Markdown 操作指令）。支持 `name`、`description`、`version`、`tags`、`priority`、`eligibility` 等字段。
    - **轻量 YAML 解析器**：手写实现，无外部依赖，支持 string / string[] / nested object 子集。
    - **5 维 Eligibility Gating**：自动检测技能前置条件是否满足：
        | 维度 | 检查方式 |
        |------|----------|
        | `env` | 环境变量存在且非空 |
        | `bin` | `where`（Windows）/ `which`（Unix）检查 PATH |
        | `mcp` | MCP 服务器名称在线 |
        | `tools` | 已注册的 tool 名称 |
        | `files` | workspace 中存在的文件 |
        - 批量检查时 bin 结果缓存，避免重复 I/O。
    - **SkillRegistry（三来源注册表）**：
        - **Bundled skills**：随项目发布的内置技能（`packages/belldandy-skills/src/bundled-skills/`）
        - **User skills**：用户自定义技能（`~/.belldandy/skills/*/SKILL.md`）
        - **Plugin skills**：插件附带的技能（通过 `PluginRegistry.getPluginSkillDirs()` 获取）
        - 内部用 `source:name` 作为唯一键防冲突，查询按 user > plugin > bundled 优先级覆盖。
    - **两级 Prompt 注入**：
        - `priority: always/high` 的 eligible skills → 直接注入 system prompt（P7 段，位于 TOOLS.md 之后）
        - 其余 eligible skills → 不注入，但提示 Agent 可通过 `skills_search` 按需查询
        - Token 控制：注入总字符数超过 4000 时自动降级为摘要模式
    - **Agent 工具**：
        - `skills_list`：列出所有技能（含 eligibility 状态、来源、标签），支持 filter/tag 过滤
        - `skills_search`：按关键词搜索技能库，返回匹配技能的完整操作指南
    - **Plugin Hooks 桥接**：修复了 `PluginRegistry.getAggregatedHooks()` 死代码问题，将旧 4-hook AgentHooks 桥接到新 13-hook HookRegistry。
- **关键文件**：
    ```
    packages/belldandy-skills/src/
    ├── skill-types.ts              # 类型定义
    ├── skill-loader.ts             # SKILL.md 解析器
    ├── skill-eligibility.ts        # 5 维准入检查引擎
    ├── skill-registry.ts           # 三来源注册表
    ├── builtin/skills-tool.ts      # skills_list + skills_search 工具
    └── bundled-skills/
        └── commit-style/SKILL.md   # 内置示例技能

    packages/belldandy-agent/src/
    └── system-prompt.ts            # 新增 P7 Skills 注入段

    packages/belldandy-plugins/src/
    ├── types.ts                    # PluginContext 扩展 registerSkillDir
    └── registry.ts                 # 新增 getPluginSkillDirs()

    packages/belldandy-core/src/bin/
    └── gateway.ts                  # SkillRegistry 初始化 + hooks 桥接
    ```
- **价值**：Agent 从"只知道有什么工具"进化到"知道如何组合工具完成任务"，用户可以通过编写 SKILL.md 将自己的工作流程沉淀为可复用的技能。

### 8. 浏览器扩展 (Phase 9)

- **目标**：突破传统 API 的限制，让 Agent 直接接管用户的浏览器，复用登录态与浏览历史。
- **实现内容**：
    - **Relay Server**：一个 WebSocket 中继服务，模拟 CDP (Chrome DevTools Protocol)，让 Puppeteer 可以连接到真实的浏览器扩展。
    - **Chrome Extension**：基于 Manifest V3 (MV3) 开发，利用 `chrome.debugger` API 接管 Tab。
    - **Agent Integration**：封装了标准的 Browser Tools (`browser_open`, `browser_screenshot`, `browser_get_content`, `browser_snapshot`)。
- **Phase 9.5 能力增强**：
    - **增强阅读 (Enhanced Reading)**：
        - `browser_get_content` 集成了 **Readability** 算法与 Markdown 转换，能够提取网页正文去除噪声，大幅提升阅读体验并降低 Token 消耗。
    - **视觉反馈 (Visual Feedback)**：
        - `browser_screenshot` 实现了完整的截图与自动归档流程（保存至 `screenshots/`），赋予 Agent "看见" 网页实际渲染效果的能力。
- **技术突破**：
    - 解决了 Puppeteer 与 Extension 之间的 Target ID 映射差异。
    - 实现了自动化中继启动（随 Gateway 拉起）。
    - 攻克了 Extension 环境下的目标发现竞态条件（Race Condition）。
    - **交互式 DOM 快照 (Interactive DOM Snapshot)**：
        - 智能过滤无关噪音（script/style/div），只保留内容与交互元素。
        - 自动分配数字 ID (`[42]`)，Agent 可直接通过 ID 点击元素，无需生成复杂 CSS Selector。
        - Token 消耗降低 50%-80%。
- **价值**：赋予 Agent "看"网页（截图/快照）和"动"网页（点击/输入）的能力，是实现复杂 Web 任务自动化的基石。

### 9. 系统级操作 (System Execution) Phase 10
- **目标**：赋予 Agent 在宿主机执行 Shell 命令的能力，但必须保证宿主机安全。
- **策略**：**Consumer Safe Mode (消费者安全模式)**
    - **严格白名单**：覆盖主流开发工具（Node/Python/编译链/Java/.NET/媒体/文档转换），并区分 Windows/Unix 命令差异。
    - **非交互保护**：对常见命令自动追加 `-y/--yes` 等参数，避免卡在交互输入。
    - **超时与强杀**：快速命令默认 5s、构建命令 300s，超时后强制 kill 进程。
    - **风险阻断**：
        - 🚫 **Blocklist**：`sudo`, `su`, `mkfs`, `dd` 等特权/破坏指令直接拦截。
        - ⚠️ **Arg Check**：允许 `rm` / `del` 但 **严禁** `rm -r/-rf` 与 `del /s /q`。
        - 🔒 **敏感保护**：`SOUL.md` 访问优先拦截；禁止通过 `exec` 读取 `.env`。
- **价值**：填补了 Agent 无法执行 `npm install` 或 `git commit` 的能力空白，使其成为真正的"全栈工程师"。

### 10. 实时文件感知 (Real-time File Perception) Phase 11

- **目标**：让 Agent 能够即时感知用户对文件的修改，无需重启或手动刷新。
- **实现内容**：
    - **Watcher**：集成 `chokidar` 监听工作空间文件变化（add/change/unlink）。
    - **Incremental Indexing**：文件修改后 1秒内自动触发增量索引，更新 Memory 数据库。
    - **Auto Cleanup**：文件删除时自动清理对应的 chunks 和 vectors。
- **价值**：消除了 AI 记忆滞后的问题，特别是对于 Coding 场景，Agent 永远知道最新的代码状态。

### 11. Model Failover & High Availability (Phase 8) [已完成]

- **目标**：实现类似 OpenClaw 的模型调用容灾机制，确保高可用性。
- **状态**：✅ 已完成 (2026-02-10)
- **实现内容**：
    - **FailoverClient**（`failover-client.ts`）：封装底层 HTTP 请求，内置错误分类 + Cooldown（熔断冷却）+ 多 Profile 自动轮询。
    - **错误分类**：429/5xx/408/超时 → 触发 failover；400 → 不可重试直接返回。
    - **Cooldown 策略**：rate_limit 冷却 2 分钟，billing (402) 冷却 10 分钟，其他 1 分钟。
    - **Agent 集成**：`OpenAIChatAgent` 和 `ToolEnabledAgent` 均已接入 `FailoverClient.fetchWithFailover`。
    - **配置加载**：Gateway 启动时自动从 `~/.belldandy/models.json`（或 `BELLDANDY_MODEL_CONFIG_FILE`）加载备用 Profile。
    - **向后兼容**：未配置 `models.json` 时行为与之前完全一致。
- **价值**：提升系统的鲁棒性，确保关键时刻 AI 不"掉链子"。多 Key 负载均衡 + 跨 Provider 降级双重保障。

#### 11.5 Kimi K2.5 视觉/视频能力集成 (Vision & Video)
- **状态**: ✅ 已完成 (2026-02-10)
- **功能**:
  - **图片理解**: 支持 WebChat 上传图片，Gateway 自动识别并转为 Base64 DataURI 发送给模型。
  - **视频理解**: 支持 WebChat 上传视频 (mp4/mov 等)，Agent 自动上传至 Moonshot 文件服务并获取 file_id，通过 `ms://` 协议引用实现长视频理解。
  - **多模态协议**: 升级 `AgentContentPart` 支持 `text`、`image_url` 和 `video_url` 三种类型。
  - **共享模块**: 抽取 `multimodal.ts`，`OpenAIChatAgent` 和 `ToolEnabledAgent` 共用视频上传与预处理逻辑。
- **技术细节**:
  - `gateway`: 识别 `image/*` 和 `video/*` 附件，分别处理为 Base64 DataURI 和本地文件路径 (`file://`)。
  - `multimodal.ts`: 共享模块，提供 `buildUrl`、`uploadFileToMoonshot`、`preprocessMultimodalContent` 三个核心函数。
  - `VideoUploadConfig`: 独立上传配置，解决代理不支持 `/files` 端点的问题。
  - **容错**: 上传失败降级为文本占位，不中断请求。
  - **验证脚本**: 提供 `scripts/verify_kimi_video.ts` 用于独立验证视频上传与理解流程。

### 12. 性能与向量加速 (Vector Optimization) Phase 12

- **目标**：引入 `sqlite-vec` 替换纯 JS 的向量计算，实现生产级性能。
- **实现内容**：
    - **核心引擎**：引入 `sqlite-vec` (C++ Extension) 提供底层的 SIMD 加速支持，搭配 `better-sqlite3` 原生扩展加载能力。
    - **存储升级**：使用 `vec0` 虚拟表存储高维向量（替代 BLOB），支持高效的 L2/Cosine 距离计算。
    - **架构优化**：
        - 移除应用层所有计算开销，直接下沉到 SQLite SQL 查询（`WHERE embedding MATCH ?`）。
        - 实现了 `rowid` 映射机制，确保 Metadata 表与 Vector 表的强一致性。
- **性能飞跃**：
    - 检索延迟：**~12ms** (10k 向量)，相比 JS 实现提升显著。
    - 内存占用：大幅降低，不再需要将所有向量加载到 Node.js 堆内存中。
- **价值**：支撑海量记忆（百万级 Chunk）的基础设施升级，让 Belldandy 有能力管理整个代码库的知识。

### 13. 多媒体与语音 (Multimedia & TTS) Phase 13

- **目标**：实现高质量、低成本的语音交互能力。
- **技术方案**：
    - **Multi-Provider 架构**：重构 `text_to_speech` 工具，抽象出 Provider 接口，同时支持 `openai` (REST API) 和 `edge` (WebSocket 逆向)。
    - **Node-Edge-TTS**：选用 `node-edge-tts` 库，无需安装浏览器即可通过 WebSocket 协议调用 Azure 顶级神经元语音（晓晓/云希）。
    - **静态资源服务**：Gateway 新增 `/generated` 静态路由，将本地生成的 MP3 文件暴露为 HTTP 链接，供前端 `<audio>` 标签播放。
    - **动态 System Prompt**：实现文件信号机制 (`TTS_ENABLED`)。Gateway 每次请求前检查该文件，若存在则动态注入 "MUST use text_to_speech tool" 的 System Prompt 指令，实现无需重启的热开关。
- **价值**：极大提升了交互的拟人感，且利用 Edge TTS 实现了零成本的高质量语音体验。

### 14. 视觉感知 (Vision) Phase 13.5

- **目标**：赋予 Agent 视觉能力，使其能够"看到"物理世界。
- **实现内容**：
    - **回环视觉 (Loopback Vision)**：利用现有的 Browser Extension + WebDriver 协议。
    - **Mirror Page**：Gateway 托管 `/mirror.html`，调用 `navigator.mediaDevices.getUserMedia` 显示摄像头画面。
    - **Agent Action**：Agent 使用 `browser_navigate` 打开页面，然后使用 `browser_screenshot` 获取视觉帧。
- **价值**：无需引入复杂的 WebRTC 或流媒体协议，复用现有浏览器能力实现"看世界"。

### 14.5 Kimi 原生视觉与视频 (Native Multimodal Vision & Video) Phase 13.6

- **目标**：支持用户直接发送图片和视频给 Agent，利用 Kimi K2.5 的多模态能力进行理解。
- **状态**：✅ 已完成 (2026-02-10)
- **实现内容**：
    - **协议升级**：重构 `AgentRunInput` 接口，支持混合多模态内容（`Array<Text | ImageURL | VideoURL>`）。
    - **透明传输**：Gateway (`server.ts`) 自动检测 MIME 类型，将图片附件转换为 Base64 `image_url` 对象，将视频附件存为本地临时文件并生成 `file://` URL。
    - **共享多模态模块** (`multimodal.ts`)：
        - 抽取视频上传与内容预处理逻辑为独立模块，`OpenAIChatAgent` 和 `ToolEnabledAgent` 共用。
        - `buildUrl(baseUrl, endpoint)`：统一处理 baseUrl 是否已带 `/v1` 的 URL 拼接。
        - `uploadFileToMoonshot(filePath, apiKey, baseUrl, purpose)`：上传本地文件到 Moonshot `/files` 端点（100MB 限制，`purpose="video"`）。
        - `preprocessMultimodalContent(content, profile, uploadOverride?)`：扫描 content 数组，将 `file://` 视频上传后替换为 `ms://<file_id>` 协议 URL。
    - **VideoUploadConfig**：独立的上传配置（`apiUrl` + `apiKey`），解决代理/网关不支持 `/files` 端点的问题，可绕过代理直连 Moonshot API。
    - **容错降级**：上传失败时替换为文本占位 `[Video: <path> (Upload Failed: <reason>)]`，不中断整个请求。
    - **混合兼容**：
        - **图片**：作为视觉输入直接传给模型（Base64 DataURI）。
        - **视频**：`file://` 本地路径 → 上传 Moonshot → `ms://<file_id>` → 模型直接读取云端文件分析。
        - **文本/代码**：作为文本附件追加到 Prompt。
- **修复链路**：
    | 问题 | 修复 |
    |------|------|
    | ToolEnabledAgent 缺少视频上传逻辑 | 抽取共享 `multimodal.ts`，两个 Agent 共用 |
    | 代理不支持 `/files` 端点 (404) | 新增 `VideoUploadConfig` 独立上传配置 |
    | `purpose="file-extract"` 不支持视频 (400) | 改为 `purpose="video"` |
    | `video_file` 不是合法 content part 类型 (400) | 改为 `video_url` + `ms://<file_id>` 协议 |
    | 代理不支持多模态 content 数组 (422) | 直连 Moonshot，统一 URL + Key |
- **文件结构**：
    ```
    packages/belldandy-agent/src/
    ├── multimodal.ts       # [NEW] 共享视频上传 & 多模态预处理
    ├── openai.ts           # [MODIFIED] 引用 multimodal.ts
    ├── tool-agent.ts       # [MODIFIED] 引用 multimodal.ts（补齐视频逻辑）
    └── index.ts            # [MODIFIED] 导出 multimodal 相关类型
    ```
- **价值**：
    - **原生理解**：无需 OCR 中转，模型能直接理解梗图、UI 截图、图表细节、视频内容。
    - **交互升级**：用户可以"发图/发视频提问"，交互体验大幅提升。
    - **DRY 架构**：两个 Agent 共享预处理逻辑，消除代码重复。

### 15. 方法论系统 (Methodology) Phase 14

- **目标**：让 Agent 具备"自我进化"与"经验沉淀"能力。
- **实现内容**：
    - **Methodology Skills**：
        - `method_list` / `method_search`：查找现有 SOP。
        - `method_read`：读取 SOP 步骤。
        - `method_create`：沉淀新的经验方法。
    - **Prompt Injection**：System Prompt 中注入 "Methodology Protocol"，强制 Agent 在复杂任务前查阅、任务后反思。
    - **Runtime Support**：自动管理 `~/.belldandy/methods` 目录。
- **价值**：解决 Agent "用完即忘"的问题，将隐性知识显性化为可复用的 Markdown 文档。

### 16. 会话持久化与向量记忆 (Persistence & Vector Memory) Phase 4.6

- **目标**：实现会话数据的持久化存储，并利用向量索引实现“无限”的记忆 recall。
- **状态**：✅ 已完成 (2026-02-08)
- **实现内容**：
    - **Session Persistence**：
        - `ConversationStore` 升级为文件支持。
        - 实时将会话写入 `.belldandy/sessions/<conversationId>.jsonl`。
        - 重启后自动加载最近会话，上下文不丢失。
    - **Session Indexing**：
        - `MemoryIndexer` 支持 `.jsonl` 格式解析。
        - 自动监听 `sessions` 目录，增量生成向量索引。
        - 实现了 `session` 类型的记忆块 (`memory_type='session'`)。
        - 解决了首次启动时向量表未初始化的 Bootstrap 问题。
        - `MemoryManager` 启动时自动检测并补全缺失的 Embedding。
    - **Configuration**:
        - 支持自定义 Embedding 模型配置（如适配 `text-embedding-v1`）。
        - 实现了环境变量优先级逻辑 (`BELLDANDY_` > `OPENAI_`)。
- **价值**：
    - **数据安全**：意外崩溃或重启不再丢失当前对话。
    - **全渠道记忆**：无论是网页还是飞书，对话记录都统一归档并在未来可检索。
    - **长程记忆**：Agent 可以通过 `memory_search` 回忆起几天甚至几个月前的对话细节。

### 17. 记忆检索增强 (Memory Retrieval Enhancement) Phase 4.7

- **目标**：让 Agent 更主动、更智能地使用长期记忆，从"被动回忆"升级为"主动关联"。
- **状态**：部分完成 (2026-02-08)
- **已完成**：
    - **Global MemoryManager**：统一 Gateway 与 Skills 的 MemoryManager 实例，让 `memory_search` 工具能访问会话向量索引。
    - **Prompt 引导**：在 `AGENTS.md` 中添加记忆检索策略规则，引导 Agent 在遇到回忆类问题时主动使用 `memory_search`。
    - **Context Injection**：每次对话开始时，自动从 sessions 中提取最近对话摘要，注入 System Prompt，让 Agent 记住最近发生的事。
- **规划中**：
    - **Auto-Recall**：使用 NLP 检测用户输入中的"回忆类"关键词，自动触发 `memory_search` 并将结果注入上下文。
- **价值**：让 Agent 像人类一样自然地回忆，而非机械地等待用户显式请求。

### 18. 上下文自动压缩 (Context Compaction) Phase 2.3

- **目标**：解决长时间对话和自动化任务中上下文窗口溢出的问题，让 Agent 能够持续运行而不丢失关键信息。
- **状态**：✅ 已完成 (2026-02-13)
- **背景**：
    - 原有系统存在三层上下文控制（`maxHistory` 硬截断、`compaction.ts` 文本截断、`trimMessagesToFit` 暴力裁剪），但均为无语义的机械截断，且 `summarizer` 参数从未被注入，不调用模型。
    - 长时间自动化任务（心跳、Cron、复杂工具链）会导致上下文快速膨胀，触发暴力裁剪后丢失关键决策和操作结果。
- **实现内容**：
    - **三层渐进式压缩架构**：
        - **Tier 3 — Working Memory**：保留最近 N 条消息的完整内容（默认 10 条），作为当前"热"上下文。
        - **Tier 2 — Rolling Summary**：当 Working Memory 溢出时，溢出的消息由模型生成增量摘要合入此层。每次只处理新溢出的消息，不从头重新生成。
        - **Tier 1 — Archival Summary**：当 Rolling Summary 超过阈值（默认 2000 token）时，进一步压缩为超浓缩版本，只保留最终结论、用户偏好和关键决策。
    - **增量压缩**（`compactIncremental`）：
        - 接收 `CompactionState` 状态对象，只处理新溢出的消息，避免每次从头生成摘要。
        - 摘要 Prompt 区分"首次生成"和"增量更新"两种模式。
    - **工具结果预压缩**：
        - 工具调用结果（网页内容、文件内容、命令输出）在合入摘要前先做结构化截取（保留前 400 + 末尾 100 字符），避免冗长输出撑爆摘要。
    - **双触发点**：
        1. **请求前触发**：`server.ts` 调用 `getHistoryCompacted()` 时，基于 token 阈值判断。
        2. **ReAct 循环内触发**：`tool-agent.ts` 每次调用模型前，检查上下文使用比例（默认 75%），超过时执行循环内压缩，防止长工具链撑爆上下文。
    - **Summarizer 注入**：
        - `gateway.ts` 基于 `FailoverClient` 创建 summarizer 函数，注入到 `ConversationStore` 和 `ToolEnabledAgent`。
        - 支持独立配置摘要专用模型、API 地址和密钥（`BELLDANDY_COMPACTION_MODEL` / `BELLDANDY_COMPACTION_BASE_URL` / `BELLDANDY_COMPACTION_API_KEY`），可使用便宜模型降低成本。
        - 不配置时复用主模型。
    - **CompactionState 持久化**：
        - 每个会话的压缩状态（滚动摘要、归档摘要、已压缩消息数、时间戳）保存到 `~/.belldandy/sessions/{会话ID}.compaction.json`。
        - 重启后自动加载，摘要不丢失。
    - **Hook 系统接入**：
        - `before_compaction` / `after_compaction` 钩子已接入实际压缩流程，事件增加 `tier`（rolling/archival）和 `source`（request/loop）字段。
    - **降级策略**：
        1. 模型摘要可用 → 使用模型生成高质量摘要。
        2. 模型不可用/超时 → 降级为文本截断摘要（`buildFallbackSummary`，每条取前 200 字符）。
        3. 压缩本身失败 → 回退到 `trimMessagesToFit` 暴力裁剪（最后防线不变）。
- **改动文件**：
    | 文件 | 改动 |
    |------|------|
    | `packages/belldandy-agent/src/compaction.ts` | 核心重构：三层状态、增量压缩、工具结果预压缩、摘要 Prompt、兼容旧 API |
    | `packages/belldandy-agent/src/conversation.ts` | `CompactionState` 持久化读写、增量 `getHistoryCompacted()`、hook 回调 |
    | `packages/belldandy-agent/src/tool-agent.ts` | ReAct 循环内压缩检查点、`compactInLoop` 方法 |
    | `packages/belldandy-core/src/bin/gateway.ts` | 注入 summarizer 函数、新增 6 个环境变量 |
    | `packages/belldandy-agent/src/hooks.ts` | `BeforeCompactionEvent` / `AfterCompactionEvent` 增加 `tier`、`source` 字段 |
    | `packages/belldandy-agent/src/index.ts` | 导出新增类型 |
- **环境变量**：
    | 变量 | 默认值 | 说明 |
    |------|--------|------|
    | `BELLDANDY_COMPACTION_ENABLED` | `true` | 总开关 |
    | `BELLDANDY_COMPACTION_THRESHOLD` | `12000` | 触发压缩的 token 阈值 |
    | `BELLDANDY_COMPACTION_KEEP_RECENT` | `10` | 保留最近消息条数 |
    | `BELLDANDY_COMPACTION_TRIGGER_FRACTION` | `0.75` | ReAct 循环内触发比例 |
    | `BELLDANDY_COMPACTION_ARCHIVAL_THRESHOLD` | `2000` | Rolling Summary 归档阈值 |
    | `BELLDANDY_COMPACTION_MODEL` | （空，复用主模型） | 摘要专用模型 |
    | `BELLDANDY_COMPACTION_BASE_URL` | （空，复用主模型） | 摘要专用 API 地址 |
    | `BELLDANDY_COMPACTION_API_KEY` | （空，复用主模型） | 摘要专用 API 密钥 |
- **价值**：
    - 长时间自动化任务不再因上下文溢出而中断或丢失关键信息。
    - 模型摘要保留语义，远优于机械截断。
    - 增量更新避免重复计算，降低 token 消耗。
    - 三层渐进降级确保任何情况下都不会阻塞对话。

---

### 19. Canvas 可视化工作区 (Phase P2-4 / P3-3)

- **目标**：提供可视化的无限画布，让用户和 Agent 都能以节点+连线的方式组织信息、拆解任务、关联知识，并实现 Agent 工作过程的实时可视化。
- **实现内容**：
    - **自研 SVG 画布引擎**：基于 SVG + `<foreignObject>` 的无限画布，零第三方渲染依赖。支持平移、缩放（viewBox 变换）、节点拖拽、端口连线、框选。
    - **8 种节点类型**：task（任务，带 todo/doing/done 状态流转）、note（笔记）、method（方法论关联）、knowledge（知识关联）、agent-output（Agent 输出）、screenshot（浏览器快照）、session（会话关联）、group（分组容器）。
    - **dagre.js 自动布局**：CDN 引入 dagre.js（~30KB），支持 TB/LR 方向的有向图自动布局，pinned 节点在布局时固定不动。
    - **贝塞尔曲线连线**：SVG `<path>` 渲染，带箭头标记，支持 solid/dashed/dotted 三种线型。
    - **持久化**：复用 `workspace.read/write` 协议，画布数据存储为 `~/.belldandy/canvas/<boardId>.json`，包含完整的节点、连线、视口状态。
    - **10 个 Agent 工具**（`packages/belldandy-skills/src/builtin/canvas.ts`）：
        - `canvas_list` / `canvas_create` / `canvas_read`：画布 CRUD
        - `canvas_add_node` / `canvas_update_node` / `canvas_remove_node`：节点操作
        - `canvas_connect` / `canvas_disconnect`：连线操作
        - `canvas_auto_layout`：触发自动布局
        - `canvas_snapshot`：生成画布文本摘要（供 Agent 理解画布状态）
    - **实时 WS 事件桥**：Agent 的写操作通过 `canvas.update` 事件实时推送到前端，增量更新（不重绘整个画布）。
    - **资源关联与双击跳转**：
        - method/knowledge/session 类型节点创建时弹出资源选择器，列出工作区中可用的文件
        - 双击节点按 ref 类型跳转：method→编辑器、memory→编辑器、session→聊天模式、url→新窗口、file→编辑器
        - 无 ref 节点双击弹出编辑对话框
        - 有关联的节点显示 🔗 badge
    - **Agent 自动填充**：Agent 通过 `canvas_add_node` 创建带 ref 的节点时，自动读取关联文件内容填充到 content 字段（截断 500 字符预览）。
    - **画布上下文注入**：用户在画布视图发送消息时，自动将画布摘要（节点列表+连线关系）注入到消息文本中，让 Agent 了解当前画布状态。工具栏"分析画布"按钮可一键将摘要填入输入框。
    - **ReAct 循环可视化**：
        - 工具栏 ReAct 开关，开启后 Agent 的工具调用过程实时映射为画布节点链
        - `tool_call` → 黄色临时节点（带 pulse 动画），显示工具名和参数预览
        - `tool_result` → 节点变绿（成功）或变红（失败），内容更新为结果摘要
        - `chat.final` → 紫色总结节点，连线到最后一个工具节点
        - 用户可 pin 有价值的临时节点，关闭 ReAct 时未固定节点自动清除
    - **server.ts 事件转发**：stream 循环新增 `tool_call` / `tool_result` 事件转发到前端（output 截断 500 字符防止 WS 帧过大）。
    - **三态切换**：chat ↔ editor ↔ canvas 无缝切换，侧边栏"画布工作区"按钮入口。
    - **Undo/Redo**：50 步撤销栈，`Ctrl+Z` 快捷键。
    - **右键菜单**：画布空白处右键添加节点，节点右键删除/固定。
    - **内存互斥锁**：canvas.ts 对同一 boardId 加内存 mutex，防止 Agent 并发写冲突。
- **文件清单**：
    | 文件 | 说明 |
    |------|------|
    | `apps/web/public/canvas.js` (~1200 行) | 前端画布引擎：BoardManager + CanvasRenderer + CanvasApp |
    | `apps/web/public/canvas.css` (~500 行) | Ethereal 主题适配：节点/连线/工具栏/选择器/ReAct 样式 |
    | `apps/web/public/index.html` | canvasSection DOM、dagre CDN、工具栏（含分析画布/ReAct 按钮） |
    | `apps/web/public/app.js` | switchMode 三态、canvas.update/tool_call/tool_result 事件处理、画布上下文注入、桥接函数 |
    | `packages/belldandy-skills/src/builtin/canvas.ts` (~690 行) | 10 个 Agent 工具 + 数据模型 + autoPopulateContent |
    | `packages/belldandy-skills/src/index.ts` | 导出 createCanvasTools + 类型 |
    | `packages/belldandy-core/src/bin/gateway.ts` | 注册 canvas 工具组、注入 broadcastEvent |
    | `packages/belldandy-core/src/server.ts` | tool_call/tool_result 事件转发 |
- **价值**：将 Agent 的能力从纯文本对话扩展到可视化空间，用户可以用画布组织复杂项目、拆解需求、关联知识库；Agent 可以主动建图、实时推送更新；ReAct 可视化让 Agent 的思考过程透明可见，增强用户信任与理解。

---

### 20. 可视化配置 & System Doctor (Phase 2.5)

**状态**：✅ 已完成

为了解决"手动改配置文件太极客"的痛点，我们在 WebChat 中集成了**可视化配置面板**。

#### 功能亮点
1.  **Lenient Mode (宽容模式)**：
    *   Gateway 启动时不再强校验 API Key。
    *   即使用户什么都没配，也能打开界面（不会白屏/Crash）。
    *   只有在真正发消息时，才会提示"配置缺失"并弹出设置窗。
2.  **Settings UI (配置面板)**：
    *   点击右上角"⚙️"图标即可打开。
    *   支持修改 **OpenAI Key**, **Base URL**, **Model**, **Heartbeat Interval**。
    *   **Auto-Save & Restart**: 点击 Save 后，自动更新 `.env.local` 并重启后端进程（配合 `start.sh/bat` 守护进程实现）。
3.  **System Doctor (系统体检)**：
    *   面板顶部实时显示 Health Badge。
    *   检查项：Node.js 版本、Vector DB 状态、Agent Config 有效性。

#### 技术实现
*   **Backend**:
    *   新增 `config.read` / `config.update` 协议（读写 `.env.local`）。
    *   新增 `system.doctor` 协议（自检）。
    *   新增 `system.restart` 协议（`process.exit(100)` 触发守护进程重启）。
*   **Frontend**:
    *   原生 JS/CSS 实现 Modal 组件，无缝集成到现有 MVP。

### 20.5 可视化工具管理 (Phase 2.6: Tool & MCP Management UI)

**状态**：✅ 已完成

**目标**：赋予用户精细控制 Agent 能力边界的权限，允许在运行时动态启用/禁用特定的工具、MCP 服务器或插件。

**实现内容**：
- **Tool Settings Panel (调用设置)**：
    - 在 WebChat 顶部栏新增 **工具设置** 入口（🛠️ 图标）。
    - **分栏管理**：
        - **Builtin Tools**：管理内置工具（Web, File, OS 等）。
        - **MCP Servers**：管理已连接的 MCP 服务器及其工具。
        - **Plugins**：管理已加载的插件。
    - **实时开关**：
        - 提供 Toggle Switch 开关。
        - 修改后立即生效（更新 Gateway 内存状态并持久化到配置）。
- **后端协议**：
    - 新增 `tools.list`：获取当前工具列表及禁用状态。
    - 新增 `tools.update`：更新工具禁用列表（`disabled: { builtin: [], mcp_servers: [], plugins: [] }`）。
- **价值**：
    - **安全性**：用户可以一键禁用高风险工具（如 `run_command`），实现"按需授权"。
    - **调试便利**：开发者可以快速启用/禁用特定 MCP 服务器进行调试。

### 21. 极致美学重构 (Phase 3: Ethereal Digital UI)

**状态**：✅ 已完成

**目标**：将功能性的 MVP 界面升级为具有高级感、沉浸感的用户体验。

**实现内容**：
- **Ethereal Design System**:
    - **视觉**: 采用 "Deep Void" 深空黑背景配合 "Divine Cyan" 青色霓虹点缀，营造赛博神性氛围。
    - **质感**: 广泛使用 CSS `backdrop-filter: blur` 实现高级磨砂玻璃效果 (Glassmorphism)。
    - **排版**: 引入 `Outfit` (Headings) 和 `Inter` (Body) 谷歌字体。
- **Awakening Ritual (唤醒仪式)**:
    - 实现了首次连接时的 **Boot Sequence** 动画。
    - 模拟终端自检日志滚动 (`Initializing Neural Interface...`)，赋予 AI "生命感"。
- **交互微调**:
    - **Smart Input**: 实现了 `textarea` 的高度自适应与 Shift+Enter 换行逻辑。
    - **Motion**: 添加了消息气泡的淡入上浮动画 (`fade-up`)。

---

### 22. 飞书渠道接入 (Phase 3.1)

- **目标**：将 Belldandy 接入飞书自建应用，利用其 WebSocket 模式实现无需内网穿透的实时对话。
- **状态**：**已完成**（2026-02-01）
- **实现内容**：`@belldandy/channels` 包 + FeishuChannel（WebSocket 长连接），消息去重，Kimi K2.5 工具调用兼容。

### 23. 渠道架构升级 (Channel Architecture) Phase 15

- **目标**：建立标准化的渠道接口，方便后续快速接入 Telegram、Discord、Slack 等社交平台。
- **状态**：**已完成**（2026-02-05）
- **实现内容**：
    - **Channel 通用接口**：定义了所有渠道必须实现的标准方法（`start`、`stop`、`sendProactiveMessage`）。
    - **ChannelManager**：渠道管理器，支持统一注册、启停、广播消息。
    - **FeishuChannel 适配**：飞书渠道已实现新接口，完全向后兼容。
- **接口设计**：
    ```typescript
    interface Channel {
        readonly name: string;           // 渠道名称: "feishu", "telegram"
        readonly isRunning: boolean;     // 运行状态
        start(): Promise<void>;          // 启动渠道
        stop(): Promise<void>;           // 停止渠道
        sendProactiveMessage(content: string, chatId?: string): Promise<boolean>;
    }
    ```
- **文件结构**：
    ```
    packages/belldandy-channels/src/
    ├── types.ts      # Channel 通用接口定义
    ├── manager.ts    # ChannelManager 管理器
    ├── feishu.ts     # 飞书渠道实现 (implements Channel)
    └── index.ts      # 统一导出
    ```
- **价值**：降低新渠道接入成本，只需实现 `Channel` 接口即可接入系统，预计每个新渠道开发周期可缩短至 1-2 天。

### 24. Heartbeat 定时任务 (Phase 7) ✅ 已完成

- **目标**：让 Agent 能够定期"醒来"检查 HEARTBEAT.md 并主动联系用户。
- **状态**：**已完成**（2026-02-01）
- **实现内容**：
    - 心跳 Runner（`packages/belldandy-core/src/heartbeat/`）
    - 定时触发 + 活跃时段支持（深夜不打扰）
    - HEARTBEAT.md 内容解析（空文件跳过）
    - HEARTBEAT_OK 响应检测（无事静默，有事推送）
- **价值**：Agent 可以主动提醒用户，如每日日程检查、待办事项提醒等。

#### 💡 Moltbot 对标分析：Heartbeat 模块

| 功能特性 | Moltbot 实现 | Belldandy 实现 | 差异/优化点 |
|---------|-------------|----------------|------------|
| **基础触发** | 定时器 + Command Queue 检查 | 简单定时器 (setInterval) | Belldandy 尚未实现队列忙碌检测，可能在 Agent 繁忙时插队 |
| **活跃时段** | 支持 User/Local 时区，精确分钟控制 | 支持时区与 HH:MM 范围 | 基本一致，Moltbot 的时区处理更健壮 |
| **消息去重** | ✅ **支持** (24内重复内容静默) | ❌ **未实现** | **差异点**：Moltbot 防止了一件事重复唠叨，Belldandy 可能会重复提醒 |
| **空值优化** | ✅ 检查文件内容是否为空 (skip empty) | ✅ 检查文件内容是否为空 | 一致，节省 Token |
| **静默响应** | `HEARTBEAT_OK` token 检测 | `HEARTBEAT_OK` token 检测 | 一致 |
| **多 Agent** | 支持每个 Agent 独立频率与配置 | 全局单一配置 | 架构差异，当前够用 |

> **改进建议**：未来应引入消息去重机制（Deduplication），防止 Agent 在无法执行操作时反复发送同一条提醒。

### 24.5 Cron 定时任务系统 (Phase 7.5) ✅ 方案 A 已完成

- **目标**：在 Heartbeat 之上，抽象通用定时任务调度，让 Agent 能按计划触发非心跳类任务。
- **状态**：**方案 A (轻量 MVP) 已完成**（2026-02-10）
- **定位**：Heartbeat = 周期性"意识"检查（批量、共享上下文），Cron = 精确调度独立任务（一次性提醒、周期报告等）。
- **实现内容**：
    - **核心模块** (`packages/belldandy-core/src/cron/`)：
        - `types.ts`：调度类型（`at` 一次性 / `every` 周期重复）、`systemEvent` Payload、Job 状态
        - `store.ts`：JSON 文件持久化（`~/.belldandy/cron-jobs.json`），原子写入，CRUD
        - `scheduler.ts`：30s 轮询引擎，活跃时段过滤，忙碌检测，`at` 执行后自动禁用/删除
        - `index.ts`：统一导出
    - **Agent 工具** (`packages/belldandy-skills/src/builtin/cron-tool.ts`)：
        - `list`：列出所有定时任务
        - `add`：创建任务（支持 `at` 和 `every` 两种调度）
        - `remove`：删除任务
        - `status`：查看调度器状态
    - **Gateway 集成**：
        - `BELLDANDY_CRON_ENABLED=true` 启用调度引擎
        - 复用 Heartbeat 的 `sendMessage`/`deliverToUser` 模式
        - 工具始终注册（即使调度器未启用也可管理任务列表）
- **使用示例**：
    - "每 4 小时提醒我站起来活动" → `cron add --every 14400000 --text "..."`
    - "下午 3 点提醒我开会" → `cron add --at "2026-02-10T15:00:00+08:00" --text "..."`

#### 🚀 方案 B 升级路径（未来按需）

| 升级项 | 内容 | 好处 |
|--------|------|------|
| **Cron 表达式** | 引入 `croner` 库，支持 5 字段表达式（如 `0 9 * * 1`） | 精确到分钟的复杂调度（"每周一 9 点"） |
| **Session 隔离** | `main` / `isolated` 会话目标 | 避免定时任务历史污染主会话上下文 |
| **agentTurn Payload** | 在隔离会话中启动独立 Agent 对话，支持模型/thinking 覆盖 | 重任务用 Opus，轻任务用便宜模型 |
| **Delivery 路由** | `announce` / `none` + 渠道定向推送 | 定时任务结果推送到指定飞书群/Telegram |
| **Gateway 协议** | `cron.*` 系列 RPC 方法 | 前端 WebChat 可直接管理定时任务 |
| **执行历史** | `run` / `runs` action | 手动触发 + 调试审计 |

### 25. 服务重启工具 (service_restart) ✅ 已完成

- **目标**：让 Agent 能够通过工具调用主动重启 Gateway 服务，无需用户手动操作。
- **状态**：**已完成**（2026-02-11）
- **实现内容**：
    - **`service_restart` 工具**（`packages/belldandy-skills/src/builtin/service-restart.ts`）：
        - 接受可选 `reason` 参数（用于日志记录）。
        - 执行前进行 **3 秒倒计时**，每秒通过 WebSocket 广播 `agent.status` 事件（`countdown: 3 → 2 → 1 → 0`）。
        - 倒计时结束后调用 `process.exit(100)` 触发 launcher 自动重启。
    - **WebChat 倒计时浮层**：
        - 前端监听 `agent.status` 事件中的 `status=restarting` + `countdown` 字段。
        - 显示半透明毛玻璃浮层，包含旋转图标、重启原因、大号倒计时数字（带 pulse 动画）。
        - 重连成功（`hello-ok`）后自动隐藏浮层。
    - **延迟绑定 broadcast**：工具注册时 server 尚未创建，通过闭包在执行时才调用 `server.broadcast`。
- **与现有重启机制的关系**：
    | 触发方式 | 位置 | 机制 |
    |----------|------|------|
    | `.env` 文件变更 | `gateway.ts` | `fs.watch` + 1500ms 防抖 → `process.exit(100)` |
    | `system.restart` WS 命令 | `server.ts` | 500ms 延迟 → `process.exit(100)` |
    | WebChat "Restart" 按钮 | `app.js` | 发送 `system.restart` WS 请求 |
    | **`service_restart` 工具** | `service-restart.ts` | **3 秒倒计时广播 → `process.exit(100)`** |
- **文件结构**：
    ```
    packages/belldandy-skills/src/builtin/
    └── service-restart.ts    # [NEW] service_restart 工具

    apps/web/public/
    ├── index.html            # [MODIFIED] 新增 #restartOverlay 浮层
    ├── styles.css            # [MODIFIED] 新增倒计时浮层样式
    └── app.js                # [MODIFIED] 处理 agent.status 倒计时事件
    ```
- **价值**：Agent 可以在修改配置后自主重启服务，实现完整的"修改配置 → 重启生效"自动化闭环。

### 26. FACET 模组切换工具 (switch_facet) ✅ 已完成

- **目标**：将 SOUL.md 中 FACET 模组的手动读写切换流程自动化为一次工具调用，省时、省 Token、减少错误。
- **状态**：**已完成**（2026-02-11）
- **实现内容**：
    - **`switch_facet` 工具**（`packages/belldandy-skills/src/builtin/switch-facet.ts`）：
        - 接受 `facet_name` 参数（模组文件名，不含 `.md` 后缀）。
        - 自动定位 SOUL.md 中的锚点行（`## **警告** FACET 模组 内容切换时...`）。
        - 保留锚点行及之前的所有内容，将锚点行之后替换为目标 facet 文件内容。
        - **原子写入**：先写 `SOUL.md.tmp`，成功后 `fs.rename` 覆盖，确保 SOUL.md 不会因中途失败而损坏。
        - **路径穿越防护**：拒绝包含 `/`、`\`、`..` 的 facet_name。
        - **友好错误提示**：模组不存在时列出所有可用模组名称。
    - **SOUL.md 提示词精简**：
        - 原 FACET 动态切换协议从 6 步手动读写流程精简为 5 步工具调用流程。
        - 去掉了手动文件读写步骤和方法论文件引用，Agent 只需调用 `switch_facet` + `service_restart` 即可完成切换。
- **与原有手动流程的对比**：
    | 对比项 | 原流程（手动） | 新流程（工具） |
    |--------|---------------|---------------|
    | 步骤数 | 6 步（读文件→定位→替换→审计→确认→重启） | 2 步（`switch_facet` → `service_restart`） |
    | Token 消耗 | 高（需读写大量文件内容） | 低（一次工具调用） |
    | 出错风险 | 高（网络/环境问题可能中断） | 低（原子写入保证一致性） |
    | 耗时 | 多轮对话 | 单轮完成 |
- **文件结构**：
    ```
    packages/belldandy-skills/src/builtin/
    └── switch-facet.ts           # [NEW] switch_facet 工具

    packages/belldandy-skills/src/
    └── index.ts                  # [MODIFIED] 导出 switchFacetTool

    packages/belldandy-core/src/bin/
    └── gateway.ts                # [MODIFIED] 导入并注册 switchFacetTool

    packages/belldandy-agent/src/templates/
    └── SOUL.md                   # [MODIFIED] 精简 FACET 切换协议提示词
    ```
- **价值**：将 FACET 模组切换从"Agent 自行摸索的多步操作"变为"一键工具调用"，显著降低切换成本和失败率。

### 27. 多 Agent 配置体系 (AgentProfile & AgentRegistry) ✅ 已完成

- **目标**：为多 Agent 场景打下配置基础，支持按 agentId 创建不同配置的 Agent 实例。
- **状态**：✅ 已完成（对应 IMPLEMENTATION_PLAN B-P1-5）
- **实现内容**：
    - **AgentProfile 类型** (`packages/belldandy-agent/src/agent-profile.ts`)：
        - 描述一个 Agent 的完整配置：`id`、`displayName`、`model`（引用 models.json 中的条目或 `"primary"` 使用环境变量）、`systemPromptOverride`、`workspaceDir`、`toolsEnabled`、`toolWhitelist`、`maxInputTokens`。
        - `loadAgentProfiles(filePath)` 从 `~/.belldandy/agents.json` 加载配置，文件不存在时静默返回空数组。
        - `resolveModelConfig()` 将 `model` 字段解析为实际的 baseUrl/apiKey/model 配置。
        - `buildDefaultProfile()` 构建隐式的 `"default"` profile（始终存在，映射到环境变量配置）。
    - **AgentRegistry 注册表** (`packages/belldandy-agent/src/agent-registry.ts`)：
        - 替代原有的单一 `agentFactory` 闭包，支持按 agentId 创建/缓存 Agent 实例。
        - `register(profile)` 注册 Profile，`create(agentId)` 按需创建或复用缓存实例。
        - `list()` 列出所有已注册 Profile，`has(agentId)` 检查是否存在。
    - **ConversationStore 元数据扩展** (`packages/belldandy-agent/src/conversation.ts`)：
        - `Conversation` 和 `ConversationMessage` 增加可选 `agentId` 和 `channel` 字段。
        - 消息持久化时携带 agentId，支持按 Agent 隔离会话。
    - **协议层预留** (`packages/belldandy-protocol/src/index.ts`)：
        - `MessageSendParams` 增加可选 `agentId` 字段。
    - **Gateway 集成** (`packages/belldandy-core/src/bin/gateway.ts`)：
        - 启动时加载 `agents.json` → 构建 AgentRegistry → 注册所有 Profile。
        - 无 `agents.json` 时行为与改动前完全一致（向后兼容）。
- **配置格式** (`~/.belldandy/agents.json`)：
    ```json
    {
      "agents": [
        {
          "id": "coder",
          "displayName": "代码专家",
          "model": "primary",
          "systemPromptOverride": "你是一个严谨的代码专家",
          "toolsEnabled": true,
          "toolWhitelist": ["file_read", "file_write", "run_command"]
        }
      ]
    }
    ```
- **设计决策**：
    - 独立 `agents.json` 文件，不污染 `models.json`。
    - 密钥管理：AgentProfile 通过 `model` 字段引用 ModelProfile.id，不重复存储密钥。
- **价值**：为多 Agent 路由、子 Agent 编排、渠道绑定等后续功能提供了统一的配置基础设施。

### 27.5 多 Agent 路由与前端集成 (P2-1a/b) ✅ 已完成

- **目标**：实现 WebChat Agent 选择、渠道级 Agent 绑定、会话隔离等多 Agent 运行时能力。
- **状态**：✅ 已完成
- **实现内容**：
    - **`agents.list` API**（`packages/belldandy-core/src/server.ts`）：
        - 新增 WebSocket 方法 `agents.list`，返回已注册的 AgentProfile 列表（`id`、`displayName`、`model`）。
    - **WebChat Agent 选择器**：
        - 配置了多个 Agent Profile 后，WebChat 界面顶部出现 Agent 下拉选择器。
        - 切换 Agent 后，`message.send` 请求携带 `agentId`，Gateway 路由到对应 Agent 实例。
    - **实例缓存**：
        - AgentRegistry 为每个 agentId 维护独立的 Agent 实例（含 FailoverClient cooldown 状态），避免重复创建。
    - **会话隔离**：
        - 通过 `agentId` 隔离 ConversationStore，不同 Agent 的会话互不干扰。
    - **飞书渠道绑定**：
        - 新增 `BELLDANDY_FEISHU_AGENT_ID` 环境变量，飞书渠道可绑定特定 Agent Profile。
        - 未设置时使用 default Agent，向后兼容。
- **价值**：用户可以在同一个 Belldandy 实例中运行多个不同人格/能力的 Agent，并在 WebChat 中自由切换。

### 27.6 Per-Agent Workspace 与 Facet 共存 (阶段 4) ✅ 已完成

- **目标**：让每个非 default Agent 拥有独立的人格文件和 FACET 模组目录，同时保持与根目录的继承关系。
- **状态**：✅ 已完成（通过构建 + 97 个测试用例验证）
- **实现内容**：
    - **Per-Agent Workspace 目录**：
        - `ensureAgentWorkspace()` 创建 `~/.belldandy/agents/{agentId}/` 和 `facets/` 子目录。
        - `loadAgentWorkspaceFiles()` 按优先级加载：优先从 `agents/{id}/` 读取，缺失则 fallback 到根目录。
        - 可继承文件：SOUL.md、IDENTITY.md、USER.md、AGENTS.md、TOOLS.md、MEMORY.md。
    - **switch_facet 多 Agent 适配**：
        - `resolveAgentPaths()` 根据 `context.agentId` 定位对应 Agent 目录的 SOUL.md 和 facets/。
        - default Agent 使用根目录，其他 Agent 使用 `agents/{id}/` 子目录。
    - **AgentProfile 字段扩展**：
        - 新增 `workspaceDir?: string`（Agent 专属 workspace 目录名，默认等于 id）。
        - `soulFile` 标记 `@deprecated`，由 `workspaceDir` 替代。
    - **ToolContext 扩展**：
        - `ToolContext` 新增 `agentId?: string`，工具执行时可感知当前 Agent 身份。
    - **Gateway 集成**：
        - 启动时为每个非 default Agent 创建 workspace 目录、预加载 workspace 文件、构建独立 system prompt（缓存到 `agentWorkspaceCache`）。
- **目录结构**：
    ```
    ~/.belldandy/
    ├── SOUL.md              # default Agent
    ├── IDENTITY.md
    ├── agents/
    │   ├── coder/
    │   │   ├── SOUL.md      # 覆盖 default
    │   │   ├── IDENTITY.md
    │   │   └── facets/
    │   │       └── strict.md
    │   └── researcher/
    │       └── SOUL.md
    ```
- **价值**：Facet 模组（全局人格扩展热替换）与 AgentProfile（多 Agent 人格差异化）互补共存，不互相替代。

### 28. 子 Agent 编排 (Sub-Agent Orchestration) Phase 16 ✅ MVP 已完成

- **目标**：将复杂任务分发给独立的子 Agent，实现 Agent 团队协作。
- **状态**：✅ MVP 已完成（24 tests 通过）
- **实现内容**：
    - **SubAgentOrchestrator 核心类** (`packages/belldandy-agent/src/orchestrator.ts`)：
        - 管理子 Agent 会话的完整生命周期：spawn → run → collect result → cleanup。
        - **Batch 模式**：子 Agent 完成后返回聚合结果给父 Agent，不污染 ReAct 上下文。
        - **Event Hook**：通过 `onEvent` 回调将子 Agent 状态实时推送（started / queued / thought_delta / completed）。
        - **独立 conversationId**：子 Agent 运行在隔离的会话中。
        - **嵌套深度限制**：通过 `context._orchestratorDepth` 防止无限递归（默认最大深度 2）。
        - **超时保护**：子 Agent 运行超时自动终止（默认 120 秒）。
    - **工具集**（`packages/belldandy-skills/src/builtin/session/`）：
        | 工具 | 说明 |
        |------|------|
        | `delegate_task` | 委托单个任务给指定子 Agent（语义化接口，指定 `agent_id` + `instruction`） |
        | `sessions_spawn` | 生成子 Agent 会话（底层工具，功能与 delegate_task 类似） |
        | `sessions_history` | 查看当前会话的所有子 Agent 会话状态 |
    - **Gateway 集成**：
        - 创建 SubAgentOrchestrator 实例，注入 AgentRegistry 和 ConversationStore。
        - 通过 `agentCapabilities` 将 `spawnSubAgent` / `listSessions` 能力注入 ToolContext。
        - 注册 `delegate_task` / `sessions_spawn` / `sessions_history` 工具。
- **环境变量**：
    | 变量 | 默认值 | 说明 |
    |------|--------|------|
    | `BELLDANDY_SUB_AGENT_MAX_CONCURRENT` | `3` | 同时运行的子 Agent 上限 |
    | `BELLDANDY_SUB_AGENT_TIMEOUT_MS` | `120000` | 单个子 Agent 运行超时（ms） |
    | `BELLDANDY_SUB_AGENT_MAX_DEPTH` | `2` | 子 Agent 嵌套委托最大深度 |
- **价值**：赋予 Agent "团队作战"能力，主 Agent 可以将子任务分发给专业化的子 Agent（如让 coder 写代码、researcher 查资料），提升复杂任务的完成质量。

### 28.5 Agents 后续迭代 Phase 25 Step 1-3 ✅ 已完成

- **目标**：基于 Phase 16 MVP 的 SubAgentOrchestrator 进行增强，提升并发能力和系统集成度。
- **状态**：✅ Step 1-3 已完成（24 tests 通过）
- **参考框架**：Inngest AgentKit（Network/Router）、OpenAI Agents JS（生命周期钩子）、LangGraph（Orchestrator-Worker + 条件分支）。
- **实现内容**：
    - **Step 1: 并发排队机制**：
        - 超出 `maxConcurrent` 时任务自动排队等待，队列满才拒绝。
        - `drainQueue()` 在子 Agent 完成后自动消费队列中的下一个任务。
        - 排队超时检测：等待时间超过 `sessionTimeoutMs` 的任务自动失败。
        - 新增 `BELLDANDY_SUB_AGENT_MAX_QUEUE_SIZE` 环境变量（默认 10）。
    - **Step 2: `delegate_parallel` 工具**：
        - 新增 `delegate_parallel` 工具（`packages/belldandy-skills/src/builtin/session/delegate-parallel.ts`）。
        - 接受 `tasks` 数组，每个 task 包含 `instruction`、`agent_id`（可选）、`context`（可选）。
        - 所有任务并行执行（通过 `orchestrator.spawnParallel()`），超出并发上限的自动排队。
        - 全部完成后返回聚合结果（每个 task 的成功/失败状态和输出）。
    - **Step 3: 生命周期钩子集成**：
        - 新增 `OrchestratorHookRunner` 接口，由 Gateway 层注入实际的 HookRunner 实例。
        - 子 Agent session 触发 `session_start` / `session_end` 钩子。
        - 钩子错误不阻塞子 Agent 执行（catch + warn 日志）。
- **改动文件**：
    ```
    packages/belldandy-agent/src/orchestrator.ts     — 排队机制 + OrchestratorHookRunner 集成
    packages/belldandy-skills/src/builtin/session/
    ├── delegate-parallel.ts                          — [NEW] 并行委托工具
    └── index.ts                                      — 导出 delegateParallelTool
    packages/belldandy-skills/src/types.ts            — AgentCapabilities.spawnParallel
    packages/belldandy-core/src/bin/gateway.ts        — 注册 + 绑定
    ```
- **后续迭代项**（待实施）：
    | 项目 | 优先级 | 说明 |
    |------|--------|------|
    | WebChat 前端展示 | P2 | `onEvent` → Gateway 转发 → WebSocket → 前端 UI 展示子 Agent 状态卡片 |
    | 条件分支编排 | P3 | `orchestrate` 工具，接受 DAG 描述，拓扑排序 → 同层并行 → 条件判断 → 聚合结果 |
- **价值**：并发排队避免资源争抢，`delegate_parallel` 让多个子 Agent 真正并行工作，钩子集成确保子 Agent 生命周期可观测。

### 29. MCP (Model Context Protocol) 支持 (Phase 17) ✅ 已完成

- **目标**：实现 MCP 协议支持，让 Belldandy 能够连接外部 MCP 服务器，获取第三方工具和数据源。
- **背景**：MCP 是 Anthropic 提出的标准化协议，moltbot 通过 ACP 实现了类似功能。
- **状态**：**已完成**（2026-02-05）
- **实现内容**：
    - **新建 `@belldandy/mcp` 包**：完整的 MCP 客户端实现
    - **类型定义 (types.ts)**：配置类型、运行时状态、事件类型等
    - **配置加载 (config.ts)**：使用 Zod 验证 `~/.belldandy/mcp.json` 配置，支持双格式兼容
    - **MCP 客户端 (client.ts)**：支持 stdio/SSE 两种传输方式
    - **工具桥接 (tool-bridge.ts)**：MCP 工具 → Belldandy Skills 转换
    - **管理器 (manager.ts)**：多服务器连接管理、工具发现、事件处理
    - **Gateway 集成**：启动时自动初始化 MCP 并注册工具
    - **双格式配置兼容**：`loadConfig()` 自动检测并兼容两种 `mcp.json` 格式，用户无需手动转换
- **配置格式**：
    - **格式一：通用格式**（与 Claude Desktop / Cursor / Windsurf 等工具通用）：
        ```json
        {
          "mcpServers": {
            "server-id": {
              "command": "npx",
              "args": ["-y", "some-mcp-server"],
              "env": { "API_KEY": "xxx" }
            },
            "remote-server": {
              "url": "https://api.example.com/mcp"
            }
          }
        }
        ```
        转换规则：对象 key → `id`/`name`，`command`/`args`/`env`/`cwd` → `transport: { type: "stdio" }`，`url`/`baseUrl` → `transport: { type: "sse" }`，`disabled: true` → `enabled: false`。
    - **格式二：Belldandy 原生格式**（提供更多控制选项）：
        ```json
        {
          "version": "1.0.0",
          "servers": [
            {
              "id": "filesystem",
              "name": "文件系统",
              "transport": {
                "type": "stdio",
                "command": "npx",
                "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"]
              },
              "autoConnect": true,
              "enabled": true
            }
          ],
          "settings": {
            "defaultTimeout": 30000,
            "toolPrefix": true
          }
        }
        ```
- **新增环境变量**：
    | 变量 | 说明 |
    |------|------|
    | `BELLDANDY_MCP_ENABLED` | 启用 MCP 支持（默认 false） |
- **价值**：**开放生态**。用户可以接入任何 MCP 兼容的服务（1Password、GitHub、Notion、Slack 等），无需修改 Belldandy 代码即可扩展能力。

### 30. 日志系统 (Logging System) Phase 18 [核心已完成]

- **目标**：实现完整的文件日志系统，支持 Agent 回溯分析任务执行过程、错误排查和性能分析。
- **状态**：✅ 已完成
- **核心价值**：
    - **可观测性**：系统运行状态完全可追溯
    - **自我进化**：Agent 能基于历史日志学习和改进，与方法论系统协同
    - **运维友好**：自动轮转和清理，无需人工干预
- **实现内容**：
    - **Logger 核心**：统一的日志接口，支持 debug/info/warn/error 四个级别
    - **双输出**：同时输出到控制台（彩色）和文件（持久化）
    - **文件轮转**：
        - 按日期分文件：`logs/2026-02-05.log`
        - 按大小轮转：单文件超过 10MB 自动创建 `.1.log`、`.2.log`
    - **自动清理**：启动时清理超过保留天数（默认 7 天）的日志
    - **Agent 工具**：`log_read`、`log_search` 让 Agent 能读取日志进行自我分析
- **日志格式**：
    ```
    [2026-02-05T14:32:15.123+08:00] [INFO] [gateway] Server started on port 28889
    [2026-02-05T14:32:15.456+08:00] [DEBUG] [agent] Tool call: file_read {path: "..."}
    [2026-02-05T14:32:15.789+08:00] [WARN] [memory] Slow query detected: 1523ms
    [2026-02-05T14:32:16.012+08:00] [ERROR] [tools] web_fetch failed: ECONNREFUSED
    ```
- **日志目录**：
    ```
    ~/.belldandy/
    ├── logs/                       # 日志目录
    │   ├── 2026-02-05.log          # 当天日志
    │   ├── 2026-02-05.1.log        # 当天轮转文件
    │   ├── 2026-02-04.log          # 昨天日志
    │   └── ...
    ```
- **环境变量**：
    | 变量 | 说明 | 默认值 |
    |------|------|--------|
    | `BELLDANDY_LOG_LEVEL` | 最低日志级别 | `debug` |
    | `BELLDANDY_LOG_DIR` | 日志目录 | `~/.belldandy/logs` |
    | `BELLDANDY_LOG_MAX_SIZE` | 单文件最大大小 | `10MB` |
    | `BELLDANDY_LOG_RETENTION_DAYS` | 日志保留天数 | `7` |
- **与方法论系统的协同**：
    1. Agent 执行任务时，详细日志记录每一步操作与耗时
    2. 任务失败时，Agent 可通过 `log_search` 定位错误
    3. Agent 分析日志后，可调用 `method_create` 沉淀经验
    4. 下次遇到类似任务，Agent 先查阅方法论，避免重复踩坑
- **已完成扩展**：
    - MCP 全模块接入 logger（manager/client/config/tool-bridge）
    - tool-agent 钩子失败日志接入 logger
    - ToolExecutor auditLogger 接入，工具调用耗时写入日志
    - camera_snap 使用 context.logger

### 31. CLI 框架 (CLI Framework) Phase P1-2 [Phase A-D 已完成]

- **目标**：统一散装的 10 个 CLI 脚本为单一 `bdd` 命令入口，支持子命令树、`--help`、`--json` 双模输出、懒加载。
- **状态**：✅ Phase A-D 全部完成（框架搭建 + pairing 迁移 + start/dev + doctor + config + relay + setup 向导 + 旧脚本清理）
- **技术选型**：
    - **CLI 框架**：`citty`（~7 kB, 0 deps, ESM-first, 声明式 `defineCommand`）
    - **终端着色**：`picocolors`（~7 kB, 0 deps）
    - **交互提示**：`@clack/prompts`（美观、TypeScript 友好、支持 group/cancel/password）
- **实现内容**：
    - **统一入口**：`bin/bdd.ts` → `cli/main.ts`，通过 `runMain()` 启动
    - **共享模块**：
        - `cli/shared/context.ts`：`CLIContext` 提供 stateDir 解析、json/verbose 模式、log/error/success/warn/output helpers
        - `cli/shared/env-loader.ts`：从 `gateway.ts` 提取的 `loadEnvFileIfExists`，re-export `resolveStateDir`（单一来源）；Phase B 新增 `parseEnvFile`、`updateEnvValue`、`resolveEnvLocalPath` 用于 config 命令读写 `.env.local`
        - `cli/shared/output.ts`：`printSuccess/Error/Warn/Info/Json` 工具函数
    - **命令树**（懒加载）：
        - `bdd start` — 带 supervisor 的 Gateway 启动（fork + exit code 100 自动重启）
        - `bdd dev` — 开发模式直接启动 Gateway
        - `bdd pairing approve/revoke/list/pending/cleanup/export/import` — 全部 7 个配对管理子命令
        - `bdd doctor` — 健康诊断（Node 版本、pnpm、state 目录、.env.local、agent 配置、端口可用性、Memory DB、MCP 配置，可选 `--check-model` 模型连通性测试）
        - `bdd config list/get/set/edit/path` — 配置管理（读写 `.env.local`，密钥自动脱敏，`--show-secrets` 显示明文）
        - `bdd relay start [--port]` — 独立启动 WebSocket-CDP relay
        - `bdd setup` — 交互式 Onboarding Wizard（`@clack/prompts`），收集 provider、API 配置、host/port、auth mode，写入 `.env.local`；支持非交互模式（`--provider openai --base-url ... --api-key ... --model ...`）
    - **双模输出**：所有命令支持 `--json` 输出结构化 JSON，默认人类友好格式
    - **全局选项**：`--json`、`--state-dir`、`--verbose`、`--version`、`--help`
    - **过渡清理（Phase D）**：已删除 7 个旧 `pairing-*.ts` 散装脚本，移除 root `package.json` 中的 `pairing:*` 别名，旧写法不再可用
    - **bin 注册**：`@belldandy/core` 的 `package.json` 添加了 `bin` 字段（`belldandy` / `bdd`）
- **文件结构**：
    ```
    packages/belldandy-core/src/
    ├── cli/
    │   ├── main.ts                    # root command + subCommands 懒加载
    │   ├── shared/
    │   │   ├── context.ts             # CLIContext
    │   │   ├── output.ts              # 输出工具
    │   │   └── env-loader.ts          # env 加载/解析/写入 + resolveStateDir
    │   └── commands/
    │       ├── start.ts               # bdd start
    │       ├── dev.ts                 # bdd dev
    │       ├── doctor.ts              # bdd doctor（11 项健康检查）
    │       ├── config.ts              # bdd config (parent)
    │       ├── config/                # config 子命令 (list/get/set/edit/path)
    │       ├── relay.ts               # bdd relay (parent)
    │       ├── relay/start.ts         # bdd relay start
    │       ├── setup.ts               # bdd setup（交互式 + 非交互式）
    │       └── pairing/               # bdd pairing <sub> (7 个文件)
    │   └── wizard/
    │       └── onboard.ts             # Onboarding Wizard 交互逻辑
    └── bin/
        └── bdd.ts                     # bin 入口
    ```
- **后续阶段**：
    - 全部完成，无待办阶段。可扩展架构为后续 `skill`/`webhook` 等子命令预留挂载点。
- **价值**：统一入口降低用户记忆成本，`--json` 支持脚本化集成，懒加载保证轻量启动，可扩展架构为后续 `skill`/`webhook` 等子命令预留挂载点。

---

## 🚧 待实现功能规划

### 1. Local Embedding (优先级：低)

- **目标**：摆脱对 OpenAI Embedding API 的依赖，实现完全本地化的记忆检索。
- **实现内容**：
    - 引入 `node-llama-cpp` 或 `transformers.js` 等本地推理库。
    - 支持加载本地 Embedding 模型（如 `all-MiniLM-L6-v2` 或 `bge-m3`）。
    - 实现一个新的 `EmbeddingProvider` 接口实现类。
- **价值**： **隐私与成本**。不需要把记忆片段发给 OpenAI 计算向量，完全离线可用，且无 API 费用。但会增加内存占用和安装包体积。
- **工作量**：**中等**。主要挑战在于 Native 依赖的安装和模型文件的管理。

### 2. SOUL_EVIL 彩蛋 (优先级：低)

- **目标**：增加趣味性和“灵魂”感。
- **实现内容**：
    - 在特定触发条件下（如特定日期、特定指令、或随机概率），加载 `SOUL_EVIL.md` 替代默认的 `SOUL.md`。
    - Agent 的性格、语气会发生反转（模仿 moltbot 的彩蛋设计）。
- **价值**：**娱乐性**。让 AI 显得不那么死板。
- **工作量**：**低**。主要是逻辑判断和 System Prompt 的动态切换。

### 3. Memory Flush 机制 (优先级：低)

- **目标**：性能优化。
- **实现内容**：
    - 在记忆写入及索引过程中引入 Buffer 缓冲。
    - 在系统空闲或关闭前统一将内存中的变更写入磁盘（Compaction）。
- **价值**：**性能与硬盘寿命**。防止高频对话时频繁对 SQLite 进行微小写入。在目前单人使用且数据量不大的情况下，收益不明显。
- **工作量**：**低**。

### 4. 记忆系统优化 (优先级：中) — Phase M-Next

基于 OpenViking 的记忆系统架构，Belldandy 实施了一系列记忆系统升级，旨在提升检索质量、降低成本、增强智能感。

#### 已完成部分

1. **Embedding Cache (M-N0)** ✅
   - **痛点**：重复内容（如常见问候、固定模板）反复计算 Embedding，浪费 API 成本与时间。
   - **方案**：基于内容哈希的缓存表（`embedding_cache`），存储 `content_hash → embedding` 映射。
   - **实现**：
     - 新增 `embedding_cache` 表（content_hash / embedding / dimensions / model / created_at）。
     - `processPendingEmbeddings` 在计算前先查缓存，命中则直接使用。
     - 缓存命中率可达 30-50%（重复内容场景），显著降低 API 成本与索引时间。

2. **统一 MemoryStore (M-N1)** ✅
   - **痛点**：多个包（agent / skills / gateway）各自创建 MemoryStore 实例，导致数据库锁竞争与内存浪费。
   - **方案**：全局单例 `MemoryManager`，通过 `registerGlobalMemoryManager` / `getGlobalMemoryManager` 实现跨包共享。
   - **实现**：
     - `manager.ts` 导出全局注册/获取函数。
     - Gateway 启动时创建唯一实例并注册。
     - 其他包通过 `getGlobalMemoryManager()` 获取共享实例。

3. **元数据过滤 (Phase M-1)** ✅
   - **痛点**：全量检索可能混杂不同渠道、不同话题的无关信息。
   - **方案**：在记忆块中注入 `channel`、`topic`、`timestamp` 等结构化标签，检索时支持 SQL 级预过滤。
   - **实现内容**：
     - `chunks` 表新增 `channel`（来源渠道）、`topic`（话题标签）、`ts_date`（日期）三个结构化列 + 4 个索引。
     - 数据库启动时自动迁移 Schema 并回填存量数据（从文件路径/metadata 推断 channel 和 ts_date）。
     - `searchKeyword` / `searchVector` / `searchHybrid` 全部支持 `MemorySearchFilter` 参数（memory_type / channel / topic / dateFrom / dateTo）。
     - 索引器（`MemoryIndexer`）在索引文件时自动推断 channel（webchat/feishu/heartbeat）和 ts_date。
     - `memory_search` 工具新增 `memory_type`、`channel`、`date_from`、`date_to` 过滤参数。
     - `MemoryManager.search()` 兼容旧签名 `(query, limit)` 和新签名 `(query, { limit, filter })`。

4. **规则重排序 (Phase M-3)** ✅
   - **痛点**：向量相似度不等于逻辑相关度，需要结合多维信号重排。
   - **方案**：零成本纯计算重排（`ResultReranker`），基于三大信号：
     1. **Memory Type 权重**：`core` (1.3) > `daily` (1.0) > `session` (0.9) > `other` (0.8)
     2. **时间衰减**：指数衰减，半衰期默认 30 天，下限 0.3（避免旧核心记忆被完全压制）
     3. **来源多样性惩罚**：同一文件的多个 chunk 每多出现一次降权 15%
   - **实现**：
     - `reranker.ts` 实现 `ResultReranker` 类，支持自定义权重与衰减参数（`RerankerOptions`）。
     - 搜索流程：先取 `limit×2` 候选 → RRF 融合 → 规则重排 → 截取 Top-K。
     - 默认开启，无需额外配置。

5. **L0 摘要层 (M-N2)** ✅
   - **痛点**：长 chunk（1000+ token）在检索时消耗大量上下文窗口，且可能包含冗余信息。
   - **方案**：为每个 chunk 生成简短摘要（100-200 token），检索时优先返回摘要，需要时再拉取原文。
   - **实现**：
     - `chunks` 表新增 `summary`、`summary_tokens` 列。
     - 配置项：`BELLDANDY_MEMORY_SUMMARY_ENABLED`、`BELLDANDY_MEMORY_SUMMARY_MODEL`、`BELLDANDY_MEMORY_SUMMARY_BATCH_SIZE`、`BELLDANDY_MEMORY_SUMMARY_MIN_CONTENT_LENGTH`。
     - `generateSummaries()` 方法：异步批量扫描未摘要的长 chunk（> 500 字符），调用 LLM 生成单句摘要。
     - `callLLMForSummary()` 方法：调用 OpenAI 兼容 API，使用专用 prompt 生成摘要（max_tokens=150，temperature=0.3）。
     - `memory_search` 工具新增 `detail_level` 参数（`summary` | `full`），默认返回摘要模式。
     - Token 节省估算：10 条结果从 ~5000-10000 token 降至 ~500-1000 token（节省 80-90%）。

6. **会话记忆自动提取 (M-N3)** ✅
   - **痛点**：长期对话会导致记忆碎片化，缺乏宏观结论。
   - **方案**：会话结束时自动提取关键信息（事实、偏好、决策）并写入 `memory/YYYY-MM-DD.md`。
   - **实现**：
     - 配置项：`BELLDANDY_MEMORY_EVOLUTION_ENABLED`、`BELLDANDY_MEMORY_EVOLUTION_MIN_MESSAGES`（默认 4）、`BELLDANDY_MEMORY_EVOLUTION_MODEL`。
     - `extractMemoriesFromConversation()` 方法：会话结束时触发，检查消息数 ≥ 4，防重复检查（meta 表标记），调用 LLM 提取记忆。
     - `callLLMForExtraction()` 方法：使用专用 prompt 提取【用户偏好】和【经验教训】两类记忆，返回 JSON 数组。
     - 相似度去重：提取后用 `memory_search` 检查是否已有相似记忆（score > 0.85 则跳过）。
     - 写入每日文件：格式为 `- [类型] 内容 (来源: session-xxx)`，追加到 `memory/YYYY-MM-DD.md`。
     - Gateway 注册 `agent_end` hook，自动触发提取流程。

7. **源路径聚合检索 (M-N4)** ✅
   - **痛点**：检索到一个相关段落后，想看完整上下文，但只返回单个 chunk。
   - **方案**：当检索结果中同一 `source_path` 出现多个 chunk 时，自动拉取该文件的所有相关 chunk 进行二次检索。
   - **实现**：
     - 配置项：`BELLDANDY_MEMORY_DEEP_RETRIEVAL`（默认关闭）。
     - `applyDeepRetrieval()` 方法：
       1. 第一轮结果按 `source_path` 分组统计。
       2. 找出出现 ≥2 次的 source（触发条件）。
       3. 计算聚合分数：`avg(score) * log(count + 1)`（兼顾质量和密度）。
       4. 选出 Top-3 高分 source。
       5. 拉取这些 source 的全部 chunk（最多 10 个/source），按 `start_line` 排序。
       6. 补充 chunk 赋予衰减分数（`aggScore * 0.5`），与第一轮结果合并去重排序。
     - `store.getChunksBySource()` 方法：按 source_path 拉取全部 chunk 并按行号排序。
     - 无热点 source 时直接返回第一轮结果（性能无损）。

#### 未来规划

8. **查询重写 (Query Rewrite)** ⏳ 待实现
   - **痛点**：用户指代不清（"它怎么样？"）导致检索失败。
   - **方案**：先用 LLM 将用户查询改写为完整句子（消歧），再检索。
   - **配置项**：`BELLDANDY_MEMORY_REWRITE_ENABLED`（待添加）。

9. **LLM 重排 (LLM Rerank)** ⏳ 待实现
   - **痛点**：规则重排无法理解深层语义，可能遗漏真正相关的结果。
   - **方案**：引入精细的 Rerank 模型对初步检索的 Top-50 结果进行二次打分，筛选出真正相关的 Top-5。
   - **配置项**：`BELLDANDY_MEMORY_RERANK_ENABLED`（待添加）。

### 5. OS 计算机操作能力 (Computer Use Strategy) (优先级：中)

基于 `UI-TARS` 的最佳实践（"看得准"与"点得准"），计划赋予 Belldandy 操作系统级别的 GUI 控制能力，使其不局限于浏览器和终端。

1.  **视觉层：精准屏幕感知 (High-Fidelity Vision)**
    - **DPI 适配**: 引入 `nut-js` + `Jimp` 方案，正确处理 Retina/高分屏缩放 (Scale Factor)，保证模型看到的与真实物理像素一致。
    - **Visual Feedback**: 实现 `ScreenMarker` (透明置顶窗口)，在执行点击前通过高亮框/光标实时展示模型意图，让用户"看得见"Agent 想点哪。

2.  **控制层：拟人化键鼠操作 (Human-like Input)**
    - **坐标映射**: 实现统一的 `Box-to-Pixel` 转换器，将 VLM 返回的归一化坐标精准映射到物理屏幕。
    - **输入优化**:
        - **Keyboard**: Windows 下优先使用 **剪贴板粘贴 (Ctrl+V)** 替代逐字输入，彻底解决 IME 输入法干扰和字符丢失问题。
        - **Mouse**: 使用线性插值 (`straightTo`) 移动路径，避免瞬移被反外挂检测，同时增加操作的自然感。

---

## 🔐 安全与网络加固路线图 ✅ 已完成 (2026-02-08)

> 基于安全评估结果完成的加固工作，已在 Phase 19 落地实现。

### 1. P0：配对绕过风险 ✅

- **修复内容**：
  - 将 `workspace.read/list` 纳入 `secureMethods`（server.ts L245）
  - 敏感文件黑名单：`allowlist.json/pairing.json/mcp.json/feishu-state.json`（server.ts L507-512）

### 2. P1：CSWSH 防护 + 安全启动 ✅

- **修复内容**：
  - Origin Header 白名单校验，使用 `verifyClient` 回调（server.ts L84-112）
  - 新增 `BELLDANDY_ALLOWED_ORIGINS` 环境变量
  - `HOST=0.0.0.0` + `AUTH_MODE=none` 组合时强制退出（gateway.ts L281-286）

### 3. P1：配置泄露防护 ✅

- **修复内容**：
  - `config.read` 对敏感字段（`*KEY*/*SECRET*/*TOKEN*/*PASSWORD*`）返回 `[REDACTED]`（server.ts L346-356）
  - `config.update` 白名单限制，仅允许修改安全配置项（server.ts L363-376）

### 4. P2：危险工具 Opt-in ✅

- **修复内容**：
  - 新增 `BELLDANDY_DANGEROUS_TOOLS_ENABLED` 环境变量，默认 `false`（gateway.ts L318-319）
  - `run_command` 仅在显式启用时注册（gateway.ts L330-331）
  - 启用时输出警告日志（gateway.ts L378-381）

### 5. P2：SSRF 防护增强 ✅

- **修复内容**：
  - 新增 `dns.lookup` 解析后二次校验，防止 DNS Rebinding（fetch.ts L99-109）
  - 新增 `isPrivateIP` 函数校验解析后的 IP（fetch.ts L215-231）

### 6. P3：浏览器域名控制 ⏳ 待验证

- **已准备**：`BELLDANDY_BROWSER_ALLOWED_DOMAINS` 环境变量已添加到 `.env.example`
- **待实现**：实际域名校验逻辑（低优先级）

---

## 📚 附录：Moltbot 能力清单 (参考基准)

以下是参考项目 **moltbot** 目前已实现的完整能力清单，Belldandy 的开发正是为了逐步对齐这些能力。

### 1. 核心文件操作 (Core Coding)
Agent 可以像工程师一样直接操作项目代码。
- **`read_file_content`** / **`readTool`**：读取文件内容。
- **`list_files`**：列出目录结构。
- **`write_file`**：写入新文件或覆盖文件。
- **`edit_file`**：编辑现有文件（支持多处查找替换）。
- **`apply_patch`**：应用 Unified Diff 补丁。

### 2. 浏览器自动化 (Browser Control)
Agent 拥有一个极其强大的 **`browser`** 工具，可以控制无头浏览器与网页交互。
- **`status`**：检查浏览器状态。
- **`start`** / **`stop`**：启动/关闭浏览器实例。
- **`profiles`**：切换环境（`chrome`=接管用户浏览器扩展, `clawd`=隔离沙箱环境）。
- **`tabs`** / **`open`** / **`focus`** / **`close`**：完整的标签页管理。
- **`snapshot`**：获取 AI 优化过的页面结构快照（Accessibility Tree），这是 Agent "看懂"网页的关键。
- **`screenshot`** / **`pdf`**：截屏或保存 PDF。
- **`act`**：执行 UI 操作（点击、输入、按键、等待、滚动）。
- **`console`**：读取浏览器控制台日志。
- **`upload`** / **`dialog`**：处理文件上传弹窗和 JS Alert 弹窗。

### 3. 系统与执行 (System)
- **`exec`**：执行 Shell 命令（受控环境）。
- **`process`**：管理长运行进程（如启动开发服务器）。

### 4. 网络与数据 (Web & Data)
- **`web_search`**：进行 Google/Bing 搜索。
- **`web_fetch`**：轻量级抓取网页内容（不启动完整浏览器）。

### 5. 多媒体生成 (Media)
- **`tts`**：文本转语音（Text-to-Speech）。
- **`image`**：图像生成或视觉识别。
- **`canvas`**：绘图能力。

### 6. 会话与编排 (Orchestration)
- **`agents_list`** / **`sessions_spawn`**：管理多 Agent 协作与子任务分发。
- **`cron`**：设置定时任务。
- **`message`**：跨渠道发送消息。
- **`nodes`**：知识图谱/记忆节点管理。

### 7. 外部扩展 (Plugins)
Moltbot 支持大量第三方集成插件（Skills），例如：
- 1Password, Spotify, Linear, GitHub, Notion, Slack 等。

### 8. 安全与存储 (Security & Persistence)
- **文件权限 (System Access)**：
    - 支持 **Sandboxed** (Docker/受限目录) 和 **Host** (本机系统级) 两种运行模式。
    - 危险操作（如 `exec` 和 `browser`）可以通过 Policy 策略配置为仅限沙箱运行，或允许受控的本机访问。
- **持久化 (Persistence)**：
    - **Session**：对话历史存储为 JSON 文件（带文件锁）。
    - **Memory**：使用 `better-sqlite3` + FTS5 + `sqlite-vec` 实现本地向量数据库与全文检索。
    - **Media**：图片/文件自动存储在本地文件系统中。

> **Belldandy 现状对比**：目前 Belldandy 已实现了 **文件操作** (read/write/list/patch)、**Web Fetch/Search**、**Memory**（FTS5 + sqlite-vec 混合检索）、**浏览器自动化**（CDP 中继 + 快照/截图/操作）、**Safe Mode 系统命令执行**（白名单 + 超时 + 风险阻断）、**多 Agent 配置与路由**（AgentProfile + AgentRegistry + agents.list + WebChat 选择器）、**子 Agent 编排**（SubAgentOrchestrator + delegate_task/delegate_parallel + 并发排队 + 钩子集成）、**Cron 定时任务**、**MCP 协议支持**、**FACET 模组切换**。

---

## 📊 Moltbot vs Belldandy Agent 能力详细对比

### 对比总结

| 能力类别 | Moltbot | Belldandy | 差距 |
|---------|---------|-----------|------|
| **文件操作** | ✅ 完整 | ✅ 完整 | `list_files`, `apply_patch` (DSL) 已就绪 |
| **系统命令** | ✅ exec/process | ✅ exec/terminal | **Safe Mode** 保护 |
| **浏览器自动化** | ✅ 28+ actions | ✅ 核心闭环 | 支持快照/截图/操作/中继 |
| **网络请求** | ✅ search + fetch | ✅ search + fetch | 集成 Brave/SerpAPI |
| **记忆系统** | ✅ memory + nodes | ✅ memory + 元数据过滤 + 规则重排 | 缺少 `nodes` 图谱 |
| **多媒体** | ✅ tts/image/canvas | ✅ tts/image/canvas | Canvas 可视化工作区已实现 |
| **会话编排** | ✅ 完整 | ✅ 完整 | SubAgentOrchestrator + delegate_task/delegate_parallel + 并发排队 + 钩子集成 |
| **渠道集成** | ✅ 4+ channels | ✅ 飞书 + Channel 接口 | 架构已就绪，可快速扩展 |
| **定时任务** | ✅ cron tool | ✅ heartbeat + cron | 完整 cron 工具（list/add/remove/status）+ Heartbeat |
| **插件系统** | ✅ 丰富 | ✅ 完整对标 | 13 种钩子 + HookRunner + 优先级 |
| **MCP 支持** | ✅ ACP 协议 | ✅ MCP 协议 | stdio/SSE 传输 + 工具桥接 |
| **FACET 模组** | — | ✅ switch_facet | 原子化切换 SOUL.md 模组 |

---

### Moltbot Agent 工具完整清单

#### 1. 文件操作 (Coding Tools)

| 工具 | 说明 | Belldandy |
|------|------|-----------|
| `read` / `read_file_content` | 读取文件内容 | ✅ `file_read` |
| `write` / `write_file` | 写入文件 | ✅ `file_write` |
| `edit` | 编辑现有文件（多处替换） | ✅ `edit_file` |
| `list_files` | 列出目录结构 | ✅ `list_files` |
| `apply_patch` | 应用 Unified Diff 补丁 | ✅ `apply_patch_dsl` |

#### 2. 系统命令 (Execution)

| 工具 | 说明 | Belldandy |
|------|------|-----------|
| `exec` | 执行 Shell 命令（受控环境） | ✅ `run_command` (Safe) |
| `process` | 管理长运行进程（后台任务） | ✅ `process_manager` |

> ⚠️ **安全提示**：这两个工具允许 Agent 执行任意系统命令。Moltbot 通过 Docker 沙箱、执行审批机制、白名单等手段控制风险。

#### 3. 浏览器自动化 (Browser Control)

| Action | 说明 | Belldandy |
|--------|------|-----------|
| `status` | 检查浏览器状态 | ✅ `browser_status` |
| `start` / `stop` | 启动/关闭浏览器 | ✅ (自动/中继) |
| `tabs` / `open` / `focus` / `close` | 标签页管理 | ✅ `browser_manage_tab` |
| `snapshot` | AI 优化页面结构快照 | ✅ `browser_snapshot` |
| `screenshot` / `pdf` | 截屏/保存 PDF | ✅ `browser_screenshot` |
| `act` | 点击/输入/按键/滚动 | ✅ `browser_action` |

#### 4. 网络与数据 (Web)

| 工具 | 说明 | Belldandy |
|------|------|-----------|
| `web_search` | Google/Bing 搜索 | ✅ `web_search` |
| `web_fetch` | 轻量级网页抓取 | ✅ |

#### 5. 多媒体 (Media)

| 工具 | 说明 | Belldandy |
|------|------|-----------|
| `tts` | 文本转语音 | ✅ `text_to_speech` |
| `image` | 图像生成/视觉识别 | ✅ `image_generate` |
| `canvas` | 绘图能力 | ✅ `canvas_*`（10 个工具，可视化工作区） |

#### 6. 会话与编排 (Orchestration)

| 工具 | 说明 | Belldandy |
|------|------|-----------|
| `agents_list` | 列出可用 Agent | ✅ `agents.list` API |
| `sessions_list` | 列出会话 | ✅ `sessions_history` |
| `sessions_spawn` | 创建子 Agent 任务 | ✅ `sessions_spawn` / `delegate_task` / `delegate_parallel` |
| `cron` | 定时任务管理 | ✅ `cron` (list/add/remove/status) |
| `message` | 跨渠道发送消息 | ❌ |

#### 7. 记忆与知识 (Memory & Nodes)

| 工具 | 说明 | Belldandy |
|------|------|-----------|
| `memory_search` | 向量+关键词检索 | ✅ |
| `memory_read` | 读取记忆文件 | ✅ |
| `memory_write` | 写入记忆 | ✅ |
| `nodes` | 知识图谱节点管理 | ❌ |

#### 8. 渠道特定工具

| 渠道 | Belldandy | 说明 |
|------|-----------|------|
| Slack | ⏳ 待实现 | Channel 接口已就绪 |
| Discord | ⏳ 待实现 | Channel 接口已就绪 |
| Telegram | ⏳ 待实现 | Channel 接口已就绪 |
| WhatsApp | ⏳ 待实现 | Channel 接口已就绪 |
| 飞书 | ✅ 已实现 | 完整实现 Channel 接口 |

---

### Belldandy 当前已实现

| 能力 | 工具/功能 |
|------|----------|
| **文件读取** | `file_read` |
| **文件写入** | `file_write`（overwrite/append/replace/insert 四种模式） |
| **目录列表** | `list_files` |
| **网页抓取** | `web_fetch`（含域名黑白名单、SSRF 防护） |
| **网页搜索** | `web_search`（Brave / SerpAPI） |
| **记忆检索** | `memory_search`（FTS5 + 向量混合检索 + Embedding Cache + 元数据过滤 + 规则重排 + 源路径聚合） |
| **记忆读写** | `memory_read`, `memory_write` |
| **飞书渠道** | `FeishuChannel`（WebSocket 长连接） |
| **定时触发** | `Heartbeat Runner`（读取 HEARTBEAT.md） |
| **定时任务** | `cron`（list/add/remove/status，支持一次性和周期任务） |
| **会话历史** | `ConversationStore`（内存 + TTL + 文件持久化） |
| **上下文压缩** | 三层渐进式压缩（Archival Summary → Rolling Summary → Working Memory），模型摘要 + 降级兜底 |
| **上下文注入** | Context Injection，每次对话自动注入最近会话摘要 |
| **多 Agent** | `AgentProfile` + `AgentRegistry` + `agents.list` API + WebChat Agent 选择器 + 会话隔离 + 飞书渠道绑定 |
| **子 Agent 编排** | `SubAgentOrchestrator` + `delegate_task` / `delegate_parallel` / `sessions_spawn` / `sessions_history`，并发排队 + 超时 + 深度限制 + 生命周期钩子 |
| **技能系统** | `SkillRegistry` + SKILL.md 格式 + 5 维 Eligibility Gating + 两级 Prompt 注入 + `skills_list` / `skills_search` 工具 + Plugin Hooks 桥接 |
| **画布工作区** | 自研 SVG 无限画布 + 8 种节点类型 + dagre 自动布局 + 10 个 Agent 工具（`canvas_*`）+ 实时 WS 推送 + 资源关联跳转 + 画布上下文注入 + ReAct 可视化 |
| **浏览器自动化** | Chrome Extension + CDP Relay + `browser_open/navigate/click/type/screenshot/get_content/snapshot` |
| **系统执行** | `run_command`（Consumer Safe Mode：白名单 + 超时 + 风险阻断） |
| **进程管理** | `process_manager`（长运行进程管理） |
| **代码解释器** | `code_interpreter`（Python / JS 沙箱执行） |
| **多媒体** | `text_to_speech`（Edge TTS / OpenAI）、`image_generate`（DALL-E 3）、`camera_snap`（回环视觉） |
| **多模态** | 图片理解（Base64 DataURI）、视频理解（Moonshot `ms://` 协议） |
| **方法论** | `method_list` / `method_search` / `method_read` / `method_create` |
| **日志系统** | `log_read` / `log_search`（文件日志 + 轮转 + 自动清理） |
| **MCP 支持** | MCP 客户端（stdio/SSE）+ 工具桥接 + 多服务器管理 |
| **模型容灾** | `FailoverClient`（错误分类 + Cooldown + 多 Profile 轮询） |
| **统一 CLI** | `bdd` 命令（pairing/doctor/config/relay/setup） |
| **可视化配置** | WebChat Settings UI + System Doctor + Tool Management UI |

---

### 🎯 推荐下一步优先级

 1. **WebChat 子 Agent 状态展示** — 前端实时展示子 Agent 运行状态（Phase 25 Step 4）
 2. **条件分支编排** — 根据子 Agent 结果决定后续分支（Phase 25 Step 5）
 3. **`code_interpreter` 增强** — 更高级的沙箱计算能力
 4. **记忆系统优化（M-Next）** ✅ 已全部完成：
    - ~~Embedding Cache (M-N0)~~✅
    - ~~统一 MemoryStore (M-N1)~~✅
    - ~~元数据过滤 (M-1)~~✅
    - ~~规则重排 (M-3)~~✅
    - ~~L0 摘要生成 (M-N2)~~✅
    - ~~会话记忆自动提取 (M-N3)~~✅
    - ~~源路径聚合检索 (M-N4)~~✅
    - **未来规划**：查询重写（Query Rewrite）、LLM 重排（LLM Rerank）
 5. **Local Embedding** — 完全本地化的向量计算，摆脱 API 依赖（`LocalEmbeddingProvider` 已实现基础框架）
 6. **OS 计算机、手机操作** — 操作系统级 GUI 控制（基于 UI-TARS 方案）

---

## 🐳 Docker 部署支持 (Phase N - MVP)

> **实施时间**：2026-02-20
> **状态**：✅ MVP 已完成

### 实现内容

**核心文件**：
- **Dockerfile** - Multi-stage 构建（deps → builder → runtime）
  - 3 阶段构建：依赖安装 → TypeScript 编译 → 运行时镜像
  - 非 root 用户运行（uid 1001，用户名 `belldandy`）
  - 基于 `node:22-bookworm-slim` 最小化镜像体积
  - 支持 BuildKit cache mount 加速构建

- **.dockerignore** - 优化构建上下文
  - 排除 `node_modules`、`dist`、日志、测试文件
  - 排除参考代码目录（`openclaw`、`UI-TARS-desktop-main`）
  - 减少构建上下文传输时间

- **docker-compose.yml** - 服务编排
  - `belldandy-gateway` 服务：主 Gateway 服务，支持健康检查、自动重启
  - `belldandy-cli` 服务：CLI 管理工具（profile: cli，按需启动）
  - Volume 挂载：`~/.belldandy`（状态目录）、`./workspace`（工作区）
  - 环境变量注入：支持所有 `BELLDANDY_*` 配置项

- **.env.example** - 环境变量模板
  - 完整的配置项说明（网络、认证、Agent、功能开关、日志等）
  - 安全提示（Token 生成方法、0.0.0.0 绑定警告）

**代码修改**：
- `packages/belldandy-core/src/server.ts:106-109` - 添加 `/health` 健康检查端点
  - 返回 JSON：`{"status":"ok","timestamp":"..."}`
  - 用于 Docker 健康检查和负载均衡器探测

**部署脚本**：
- `scripts/docker-build.sh` - 镜像构建脚本
  - 支持版本标签（默认 `local`）
  - 使用 BuildKit 加速构建
  - 输出构建完成提示和后续步骤

- `scripts/docker-deploy.sh` - 一键部署脚本
  - 环境检查（Docker、Docker Compose、.env 文件）
  - 必需环境变量校验（AUTH_TOKEN、API_KEY、MODEL）
  - 自动构建镜像（如不存在）
  - 启动服务并等待健康检查通过（60s 超时）
  - 输出访问地址和常用命令

**文档**：
- `docs/DOCKER_DEPLOYMENT.md` - 完整部署指南
  - 快速开始（3 步部署）
  - 配置说明（网络、认证、Agent、功能开关、数据持久化）
  - 常用命令（服务管理、CLI 工具、数据备份、镜像管理）
  - 升级指南（重新构建、官方镜像）
  - 故障排查（容器启动失败、健康检查失败、WebChat 无法连接、数据丢失）
  - 高级配置（自定义 Dockerfile、多实例部署、反向代理、资源限制）
  - 安全建议

- `README.md` - 添加 Docker 部署章节
  - 快速部署流程
  - 手动部署步骤
  - 链接到详细文档

### 技术特性

1. **Multi-stage Build**
   - 分离构建依赖和运行时依赖
   - 最小化最终镜像体积（仅包含必要文件）
   - 利用 Docker layer cache 加速重复构建

2. **安全加固**
   - 非 root 用户运行（uid 1001）
   - 最小权限原则
   - 默认 127.0.0.1 绑定（需显式配置 LAN 访问）
   - 强制认证（0.0.0.0 + AUTH_MODE=none 会退出）

3. **健康检查**
   - HTTP 端点：`GET /health`
   - Docker 原生健康检查（30s 间隔，3 次重试）
   - 自动重启不健康容器

4. **数据持久化**
   - Volume 挂载 `~/.belldandy`（配置、会话、记忆数据库）
   - Volume 挂载 `workspace/`（文件工具访问范围）
   - 支持自定义挂载路径

5. **生产就绪**
   - 完整的日志输出（stdout/stderr）
   - 配置管理（环境变量注入）
   - 故障排查支持（健康检查、日志查看）
   - 一键部署脚本

### 使用方式

```bash
# 1. 配置环境变量
cp .env.example .env
# 编辑 .env，填写 BELLDANDY_AUTH_TOKEN、BELLDANDY_OPENAI_API_KEY 等

# 2. 一键部署
./scripts/docker-deploy.sh

# 3. 访问 WebChat
# http://localhost:28889
```

### 后续规划

**Phase N - 完整方案**（待实施）：
- ❌ **Tailscale 集成**（Sidecar 模式）- 实现远程访问
- ❌ **Nix 支持**（flake.nix）- 声明式依赖管理
- ❌ **官方 Docker Hub 镜像** - 公开发布
- ❌ **CI/CD 自动构建**（GitHub Actions）- 自动化发布流程

---

### 价值

- **降低部署门槛**：无需配置 Node.js 环境，一键启动
- **环境隔离**：容器化运行，避免依赖冲突
- **生产就绪**：健康检查、自动重启、数据持久化
- **安全可控**：非 root 用户、强制认证、最小权限
- **易于维护**：统一的部署流程、完整的文档支持




