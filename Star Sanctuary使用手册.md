# Star Sanctuary 使用手册

最后更新时间：2026-04-15  
适用版本：当前仓库主干，workspace version `0.2.4`

Star Sanctuary 是一个 **本地优先的个人 AI 助手与 Agent 工作台**。  
它不是单纯的聊天网页，而是一套把 `Gateway`、`WebChat`、`CLI`、`工具系统`、`长期记忆`、`长期任务`、`多 Agent`、`渠道接入`、`浏览器自动化`、`Webhook` 和 `MCP` 统一到一起的本地运行时。

本文定位为 **主使用手册**：

- 讲清楚怎么安装、配置、启动和日常使用
- 讲清楚哪些能力当前已经可用
- 把更深的专题配置，链接到对应专题文档

如果你只想快速跑起来，优先看：

1. [3. 最小配置](#3-最小配置)
2. [4. 启动与首次使用](#4-启动与首次使用)
3. [5. WebChat 日常使用](#5-webchat-日常使用)

---

## 1. 你该选哪种使用方式

| 使用方式 | 适合人群 | 你需要准备什么 |
| --- | --- | --- |
| 安装器版（终端一键安装） | 希望用命令快速安装、后续也用命令升级的用户 | Windows PowerShell 或 Linux/macOS 终端，Node.js `22.12.0+` |
| 标准发布版 | 普通用户、Windows 用户 | 下载发布包即可，通常不需要单独安装 Node.js |
| 源码运行 | 开发者、二次定制用户 | Node.js `22.12.0+`、`corepack`、`pnpm` |
| Docker / Compose | NAS、服务器、长期运行 | Docker 24+、Docker Compose v2 |

当前标准发布口径：

- `Portable`：提供 `Slim` / `Full`
- `Single-Exe`：当前提供 `Windows x64 + Full`

选择建议：

- 不确定选哪个：优先 `Portable Slim`
- 想双击即用：优先 `Single-Exe Full`
- 想通过终端一键安装、后续也想直接命令升级：优先安装器版
- 要开发、改代码、接更多模块：用源码运行
- 要放服务器常驻：用 Docker / Compose

---

## 2. 安装

### 2.1 标准发布版

当前 Windows 标准包通常从社区官网获取：

- 官网主页：`https://www.goddess-ai.top`

#### Portable

1. 下载并解压发布包。
2. 保持包内的 `runtime/`、`launcher/`、`payload/`、`version.json`、`runtime-manifest.json` 完整存在。
3. 运行 `start.bat`。
4. 若浏览器未自动打开，手动访问 `http://127.0.0.1:28889/`。

#### Single-Exe

1. 下载 `star-sanctuary-single.exe` 所在目录包。
2. 双击运行 `star-sanctuary-single.exe`。
3. 首次运行、升级后首次运行或自动修复时，可能需要等待一段时间。

补充说明：

- 两种发布形态的用户数据默认都写入 `~/.star_sanctuary`
- `Single-Exe` 运行时默认解包到 `%LOCALAPPDATA%\\StarSanctuary\\runtime\\<version>-win32-x64`

### 2.2 安装器版（终端一键安装）

如果你希望：

- 不手动 clone 仓库
- 不手动跑 `pnpm install / build`
- 后续继续用同一套命令升级

那么当前最适合的是安装器版，也就是通过 `install.ps1 / install.sh` 安装。

#### Windows PowerShell

安装最新版：

```powershell
irm https://raw.githubusercontent.com/vrboyzero/star-sanctuary/main/install.ps1 | iex
```

安装指定版本：

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/vrboyzero/star-sanctuary/main/install.ps1))) -Version v0.2.4
```

安装并跳过 setup：

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/vrboyzero/star-sanctuary/main/install.ps1))) -Version v0.2.4 -NoSetup
```

安装并强制重跑 setup：

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/vrboyzero/star-sanctuary/main/install.ps1))) -Version v0.2.4 -ForceSetup
```

#### Linux / macOS

安装最新版：

```bash
curl -fsSL https://raw.githubusercontent.com/vrboyzero/star-sanctuary/main/install.sh | bash
```

安装指定版本：

```bash
curl -fsSL https://raw.githubusercontent.com/vrboyzero/star-sanctuary/main/install.sh | bash -s -- --version v0.2.4
```

安装并跳过 setup：

```bash
curl -fsSL https://raw.githubusercontent.com/vrboyzero/star-sanctuary/main/install.sh | bash -s -- --version v0.2.4 --no-setup
```

安装并强制重跑 setup：

```bash
curl -fsSL https://raw.githubusercontent.com/vrboyzero/star-sanctuary/main/install.sh | bash -s -- --version v0.2.4 --force-setup
```

#### 安装器版会做什么

- 检查 `Node.js 22.12+`
- 自动准备依赖与构建产物
- 在安装根生成启动包装脚本
- 默认复用安装根中的 `.env` / `.env.local`
- 如果安装根已存在 `.env.local`，默认跳过 `bdd setup`

安装完成后，你通常可以直接用安装根里的命令继续操作：

- Windows：`<InstallDir>\start.bat`、`<InstallDir>\bdd.cmd`
- Linux/macOS：`<InstallDir>/start.sh`、`<InstallDir>/bdd`

补充说明：

- 安装器版也是当前推荐的“命令行用户升级路径”
- 更完整的升级、回滚和安装器语义说明，见 [docs/用户版本升级手册.md](E:\project\star-sanctuary\docs\用户版本升级手册.md)

### 2.3 源码运行

环境要求：

- Node.js `22.12.0+`
- 推荐开启 `corepack`
- 推荐使用 `pnpm`

安装步骤：

```bash
git clone https://github.com/vrboyzero/star-sanctuary.git
cd star-sanctuary
corepack pnpm install
corepack pnpm build
```

### 2.4 Docker / Compose

如果你是服务器、NAS、长期开机设备场景，建议直接看这些文档：

- [DOCKER_DEPLOYMENT.md](E:\project\star-sanctuary\DOCKER_DEPLOYMENT.md)
- [docs/NIX_DEPLOYMENT.md](E:\project\star-sanctuary\docs\NIX_DEPLOYMENT.md)
- [docs/TAILSCALE_DEPLOYMENT.md](E:\project\star-sanctuary\docs\TAILSCALE_DEPLOYMENT.md)

---

## 3. 最小配置

### 3.1 当前配置文件放在哪里

Star Sanctuary 当前不再强制把配置固定写在项目根目录。它会根据当前实际 `envDir` 读写配置。

你最常用的两个命令：

```bash
corepack pnpm bdd config path
corepack pnpm bdd doctor
```

当前 `envDir` 规则：

1. 如果显式设置了 `STAR_SANCTUARY_ENV_DIR` 或 `BELLDANDY_ENV_DIR`，优先使用该目录
2. 否则，如果项目根目录已经存在 `.env` 或 `.env.local`，继续兼容使用项目根目录
3. 否则，默认使用 `stateDir`，通常是 `~/.star_sanctuary`

推荐原则：

- 本地源码运行：优先使用 `.env.local`
- Docker：优先使用 `.env`
- 不要把真实密钥提交到 Git

### 3.2 本地最小可用配置

如果你只想先在本机跑起来，建议从下面这组开始：

```env
BELLDANDY_AGENT_PROVIDER=openai
BELLDANDY_OPENAI_BASE_URL=https://api.openai.com/v1
BELLDANDY_OPENAI_API_KEY=sk-your-api-key
BELLDANDY_OPENAI_MODEL=gpt-4o

BELLDANDY_AUTH_MODE=none
BELLDANDY_TOOLS_ENABLED=true
```

说明：

- `BELLDANDY_AGENT_PROVIDER=openai`
  使用 OpenAI-compatible 路线，兼容 OpenAI、Gemini、DeepSeek、Ollama 等
- `BELLDANDY_AUTH_MODE=none`
  仅建议在本机本地使用时采用；即使是 `none`，新设备仍然需要 Pairing
- `BELLDANDY_TOOLS_ENABLED=true`
  开启工具能力，WebChat 和 Agent 才能调用文件、浏览器、命令等工具

### 3.3 局域网 / 公网访问的最小安全配置

如果你要让其他设备访问，至少改成：

```env
BELLDANDY_HOST=0.0.0.0
BELLDANDY_PORT=28889
BELLDANDY_AUTH_MODE=token
BELLDANDY_AUTH_TOKEN=your-secure-token
```

注意：

- `0.0.0.0 + AUTH_MODE=none` 是不安全组合，系统会拒绝这种配置
- 公网场景建议同时配置反向代理、来源限制和更严格的工具策略

### 3.4 常用增强配置

如果你希望体验接近完整能力，通常还会加上：

```env
BELLDANDY_EMBEDDING_ENABLED=true
BELLDANDY_EMBEDDING_PROVIDER=openai
BELLDANDY_EMBEDDING_MODEL=text-embedding-3-small

BELLDANDY_CRON_ENABLED=true
BELLDANDY_HEARTBEAT_ENABLED=true
BELLDANDY_HEARTBEAT_INTERVAL=30m
BELLDANDY_HEARTBEAT_ACTIVE_HOURS=08:00-23:00

BELLDANDY_MCP_ENABLED=true
BELLDANDY_BROWSER_RELAY_ENABLED=true
```

作用：

- `EMBEDDING`：提升记忆召回与检索体验
- `CRON`：启用定时任务自动执行
- `HEARTBEAT`：启用定时主动提醒
- `MCP`：允许接外部 MCP 服务器
- `BROWSER_RELAY`：允许浏览器自动化

### 3.5 某些模型需要 `responses` 线路

当前默认线路是：

```env
BELLDANDY_OPENAI_WIRE_API=chat_completions
```

某些模型或代理线路需要：

```env
BELLDANDY_OPENAI_WIRE_API=responses
```

例如使用某些 `gpt-5.x` 兼容代理时，常需要改成 `responses`。如果模型能对话但工具模式异常，可以优先检查这一项。

### 3.6 可以直接用 WebChat 设置

当前 WebChat 已有设置面板。普通用户通常可以：

1. 先把服务跑起来
2. 打开 WebChat
3. 点击右上角设置
4. 直接修改 API Key、模型、能力开关等配置

当前 Settings 更适合做：

- API Key / Base URL / 模型
- 工具、Embedding、MCP、Browser Relay、Cron、TTS 等开关
- 模型容灾、语音快捷键等常见运行配置

---

## 4. 启动与首次使用

### 4.1 推荐启动方式

#### 源码运行

```bash
corepack pnpm bdd setup
corepack pnpm bdd doctor
corepack pnpm bdd start
```

如果你在开发中：

```bash
corepack pnpm bdd dev
```

常用命令：

```bash
corepack pnpm bdd status
corepack pnpm bdd stop
corepack pnpm bdd console
```

#### 发布版

- Windows：运行 `start.bat`
- 之后访问 `http://127.0.0.1:28889/`

### 4.2 `bdd setup` 做什么

`bdd setup` 是当前推荐的首次启动入口。它会帮你：

- 生成初始配置
- 选择 provider、Base URL、API Key、模型
- 配置监听地址与鉴权方式
- 在高级流程里顺带配置部分扩展模块

也支持非交互式：

```bash
corepack pnpm bdd setup ^
  --provider openai ^
  --base-url https://api.openai.com/v1 ^
  --api-key sk-your-api-key ^
  --model gpt-4o ^
  --host 127.0.0.1 ^
  --port 28889 ^
  --auth-mode none
```

### 4.3 首次访问 WebChat

默认地址：

- `http://127.0.0.1:28889/`

首次进入后你通常会看到这些区域：

- 聊天主区域
- 设置入口
- 工作区文件树
- 记忆查看器
- 长期任务面板
- 子任务面板
- Tool Settings
- 画布工作区

### 4.4 首次配对（Pairing）

当前任何新设备首次连接，默认都需要 Pairing。

典型流程：

1. 新设备在 WebChat 发送一条消息
2. 页面会给出配对码
3. 在服务端机器执行批准命令

```bash
corepack pnpm bdd pairing pending
corepack pnpm bdd pairing approve <配对码>
```

常用配对命令：

```bash
corepack pnpm bdd pairing list
corepack pnpm bdd pairing pending
corepack pnpm bdd pairing approve <code>
corepack pnpm bdd pairing revoke <clientId>
corepack pnpm bdd pairing cleanup --dry-run
```

### 4.5 版本检查与升级

当前默认会做轻量版本检查，只提示，不自动升级。

相关变量：

```env
BELLDANDY_UPDATE_CHECK=true
# BELLDANDY_UPDATE_CHECK_TIMEOUT_MS=3000
```

源码用户升级通常是：

```bash
git pull
corepack pnpm install
corepack pnpm build
corepack pnpm bdd start
```

发布版用户建议同时查看：

- [docs/用户版本升级手册.md](E:\project\star-sanctuary\docs\用户版本升级手册.md)

---

## 5. WebChat 日常使用

### 5.1 当前 WebChat 是什么

当前 WebChat 已经不是简单聊天页，而是一个工作台。你可以在里面完成：

- 聊天与流式回复
- 切换 Agent / 模型
- 附件发送
- 工作区文件浏览与编辑
- 记忆查看与经验复盘
- 长期任务管理
- 子任务状态查看、续跑与接管
- Doctor 摘要查看
- Tool Settings
- 语音、画布、主题、语言切换

### 5.2 普通用户最常用的入口

| 需求 | WebChat 入口 |
| --- | --- |
| 正常聊天 | 中间聊天区 |
| 改模型 / 改 API Key | `⚙️ 设置` |
| 看记忆命中与任务记录 | `🧠 记忆查看` |
| 管长期任务 | `🎯 长期任务` |
| 看子任务、续跑、接管 | `子任务` 面板 |
| 临时禁用工具 / MCP / 扩展 | `🛠️ 工具设置` |
| 看系统状态 | `Doctor` / 顶部摘要 |
| 做可视化拆解 | `Canvas` |

### 5.3 Tool Settings 是什么

当前 Tool Settings 是 **运行时策略层**，不是卸载工具。

它主要用于：

- 临时禁用高风险工具
- 临时禁用 MCP / 插件 / 技能包
- 观察当前工具可见性

如果开启了确认模式，相关变量是：

```env
BELLDANDY_AGENT_TOOL_CONTROL_MODE=confirm
BELLDANDY_AGENT_TOOL_CONTROL_CONFIRM_PASSWORD=
```

说明：

- `confirm` 模式下，变更工具开关时需要确认
- 不填确认密码时，可使用系统给出的 `requestId` 完成批准

### 5.4 会话复盘

当前会话复盘已经是独立能力，不需要再只靠日志猜。

常用命令：

```bash
corepack pnpm bdd conversation list
corepack pnpm bdd conversation export --conversation-id <id>
corepack pnpm bdd conversation timeline --conversation-id <id>
corepack pnpm bdd conversation prompt-snapshot --conversation-id <id>
corepack pnpm bdd conversation exports
```

适合排查：

- 这轮 prompt 到底注入了什么
- 为什么触发了某个工具
- 历史摘要、压缩和边界信息

---

## 6. 个性化与工作区

### 6.1 状态目录里最重要的文件

默认状态目录通常是：

- `~/.star_sanctuary`

最重要的工作区文件：

- `AGENTS.md`
- `SOUL.md`
- `IDENTITY.md`
- `USER.md`
- `TOOLS.md`
- `HEARTBEAT.md`
- `BOOTSTRAP.md`
- `MEMORY.md`（可选）

它们分别大致负责：

- `SOUL.md`：人格、语气、价值观
- `IDENTITY.md`：名字、头像、身份标签
- `USER.md`：你是谁、偏好和长期上下文
- `TOOLS.md`：工具使用边界与偏好
- `HEARTBEAT.md`：主动提醒与跟进规则
- `AGENTS.md`：项目级或工作区级工程协作规则

### 6.2 FACET 模组

FACET 可以理解为“人格 / 职能模组”。你可以把不同工作模式拆开，而不是把所有规则堆进一个 `SOUL.md`。

适合场景：

- coder
- researcher
- writer
- translator
- reviewer

当前运行时支持通过工具切换 FACET，也支持与多 Agent 配置配合使用。

### 6.3 额外工作区根目录

如果你要跨多个项目协作，可设置：

```env
BELLDANDY_EXTRA_WORKSPACE_ROOTS=E:\projects,D:\workspace
```

这会把这些目录加入允许访问的工作区根目录。

---

## 7. 记忆、长期任务与 Resident

### 7.1 记忆系统的实际作用

当前记忆不是“聊天记录回放”，而是混合了：

- 会话持久化
- 关键词检索
- 向量语义检索
- Durable Extraction
- 任务记忆
- Experience candidate / usage
- Resident 的 private/shared/hybrid 记忆治理

最常用的开关：

```env
BELLDANDY_EMBEDDING_ENABLED=true
BELLDANDY_EMBEDDING_PROVIDER=openai
BELLDANDY_EMBEDDING_MODEL=text-embedding-3-small
```

如果 Embedding 没开，系统仍可运行，但“它为什么记不住”“为什么找不到以前做过的事”这类体验会明显下降。

### 7.2 Memory Viewer

WebChat 的 `🧠 记忆查看` 当前适合做这些事：

- 看最近任务记录
- 看 durable memory / chunk 命中
- 看 experience candidate
- 看 shared review backlog
- 看外发审计记录

它很适合回答两类问题：

- “它为什么会这么答？”
- “它之前到底做过什么？”

### 7.3 长期任务（Goals）

当前 Goals 已经是主线能力之一。你可以把它理解为“长期事项的执行工作台”，而不是普通待办列表。

当前已落地的主线能力包括：

- Goal 创建、暂停、恢复
- NORTHSTAR / 目标文档
- task graph
- capability plan
- handoff / retrospective
- suggestion review
- checkpoint 审批
- WebChat 中的目标详情、治理和跟踪面板

最常用入口：

- WebChat 左侧 `🎯 长期任务`

推荐配套阅读：

- [docs/长期任务使用指南.md](E:\project\star-sanctuary\docs\长期任务使用指南.md)

如果你准备认真使用长期任务治理，建议额外配置：

- `~/.star_sanctuary/governance/review-governance.json`

它主要负责：

- reviewer 目录
- checkpoint / suggestion review 模板
- reminder / SLA
- notification channel / route 默认值

最小示例：

```json
{
  "version": 1,
  "reviewers": [
    {
      "id": "producer",
      "name": "制作人",
      "reviewerRole": "owner",
      "channels": ["reviewer_inbox"],
      "active": true
    }
  ],
  "templates": [],
  "defaults": {
    "reminderMinutes": [240, 60, 15],
    "notificationChannels": ["goal_detail", "reviewer_inbox"]
  },
  "updatedAt": "2026-03-21T00:00:00.000Z"
}
```

如果你不配这个文件，Goals 仍然能用，但组织级 reviewer / template / SLA / 通知策略会明显弱很多。

### 7.4 Resident、Shared Review、Mind Profile

这部分当前已经存在，但更偏“长期运行治理”能力：

- Resident Agent 运行态
- private / shared / hybrid 记忆模式
- shared review 审批积压
- mind profile runtime 摘要
- learning review 输入
- skill freshness 风险观测

普通用户可以先只理解成一句话：

它们的目标是让 Agent 不只是“记得住”，还要“记得稳、记得可审计、记得可治理”。

---

## 8. 多 Agent、模型切换与子任务

### 8.1 `agents.json`

当前多 Agent 主配置文件是：

- `~/.star_sanctuary/agents.json`

它主要定义：

- Agent ID 和显示名
- 模型引用
- Resident / Worker 类型
- 专属工作区目录
- 记忆模式
- 工具权限边界

最小示例：

```json
{
  "agents": [
    {
      "id": "default",
      "model": "primary"
    },
    {
      "id": "coder",
      "displayName": "代码专家",
      "model": "primary",
      "kind": "resident",
      "workspaceDir": "coder",
      "memoryMode": "hybrid",
      "toolsEnabled": true
    }
  ]
}
```

完整字段说明请看：

- [docs/agents.json配置说明.md](E:\project\star-sanctuary\docs\agents.json配置说明.md)

### 8.2 `models.json`

如果你需要主模型故障时自动切换备用模型，可配置：

- `~/.star_sanctuary/models.json`

对应变量：

```env
BELLDANDY_MODEL_CONFIG_FILE=~/.star_sanctuary/models.json
```

它主要用于：

- fallback 模型队列
- 给不同 Agent / 手动切换使用不同模型条目

最小示例：

```json
{
  "fallbacks": [
    {
      "id": "backup",
      "baseUrl": "https://api.deepseek.com/v1",
      "apiKey": "sk-xxx",
      "model": "deepseek-chat",
      "protocol": "openai",
      "wireApi": "chat_completions",
      "requestTimeoutMs": 60000,
      "maxRetries": 1,
      "retryBackoffMs": 300
    }
  ]
}
```

### 8.3 WebChat 中切换 Agent / 模型

当前 WebChat 已支持：

- 在会话中切换 Agent
- 在会话中切换模型

前提：

- `agents.json` 中已经定义了 Agent
- `models.json` 中已经定义了可选模型，或者使用 `primary`

### 8.4 子任务与委派

当前子任务系统已经可以支持：

- 让主 Agent 委派子 Agent
- 并行处理多个子任务
- 查看子任务状态
- 对结束态子任务进行续跑或接管

这部分更适合高级用户或多 Agent 场景。对普通用户来说，你可以先把它理解为“让主 Agent 自己分工”。

---

## 9. 自动化与外部集成

### 9.1 Heartbeat

Heartbeat 是“定时主动提醒你”的能力。常见用法是：

- 定期回顾待办
- 定期检查某个长期事项
- 定期提醒你推进工作

常用配置：

```env
BELLDANDY_HEARTBEAT_ENABLED=true
BELLDANDY_HEARTBEAT_INTERVAL=30m
BELLDANDY_HEARTBEAT_ACTIVE_HOURS=08:00-23:00
```

### 9.2 Cron

Cron 是更通用的定时任务引擎。和 Heartbeat 的关系可以简单理解为：

- Heartbeat：偏“主动联系你”
- Cron：偏“定时执行任务”

开启方式：

```env
BELLDANDY_CRON_ENABLED=true
```

注意：

- 即使 `CRON_ENABLED=false`，`cron` 工具本身仍可存在
- 该开关主要控制“自动调度执行”是否启用

### 9.2.1 统一 `Assistant Mode`

当前推荐把主动工作相关配置理解为一个统一的 `Assistant Mode`，而不是分别记忆多条旧开关。

对普通用户可以这样理解：

- 它更像“贝露丹蒂当前主动工作状态的总览卡”
- 它负责解释：她现在会不会主动跟进、下一步准备做什么、哪里卡住了
- 它**不是**“所有任务的总模式切换器”

产品层主开关是：

```env
BELLDANDY_ASSISTANT_MODE_ENABLED=true
```

它收口的是下面这组现有 runtime：

```env
BELLDANDY_HEARTBEAT_ENABLED=true
BELLDANDY_HEARTBEAT_INTERVAL=30m
BELLDANDY_HEARTBEAT_ACTIVE_HOURS=08:00-23:00
BELLDANDY_CRON_ENABLED=true
BELLDANDY_EXTERNAL_OUTBOUND_REQUIRE_CONFIRMATION=true
```

这组运行时背后的实际含义是：

- `heartbeat`
  负责按固定节奏主动看一眼当前状态，看有没有值得继续推进的事情
- `cron`
  负责按计划任务时间表主动跑一些调度
- `external outbound confirmation`
  负责“如果系统准备主动往外发消息，是否需要你先确认”

所以现在的 `Assistant Mode`，本质上统一的是：

- 主动工作解释层
- 主动调度策略
- 主动外发策略

它当前**不直接改**下面这些执行模型：

- 你在普通聊天窗口里手动发起的一次对话任务
- 长期任务自己的生命周期控制
- `subtask / goal / resume / takeover / steering` 这些长期任务运行时

一句话记忆：

- `Assistant Mode` 是“主动工作统一解释层”
- 不是“所有任务统一执行层”

建议直接记住当前语义：

- 关闭 `Assistant Mode`：`heartbeat` 和 `cron` 都不会主动运行
- 重新开启 `Assistant Mode`：如果当前两者都关闭，设置页保存时会优先恢复成 `heartbeat + cron` 的默认主动组合
- 下方细项仍然保留：你之后仍可以继续单独调整 `heartbeat interval / active hours / cron / 外发确认`

当前最方便的使用入口是 WebChat 设置页：

1. 打开设置窗口
2. 找到 `Assistant Mode 配置`
3. 先决定主开关是否启用
4. 再按需要细调 `heartbeat`、`cron` 和 `external outbound confirmation`

如果你更习惯看运行状态，而不是只看配置值，可以直接看 WebChat 的 `系统检查`：

- `Assistant Mode`
  用来查看当前统一状态、heartbeat / cron 概况、外发确认策略、长期任务摘要、goal 摘要、当前焦点和待处理事项
- `Config Source`
  用来查看当前配置究竟来自哪里

#### 9.2.1.1 `系统检查 -> Assistant Mode` 现在应该怎么看

如果你已经打开 `系统检查 -> Assistant Mode`，建议按下面顺序理解：

##### A. 先看状态和主策略

通常最上面会先告诉你：

- 当前 `Assistant Mode` 是开还是关
- 当前 `status` 是：
  - `disabled`
  - `idle`
  - `running`
  - `attention`
- `heartbeat / cron` 当前是否启用
- 当前外发策略和是否需要确认

普通用户可以这样理解：

- `disabled`
  说明主动链路整体没在工作
- `idle`
  说明主动链路是开着的，但现在没有正在跑的动作
- `running`
  说明现在确实有主动动作正在进行
- `attention`
  说明系统认为“有东西值得你看一下”

##### B. 再看 `next action`

`next action` 的意思不是“当前焦点”，而是：

- 如果现在没有更强的运行中事项
- 系统下一步最可能去做什么

常见例子：

- 等下一次 heartbeat
- 等下一次可执行的 cron
- 继续某个主动跟进动作

所以你看到 `next action` 只是说明“接下来准备干什么”，不等于“这就是现在最值得你看的对象”。

##### C. 再看 `focus`

`focus` 才是当前这张卡最值得你优先看的对象。  
它表示：**现在最应该被当成当前工作焦点的事项**。

当前系统会按大致下面的顺序选 `focus`：

1. 正在运行的主动动作
2. 明显失败或超时的长期任务摘要
3. 明显阻塞或等待确认的 goal 摘要
4. resident 的 continuation 焦点
5. 最近一次带目标的主动动作
6. 如果上面都没有，再回退到 `next action`

这意味着：

- `focus` 比 `next action` 更像“当前注意力中心”
- 如果一个 goal 正在阻塞，或者 resident 正在跟进，它们不会再轻易被“等下一次 heartbeat”这种说明盖住

##### D. 再看长期任务摘要和 goal 摘要

现在 `Assistant Mode` 卡里已经会并入：

- `长期任务摘要`
- `长期任务焦点`
- `Goal 摘要`
- `Goal 焦点`

这部分是**只读映射**，目的只是帮助你知道：

- 有没有长期任务正在跑
- 有没有长期任务失败、超时、阻塞
- 当前最值得关注的是哪个长期目标

这部分当前不会把控制按钮搬进来，所以你不要期待在这里直接看到：

- `resume`
- `takeover`
- `steering`
- goal 的调度控制

如果你需要真正管理长期任务，还是去：

- `🎯 长期任务`
- 对应长期任务详情页

##### E. 最后看 `attention items`

`attention items` 可以理解成：**现在最像“待处理事项”的清单**。  
它不是所有异常的杂项堆叠，而是当前最值得你处理的几类确定性事项。

现在常见会进入这一区域的内容包括：

- 待确认的主动外发
- 阻塞或等待确认的 goal
- 失败或超时的长期任务
- 失败的主动动作
- 没有 `nextRunAtMs` 的 cron 异常

当前有一个重要变化：

- `mismatch` 这类配置不一致提示，**不再放进 `attention items`**
- 它仍会出现在：
  - `blocked reason`
  - `attention reason`
  - 或单独的 mismatch 提示文字里

这样做的目的，是让 `attention items` 更像“待处理事项”，而不是“所有诊断信息”。

#### 9.2.1.2 普通用户最容易混淆的 3 件事

##### A. `Assistant Mode` 开了，不等于所有任务都自动变成另一套模式

当前它不会直接改变：

- 你手动发送的一条普通聊天消息
- 一次普通问答
- 一次普通编码请求

也就是说：

- 你正常在聊天窗口里发起任务，还是按原来的执行链工作
- `Assistant Mode` 主要解释和治理“主动工作”这条线

##### B. 长期任务已经出现在 `Assistant Mode` 里，不等于它已经被接管

现在接进来的，是：

- 长期任务摘要
- goal 摘要
- 焦点和 attention 映射

不是：

- 长期任务执行控制权本身

所以你看到它，表示“它被纳入观察和解释”，不是“它已经被 Assistant Mode 这个壳接管执行”。

##### C. `focus` 和 `attention items` 不是一回事

- `focus`
  更像“当前最值得先看的一件事”
- `attention items`
  更像“当前待处理事项列表”

一个东西可能是 `focus`，也可能同时出现在 `attention items`。  
但系统现在已经尽量减少这两处的重复噪音。

关于 `Config Source`，当前只要记住一条：

- 如果页面、日志、`bdd doctor` 或 `system.doctor` 提示 `legacy project-root env files`，表示当前真正生效的是仓库根目录 `.env/.env.local`
- 这时 `state-dir` 下的同名配置不会再同时合并
- 如果要切换到状态目录配置，使用 `corepack pnpm bdd config migrate-to-state-dir`
- 如果要强制指定配置目录，可以显式设置 `STAR_SANCTUARY_ENV_DIR` 或 `BELLDANDY_ENV_DIR`

排障时再记一条经验：

- 如果 `Assistant Mode`、模型 fallback、渠道安全或 `system.doctor` 一起显示读取失败，先确认当前 WebChat 会话是否已经完成 `Pairing`

### 9.2.2 邮件收发：从接入邮箱到日常使用

这一节面向普通用户写，不要求你先理解代码或运行时结构。  
你只需要把它理解成：

- Star Sanctuary 现在已经可以帮你**发邮件**
- 也可以把**新收到的邮件接进会话**
- 收到邮件后，系统会给出**整理建议、建议回复、跟进提醒**

但当前它还**不是一个完整邮箱客户端**。  
也就是说：

- 你不会看到一个像 Outlook / Gmail 那样完整的收件箱页面
- 邮件相关能力主要通过：
  - `系统检查`
  - `记忆查看 -> 消息审计`
  - 邮件线程对应的聊天会话
  来使用和检查

当前邮件链路分成两条：

- 发信：`SMTP`
- 收信：`IMAP polling fallback`

如果你是第一次接入，建议顺序是：

1. 先接好 `SMTP`，确认能发
2. 再接好 `IMAP`，确认能收
3. 最后再开始体验“整理建议 / 跟进提醒 / 邮件线程会话”

#### 9.2.2.1 你接入前要先准备什么

在真正修改配置前，先准备好下面这些信息：

1. 你的邮箱地址  
   例如：`yourname@example.com`

2. 你的 SMTP 信息  
   也就是“发送服务器”的地址和端口。常见需要：
   - SMTP Host
   - SMTP Port
   - 是否加密 `secure`
   - SMTP 用户名
   - SMTP 密码或应用专用密码

3. 你的 IMAP 信息  
   也就是“收信服务器”的地址和端口。常见需要：
   - IMAP Host
   - IMAP Port
   - 是否加密 `secure`
   - IMAP 用户名
   - IMAP 密码或应用专用密码

4. 如果你的邮箱服务商要求“应用专用密码”  
   不要直接用网页登录密码，优先使用应用专用密码。

对普通用户最重要的一条提醒：

- **SMTP 是发信**
- **IMAP 是收信**
- 两者通常都要单独填

#### 9.2.2.2 先确认你改的是哪个配置文件

Star Sanctuary 不一定总是读取仓库根目录 `.env`。  
所以改邮箱配置之前，先确认当前实际生效的配置目录。

最简单的方法：

1. 打开 WebChat
2. 进入 `系统检查`
3. 找到 `Config Source`

你只需要看明白这一点：

- 如果看到的是 `legacy project-root env files`
  说明当前真正生效的是**项目根目录**下的 `.env / .env.local`
- 如果看到的是 `state-dir config`
  说明当前真正生效的是 `~/.star_sanctuary` 里的 `.env / .env.local`
- 如果你显式设置过 `STAR_SANCTUARY_ENV_DIR` 或 `BELLDANDY_ENV_DIR`
  那么系统会优先读取你指定的目录

对普通用户的推荐是：

- **优先把你自己的邮箱账号信息写进 `.env.local`**
- 不要直接改 `.env.example`
- 不要把真实邮箱密码提交到 Git

当前再补一条很重要的现实说明：

- **邮件接入目前主要通过环境变量完成**
- 也就是说，你主要是在 `.env.local` 里填写 SMTP / IMAP 信息
- 现在 WebChat 里还没有一个“邮箱账号设置向导”把这些字段全部做成可视化表单

#### 9.2.2.3 最推荐的写法：把邮箱配置写进 `.env.local`

如果你是本机个人使用，最推荐把真实账号配置写进当前生效目录里的 `.env.local`。

原因很简单：

- `.env` 更适合放通用默认值
- `.env.local` 更适合放你自己这台机器的真实账号和密码

你可以先在 `.env.example` 里找到模板，再把真实值写进 `.env.local`。

#### 9.2.2.4 只接发信：SMTP 配置怎么写

如果你想先体验“让贝露丹蒂帮你写并发送邮件”，先接 SMTP 就够了。

推荐最小配置：

```env
BELLDANDY_EMAIL_DEFAULT_PROVIDER=smtp
BELLDANDY_EMAIL_OUTBOUND_REQUIRE_CONFIRMATION=true

BELLDANDY_EMAIL_SMTP_ENABLED=true
BELLDANDY_EMAIL_SMTP_ACCOUNT_ID=default
BELLDANDY_EMAIL_SMTP_HOST=smtp.example.com
BELLDANDY_EMAIL_SMTP_PORT=587
BELLDANDY_EMAIL_SMTP_SECURE=false
BELLDANDY_EMAIL_SMTP_USER=mailer@example.com
BELLDANDY_EMAIL_SMTP_PASS=your-smtp-password-or-app-password
BELLDANDY_EMAIL_SMTP_FROM_ADDRESS=mailer@example.com
BELLDANDY_EMAIL_SMTP_FROM_NAME=Belldandy
```

每一项的意思：

- `BELLDANDY_EMAIL_DEFAULT_PROVIDER=smtp`
  表示默认发信 provider 用 SMTP
- `BELLDANDY_EMAIL_OUTBOUND_REQUIRE_CONFIRMATION=true`
  表示真实发信前必须经过确认
- `BELLDANDY_EMAIL_SMTP_ENABLED=true`
  允许 Gateway 注册 SMTP 发信能力
- `BELLDANDY_EMAIL_SMTP_ACCOUNT_ID=default`
  这是这个发信账号在系统里的名字。普通用户保持 `default` 就可以
- `BELLDANDY_EMAIL_SMTP_HOST`
  SMTP 服务器地址
- `BELLDANDY_EMAIL_SMTP_PORT`
  SMTP 端口
- `BELLDANDY_EMAIL_SMTP_SECURE`
  是否使用加密连接
- `BELLDANDY_EMAIL_SMTP_USER`
  登录 SMTP 的用户名，很多服务商就是邮箱地址
- `BELLDANDY_EMAIL_SMTP_PASS`
  SMTP 密码或应用专用密码
- `BELLDANDY_EMAIL_SMTP_FROM_ADDRESS`
  发件地址
- `BELLDANDY_EMAIL_SMTP_FROM_NAME`
  收件人看到的发件人名称

普通用户可以这样理解 `PORT + SECURE`：

- 常见 `465 + true`
  表示一开始就走加密
- 常见 `587 + false`
  表示按常见 submission 配置走

如果你不知道该填什么：

- 以你的邮箱服务商文档为准
- 不要猜

#### 9.2.2.5 只接收信：IMAP 配置怎么写

如果你想让系统把新邮件接进会话，需要配置 IMAP。

推荐最小配置：

```env
BELLDANDY_EMAIL_INBOUND_AGENT_ID=default

BELLDANDY_EMAIL_IMAP_ENABLED=true
BELLDANDY_EMAIL_IMAP_ACCOUNT_ID=default
BELLDANDY_EMAIL_IMAP_HOST=imap.example.com
BELLDANDY_EMAIL_IMAP_PORT=993
BELLDANDY_EMAIL_IMAP_SECURE=true
BELLDANDY_EMAIL_IMAP_USER=mailer@example.com
BELLDANDY_EMAIL_IMAP_PASS=your-imap-password-or-app-password
BELLDANDY_EMAIL_IMAP_MAILBOX=INBOX
BELLDANDY_EMAIL_IMAP_POLL_INTERVAL_MS=60000
BELLDANDY_EMAIL_IMAP_CONNECT_TIMEOUT_MS=10000
BELLDANDY_EMAIL_IMAP_SOCKET_TIMEOUT_MS=20000
BELLDANDY_EMAIL_IMAP_BOOTSTRAP_MODE=latest
BELLDANDY_EMAIL_IMAP_RECENT_WINDOW_LIMIT=50
```

每一项的意思：

- `BELLDANDY_EMAIL_INBOUND_AGENT_ID=default`
  指定“收到邮件后交给哪个 Agent 处理”。普通用户一般保持 `default`
- `BELLDANDY_EMAIL_IMAP_ENABLED=true`
  允许 Gateway 尝试启动收信 runtime
- `BELLDANDY_EMAIL_IMAP_ACCOUNT_ID=default`
  这是这个收信账号在系统里的名字
- `BELLDANDY_EMAIL_IMAP_HOST`
  IMAP 服务器地址
- `BELLDANDY_EMAIL_IMAP_PORT`
  IMAP 端口，很多服务商常见是 `993`
- `BELLDANDY_EMAIL_IMAP_SECURE=true`
  是否使用加密连接
- `BELLDANDY_EMAIL_IMAP_USER`
  登录 IMAP 的用户名
- `BELLDANDY_EMAIL_IMAP_PASS`
  IMAP 密码或应用专用密码
- `BELLDANDY_EMAIL_IMAP_MAILBOX=INBOX`
  默认轮询收件箱
- `BELLDANDY_EMAIL_IMAP_POLL_INTERVAL_MS=60000`
  轮询间隔，`60000` 表示 60 秒检查一次
- `BELLDANDY_EMAIL_IMAP_CONNECT_TIMEOUT_MS`
  连接超时
- `BELLDANDY_EMAIL_IMAP_SOCKET_TIMEOUT_MS`
  Socket 超时
- `BELLDANDY_EMAIL_IMAP_BOOTSTRAP_MODE=latest`
  首次接入或 checkpoint 明显过旧时，优先从最新位置建基线，而不是回扫整箱历史邮件
- `BELLDANDY_EMAIL_IMAP_RECENT_WINDOW_LIMIT=50`
  当邮箱历史邮件很多时，只追最近 `50` 封邮件作为当前导入窗口；这不会删除本地已经保存的旧线程或旧审计，只是避免首次接入或 checkpoint 过旧时去追整箱历史邮件

这里最重要的实际语义要记住：

- `BELLDANDY_EMAIL_IMAP_ENABLED=true`
  只表示“允许尝试启动”，不等于一定成功启动
- 如果 `HOST / USER / PASS` 缺任意一个
  runtime 会直接跳过启动
- 当前首发是 `IMAP polling fallback`
  不是 `IMAP IDLE`

也就是说，当前系统是“按固定间隔检查新邮件”，不是“邮件一到马上推送”。

如果你接入的是一个用了很多年的老邮箱，建议额外记住这一条：

- `BELLDANDY_EMAIL_IMAP_RECENT_WINDOW_LIMIT`
  这是“最近窗口限制”，不是“把本地邮件永远只保留 N 封”
- 它控制的是：
  当历史 backlog 很大时，IMAP runtime 只追最近 N 封邮件，再继续往后收新邮件
- 对普通用户来说，可以把它理解成：
  “第一次接入旧邮箱时，不要让系统去翻几千封历史信，而是只从最近一小段开始接”
- 如果你不确定填多少，`50` 是当前比较稳妥的起点

如果你还想控制“邮件线程对应的 prompt snapshot 不要保留太多”，当前也已经支持单独设置：

```env
BELLDANDY_PROMPT_SNAPSHOT_EMAIL_THREAD_MAX_RUNS=10
```

它的语义是：

- 只影响 `channel=email:scope=per-account-thread:*` 这类邮件线程会话
- 控制每条邮件线程在 `diagnostics/prompt-snapshots/` 下最多保留多少份 prompt snapshot
- 默认值是 `10`
- 它不会删除你的真实会话正文；真实会话正文仍在 `sessions/` 目录里

#### 9.2.2.6 同时接入收发：建议怎么配置

如果你要完整体验“会发 + 会收 + 会整理”，可以把 SMTP 和 IMAP 一起配置。

一个普通用户可参考的组合是：

```env
BELLDANDY_EMAIL_DEFAULT_PROVIDER=smtp
BELLDANDY_EMAIL_OUTBOUND_REQUIRE_CONFIRMATION=true

BELLDANDY_EMAIL_SMTP_ENABLED=true
BELLDANDY_EMAIL_SMTP_ACCOUNT_ID=default
BELLDANDY_EMAIL_SMTP_HOST=smtp.example.com
BELLDANDY_EMAIL_SMTP_PORT=587
BELLDANDY_EMAIL_SMTP_SECURE=false
BELLDANDY_EMAIL_SMTP_USER=mailer@example.com
BELLDANDY_EMAIL_SMTP_PASS=your-smtp-password-or-app-password
BELLDANDY_EMAIL_SMTP_FROM_ADDRESS=mailer@example.com
BELLDANDY_EMAIL_SMTP_FROM_NAME=Belldandy

BELLDANDY_EMAIL_INBOUND_AGENT_ID=default
BELLDANDY_EMAIL_IMAP_ENABLED=true
BELLDANDY_EMAIL_IMAP_ACCOUNT_ID=default
BELLDANDY_EMAIL_IMAP_HOST=imap.example.com
BELLDANDY_EMAIL_IMAP_PORT=993
BELLDANDY_EMAIL_IMAP_SECURE=true
BELLDANDY_EMAIL_IMAP_USER=mailer@example.com
BELLDANDY_EMAIL_IMAP_PASS=your-imap-password-or-app-password
BELLDANDY_EMAIL_IMAP_MAILBOX=INBOX
BELLDANDY_EMAIL_IMAP_POLL_INTERVAL_MS=60000
BELLDANDY_EMAIL_IMAP_RECENT_WINDOW_LIMIT=50
```

如果发信和收信用的是同一个邮箱账号：

- `SMTP_USER / FROM_ADDRESS`
- `IMAP_USER`

通常都会是同一个邮箱地址。  
但端口、服务器地址和密码类型，不一定完全相同，仍以服务商文档为准。

#### 9.2.2.7 配置好以后，界面上应该去哪里看

当前邮件能力没有单独做成一个“邮箱首页”，所以你主要看下面几个位置。

##### A. `系统检查 -> Config Source`

用途：

- 看系统到底从哪个目录读取 `.env / .env.local`

你要确认的是：

- 你刚改的那个配置文件，是不是当前真正生效的那个

如果这里没对上，后面其他检查都不可靠。

##### B. `系统检查 -> Email Inbound Runtime`

用途：

- 看 IMAP 收信当前有没有正确启动

你会看到大致三种状态：

- `disabled`
  说明你还没有开启 `BELLDANDY_EMAIL_IMAP_ENABLED`
- `blocked`
  说明你虽然写了开启，但配置还不完整，通常是缺 `HOST / USER / PASS`
- `running`
  说明当前配置完整，收信 runtime 预期已经正常运行

这张卡片还会直接告诉你：

- 当前账号是谁
- 当前 Host / Port / Mailbox
- 当前收信交给哪个 Agent
- 当前轮询间隔是多少
- 如果没起来，还缺哪些字段

##### C. `系统检查 -> Email Outbound Runtime`

用途：

- 看邮件发信能力是否已经有运行记录
- 看发信是否成功、是否失败、失败集中在哪些错误码

如果你已经测试过发信，这里会慢慢积累发信统计。

##### D. `记忆查看 -> 消息审计`

这是邮件最重要的“明细页”。

这里会显示：

- 邮件发信记录
- 邮件收信记录
- 失败记录
- 重复跳过记录
- 线程 ID、消息 ID、会话绑定、重试状态

如果你只是想知道：

- “系统到底有没有收到邮件？”
- “刚才那封邮件为什么没处理成功？”
- “这条线程是不是已经进会话了？”

优先看这里。

补充说明：邮件相关历史默认主要保存在 `C:\Users\admin\.star_sanctuary` 下。

其中最常见的几类文件是：

- 邮件线程会话正文与聊天历史：`C:\Users\admin\.star_sanctuary\sessions\`
  - 邮件线程通常会落成：
    - `channel=email:scope=per-account-thread:... .jsonl`
    - `channel=email:scope=per-account-thread:... .transcript.jsonl`
- 收信审计：`C:\Users\admin\.star_sanctuary\email-inbound-audit.jsonl`
- 发信审计：`C:\Users\admin\.star_sanctuary\email-outbound-audit.jsonl`
- 邮件线程绑定：`C:\Users\admin\.star_sanctuary\email-thread-bindings.json`
- IMAP checkpoint：`C:\Users\admin\.star_sanctuary\email-inbound-checkpoints.json`
- 跟进提醒：`C:\Users\admin\.star_sanctuary\email-follow-up-reminders.json`

可以这样理解：

- `sessions/` 里是“真实会话内容”
- `email-*.json / jsonl` 更像“邮件运行态索引、审计和提醒状态”
- 如果你只是想确认“系统有没有收进来、有没有发出去”，优先看 `消息审计`

##### E. `记忆查看 -> 消息审计 -> 邮件线程整理`

这是当前最接近“邮件工作台”的地方。

你会在这里看到：

- 哪些线程待回复
- 哪些线程待跟进
- 哪些线程已经发过提醒
- 哪些线程的建议回复需要人工复核

点开详情后，你还能看到：

- 整理摘要
- 建议回复 starter
- 建议回复草稿
- 回复建议质量
- 风险提醒和检查清单
- 打开线程会话

##### F. 邮件线程聊天会话顶部提示

当系统已经收到某封邮件，并把它绑定成一条邮件线程会话后：

- 你打开那条会话
- 聊天区顶部会出现一个固定的邮件线程 banner

这里会提示你：

- 当前是不是外部邮件线程
- 最近这封邮件的整理建议
- 回复建议质量
- 第一条回复风险提示
- 推荐使用的 `send_email.threadId`
- 推荐使用的 `send_email.replyToMessageId`

补充说明：

- 这个 banner 现在是**固定在聊天区顶部**的，不再作为一条新的普通消息反复追加到聊天流里
- 如果你看到线程里已经有一大段 `[Inbound Email Context]`、Agent 自动处理结果、跟进提醒，那么顶部 banner 的作用主要是“给你一个压缩后的当前线程提示”，而不是再重复完整邮件内容
- 当前为了减少重复，banner 不再展示完整建议回复草稿，也不再重复显示最近邮件的完整摘要正文

#### 9.2.2.8 第一次接入成功后，怎么验证“能发”和“能收”

建议你按下面顺序做。

##### 第一步：先验证配置生效

1. 修改当前生效目录里的 `.env.local`
2. 保存文件
3. 看启动日志里是否出现：

```text
[config-watcher] 检测到 .env.local 变更，正在重启服务...
```

如果你是重启后再看页面，也可以直接打开：

- `系统检查 -> Config Source`
- `系统检查 -> Email Inbound Runtime`

##### 第二步：先测发信

普通用户最容易上手的方式是直接在 WebChat 里对贝露丹蒂说：

- “帮我写一封测试邮件发给我自己”
- “帮我发一封主题是 Test，正文是 Hello 的邮件给 xxx@example.com”

当前发信链路是：

1. Agent 先生成邮件草稿
2. WebChat 弹出确认窗口
3. 你确认后，系统才真的发出去

请特别记住：

- 当前默认推荐保持 `BELLDANDY_EMAIL_OUTBOUND_REQUIRE_CONFIRMATION=true`
- 这表示 **AI 不会静默帮你发出真实邮件**

发信成功后，建议你立刻去看两处：

- `系统检查 -> Email Outbound Runtime`
- `记忆查看 -> 消息审计`

##### 第三步：再测收信

最简单的方式是：

1. 用另一个邮箱给当前接入的邮箱发一封测试邮件
2. 等待一个轮询周期
3. 再到 WebChat 查看：
   - `系统检查 -> Email Inbound Runtime`
   - `记忆查看 -> 消息审计`
   - `邮件线程整理`

如果收信成功，你通常会看到：

- 有新的 `email_inbound` 记录
- 有新的 `threadId / messageId`
- 系统把这封邮件绑定到一条线程会话
- 线程整理页里出现这条邮件线程

##### 第四步：验证“整理”和“回复建议”

当收信链路正常后，再去看：

- `记忆查看 -> 消息审计 -> 邮件线程整理`

你可以重点确认：

- 这条线程是不是被标成 `待回复`
- 有没有建议跟进窗口
- 回复建议质量是不是 `cautious` 或 `review_required`
- 有没有风险提示和检查清单

#### 9.2.2.9 现在日常该怎么用

普通用户可以把当前邮件能力这样理解：

##### 场景 A：你主动写邮件

你直接在 WebChat 里说：

- “帮我给客户写一封确认邮件”
- “把这段内容整理成正式邮件”
- “发给某某，语气正式一点”

系统会：

1. 先给出草稿
2. 弹出确认窗口
3. 你确认后再发送

##### 场景 B：你收到新邮件

系统轮询到新邮件后，会：

1. 把它按外部内容接入系统
2. 建立或复用对应邮件线程会话
3. 生成整理建议
4. 给出建议回复草稿
5. 在需要时创建跟进提醒

##### 场景 C：你回来处理待办邮件

你优先打开：

- `记忆查看 -> 消息审计 -> 邮件线程整理`

它更适合你快速判断：

- 先回复哪一条
- 哪些线程已经提醒过
- 哪些回复建议需要你再看一眼

##### 场景 D：你准备回复某个线程

你可以：

1. 先打开对应线程会话
2. 看聊天顶部的邮件线程提示
3. 参考其中的：
   - `send_email.threadId`
   - `send_email.replyToMessageId`
4. 再让 Agent 帮你起草回复

这样做的好处是：

- 更不容易串错线程
- 更不容易把回复发到错误对象
- 系统能自动把同线程 reminder 关闭掉

当前这条链路已经做过真实邮箱联调：

- 从 `记忆查看 -> 消息审计 -> 邮件线程整理 -> 打开线程会话` 进入线程
- 在该线程里直接让贝露丹蒂回复
- WebChat 弹出邮件确认窗口
- 确认后通过 SMTP 真实发出
- 对端邮箱已实际收到回复

所以现在“在线程里直接回复邮件”已经不是只停留在设计层，而是可以按这个路径真实使用。

#### 9.2.2.10 普通用户最常见的问题

##### 问题 1：我明明改了 `.env.local`，页面还是没变化

按下面顺序查：

1. 先看 `系统检查 -> Config Source`
2. 确认当前生效目录是不是你刚才改的那个目录
3. 再看日志里有没有：

```text
[config-watcher] 检测到 .env.local 变更，正在重启服务...
```

如果没有，说明这次改动还没有真正触发 Gateway 重载。

##### 问题 2：`Email Inbound Runtime` 显示 `blocked`

通常表示：

- `BELLDANDY_EMAIL_IMAP_ENABLED=true` 已经开了
- 但 `HOST / USER / PASS` 还缺字段

优先检查：

- `BELLDANDY_EMAIL_IMAP_HOST`
- `BELLDANDY_EMAIL_IMAP_USER`
- `BELLDANDY_EMAIL_IMAP_PASS`

##### 问题 3：我能发邮件，但收不到邮件

先分开理解：

- 能发 = `SMTP` 没问题
- 能收 = `IMAP` 没问题

这是两条独立链路。  
所以发信正常，不代表收信也一定正常。

优先检查：

1. `Email Inbound Runtime` 是不是 `running`
2. `IMAP_HOST / PORT / USER / PASS` 是否正确
3. `MAILBOX` 是否填对，通常先用 `INBOX`
4. 你的邮箱服务商是否真的开放了 IMAP
5. 如果这是一个历史邮件很多的老邮箱，建议显式设置 `BELLDANDY_EMAIL_IMAP_RECENT_WINDOW_LIMIT=50`

关于“老邮箱历史邮件很多”这件事，再额外说明清楚一点：

- 历史邮件很多，主要会影响收信，不会影响 SMTP 发信
- 当前系统默认不建议做“全量历史邮件导入”
- 更推荐的做法是通过 `BELLDANDY_EMAIL_IMAP_RECENT_WINDOW_LIMIT` 只追最近一小段窗口，例如 `50`
- 这能显著降低首次接入或 checkpoint 落后很多时的超时、卡顿和新邮件被 backlog 挤住的问题
- 如果你担心邮件线程很多时 `diagnostics/prompt-snapshots` 增长太快，可以再结合：
  - `BELLDANDY_PROMPT_SNAPSHOT_EMAIL_THREAD_MAX_RUNS=10`
  - `BELLDANDY_PROMPT_SNAPSHOT_RETENTION_DAYS=7`

如果你已经接入的是一个用了很多年的老邮箱，并且前面已经把一批旧邮件 reminder 导进本地，推荐再做一步“历史 reminder 清理”：

- 目标不是删掉真实会话历史
- 而是把那些很久以前就过期的旧邮件提醒统一标记为已处理，避免它们继续刷屏或持续投递提醒

推荐策略：

- 只清理“收到时间早于 7 天前”的历史 reminder
- 保留最近 7 天的新邮件 reminder 能力

这样做的结果通常是：

- 新邮件接入继续正常
- 旧提醒噪音会明显减少
- 日志里不会再反复出现一大批历史 reminder 的投递记录

如果日志里出现：

```text
[email-inbound] IMAP inbound poll failed
```

现在可以继续看后面的结构化字段。当前系统会把这些信息一并打出来：

- `accountId`
- `host`
- `port`
- `secure`
- `mailbox`
- `error.name`
- `error.message`
- `error.code`

最常见的两类超时含义是：

- `IMAP connect timeout`
  通常表示 TCP/TLS 建连阶段就卡住了，优先怀疑 host、port、网络连通性或服务商限制
- `IMAP socket timeout`
  通常表示已经连上，但后续 greeting / LOGIN / SELECT / FETCH 某一步长时间没有返回

如果你把这条结构化错误日志贴出来，通常就能继续判断是配置问题、网络问题，还是邮箱服务商侧的响应慢

##### 问题 4：为什么我收到了邮件，但没有看到“邮件线程聊天顶部提示”

当前只有在下面三个条件同时满足时才会显示：

1. 系统已经收到这封邮件
2. 这封邮件已经绑定成邮件线程会话
3. 你当前打开的正好是那条邮件线程会话

所以如果你还没收到邮件，或者当前打开的是普通聊天会话，就不会看到顶部提示。

另外还有两个容易误解的点：

- 顶部提示不是“每封邮件都新增一条聊天消息”，而是固定显示在当前邮件线程会话顶部
- 如果这是你刚接入邮箱后读到的**历史旧邮件**，系统可能会立刻给出“已到建议跟进时间”的提醒  
  这通常不是 bug，而是因为邮件原始收到时间本来就已经过去很久了

##### 问题 5：为什么系统给了建议回复，但还要我确认

这是刻意设计的。

当前目标不是让 AI 自动代替你发真实邮件，而是：

- 帮你起草
- 帮你整理
- 帮你减少重复工作
- 但最终发送仍然由你确认

对普通用户来说，这样更安全，也更容易建立信任。

#### 9.2.2.11 给普通用户的最终建议

如果你不想一上来就折腾太多，最稳妥的顺序是：

1. 先确认 `Config Source`
2. 先配 `SMTP`，确认能发测试邮件
3. 再配 `IMAP`，确认能看到收信记录
4. 然后再开始用：
   - `消息审计`
   - `邮件线程整理`
   - 邮件线程聊天会话顶部提示

如果你只想要一句最简单的理解：

- `SMTP` 负责“发出去”
- `IMAP` 负责“收进来”
- `消息审计` 负责“看明细”
- `邮件线程整理` 负责“看待办和建议”
- 聊天会话顶部提示负责“告诉你这条线程该怎么回”

### 9.3 Community HTTP API：`/api/message`

如果你要让官网社区服务、你自己的服务、其他 HTTP 系统直接把消息打进 Gateway，可以启用：

```env
BELLDANDY_AUTH_MODE=token
BELLDANDY_AUTH_TOKEN=your-secure-token
BELLDANDY_COMMUNITY_API_ENABLED=true
BELLDANDY_COMMUNITY_API_TOKEN=your-community-api-token
```

关键约束：

- 当 `BELLDANDY_COMMUNITY_API_ENABLED=true` 时，`BELLDANDY_AUTH_MODE` 不能是 `none`

如果你要长期连接社区房间，当前还会用到：

- `~/.star_sanctuary/community.json`

最小示例：

```json
{
  "endpoint": "https://office.goddess.ai",
  "agents": [
    {
      "name": "贝露丹蒂",
      "apiKey": "office_xxx",
      "room": {
        "name": "my-room"
      }
    }
  ],
  "reconnect": {
    "enabled": true,
    "maxRetries": 10,
    "backoffMs": 5000
  }
}
```

如果你不想手写这个文件，直接运行：

```bash
corepack pnpm bdd community
```

或：

```bash
corepack pnpm bdd configure community
```

### 9.4 Webhook：`/api/webhook/:id`

Webhook 适合：

- CI/CD
- 监控告警
- 定时外部触发
- 第三方系统集成

当前配置文件：

- `~/.star_sanctuary/webhooks.json`

最小示例：

```json
{
  "version": 1,
  "webhooks": [
    {
      "id": "ci-alert",
      "enabled": true,
      "token": "your-secure-token-here",
      "defaultAgentId": "default",
      "conversationIdPrefix": "webhook:ci-alert"
    }
  ]
}
```

推荐配套阅读：

- [docs/webhook.md](E:\project\star-sanctuary\docs\webhook.md)

### 9.5 Token Usage 上传

如果你在对接 office / 社区侧生态，有时会需要把本地 token 消耗增量上报给外部服务。

对应变量：

```env
BELLDANDY_TOKEN_USAGE_UPLOAD_ENABLED=false
# BELLDANDY_TOKEN_USAGE_UPLOAD_URL=http://127.0.0.1:3001/api/internal/token-usage
# BELLDANDY_TOKEN_USAGE_UPLOAD_APIKEY=gro_xxx
```

这个能力默认关闭，不需要时不要开。

---

## 10. 渠道接入、路由与安全兜底

### 10.1 当前已落地渠道

当前仓库已经落地：

- WebChat
- Feishu
- QQ
- Discord
- Community

### 10.2 渠道路由和渠道安全不是一回事

当前渠道层有两套配置：

- `channels-routing.json`
  负责“消息路由给谁”
- `channel-security.json`
  负责“这条消息能不能进系统”

推荐专题文档：

- [docs/channels-routing.md](E:\project\star-sanctuary\docs\channels-routing.md)
- [docs/channel-security配置说明.md](E:\project\star-sanctuary\docs\channel-security配置说明.md)

`channels-routing.json` 最小示例：

```json
{
  "version": 1,
  "defaultAction": {
    "allow": true,
    "agentId": "default"
  },
  "rules": [
    {
      "id": "ops-alert-route",
      "enabled": true,
      "priority": 200,
      "match": {
        "channels": ["discord", "feishu", "qq"],
        "keywordsAny": ["alert", "报警", "告警"]
      },
      "action": {
        "allow": true,
        "agentId": "ops"
      }
    }
  ]
}
```

这个文件回答的是：

- 哪条消息命中哪条规则
- 命中后是否放行
- 放行后交给哪个 `agentId`

`channel-security.json` 最小示例：

```json
{
  "version": 1,
  "channels": {
    "discord": {
      "dmPolicy": "allowlist",
      "allowFrom": [],
      "mentionRequired": {
        "channel": true
      }
    },
    "community": {
      "dmPolicy": "allowlist",
      "allowFrom": [],
      "mentionRequired": {
        "room": true
      }
    }
  }
}
```

这个文件回答的是：

- 私信是不是必须白名单
- 群聊 / 频道 / 房间是不是必须 `@` 机器人
- 某个渠道当前的安全默认值是什么

### 10.3 Feishu 最小配置

飞书是当前比较成熟、适合手机使用的渠道之一。完整接入流程请以现有文档为准，但主线步骤通常是：

1. 在飞书开发者后台创建应用
2. 配置回调、权限和凭证
3. 在 Star Sanctuary 当前实际配置目录中填入飞书相关变量
4. 重启 Gateway
5. 用飞书真实发消息验证

### 10.4 QQ / Discord / Community

QQ、Discord、Community 当前都已具备最小接入能力，但更建议在这些场景下同时配置：

- 渠道路由
- 渠道安全兜底
- 合理的 `agentId`
- mention gate / allowlist

尤其是公开房间、群聊、频道场景，不建议默认“全开放响应”。

---

## 11. 浏览器自动化、语音、附件与 Canvas

### 11.1 浏览器自动化

当前浏览器自动化依赖两部分：

1. 本地 Relay Server
2. Chrome 扩展

启动 Relay：

```bash
corepack pnpm bdd relay start --port 28892
```

或者在 Gateway 启用自动启动：

```env
BELLDANDY_BROWSER_RELAY_ENABLED=true
BELLDANDY_RELAY_PORT=28892
```

安装扩展：

1. 打开 `chrome://extensions/`
2. 开启开发者模式
3. 点击“加载已解压的扩展程序”
4. 选择 `apps/browser-extension`

推荐同时配置站点范围限制：

```env
BELLDANDY_BROWSER_ALLOWED_DOMAINS=github.com,developer.mozilla.org,docs.example.com
BELLDANDY_BROWSER_DENIED_DOMAINS=mail.google.com,drive.google.com,onedrive.live.com
```

扩展说明见：

- [apps/browser-extension/README.md](E:\project\star-sanctuary\apps\browser-extension\README.md)

### 11.2 语音

当前已经支持：

- STT：语音转文本
- TTS：文本转语音

常用配置：

```env
# STT
# BELLDANDY_STT_PROVIDER=openai
# BELLDANDY_STT_LANGUAGE=zh

# TTS
# BELLDANDY_TTS_ENABLED=false
BELLDANDY_TTS_PROVIDER=edge
BELLDANDY_TTS_VOICE=zh-CN-XiaoxiaoNeural
```

### 11.3 附件与多模态

当前 WebChat 已支持：

- 文本附件
- 图片
- 音频
- 其他受限格式

附件有体积和注入预算限制，对应变量在 `.env.example` 中可以看到，例如：

- `BELLDANDY_ATTACHMENT_MAX_FILE_BYTES`
- `BELLDANDY_ATTACHMENT_MAX_TOTAL_BYTES`
- `BELLDANDY_ATTACHMENT_TEXT_CHAR_LIMIT`

### 11.4 Canvas

Canvas 当前定位是“复杂任务的可视化工作区”，适合：

- 拆解任务结构
- 做思路节点整理
- 给 Agent 提供画布上下文
- 辅助观察 ReAct 过程

它是当前 WebChat 的辅助工作台，而不是独立产品。

---

## 12. 工具、MCP、扩展与技能

### 12.1 工具系统

当前工具系统已经覆盖：

- 文件读写与补丁
- 网络抓取与搜索
- 系统命令与终端
- 浏览器操作
- 记忆检索
- 会话委派
- 方法论
- 定时器 / Cron / 服务重启 / Token 计数器
- Canvas / 社区 / 身份上下文

工具系统总开关：

```env
BELLDANDY_TOOLS_ENABLED=true
```

### 12.2 工具策略文件

如果你要进一步收紧风险边界，可用：

```env
BELLDANDY_TOOLS_POLICY_FILE=E:\project\star-sanctuary\config\tools-policy.balanced.json
```

也可以按需加载工具分组：

```env
# 示例
# BELLDANDY_TOOL_GROUPS=browser,methodology,system
```

更多建议见：

- [docs/工具分级指南.md](E:\project\star-sanctuary\docs\工具分级指南.md)

### 12.3 MCP

当前 MCP 已可用，开启方式：

```env
BELLDANDY_TOOLS_ENABLED=true
BELLDANDY_MCP_ENABLED=true
```

当前配置文件通常是：

- `~/.star_sanctuary/mcp.json`

MCP 适合接：

- 文件系统服务
- 文档服务
- 数据库或搜索服务
- 其他外部工具 / 资源服务器

`mcp.json` 最小示例：

```json
{
  "version": "1.0.0",
  "servers": [
    {
      "id": "filesystem",
      "name": "filesystem",
      "transport": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "E:\\project"]
      },
      "enabled": true,
      "autoConnect": true
    }
  ]
}
```

补充说明：

- 当前也兼容外部常见的 `mcpServers` 格式，不一定非要写 Star Sanctuary 原生结构
- 如果你更喜欢通过命令引导配置，也可以先用：

```bash
corepack pnpm bdd configure models
corepack pnpm bdd configure webhook
corepack pnpm bdd configure cron
```

### 12.4 扩展市场与插件

当前 marketplace 已经能完成最小可用链路：

```bash
corepack pnpm bdd marketplace list
corepack pnpm bdd marketplace install local-dev --source directory --path E:\my-extension
corepack pnpm bdd marketplace enable <extension-id>
corepack pnpm bdd marketplace disable <extension-id>
corepack pnpm bdd marketplace update <extension-id>
corepack pnpm bdd marketplace uninstall <extension-id>
```

但当前仍属于 **第一阶段轻量扩展分发层**，不是重平台化插件生态。

### 12.5 技能系统

当前技能来源包括：

- 内置技能
- bundled skills
- 用户技能目录
- 插件提供的技能
- marketplace 安装的 `skill-pack`

如果你要自定义技能，建议直接看：

- [Star Sanctuary实现内容说明.md](E:\project\star-sanctuary\Star Sanctuary实现内容说明.md)
- [docs/长期任务使用指南.md](E:\project\star-sanctuary\docs\长期任务使用指南.md)

---

## 13. CLI、诊断与日志

### 13.1 当前 CLI 主命令

当前 `bdd` CLI 的主命令包括：

- `start`
- `stop`
- `status`
- `dev`
- `doctor`
- `console`
- `setup`
- `pairing`
- `config`
- `configure`
- `conversation`
- `relay`
- `community`
- `marketplace`

### 13.2 最常用命令清单

```bash
# 启动 / 停止 / 状态
corepack pnpm bdd start
corepack pnpm bdd stop
corepack pnpm bdd status
corepack pnpm bdd dev

# 配置
corepack pnpm bdd config path
corepack pnpm bdd config list
corepack pnpm bdd config get BELLDANDY_OPENAI_MODEL
corepack pnpm bdd config set BELLDANDY_OPENAI_MODEL gpt-4o
corepack pnpm bdd config edit
corepack pnpm bdd config migrate-to-state-dir

# 诊断
corepack pnpm bdd doctor
corepack pnpm bdd console

# 配对
corepack pnpm bdd pairing pending
corepack pnpm bdd pairing approve <code>

# 会话复盘
corepack pnpm bdd conversation list
corepack pnpm bdd conversation export --conversation-id <id>
corepack pnpm bdd conversation timeline --conversation-id <id>

# 高级配置向导
corepack pnpm bdd configure community
corepack pnpm bdd configure models
corepack pnpm bdd configure webhook
corepack pnpm bdd configure cron
```

补充说明：

- `bdd community` 是社区配置专用向导
- `bdd configure ...` 是当前高级模块的分项配置入口
- `bdd config migrate-to-state-dir` 适合把旧的仓库根目录配置迁移到状态目录
- 如果启动日志、`bdd doctor` 或 `system.doctor` 提示 `legacy project-root env files`，表示当前真正生效的是仓库根目录 `.env/.env.local`；此时 `state-dir` 下的同名配置不会再同时合并，直到迁移或显式指定 `ENV_DIR`

### 13.3 `bdd doctor` 和 `system.doctor`

两者不要混为一谈：

- `bdd doctor`
  偏静态，检查环境、配置、端口、状态目录、能力开关
- `system.doctor`
  偏运行时，返回 resident、mind profile、runtime resilience、external outbound、prompt observability 等结构化结果

如果你已经在用更复杂的部署画像，当前运行时还会关注：

- `~/.star_sanctuary/deployment-backends.json`

这个文件用于描述 `local / docker / ssh` 三类部署 profile。它目前更偏高级运行配置，一般用户不需要手写；但如果你在 `doctor` 里看到了 `Deployment Backends` 摘要，数据来源就是这里。

### 13.4 `diagnostics/prompt-snapshots` 是什么，会不会一直涨

这个目录是 prompt 诊断快照，不是普通聊天历史正文。

默认路径：

- `C:\Users\admin\.star_sanctuary\diagnostics\prompt-snapshots`

它主要用于：

- 诊断某一轮 prompt 到底长什么样
- 做 prompt observability
- 支撑部分 doctor / explainability / learning review 诊断

当前保留策略不是“无限增加”，而是几层一起工作：

- `BELLDANDY_PROMPT_SNAPSHOT_MAX_PERSISTED_RUNS`
  - 普通 conversation 每个会话最多保留多少份
  - 默认 `20`
- `BELLDANDY_PROMPT_SNAPSHOT_EMAIL_THREAD_MAX_RUNS`
  - 邮件线程 conversation 每个线程最多保留多少份
  - 默认 `10`
- `BELLDANDY_PROMPT_SNAPSHOT_HEARTBEAT_MAX_RUNS`
  - heartbeat 全局最多保留多少份
  - 默认 `5`
- `BELLDANDY_PROMPT_SNAPSHOT_RETENTION_DAYS`
  - 超过多少天自动清理
  - 默认 `7`

所以真实语义是：

- 单个邮件线程目录里的 snapshot 文件不会无限增长
- 但如果你最近活跃了很多不同邮件线程，目录数在保留期内仍会增加
- 这不代表真实聊天历史在无限复制；真实聊天历史和 prompt snapshot 是两套不同文件

### 13.5 日志

常用日志配置：

```env
# BELLDANDY_LOG_LEVEL=info
# BELLDANDY_LOG_DIR=~/.star_sanctuary/logs
# BELLDANDY_LOG_MAX_SIZE=10MB
# BELLDANDY_LOG_RETENTION_DAYS=7
# BELLDANDY_LOG_CONSOLE=true
# BELLDANDY_LOG_FILE=true
```

日志适合看：

- 服务是否正常启动
- Relay / 渠道 / Webhook 是否接通
- 模型是否报错
- marketplace / extension 是否加载

---

## 14. 安全建议

当前项目具备：

- 本地命令执行
- 文件修改
- 浏览器控制
- 外部系统集成

所以默认建议是：

1. 本地使用时，优先 `127.0.0.1 + Pairing`
2. 需要局域网 / 公网访问时，必须启用 `token` 或 `password`
3. 打开浏览器自动化时，同时配置 `ALLOWED_DOMAINS / DENIED_DOMAINS`
4. 公开渠道、群聊、房间里，优先配置 `channel-security.json`
5. 对外主动发送、Webhook、Community API 这类入口，不要和“完全无鉴权”一起使用
6. 高权限工具先从保守策略开始，逐步放开

推荐配套文档：

- [docs/安全变量配置建议方案.md](E:\project\star-sanctuary\docs\安全变量配置建议方案.md)
- [docs/channel-security配置说明.md](E:\project\star-sanctuary\docs\channel-security配置说明.md)
- [docs/webhook.md](E:\project\star-sanctuary\docs\webhook.md)

---

## 15. 常见问题

### 15.1 启动时报 `Cannot find module ... dist/...`

通常是构建产物不完整。源码环境先执行：

```bash
corepack pnpm build
```

如果构建缓存异常，再执行完整重建。

### 15.2 `better-sqlite3` 安装失败

这通常发生在源码安装时的本地编译环境问题。对普通用户最简单的解决方式通常是改用标准发布版。

### 15.3 端口被占用

先检查：

```bash
corepack pnpm bdd doctor
```

再考虑修改：

```env
BELLDANDY_PORT=28889
```

### 15.4 浏览器页面提示需要 Pairing

这是正常安全机制。先在 WebChat 拿到配对码，再在服务端批准：

```bash
corepack pnpm bdd pairing approve <code>
```

### 15.5 想局域网或公网访问

至少要改成：

```env
BELLDANDY_HOST=0.0.0.0
BELLDANDY_AUTH_MODE=token
BELLDANDY_AUTH_TOKEN=your-secure-token
```

### 15.6 `/api/message` 或 `/api/webhook/:id` 调不通

优先排查：

1. 鉴权是不是配对了正确 token
2. `COMMUNITY_API_ENABLED` 或 `webhooks.json` 是否真的开启
3. `AUTH_MODE` 是否与当前入口冲突
4. `bdd doctor` 和服务日志里有没有报错

---

## 16. 推荐配套文档

如果你准备进一步深入，建议按主题查看：

- 项目总览：[README.md](E:\project\star-sanctuary\README.md)
- 当前实现总览：[Star Sanctuary实现内容说明.md](E:\project\star-sanctuary\Star Sanctuary实现内容说明.md)
- 长期任务：[docs/长期任务使用指南.md](E:\project\star-sanctuary\docs\长期任务使用指南.md)
- Agent Profile：[docs/agents.json配置说明.md](E:\project\star-sanctuary\docs\agents.json配置说明.md)
- 渠道路由：[docs/channels-routing.md](E:\project\star-sanctuary\docs\channels-routing.md)
- 渠道安全：[docs/channel-security配置说明.md](E:\project\star-sanctuary\docs\channel-security配置说明.md)
- Webhook：[docs/webhook.md](E:\project\star-sanctuary\docs\webhook.md)
- 工具策略与分级：[docs/工具分级指南.md](E:\project\star-sanctuary\docs\工具分级指南.md)
- 记忆与 token 配置：[docs/记忆与token变量配置建议方案.md](E:\project\star-sanctuary\docs\记忆与token变量配置建议方案.md)
- 安全变量建议：[docs/安全变量配置建议方案.md](E:\project\star-sanctuary\docs\安全变量配置建议方案.md)
- 用户升级：[docs/用户版本升级手册.md](E:\project\star-sanctuary\docs\用户版本升级手册.md)

---

## 17. 一句话总结

当前最推荐的使用路线是：

1. 用 `bdd setup` 或 WebChat Settings 配好最小模型配置
2. 用 `bdd doctor` 确认环境正常
3. 先在 WebChat 中熟悉聊天、记忆、长期任务、Tool Settings
4. 再逐步开启浏览器、MCP、渠道、Webhook、扩展市场等高级能力

如果你把它理解成一个“带长期记忆、长期任务和多入口集成的本地 Agent 工作台”，而不是一个普通聊天网页，你对当前 Star Sanctuary 的认知就基本准确了。
