# Star Sanctuary

<p align="center">
  <a href="./README.md"><b>简体中文</b></a> |
  <a href="./README.en.md">English</a>
</p>

<p align="center">
  <strong>本地优先的个人 AI 助手与 Agent 工作台</strong><br>
  运行在你自己的设备上，提供 WebChat、CLI、多渠道接入、记忆、工具、自动化与长期工作区能力<br>
  <span style="color:#ff4d4f;font-weight:bold;">重要声明：Star Sanctuary 具备本地执行、文件修改、浏览器控制和外部集成能力。请在理解权限边界的前提下启用高权限功能，优先在可控环境中使用，并做好数据备份。</span>
</p>

<p align="center">
  <a href="#快速开始">快速开始</a> •
  <a href="#核心能力">核心能力</a> •
  <a href="#项目结构">项目结构</a> •
  <a href="#个性化与长期能力">个性化能力</a> •
  <a href="#长期任务快速入口">长期任务</a> •
  <a href="#配置指南">配置指南</a> •
  <a href="#渠道与集成">渠道与集成</a> •
  <a href="#部署方式">部署方式</a> •
  <a href="#常见问题">FAQ</a> •
  <a href="#赞助支持">赞助支持</a>
</p>

---

## 简介

Star Sanctuary 是一个 **local-first** 的个人 AI 助手项目。它以本地 Gateway 为中心，把模型调用、长期工作区、记忆检索、工具执行、聊天渠道、浏览器自动化和定时任务统一到同一套运行时中。

当前仓库已经不只是一个 WebChat Demo，而是一套完整的 Agent 基础设施：

- **本地优先**：默认状态目录在 `~/.star_sanctuary`，兼容旧目录 `~/.belldandy`
- **统一入口**：WebChat、`bdd` CLI、聊天渠道、Webhook、社区接口共用同一套 Agent 与工具体系
- **长期工作区**：内置 `SOUL.md`、`IDENTITY.md`、`USER.md`、`TOOLS.md`、`HEARTBEAT.md`、`AGENTS.md` 等工作区文件
- **面向扩展**：支持 Skills、Methods、Plugins、MCP、Browser Relay、Channels Router、多 Agent Profile

### 设计原则

- **隐私优先**：默认在本机运行，数据与工作区归你自己控制
- **安全默认值**：公网监听要求启用鉴权；客户端消息默认需要 Pairing 配对；工具有白名单与策略层
- **长期陪伴**：不是“一次性问答”，而是带记忆、方法论、日志回溯和自动化能力的长期 Agent

### 技术栈

| 类别 | 技术 |
|------|------|
| 语言 | TypeScript |
| 运行时 | Node.js 22.12+ |
| 包管理 | pnpm Workspace |
| 通信 | WebSocket + HTTP API |
| 数据 | SQLite / FTS5 / sqlite-vec |
| 前端 | 原生 HTML / JS / CSS |
| 浏览器自动化 | Chrome Extension (MV3) + Relay |
| 语音 | TTS / STT |
| 扩展协议 | MCP |

### 标准客户端获取

对于非技术型普通用户，项目社区官网提供了专门制作的标准版客户端下载。

- **社区官网主页**：[https://www.goddess-ai.top](https://www.goddess-ai.top)

当前标准包口径：

- `Portable`：提供 `Slim` / `Full`
- `Single-Exe`：当前提供 `Windows x64 + Full`
- `Single-Exe Full` 当前会附带：
  - `star-sanctuary-single.exe`
  - `single-exe.json`
  - `README-single-exe.md`
  - `README-single-exe-zh.md`
  - `.env.example`
- `Single-Exe` 首次启动时会把 runtime 解包到 `%LOCALAPPDATA%\\StarSanctuary\\runtime\\<version>-win32-x64`

> **社区官网不仅提供下载，还内置了丰富的生态模块：**
> - **协作枢纽 (Co-Lab)**：任务大厅，支持需求发布与接单
> - **社区家园 (Town Square)**：广场与个人专属家园展示
> - **模组工坊 (Workshop)**：探索、发布和运行各种 Agent Apps 与模组
> - **社区房间 (Community Rooms)**：与 Agent 互动、管理及 API Key 配置

### 教程与视频

为了保持 README 简洁，完整使用教程、安装演示、配置说明、问题排查和版本更新介绍不会全部写在本文件中。

后续相关视频教程会发布在作者的 B 站主页：

- https://space.bilibili.com/26585867?spm_id_from=333.1007.0.0

---

## 核心能力

### 1. Gateway + WebChat + CLI

- 本地 Gateway，默认地址 `http://127.0.0.1:28889`
- WebChat 实时流式对话、配置管理、工具开关、工作区读写
- `bdd` CLI 提供 `start / stop / status / doctor / setup / pairing / config / relay / community`
- 支持前台运行、后台守护进程、健康检查 `GET /health`

### 2. Agent 运行时

- OpenAI 兼容 Provider
- `chat_completions` 与 `responses` 双线路
- 主模型 + `models.json` fallback 模型队列
- 上下文自动压缩（compaction）
- 多 Agent Profile、Agent Registry、按渠道/规则路由到不同 Agent

### 3. 记忆与长期工作区

- SQLite + FTS5 + sqlite-vec 混合检索
- Embedding 检索、本地工作区文件加载、会话持久化
- Methods 方法论文档、Logs 日志回放、Memory 文件目录
- 支持 `agents/{agentId}` 子工作区与 `facets/` 模组切换

### 4. 工具系统

当前内置工具覆盖：

- 文件读写、目录遍历、补丁应用、网页抓取、网络搜索
- 系统命令、进程管理、终端、代码解释器
- 记忆搜索、日志读取、方法论读写、会话委派、并行子任务
- 浏览器打开/导航/点击/输入/截图/快照
- TTS、STT、图像生成、摄像头拍照
- 定时器、Token 计数器、Cron 调度、服务重启
- Skills 检索、Canvas 工作区、身份上下文、社区房间、官网工坊/家园工具

### 5. 渠道与外部集成

- WebChat
- 飞书
- QQ
- Discord
- `community` 社区长连接
- `/api/message` 社区 HTTP 接口
- `/api/webhook/:id` Webhook API
- Channels Router 路由引擎

### 6. 部署与运维

- `start.bat` / `start.sh` 一键启动
- Docker / Docker Compose
- Tailscale 远程访问
- Nix 部署
- `bdd doctor` 健康检查

---

## 项目结构

```text
star-sanctuary/
├── apps/
│   ├── web/                         # WebChat 前端
│   └── browser-extension/          # Chrome 扩展（浏览器 Relay 配套）
├── packages/
│   ├── belldandy-protocol/         # 协议、状态目录解析、公共类型
│   ├── belldandy-core/             # Gateway、CLI、日志、Heartbeat、Cron、Webhook
│   ├── belldandy-agent/            # Agent 运行时、Prompt、Compaction、多 Agent
│   ├── belldandy-memory/           # SQLite / FTS / 向量检索 / 记忆管理
│   ├── belldandy-skills/           # 内置工具、Skills、Browser、Methods、Office
│   ├── belldandy-channels/         # 飞书 / QQ / Discord / Community / Router
│   ├── belldandy-mcp/              # MCP 集成
│   ├── belldandy-plugins/          # 插件系统
│   └── belldandy-browser/          # Browser Relay
├── docs/                           # 部署、Webhook、路由、设计文档
├── examples/                       # 方法、技能、模组、Agent 示例
├── start.bat
├── start.sh
├── DOCKER_DEPLOYMENT.md
└── README.md
```

### 默认状态目录

默认状态目录为 `~/.star_sanctuary`，若该目录不存在但检测到旧目录 `~/.belldandy`，系统会自动兼容使用旧目录。

常见内容如下：

```text
~/.star_sanctuary/
├── AGENTS.md
├── SOUL.md
├── TOOLS.md
├── IDENTITY.md
├── USER.md
├── HEARTBEAT.md
├── BOOTSTRAP.md
├── MEMORY.md                       # 可选
├── agents/                         # 多 Agent 子工作区
├── facets/                         # FACET 模组文件
├── methods/                        # SOP / 方法论
├── sessions/                       # 会话持久化
├── generated/                      # 运行期生成资源
├── logs/                           # 日志
├── models.json                     # fallback 模型配置
├── mcp.json                        # MCP 配置
├── webhooks.json                   # Webhook 配置
├── channels-routing.json           # 渠道路由规则
├── allowlist.json                  # 客户端配对白名单
└── pairing.json                    # 待批准配对请求
```

---

## 个性化与长期能力

### FACET 模组机制

FACET 可以理解为 Belldandy 的“人格模组 / 职能模组”。你可以把不同风格、不同职责的行为规则拆成独立模组，在需要时切换，而不是把所有设定都塞进同一个 `SOUL.md`。

- 模组文件默认放在 `~/.star_sanctuary/facets/`
- 适合为 coder、researcher、translator、writer 等不同场景准备独立职能
- 可通过 `switch_facet` 工具切换，切换后会按当前工作区规则生效
- 多 Agent 场景下，也可以和 `agents/{agentId}` 子工作区配合使用

如果你想快速参考写法，可以查看仓库中的 [`examples/facets`](./examples/facets)。

### 方法论系统

Methods 不是“工具列表”，而是 Agent 自己逐步沉淀出来的 SOP。它解决的是“下次遇到类似任务，应该怎么做”，而不是“现在能做什么”。

- 方法论文档默认放在 `~/.star_sanctuary/methods/`
- Agent 可通过 `method_list`、`method_read`、`method_create`、`method_search` 读写与检索方法
- Methods 可以和日志系统、记忆系统、Heartbeat、Cron 配合，形成“执行 -> 复盘 -> 沉淀 -> 下次复用”的闭环
- 适合沉淀部署流程、渠道对接、运营 SOP、排障步骤、内容生产流程等长期工作方式

简言之：

- Skills 解决“能做什么”
- Methods 解决“以后最好怎么做”
- Logs 解决“之前实际做过什么”

### 官网社区生态能力

Star Sanctuary 已经接入官网社区生态能力。当前线上服务地址为 `https://recwcppxiamd.sealosgzg.site`；它不只是聊天，还可以和社区、工坊、家园等模块联动。

- `bdd community` 可配置社区接入与房间连接
- 内置 Workshop 工具支持搜索、查看、下载、发布、更新、删除内容
- 内置 Homestead 工具支持查看家园、库存、领取、摆放、回收、挂载、开盲盒等操作
- 可配合社区身份、房间上下文和 token usage 上传，形成一体化使用体验

如果你会长期在社区生态里使用 Belldandy，这一块不是附加功能，而是完整工作流的一部分。

---

## 快速开始

### 环境要求

- 操作系统：Windows / macOS / Linux
- Node.js：**22.12.0 或更高（24.x暂时有问题）**
- Node.js下载地址：https://nodejs.org/zh-cn
- 包管理器：`pnpm`（建议通过 `corepack`）

### 获取项目代码

你可以通过以下两种方式之一获取项目：

**方式一：从 Release 下载（推荐）**
1. 访问项目的 [Releases 页面](https://github.com/vrboyzero/star-sanctuary/releases)。
2. 下载最新版本的 `Source code (zip)`压缩包。
3. 解压到一个没有中文和特殊字符的路径下。

**方式二：通过 Git 克隆**
```bash
git clone https://github.com/vrboyzero/star-sanctuary.git
cd star-sanctuary
```

### 配置环境文件

首次运行前，先从示例文件复制一份本地配置：

```powershell
Copy-Item .env.example .env
```

或：

```bash
cp .env.example .env
```

说明：

- `.env` / `.env.local` 只用于本机，不应提交到 Git
- 如需覆盖少量本地变量，优先新建 `.env.local`

### 一键启动

**Windows**
在安装目录中双击 start.bat 即可。
或在终端中执行：
```powershell
.\start.bat
```

**macOS / Linux**

```bash
./start.sh
```

启动脚本会自动完成这些事：

- 检查 Node.js 与 pnpm
- 缺依赖时自动执行 `corepack pnpm install`
- 缺少 `dist/` 时自动执行 `corepack pnpm build`
- 生成一次性 WebChat Token
- 启动 Gateway 并自动打开浏览器

### 手动启动

```bash
# 1. 安装依赖
corepack pnpm install

# 2. 构建
corepack pnpm build

# 如构建缓存异常，执行全量重建
corepack pnpm rebuild

# 3. 健康检查（推荐）
corepack pnpm bdd doctor

# 4. 开发模式启动
corepack pnpm bdd dev

# 或生产模式前台启动
corepack pnpm bdd start

# 或后台守护模式启动
corepack pnpm bdd start -d

# 查看状态 / 停止
corepack pnpm bdd status
corepack pnpm bdd stop
```

### 首次配置

如果还没有 `.env.local`，推荐先执行：

```bash
corepack pnpm bdd setup
```

非交互模式示例：

```bash
corepack pnpm bdd setup \
  --provider openai \
  --base-url https://api.openai.com/v1 \
  --api-key sk-xxx \
  --model gpt-4o \
  --auth-mode token \
  --auth-secret your-token
```

### 首次配对

Web 客户端首次连接时会触发配对。页面会显示一组配对码，例如 `ABC123XY`。

在终端批准：

```bash
corepack pnpm bdd pairing approve ABC123XY
```

常用配对命令：

```bash
corepack pnpm bdd pairing pending
corepack pnpm bdd pairing list
corepack pnpm bdd pairing revoke <CLIENT_ID>
corepack pnpm bdd pairing cleanup --dry-run
corepack pnpm bdd pairing export --out pairing-backup.json --include-pending
corepack pnpm bdd pairing import --in pairing-backup.json --mode merge
```

---

## 配置指南

推荐在项目根目录创建 `.env.local`。仓库中的 `.env.example` 与 `.env.local.example` 提供了更完整的配置样例。

### 最小可用配置

```env
BELLDANDY_AGENT_PROVIDER=openai
BELLDANDY_OPENAI_BASE_URL=https://api.openai.com/v1
BELLDANDY_OPENAI_API_KEY=sk-xxxxxxxx
BELLDANDY_OPENAI_MODEL=gpt-4o
```

### 常用基础配置

```env
# 监听地址与端口
BELLDANDY_HOST=127.0.0.1
BELLDANDY_PORT=28889

# 鉴权模式：none | token | password
BELLDANDY_AUTH_MODE=token
BELLDANDY_AUTH_TOKEN=your-secure-token

# 状态目录（默认 ~/.star_sanctuary）
# BELLDANDY_STATE_DIR=E:/star_sanctuary
# Windows / WSL 分离运行态（可选，优先级高于 BELLDANDY_STATE_DIR）
# BELLDANDY_STATE_DIR_WINDOWS=C:/Users/your-name/.star_sanctuary
# BELLDANDY_STATE_DIR_WSL=~/.star_sanctuary
```

### 模型与调用链路

```env
# OpenAI 兼容线路：chat_completions | responses
BELLDANDY_OPENAI_WIRE_API=chat_completions

# 开启流式输出
BELLDANDY_OPENAI_STREAM=true

# 重试与预热
BELLDANDY_OPENAI_MAX_RETRIES=1
BELLDANDY_OPENAI_RETRY_BACKOFF_MS=300
BELLDANDY_PRIMARY_WARMUP_ENABLED=true
BELLDANDY_PRIMARY_WARMUP_TIMEOUT_MS=8000
BELLDANDY_PRIMARY_WARMUP_COOLDOWN_MS=60000
```

`responses` 线路通常用于需要该接口形态的模型，例如部分 Codex 风格模型。

### 记忆、工具与工作区

```env
BELLDANDY_TOOLS_ENABLED=true
BELLDANDY_EMBEDDING_ENABLED=true
BELLDANDY_EMBEDDING_PROVIDER=openai
BELLDANDY_EMBEDDING_MODEL=text-embedding-3-large

# 额外工作区根目录（逗号分隔）
# BELLDANDY_EXTRA_WORKSPACE_ROOTS=E:/project-a,E:/project-b

# 自定义工具策略文件
# BELLDANDY_TOOLS_POLICY_FILE=./config/tools-policy.json
```

工具策略文件现已提供三挡示例：

- `config/tools-policy.strict.json`：最保守档
- `config/tools-policy.balanced.json`：平衡推荐档
- `config/tools-policy.open.json`：受控开放档

默认建议优先采用 `balanced`，再按你是否需要 `run_command`、MCP、浏览器自动化、Webhook 等能力逐步放开。

### 定时任务与上下文压缩

```env
BELLDANDY_HEARTBEAT_ENABLED=true
BELLDANDY_HEARTBEAT_INTERVAL=30m
BELLDANDY_HEARTBEAT_ACTIVE_HOURS=08:00-23:00

BELLDANDY_CRON_ENABLED=true

BELLDANDY_COMPACTION_ENABLED=true
BELLDANDY_COMPACTION_TRIGGER_FRACTION=0.75
BELLDANDY_COMPACTION_ARCHIVAL_THRESHOLD=2000
```

### 浏览器自动化

```env
BELLDANDY_BROWSER_RELAY_ENABLED=true
BELLDANDY_RELAY_PORT=28892

# 浏览器访问范围限制（建议与 Relay 一起配置）
# BELLDANDY_BROWSER_ALLOWED_DOMAINS=github.com,developer.mozilla.org,docs.example.com
# BELLDANDY_BROWSER_DENIED_DOMAINS=mail.google.com,drive.google.com,onedrive.live.com
```

### 配置建议文档

如果你正在做环境变量收口或准备上线前自查，建议同时查看：

- [docs/安全变量配置建议方案.md](./docs/安全变量配置建议方案.md)
- [docs/记忆与token变量配置建议方案.md](./docs/记忆与token变量配置建议方案.md)

建议阅读顺序：

- 先看“安全变量配置建议方案”，确定监听地址、鉴权、工具权限、文件边界和外网暴露面
- 再看“记忆与token变量配置建议方案”，确定记忆召回、压缩和 token 成本策略

### 多渠道配置

```env
# 飞书
BELLDANDY_FEISHU_APP_ID=
BELLDANDY_FEISHU_APP_SECRET=
BELLDANDY_FEISHU_AGENT_ID=default

# QQ
BELLDANDY_QQ_APP_ID=
BELLDANDY_QQ_APP_SECRET=
BELLDANDY_QQ_AGENT_ID=default
BELLDANDY_QQ_SANDBOX=true

# Discord
BELLDANDY_DISCORD_ENABLED=true
BELLDANDY_DISCORD_BOT_TOKEN=
BELLDANDY_DISCORD_DEFAULT_CHANNEL_ID=
```

### 渠道路由与社区 / Webhook

```env
BELLDANDY_CHANNEL_ROUTER_ENABLED=true
BELLDANDY_CHANNEL_ROUTER_CONFIG_PATH=~/.star_sanctuary/channels-routing.json
BELLDANDY_CHANNEL_ROUTER_DEFAULT_AGENT_ID=default

BELLDANDY_COMMUNITY_API_ENABLED=false
BELLDANDY_COMMUNITY_API_TOKEN=your-community-token

BELLDANDY_WEBHOOK_CONFIG_PATH=~/.star_sanctuary/webhooks.json
BELLDANDY_WEBHOOK_IDEMPOTENCY_WINDOW_MS=600000
```

### 备用模型配置 `models.json`

`models.json` 默认位于 `~/.star_sanctuary/models.json`，用于配置 fallback 模型：

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

---

## 渠道与集成

### WebChat

启动 Gateway 后访问：

- `http://127.0.0.1:28889`
- 或你自定义的 `BELLDANDY_HOST:PORT`

### 飞书 / QQ / Discord

对应凭证配置完成后，Gateway 启动时会自动初始化相应渠道。

参考资料：

- [Star Sanctuary渠道对接说明.md](./Star%20Sanctuary渠道对接说明.md)

### Community 社区接入

社区接入使用单独的配置向导：

```bash
corepack pnpm bdd community
```

该向导会维护社区连接配置，并支持为不同 Agent 配置 API Key、房间名与房间密码。

### Channels Router

通过 `channels-routing.json` 可以按渠道、房间、关键词、是否被 @ 等规则把消息路由到不同 Agent。

详细说明见：

- [docs/channels-routing.md](./docs/channels-routing.md)

### Community HTTP API

启用 `BELLDANDY_COMMUNITY_API_ENABLED=true` 后，可使用：

```text
POST /api/message
```

它主要面向社区或外部服务与 Gateway 做简化集成，使用 Bearer Token 鉴权。

### Webhook API

Webhook 使用独立配置文件 `~/.star_sanctuary/webhooks.json`，支持：

- 每个 webhook 独立 token
- 指定 `agentId`
- 自动生成 `conversationId`
- `X-Idempotency-Key` 幂等保护

接口形式：

```text
POST /api/webhook/:id
```

详细说明见：

- [docs/webhook.md](./docs/webhook.md)

---

## 浏览器自动化

Star Sanctuary 的浏览器自动化由两部分组成：

- 本地 Relay Server
- Chrome 扩展 `apps/browser-extension`

两者都就绪后，Agent 才能真正控制你当前登录态下的浏览器页面。

### 1. 启动 Relay

最直接的方式：

```bash
corepack pnpm bdd relay start --port 28892
```

也可以让 Gateway 启动时自动拉起 Relay：

```env
BELLDANDY_BROWSER_RELAY_ENABLED=true
BELLDANDY_RELAY_PORT=28892
```

> 扩展默认会连接 `ws://127.0.0.1:28892/extension`。如果你修改了 Relay 端口，扩展侧也需要保持一致。

### 2. 安装 Chrome 扩展

1. 打开 `chrome://extensions`
2. 开启“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择项目目录中的 [`apps/browser-extension`](./apps/browser-extension)

扩展安装后，Chrome 工具栏里会出现 `Star Sanctuary Browser Relay` 图标。

### 3. 首次连接

1. 确保 Relay 已经启动
2. 点击浏览器工具栏中的扩展图标一次
3. 扩展会尝试连接本地 Relay，并在后台自动保持连接

当前扩展的状态提示大致如下：

- `ON`：已连接
- `OFF`：未连接
- `ERR`：连接失败
- `...`：正在连接

### 4. 验证是否连接成功

- 浏览器扩展图标显示 `ON`
- Gateway / Relay 日志里能看到扩展已连接
- 之后 Agent 就可以调用浏览器工具，例如打开网页、截图、点击、输入、抓取快照

### 5. 常见使用方式

- 先打开你已经登录的网站，再让 Agent 接管操作
- 如果你不希望 WebChat 标签页被误操作，优先让 Agent 使用 `browser_open` 新开标签页
- 如果连接异常，先确认本地 28892 端口没有被占用，再重新点击一次扩展图标

### 6. 安装步骤摘要

1. 启动 Relay
2. 在 `chrome://extensions` 中加载 [`apps/browser-extension`](./apps/browser-extension)
3. 点击扩展图标连接
4. 在聊天中使用浏览器工具

扩展说明见：

- [apps/browser-extension/README.md](./apps/browser-extension/README.md)

---

## 部署方式

### Docker / Compose

最短路径：

```bash
cp .env.example .env
docker compose up -d belldandy-gateway
```

完整部署、镜像、持久化目录、Tailscale 侧车等说明见：

- [DOCKER_DEPLOYMENT.md](./DOCKER_DEPLOYMENT.md)
- [DOCKER_HUB_README.md](./DOCKER_HUB_README.md)

### Tailscale

- [docs/TAILSCALE_DEPLOYMENT.md](./docs/TAILSCALE_DEPLOYMENT.md)

### Nix

- [docs/NIX_DEPLOYMENT.md](./docs/NIX_DEPLOYMENT.md)

---

## CLI 命令

```bash
# 根命令帮助
corepack pnpm bdd --help

# 服务管理
corepack pnpm bdd start
corepack pnpm bdd start -d
corepack pnpm bdd status
corepack pnpm bdd stop

# 配置与诊断
corepack pnpm bdd setup
corepack pnpm bdd doctor
corepack pnpm bdd doctor --check-model

# 配对管理
corepack pnpm bdd pairing pending
corepack pnpm bdd pairing approve <CODE>
corepack pnpm bdd pairing revoke <CLIENT_ID>

# 配置文件管理
corepack pnpm bdd config path
corepack pnpm bdd config list
corepack pnpm bdd config list --show-secrets
corepack pnpm bdd config get <KEY>
corepack pnpm bdd config set <KEY> <VALUE>
corepack pnpm bdd config edit

# 浏览器 Relay
corepack pnpm bdd relay start --port 28892

# 社区配置向导
corepack pnpm bdd community
```

---

## 长期任务快速入口

如果你准备开始使用超长期任务 / Long-term Goals，推荐先看：

- [docs/长期任务使用指南.md](./docs/%E9%95%BF%E6%9C%9F%E4%BB%BB%E5%8A%A1%E4%BD%BF%E7%94%A8%E6%8C%87%E5%8D%97.md)
- [docs/超长期任务系统实现方案.md](./docs/%E8%B6%85%E9%95%BF%E6%9C%9F%E4%BB%BB%E5%8A%A1%E7%B3%BB%E7%BB%9F%E5%AE%9E%E7%8E%B0%E6%96%B9%E6%A1%88.md)

### 长期任务最小上手清单

1. 配好最小运行环境：

   ```env
   BELLDANDY_AGENT_PROVIDER=openai
   BELLDANDY_OPENAI_BASE_URL=https://api.openai.com/v1
   BELLDANDY_OPENAI_API_KEY=<your-api-key>
   BELLDANDY_OPENAI_MODEL=<your-model>
   BELLDANDY_TOOLS_ENABLED=true
   BELLDANDY_CRON_ENABLED=true
   ```

2. 可选但强烈建议创建组织级治理配置：

   - `~/.star_sanctuary/governance/review-governance.json`

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

3. 创建一个长期任务：

   - WebChat → Goals 面板
   - 或工具 `goal_init`
   - 或 RPC `goal.create`

4. 先拆 task graph，再执行节点：

   - `task_graph_create`
   - `goal_orchestrate`
   - `task_graph_claim / complete / block ...`

5. 对高风险节点使用 checkpoint：

   - `goal.checkpoint.request`
   - `goal.checkpoint.approve / reject / escalate`

6. 节点完成后生成沉淀资产：

   - `goal.retrospect.generate`
   - `goal.method_candidates.generate`
   - `goal.skill_candidates.generate`
   - `goal.flow_patterns.generate`

7. 进入治理闭环：

   - `goal.suggestion_review.list`
   - `goal.suggestion_review.workflow.set`
   - `goal.suggestion_review.decide`
   - `goal.suggestion.publish`

8. 查看统一审批治理面板 / 摘要：

   - `goal.review_governance.summary`
   - `goal.approval.scan`

9. 如需自动扫描超时审批，创建 cron：

   - 打开 `BELLDANDY_CRON_ENABLED=true`
   - 用 `cron` 工具添加 `goalApprovalScan` 任务

10. 不需要手工创建这些运行态文件，它们会自动生成：

   - `~/.star_sanctuary/cron-jobs.json`
   - `<goal.runtimeRoot>/suggestion-reviews.json`
   - `<goal.runtimeRoot>/publish-records.json`
   - `<goal.runtimeRoot>/review-notifications.json`
   - `<goal.runtimeRoot>/review-notification-dispatches.json`

> 说明：当前 `review-notification-dispatches.json` 中的 `im_dm / webhook` 仅是运行态 outbox，不会直接对外发送。

---

## 常见问题

### 启动时报 `Cannot find module ... dist/...`

这是构建产物缺失或不完整。执行：

```bash
corepack pnpm build
```

如果仍然异常，再执行：

```bash
corepack pnpm rebuild
```

### 安装依赖时 `better-sqlite3` 编译失败

优先确认 Node.js 版本。当前推荐 **Node.js 22 LTS**；Node 24+ 上原生模块更容易出问题。

### 端口被占用

修改：

```env
BELLDANDY_PORT=28890
```

然后重启。

### 浏览器里提示需要 Pairing

这是正常安全机制。复制页面中的配对码，然后执行：

```bash
corepack pnpm bdd pairing approve <CODE>
```

### 想局域网或公网访问

把：

```env
BELLDANDY_HOST=0.0.0.0
```

同时务必启用：

```env
BELLDANDY_AUTH_MODE=token
BELLDANDY_AUTH_TOKEN=your-secure-token
```

项目会拒绝 `0.0.0.0 + AUTH_MODE=none` 这种不安全组合。

### Webhook / Community API 调不通

先确认：

- 对应功能是否已启用
- Bearer Token 是否正确
- 配置文件是否位于状态目录中
- Gateway 是否已重启

---

## 相关文档

- [Star Sanctuary使用手册.md](./Star%20Sanctuary使用手册.md)
- [Star Sanctuary实现内容说明.md](./Star%20Sanctuary实现内容说明.md)
- [项目使用指南.md](./项目使用指南.md)
- [docs/长期任务使用指南.md](./docs/%E9%95%BF%E6%9C%9F%E4%BB%BB%E5%8A%A1%E4%BD%BF%E7%94%A8%E6%8C%87%E5%8D%97.md)
- [docs/超长期任务系统实现方案.md](./docs/%E8%B6%85%E9%95%BF%E6%9C%9F%E4%BB%BB%E5%8A%A1%E7%B3%BB%E7%BB%9F%E5%AE%9E%E7%8E%B0%E6%96%B9%E6%A1%88.md)
- [Agent官网对接使用手册.md](./Agent官网对接使用手册.md)
- [DOCKER_DEPLOYMENT.md](./DOCKER_DEPLOYMENT.md)
- [docs/webhook.md](./docs/webhook.md)
- [docs/channels-routing.md](./docs/channels-routing.md)

---

## 赞助支持

如果 Star Sanctuary 对你有帮助，欢迎支持项目继续迭代。

### 爱发电

[![爱发电](https://img.shields.io/badge/爱发电-支持作者-946ce6?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iI2ZmZiIgZD0iTTEyIDIxLjM1bC0xLjQ1LTEuMzJDNS40IDE1LjM2IDIgMTIuMjggMiA4LjUgMiA1LjQyIDQuNDIgMyA3LjUgM2MxLjc0IDAgMy40MS44MSA0LjUgMi4wOUMxMy4wOSAzLjgxIDE0Ljc2IDMgMTYuNSAzIDE5LjU4IDMgMjIgNS40MiAyMiA4LjVjMCAzLjc4LTMuNCA2Ljg2LTguNTUgMTEuNTRMMTIgMjEuMzV6Ii8+PC9zdmc+)](https://afdian.com/a/vrboyzero777)

<https://afdian.com/a/vrboyzero777>

### 微信 / 支付宝

<p align="center">
  <img src="./assets/wechat.png" alt="微信收款码" width="200">
  &nbsp;&nbsp;&nbsp;&nbsp;
  <img src="./assets/alipay.jpg" alt="支付宝收款码" width="200">
</p>

---

## 联系方式

- **Email**：[fyyx4918822@gmail.com](mailto:fyyx4918822@gmail.com)
- **QQ 群**：1080383003
- **问题反馈**：[GitHub Issues](https://github.com/vrboyzero/star-sanctuary/issues)

欢迎交流、反馈 Bug 或提出建议。

---

## 💖 赞助者名单 (Sponsors)

非常感谢所有支持和赞助 Star Sanctuary 项目的朋友们，是你们的帮助让项目能够变得更好！

### 🥇 第一位特别赞助者

**特别鸣谢：王道**
您是本项目历史上的**第一位赞助者**！这份从 0 到 1 的信任与支持对我们具有极大的里程碑意义，万分感谢！

*(未来我们将在此处展示更多的赞助者信息)*

---

## License

[MIT License](./LICENSE)

---

<p align="center">
  <em>Star Sanctuary - Your Personal AI Assistant</em>
</p>
