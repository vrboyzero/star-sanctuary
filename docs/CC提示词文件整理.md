# Claude Code 提示词文件整理

## 1. 范围与口径

本整理基于 `E:\project\star-sanctuary\tmp\claude-code-source` 当前快照。

纳入范围：

- 直接定义模型可见 prompt / system prompt / instruction 的文件
- 负责拼装、注入、覆盖、缓存、导出 prompt 的关键文件
- 工具 prompt、agent prompt、skill prompt、命令内嵌 prompt
- 被源码 `import` / `require` 的 `.md` / `.txt` prompt 资产

不纳入主清单：

- 只给人类 UI 用的文案文件，如 `src/components/PromptInput/*`、`PromptDialog.tsx`
- 只是在调用链里传递 prompt、但没有新增 prompt 语义的普通调用层
- 仅包含 `prompt` 命名但本质是输入框状态、overlay、埋点、样式的组件文件

建议把这份清单理解为“Claude Code 里真正影响模型行为的提示资产与关键装配链”。

---

## 2. 核心系统 Prompt 与注入链

- `src/constants/prompts.ts`：Claude Code 默认 system prompt 主骨架，负责拼装 intro、做事原则、工具使用、风险动作、memory、MCP instructions、output style、env info 等核心段落。
- `src/constants/systemPromptSections.ts`：把 system prompt 拆成 section，并支持缓存、动态 section、清理 section 状态。
- `src/constants/system.ts`：定义 CLI / Agent SDK 的 sysprompt 前缀和 attribution header，决定“你是谁”这层开场文本。
- `src/constants/cyberRiskInstruction.ts`：单独维护安全/网络攻防边界指令，限制高风险安全请求的响应范围。
- `src/constants/outputStyles.ts`：定义 Explanatory / Learning 等输出风格对应的附加 prompt。
- `src/utils/systemPrompt.ts`：按优先级组装最终有效 system prompt，处理 override / custom / append / agent prompt 等覆盖关系。
- `src/utils/systemPromptType.ts`：为 system prompt 提供类型封装，确保拼装后的 prompt 以统一结构进入请求层。
- `src/utils/queryContext.ts`：拉取 system prompt、user context、system context，并为 side question 等场景构建 fallback prompt 参数。
- `src/context.ts`：生成 `userContext` / `systemContext`，并支持临时 system prompt injection。
- `src/utils/mcpInstructionsDelta.ts`：把 MCP server 的 instructions 做成增量注入，避免整段 prompt 反复重建。
- `src/utils/messages.ts`：定义 plan mode、auto mode、team context、MCP instructions delta 等运行时注入到对话中的 meta instruction。
- `src/utils/claudemd.ts`：加载 `CLAUDE.md` / `CLAUDE.local.md` / rules，并用统一 instruction prompt 包裹这些仓库级规则。

---

## 3. 工具 Prompt

### 3.1 文件、搜索、执行类

- `src/tools/FileReadTool/prompt.ts`：Read 工具 prompt，约束绝对路径、行号格式、offset 读取和大文件读取方式。
- `src/tools/FileEditTool/prompt.ts`：Edit 工具 prompt，强调先读后改、精确替换、最小上下文、避免误伤。
- `src/tools/FileWriteTool/prompt.ts`：Write 工具 prompt，说明整文件写入/新建文件的适用场景，并提醒优先先读。
- `src/tools/NotebookEditTool/prompt.ts`：Jupyter Notebook 单元编辑 prompt，规定 cell 替换 / 插入 / 删除的参数语义。
- `src/tools/GlobTool/prompt.ts`：Glob 工具 prompt，负责文件模式匹配和快速找文件。
- `src/tools/GrepTool/prompt.ts`：Grep 工具 prompt，负责正则文本搜索与代码内容定位。
- `src/tools/BashTool/prompt.ts`：Bash 工具 prompt，规定 shell 使用方式、sandbox、后台运行、git/危险命令边界。
- `src/tools/PowerShellTool/prompt.ts`：PowerShell 工具 prompt，Windows 场景下的 shell 使用规范与安全约束。
- `src/tools/LSPTool/prompt.ts`：LSP 工具 prompt，说明符号搜索、引用、定义、hover 等代码智能能力。
- `src/tools/SleepTool/prompt.ts`：Sleep 工具 prompt，定义等待/暂停的使用方式。

### 3.2 计划、任务、团队类

- `src/tools/EnterPlanModeTool/prompt.ts`：进入 Plan Mode 的工具 prompt，说明计划模式 workflow 和约束。
- `src/tools/ExitPlanModeTool/prompt.ts`：退出 Plan Mode 的工具 prompt，用于请求用户批准计划。
- `src/tools/EnterWorktreeTool/prompt.ts`：进入 worktree 的工具 prompt，指导会话切换到隔离工作树。
- `src/tools/ExitWorktreeTool/prompt.ts`：退出 worktree 的工具 prompt，处理工作树收尾和返回原工作目录。
- `src/tools/TodoWriteTool/prompt.ts`：TodoList 工具 prompt，定义何时必须建 todo、任务状态约束、何时不该用。
- `src/tools/TaskCreateTool/prompt.ts`：任务创建工具 prompt，面向团队/后台任务系统创建单个任务。
- `src/tools/TaskGetTool/prompt.ts`：任务查询工具 prompt，按 ID 拉取任务详情。
- `src/tools/TaskListTool/prompt.ts`：任务列表工具 prompt，用于列出当前任务池。
- `src/tools/TaskStopTool/prompt.ts`：后台任务停止工具 prompt，用于终止正在运行的任务。
- `src/tools/TaskUpdateTool/prompt.ts`：任务更新工具 prompt，用于修改状态、owner、描述等。
- `src/tools/TeamCreateTool/prompt.ts`：团队创建工具 prompt，定义 swarm/team 的创建、成员协作和任务流转方式。
- `src/tools/TeamDeleteTool/prompt.ts`：团队删除工具 prompt，负责团队与任务目录清理。
- `src/tools/AgentTool/prompt.ts`：Agent 工具 prompt，定义何时开子代理、何时 fork、自代理提示怎么写、何时不要用 agent。

### 3.3 Web、MCP、远程与通信类

- `src/tools/WebSearchTool/prompt.ts`：WebSearch prompt，要求在答案后带 Sources，并强调使用当前年份搜索最新资料。
- `src/tools/WebFetchTool/prompt.ts`：WebFetch prompt，定义网页抓取、二次小模型抽取和引用限制。
- `src/tools/ListMcpResourcesTool/prompt.ts`：列出 MCP 资源的 prompt，说明资源发现用途。
- `src/tools/ReadMcpResourceTool/prompt.ts`：读取 MCP 资源的 prompt，规范资源读取场景。
- `src/tools/MCPTool/prompt.ts`：MCPTool 占位 prompt；源码中为空，实际 prompt 由 MCP client 在运行时覆盖。
- `src/tools/RemoteTriggerTool/prompt.ts`：远程触发 API 的 prompt，约束使用内置 OAuth 通道而不是自己 curl。
- `src/tools/ScheduleCronTool/prompt.ts`：CronCreate / CronDelete / CronList 的 prompt 生成器，定义远程定时任务调度语义。
- `src/tools/SendMessageTool/prompt.ts`：队友/子代理通信工具 prompt，明确只有通过这个工具别的 agent 才能收到消息。
- `src/tools/BriefTool/prompt.ts`：面向用户的消息发送 prompt，定义 brief 模式下“真正给用户看的答案”写在哪里。
- `src/tools/AskUserQuestionTool/prompt.ts`：结构化向用户提问的 prompt，适用于澄清、选择和确认。

### 3.4 配置、技能入口与延迟加载类

- `src/tools/ConfigTool/prompt.ts`：根据 setting registry 动态生成配置 prompt，告诉模型哪些配置可读/可写。
- `src/tools/SkillTool/prompt.ts`：动态生成技能列表 prompt，并控制 skill listing 的 token/字符预算。
- `src/tools/ToolSearchTool/prompt.ts`：延迟工具发现 prompt，告诉模型必须先加载 deferred tool 才能调用。

---

## 4. Agent、团队协作与平台体验 Prompt

- `src/tools/AgentTool/built-in/claudeCodeGuideAgent.ts`：Claude Code / Agent SDK / Claude API 官方文档问答代理的 system prompt。
- `src/tools/AgentTool/built-in/exploreAgent.ts`：只读代码探索代理的 system prompt，强调“只能搜、不能改”。
- `src/tools/AgentTool/built-in/generalPurposeAgent.ts`：通用子代理 system prompt，适合复杂搜索和多步执行。
- `src/tools/AgentTool/built-in/planAgent.ts`：只读规划代理 system prompt，负责产出实现计划。
- `src/tools/AgentTool/built-in/statuslineSetup.ts`：状态栏配置专用代理 prompt，教模型把 shell PS1 转成 Claude Code statusLine。
- `src/tools/AgentTool/built-in/verificationAgent.ts`：对抗式验证代理 prompt，要求主动“找问题”而不是“帮忙通过”。
- `src/tools/AgentTool/forkSubagent.ts`：fork worker 的固定 boilerplate prompt，以及 worktree notice。
- `src/utils/swarm/teammatePromptAddendum.ts`：团队成员附加 system prompt，要求通过 `SendMessage` 明确通信。
- `src/components/agents/generateAgent.ts`：生成新 agent 配置的元 prompt，要求输出 identifier / whenToUse / systemPrompt 三元组。
- `src/utils/sideQuestion.ts`：`/btw` 侧问场景的 one-off prompt，要求无工具、单轮、直接回答。
- `src/utils/claudeInChrome/prompt.ts`：Chrome 自动化基础 prompt，定义浏览器操作原则、ToolSearch 前置要求和技能提示。
- `src/skills/bundled/claudeInChrome.ts`：`claude-in-chrome` skill 激活 prompt，在基础浏览器 prompt 上追加“先获取 tabs context”等运行指令。
- `src/buddy/prompt.ts`：Companion / Buddy 旁白角色的介绍 prompt 与 attachment 生成。

---

## 5. 记忆、压缩、文档维护与建议 Prompt

- `src/memdir/teamMemPrompts.ts`：团队记忆/自动记忆主 prompt，定义记忆层如何组合。
- `src/memdir/findRelevantMemories.ts`：从 memory manifest 中挑选相关记忆的筛选 prompt。
- `src/services/extractMemories/prompts.ts`：后台记忆抽取子代理 prompt，指导如何从最近消息中提炼记忆。
- `src/services/SessionMemory/prompts.ts`：会话记忆模板、更新 prompt、截断规则和变量替换逻辑。
- `src/services/compact/prompt.ts`：长上下文 compact prompt，包含完整压缩、局部压缩和分析草稿规则。
- `src/services/autoDream/consolidationPrompt.ts`：auto-dream 记忆整理/合并 prompt。
- `src/services/MagicDocs/prompts.ts`：MagicDocs 文档维护 prompt，用于持续更新项目文档。
- `src/services/PromptSuggestion/promptSuggestion.ts`：下一条用户输入建议的生成 prompt。
- `src/services/toolUseSummary/toolUseSummaryGenerator.ts`：为一组工具调用生成单行摘要标签的 prompt。

---

## 6. 命令、Bundled Skill 与专项任务 Prompt

### 6.1 内建命令 Prompt

- `src/commands/init.ts`：`/init` 的多阶段引导 prompt，用于生成 `CLAUDE.md`、skills、hooks 和本地规则。
- `src/commands/review.ts`：本地 PR review prompt，指导模型调用 `gh` 拉取 diff 并输出审查报告。
- `src/commands/insights.ts`：会话洞察分析 prompt，包含 transcript facet 抽取和 chunk 摘要。
- `src/commands/ultraplan.tsx`：远程规划命令 prompt 包装层；实际大段说明来自外部 `prompt.txt` 资产。
- `src/commands/thinkback/thinkback.tsx`：为 thinkback skill 构造 edit / fix / regenerate 三类调用 prompt。
- `src/cli/handlers/autoMode.ts`：auto mode 规则评审 prompt，用来批判性检查用户自定义 allow/deny/environment 规则。

### 6.2 Bundled Skill Prompt

- `src/skills/bundled/updateConfig.ts`：更新设置 skill 的 prompt，内联 settings / hooks schema 与常见示例。
- `src/skills/bundled/stuck.ts`：排查卡住/变慢 Claude Code 会话的技能 prompt。
- `src/skills/bundled/skillify.ts`：把当前会话沉淀成可复用 SKILL.md 的采访式 prompt。
- `src/skills/bundled/simplify.ts`：并发启动 review agents 进行复用/质量/效率清理的技能 prompt。
- `src/skills/bundled/scheduleRemoteAgents.ts`：创建/更新/列出/运行远程定时 agent 的技能 prompt。
- `src/skills/bundled/remember.ts`：审阅 auto-memory 并提议迁移到 `CLAUDE.md` / `CLAUDE.local.md` / team memory 的技能 prompt。
- `src/skills/bundled/claudeApi.ts`：Claude API skill 的运行时 prompt 组装器，会根据检测到的语言内联对应文档。
- `src/skills/bundled/claudeApiContent.ts`：Claude API skill 的主 prompt 文本和文档资产注册表。
- `src/skills/bundled/verify.ts`：验证技能的 prompt 包装层，从 `SKILL.md` 和示例文档拼装最终技能 prompt。
- `src/skills/bundled/verifyContent.ts`：验证技能依赖的 `SKILL.md` / example markdown 资源清单。

---

## 7. Prompt 装配、分类、调试与扩展链路

- `src/services/api/dumpPrompts.ts`：把最终请求中的 system prompt、tools、messages 导出到文件，便于调试。
- `src/services/api/promptCacheBreakDetection.ts`：检测 prompt cache break，比较 system/tool schema 变化并输出 diff。
- `src/utils/promptCategory.ts`：给 prompt/query source 分类，用于分析和埋点。
- `src/utils/promptEditor.ts`：把 prompt 临时展开到编辑器里修改，再回收为可发送文本。
- `src/utils/promptShellExecution.ts`：执行 prompt 中内嵌的 `!` shell 片段，常用于 skill/插件 markdown prompt。
- `src/utils/hooks/execPromptHook.ts`：执行与 prompt 提交相关的 hook。
- `src/utils/userPromptKeywords.ts`：识别“继续 / 不要继续”等用户关键词，用于 prompt 处理分支。
- `src/utils/permissions/yoloClassifier.ts`：auto mode classifier 的 prompt 组装器，运行时加载外部 `.txt` 模板。
- `src/utils/permissions/permissionExplainer.ts`：用小模型解释 shell 命令风险和目的的 prompt。
- `src/utils/agenticSessionSearch.ts`：基于会话元数据和 transcript 摘要做 session 检索的系统 prompt。
- `src/utils/sessionTitle.ts`：生成会话标题的 prompt。
- `src/utils/teleport.tsx`：远程 teleport / CCR 场景下生成会话标题和分支名的 prompt。
- `src/utils/plugins/loadPluginCommands.ts`：加载插件 markdown command / skill，并把文件内容转成 prompt。
- `src/utils/plugins/loadPluginAgents.ts`：加载插件 agent markdown，把正文作为 agent system prompt。

---

## 8. 源码引用但当前快照缺失的 Prompt 资产

下面这些文件在源码里被 `import` / `require` 为 prompt 资产，但在当前 `tmp/claude-code-source` 快照里没有找到原文件；可以视为“源码可见引用、快照未包含正文”。

### 8.1 Auto Mode / Ultraplan 文本资产

- `src/utils/permissions/yolo-classifier-prompts/auto_mode_system_prompt.txt`：auto mode classifier 的基础 system prompt。
- `src/utils/permissions/yolo-classifier-prompts/permissions_external.txt`：外部用户版本的权限模板。
- `src/utils/permissions/yolo-classifier-prompts/permissions_anthropic.txt`：Anthropic 内部版本的权限模板。
- `src/utils/ultraplan/prompt.txt`：`/ultraplan` 远程规划命令的主体指令文本。

### 8.2 Verify Skill 资产

- `src/skills/bundled/verify/SKILL.md`：verify 技能的主说明文档。
- `src/skills/bundled/verify/examples/cli.md`：CLI 验证示例文档。
- `src/skills/bundled/verify/examples/server.md`：服务端验证示例文档。

### 8.3 Claude API Skill 资产

- `src/skills/bundled/claude-api/SKILL.md`：Claude API 技能的主说明文档。
- `src/skills/bundled/claude-api/csharp/claude-api.md`：C# 版 Claude API 参考。
- `src/skills/bundled/claude-api/curl/examples.md`：curl 调用示例集合。
- `src/skills/bundled/claude-api/go/claude-api.md`：Go 版 Claude API 参考。
- `src/skills/bundled/claude-api/java/claude-api.md`：Java 版 Claude API 参考。
- `src/skills/bundled/claude-api/php/claude-api.md`：PHP 版 Claude API 参考。
- `src/skills/bundled/claude-api/python/agent-sdk/README.md`：Python Agent SDK 主说明。
- `src/skills/bundled/claude-api/python/agent-sdk/patterns.md`：Python Agent SDK 常见模式。
- `src/skills/bundled/claude-api/python/claude-api/README.md`：Python 版 Claude API 主说明。
- `src/skills/bundled/claude-api/python/claude-api/batches.md`：Python 批处理 API 说明。
- `src/skills/bundled/claude-api/python/claude-api/files-api.md`：Python Files API 说明。
- `src/skills/bundled/claude-api/python/claude-api/streaming.md`：Python 流式输出说明。
- `src/skills/bundled/claude-api/python/claude-api/tool-use.md`：Python tool use 说明。
- `src/skills/bundled/claude-api/ruby/claude-api.md`：Ruby 版 Claude API 参考。
- `src/skills/bundled/claude-api/shared/error-codes.md`：通用错误码参考。
- `src/skills/bundled/claude-api/shared/live-sources.md`：在线文档/实时来源索引。
- `src/skills/bundled/claude-api/shared/models.md`：模型目录与命名说明。
- `src/skills/bundled/claude-api/shared/prompt-caching.md`：prompt caching 说明。
- `src/skills/bundled/claude-api/shared/tool-use-concepts.md`：tool use 通用概念说明。
- `src/skills/bundled/claude-api/typescript/agent-sdk/README.md`：TypeScript Agent SDK 主说明。
- `src/skills/bundled/claude-api/typescript/agent-sdk/patterns.md`：TypeScript Agent SDK 常见模式。
- `src/skills/bundled/claude-api/typescript/claude-api/README.md`：TypeScript 版 Claude API 主说明。
- `src/skills/bundled/claude-api/typescript/claude-api/batches.md`：TypeScript 批处理 API 说明。
- `src/skills/bundled/claude-api/typescript/claude-api/files-api.md`：TypeScript Files API 说明。
- `src/skills/bundled/claude-api/typescript/claude-api/streaming.md`：TypeScript 流式输出说明。
- `src/skills/bundled/claude-api/typescript/claude-api/tool-use.md`：TypeScript tool use 说明。

---

## 9. 备注

- 如果后续你要做“对标 Claude Code 的提示词分层设计”，优先看这几个入口：`src/constants/prompts.ts`、`src/tools/*/prompt.ts`、`src/utils/messages.ts`、`src/services/SessionMemory/prompts.ts`、`src/services/compact/prompt.ts`、`src/tools/AgentTool/built-in/*.ts`。
- 如果后续你要做“最终 prompt 实际长什么样”的排查，优先看：`src/services/api/dumpPrompts.ts`、`src/services/api/promptCacheBreakDetection.ts`、`src/utils/systemPrompt.ts`。
- 当前快照缺失的 `.md/.txt` 资产，意味着这份整理已经覆盖了“代码侧引用关系”，但未能逐字核验那些外部文本正文。
