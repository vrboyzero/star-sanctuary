# Star Sanctuary 使用手册

最后更新时间：2026-04-14  
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

### 13.3 `bdd doctor` 和 `system.doctor`

两者不要混为一谈：

- `bdd doctor`
  偏静态，检查环境、配置、端口、状态目录、能力开关
- `system.doctor`
  偏运行时，返回 resident、mind profile、runtime resilience、external outbound、prompt observability 等结构化结果

如果你已经在用更复杂的部署画像，当前运行时还会关注：

- `~/.star_sanctuary/deployment-backends.json`

这个文件用于描述 `local / docker / ssh` 三类部署 profile。它目前更偏高级运行配置，一般用户不需要手写；但如果你在 `doctor` 里看到了 `Deployment Backends` 摘要，数据来源就是这里。

### 13.4 日志

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
