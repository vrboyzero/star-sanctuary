# Star Sanctuary 使用手册

Star Sanctuary 是一个运行在你本地电脑上的个人 AI 助手。它注重隐私、安全，并具备记忆与工具使用能力。

本手册将指引你完成安装、配置、启动以及日常使用。

---

## 📚 全文目录

1. 环境准备
2. 安装步骤
   - 2.1 标准发布版（Portable / Single-Exe）
   - 2.2 源码安装（开发者）
3. 基础配置
   - 3.1 基础配置（必选）
   - 3.1.1 office Token 上传配置（可选）
   - 3.1.2 Channels 路由引擎（Router MVP）配置总览（短版）
   - 3.2 可视化配置 (Settings UI)
   - 3.3 视觉与视频理解
   - 3.4 语音交互配置 (STT & TTS)
   - 3.5 Docker 部署（推荐用于生产环境）
4. 启动与首次使用
   - 4.1 极速启动 (推荐)
   - 4.2 使用 CLI 启动（推荐）
   - 4.3 手动启动（兼容方式）
   - 4.4 访问界面
   - 4.5 首次配对（Pairing）
   - 4.6 更新检查与版本升级
5. 人格与记忆（让它变成你的专属 AI）
   - 5.1 塑造人格 (SOUL)
   - 5.2 长期记忆 (Memory)
   - 5.3 FACET 模组切换
   - 5.4 Memory Viewer、任务记忆与经验沉淀
   - 5.5 长期任务（Goals）与治理
6. 定时任务
7. 多 Agent 系统 (Multi-Agent)
8. 管理命令（bdd CLI）
9. 社区房间（多 Agent 协作）
   - 9.10 官网生态工具
10. 飞书渠道（手机可用）
   - 10.1 配置飞书
   - 10.2 配置 Star Sanctuary
   - 10.3 使用
   - 10.4 渠道架构说明
   - 10.5 Channels 路由引擎（Router MVP）
   - 10.6 QQ / Discord 最小配置
11. 语音交互 (Voice Interaction)
12. 视觉感知 (Loopback Vision)
13. 高级配置
14. 浏览器自动化
15. 方法论系统 (Methodology System)
16. 画布工作区 (Canvas)
17. MCP 支持 (Model Context Protocol)
18. 插件与钩子系统 (Plugin & Hook System)
19. 技能系统 (Skills)
20. 当前可用功能统一速查表
21. 常见问题 (FAQ)

**第一部分：快速上手**


## 1. 环境准备

Star Sanctuary 当前有三种常见使用形态，不同形态的准备条件不同：

| 使用形态 | 适合人群 | 必备环境 |
|---|---|---|
| **标准发布版（Portable / Single-Exe）** | 普通用户、发布包用户 | Windows x64；**不需要**额外安装 Node.js |
| **源码运行** | 开发者、二次定制用户 | Windows / macOS / Linux，Node.js **22.12.0+**，建议 `corepack + pnpm` |
| **Docker 部署** | 服务器 / 家庭 NAS / 长期开机设备 | Docker 24+、Docker Compose v2 |

如果你准备直接使用发布包，可以跳过 Node.js 与 pnpm 安装，直接看 **2.1 标准发布版**。

如果你准备运行源码，请确保：

- **操作系统**：Windows、macOS、或 Linux
- **Node.js**：版本 **22.12.0** 或更高（推荐使用 22.x LTS；24.x 当前不建议）
- **包管理器**：推荐使用 `pnpm`（本项目已启用 corepack，可自动管理版本）

## 2. 安装步骤

### 2.1 标准发布版（推荐普通用户）

当前 Windows x64 发布包有两种形态：

- **Portable 便携目录版**：解压后运行 `start.bat` / `start.ps1`
- **Single-Exe 单文件版**：双击 `star-sanctuary-single.exe`

当前发布口径下：

- **Portable**：提供 **Slim** / **Full**
- **Single-Exe**：当前仅提供 **Full**

其中：

- **Slim**：适合大多数普通用户，包含 WebChat、浏览器控制、网页抓取、SQLite 记忆等常用能力
- **Full**：在 Slim 基础上额外包含本地 embedding 与原生 PTY，适合高级用户

选择建议：

- **不确定选哪个**：优先下载 **Portable Slim**
- **想要一个 exe 直接双击**：选择 **Single-Exe Full**
- **明确需要本地 embedding / 原生 PTY**：选择 **Portable Full** 或 **Single-Exe Full**

#### Portable 便携目录版

1. 下载压缩包并解压到一个普通目录。
2. 保持目录中的 `runtime/`、`launcher/`、`payload/`、`version.json`、`runtime-manifest.json` 完整存在。
3. 双击 `start.bat` 启动；若需要保留控制台日志，可运行 `start.ps1`。
4. 若浏览器没有自动打开，请手动访问 `http://127.0.0.1:28889/`。

#### Single-Exe 单文件版（当前仅 Full）

1. 下载 `star-sanctuary-single.exe` 所在目录包。
2. 双击运行 `star-sanctuary-single.exe`。
3. 首次运行、升级后首次运行或自动修复时，可能需要等待约 1 分钟。
4. 运行时缓存默认会解包到 `%LOCALAPPDATA%\StarSanctuary\runtime\<version>-win32-x64`。

> **说明**：两种发布形态的用户数据默认仍写入 `~/.star_sanctuary`，便于升级和迁移。

### 2.2 源码安装（开发者）

1. 获取项目代码：

   ```bash
   git clone https://github.com/vrboyzero/star-sanctuary.git
   cd star-sanctuary
   ```

2. 安装依赖：

   ```bash
   corepack pnpm install
   ```

3. 首次运行前建议先构建一次：

   ```bash
   corepack pnpm build
   ```

### 2.3 Docker 用户

如果你打算长期运行、远程访问或部署到 NAS / 服务器，建议直接看本手册的 **3.5 Docker 部署** 小节，或阅读仓库根目录的 `DOCKER_DEPLOYMENT.md`。

## 3. 基础配置

Star Sanctuary 使用 **环境变量** 进行配置。当前版本不再默认把配置固定在项目根目录，而是使用“当前实际 `envDir`”。

`envDir` 的判定规则：

1. 如果显式设置了 `STAR_SANCTUARY_ENV_DIR` 或 `BELLDANDY_ENV_DIR`，则使用该目录
2. 否则，如果项目根目录已存在 `.env` 或 `.env.local`，则继续兼容使用项目根目录
3. 否则，默认使用 `stateDir`（通常是 `~/.star_sanctuary`）

默认行为：

- 首次启动时，系统会在当前实际 `envDir` 下自动补一份默认 `.env`
- 敏感配置和个性化覆盖继续写入 `.env.local`
- `.env` / `.env.local` 都只用于本机，不应提交到 Git

如果你想确认当前到底在用哪份配置，可执行：

```bash
corepack pnpm bdd config path
corepack pnpm bdd doctor
```

### 3.1 基础配置（必选）

决定你使用什么 AI 模型服务。

**方案 A：使用 OpenAI 协议兼容服务（推荐）**
如果你有 OpenAI、Gemini、DeepSeek 或本地 LLM（如 Ollama）的 API Key。

在当前实际 `envDir/.env.local` 中添加：

```env
# 启用 OpenAI 协议 Provider
BELLDANDY_AGENT_PROVIDER=openai

# API 服务地址 (例如 Gemini)
BELLDANDY_OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
# 或者本地 Ollama
# BELLDANDY_OPENAI_BASE_URL=http://127.0.0.1:11434/v1

# 你的 API Key
BELLDANDY_OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxx

# 模型名称
BELLDANDY_OPENAI_MODEL=gemini-2.0-flash-exp
# 或者本地模型
# BELLDANDY_OPENAI_MODEL=llama3
BELLDANDY_OPENAI_MODEL=gemini-2.0-flash-exp
# 或者本地模型
# BELLDANDY_OPENAI_MODEL=llama3
```

> **✨ 也可以在网页界面设置！**
>  Phase 2.5 版本新增了可视化配置面板。你只需要先运行起来（哪怕 Key 是空的），然后在网页右上角点击设置图标（⚙️）即可修改这些配置。
>  修改后系统会自动重启生效。如果使用此方式，可以跳过手动编辑 `.env.local`。

**方案 B：使用 Mock 模式（测试用）**
如果你只是想跑通流程，不消耗 Token。

```env
BELLDANDY_AGENT_PROVIDER=mock
```

# Gateway 服务端口（默认 28889）
BELLDANDY_PORT=28889

# 鉴权模式：none (默认) | token | password
# 注意：即使是 none，新设备连接也需要 Pairing 配对
BELLDANDY_AUTH_MODE=none
# BELLDANDY_AUTH_TOKEN=my-secret-token

# Community API（/api/message）开关与鉴权
# 默认关闭；仅在需要被官网社区服务或其他 HTTP 服务调用时开启
# 安全约束：当 BELLDANDY_COMMUNITY_API_ENABLED=true 时，BELLDANDY_AUTH_MODE 不能为 none（建议 token）
BELLDANDY_COMMUNITY_API_ENABLED=false
# 专用 Bearer token（推荐单独设置）；未设置时会回退到 BELLDANDY_AUTH_TOKEN
# BELLDANDY_COMMUNITY_API_TOKEN=my-community-api-token

# Token 消耗上传（对接官网社区服务，可选）
# 开启后，Gateway 会把本地 WebChat 与社区房间中的 token 增量
# 主动上报到官网社区服务的 /api/internal/token-usage
BELLDANDY_TOKEN_USAGE_UPLOAD_ENABLED=false
# 目标地址：你的官网社区服务地址
# BELLDANDY_TOKEN_USAGE_UPLOAD_URL=https://api.goddess-ai.top/api/internal/token-usage
# 鉴权：填写“该主人自己的 office API Key 明文”
# BELLDANDY_TOKEN_USAGE_UPLOAD_APIKEY=gro_xxxxx
# 超时（毫秒）
BELLDANDY_TOKEN_USAGE_UPLOAD_TIMEOUT_MS=3000
# 严格 UUID 校验（可选）
# 开启后，office 会要求上传 body 里的 userUuid 与 API Key 主人一致
BELLDANDY_TOKEN_USAGE_STRICT_UUID=false

# ------ AI 能力开关 ------
# 启用工具调用（联网、读写文件）
BELLDANDY_TOOLS_ENABLED=true

# 启用记忆检索（向量搜索）
BELLDANDY_EMBEDDING_ENABLED=true
# 向量模型配置（通常与 Chat 模型用同一家服务）
BELLDANDY_EMBEDDING_MODEL=text-embedding-004

# ------ 记忆系统增强 (可选) ------
# 启用 L0 摘要层（自动生成 chunk 摘要，节省 80-90% token）
BELLDANDY_MEMORY_SUMMARY_ENABLED=true
# 启用长期记忆提取（Durable Extraction）
BELLDANDY_MEMORY_EVOLUTION_ENABLED=true
# Session Digest / Durable Extraction 的节流与触发门槛见 5.2.2
# 启用深度检索（找到相关段落后自动拉取完整上下文）
BELLDANDY_MEMORY_DEEP_RETRIEVAL=true
# 详细配置见 5.2.2 章节

# ------ 心跳定时任务 ------
# 启用心跳（Agent 定期检查 HEARTBEAT.md 并主动联系你）
BELLDANDY_HEARTBEAT_ENABLED=true
# 心跳间隔（支持 30m, 1h, 300s 格式）
BELLDANDY_HEARTBEAT_INTERVAL=30m
# 活跃时段（可选，深夜不打扰）
BELLDANDY_HEARTBEAT_ACTIVE_HOURS=08:00-23:00

# ------ 定时任务 (Cron) ------
# 启用 Cron 调度引擎（Agent cron 工具始终可用，此开关仅控制自动执行）
# BELLDANDY_CRON_ENABLED=true

# ------ 日志系统 ------
# 最低日志级别 (debug/info/warn/error)
BELLDANDY_LOG_LEVEL=debug
# 日志目录，默认 ~/.star_sanctuary/logs
# BELLDANDY_LOG_DIR=~/.star_sanctuary/logs
# 单文件最大大小，超过则轮转 (如 10MB)
# BELLDANDY_LOG_MAX_SIZE=10MB
# 日志保留天数，超过自动清理
# BELLDANDY_LOG_RETENTION_DAYS=7
# 是否输出到控制台 / 是否写入文件
# BELLDANDY_LOG_CONSOLE=true
# BELLDANDY_LOG_FILE=true
```

#### 3.1.1 office Token 上传配置（可选）

如果你希望把 Star Sanctuary 的 token 消耗累计到官网社区服务对应的用户账户中，可以开启上传功能。

**适用范围**：

- 本地 WebChat 对话
- 官网社区房间中的 Agent 对话

**记账语义**：

- token 始终记到 **Agent 主人** 名下
- 不区分是哪个 Agent 消耗了 token
- 社区房间里也**不按实际发言用户**记账

**最小配置**：

```env
BELLDANDY_TOKEN_USAGE_UPLOAD_ENABLED=true
BELLDANDY_TOKEN_USAGE_UPLOAD_URL=https://api.goddess-ai.top/api/internal/token-usage
BELLDANDY_TOKEN_USAGE_UPLOAD_APIKEY=gro_xxxxx
```

说明：

- `BELLDANDY_TOKEN_USAGE_UPLOAD_URL` 填你的官网社区服务地址，不是本机 Gateway 地址
- `BELLDANDY_TOKEN_USAGE_UPLOAD_APIKEY` 填 **该主人自己** 在 office 后台生成的 API Key 明文
- 上传失败不会中断聊天主流程，只会输出 warning 日志

**严格 UUID 校验（可选）**：

```env
BELLDANDY_TOKEN_USAGE_STRICT_UUID=true
```

开启后：

- WebChat 会上传当前用户 UUID
- community 链路会尝试从**根工作区** `IDENTITY.md` 中读取 `主人UUID`
- 如果你开启了严格模式，但 `IDENTITY.md` 里没有配置 `主人UUID`，community token 上传会失败，启动时也会看到 warning

`IDENTITY.md` 示例：

```md
- **主人UUID**：a10001
```

**常见用法**：

- 只想本地使用，不对接 office：保持 `BELLDANDY_TOKEN_USAGE_UPLOAD_ENABLED=false`
- 想把 token 统一累计到 office 主人账户：开启上传并配置 URL + API Key
- 想进一步防止 UUID 归属错误：再开启 `BELLDANDY_TOKEN_USAGE_STRICT_UUID=true`

#### 3.1.2 Channels 路由引擎（Router MVP）配置总览（短版）

如果你希望在多渠道（Discord / QQ / Feishu）中实现“群聊只在被 @ 时触发”或“按关键词路由到不同 Agent”，可加以下最小配置：

```env
# 开启路由引擎（默认 false）
BELLDANDY_CHANNEL_ROUTER_ENABLED=true

# 路由规则文件
BELLDANDY_CHANNEL_ROUTER_CONFIG_PATH=~/.star_sanctuary/channels-routing.json

# 默认 Agent（规则未指定 agentId 时使用）
BELLDANDY_CHANNEL_ROUTER_DEFAULT_AGENT_ID=default
```

`~/.star_sanctuary/channels-routing.json` 最小示例：

```json
{
  "version": 1,
  "defaultAction": {
    "allow": true,
    "agentId": "default"
  },
  "rules": [
    {
      "id": "discord-mention-only",
      "enabled": true,
      "priority": 100,
      "match": {
        "channels": ["discord"],
        "chatKinds": ["channel"],
        "mentionRequired": true
      },
      "action": {
        "allow": true,
        "agentId": "default"
      }
    },
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

启用后重启 Gateway，并观察日志中的 `channel-router` 决策输出（`allow/reason/matchedRuleId/agentId`）。

快速回滚：
- 设置 `BELLDANDY_CHANNEL_ROUTER_ENABLED=false`
- 重启 Gateway

详版说明见第 10 章的 `9.5 Channels 路由引擎（Router MVP）` 小节和 [channels-routing.md](./docs/channels-routing.md)。

### 3.2 可视化配置 (Settings UI)

如果你不想手改当前实际 `envDir/.env.local`，可以直接使用 WebChat 的配置面板：

1. 启动 Star Sanctuary（`start.bat` / `start.sh` / 发布包启动器均可）。
2. 在 WebChat 右上角点击 **⚙️ 设置图标**。
3. 在弹出的面板中可以直接修改这些当前已落地的配置项：
   - **模型配置**：`BELLDANDY_OPENAI_API_KEY`、`BELLDANDY_OPENAI_BASE_URL`、`BELLDANDY_OPENAI_MODEL`
   - **记忆与能力开关**：Embedding、Cron、MCP、工具总开关
   - **Browser Relay**：是否启用、Relay 端口
   - **语音输出**：TTS 开关、Provider、Voice
   - **工具控制模式**：`disabled / confirm / auto` 与确认密码
   - **系统提示词注入**：是否注入 `AGENTS / SOUL / MEMORY`
   - **上下文限制**：最大系统提示词长度、最大历史条数
   - **Heartbeat**：启用状态、间隔、活跃时段
4. 点击 **Save** 后，系统会写回当前实际 `envDir/.env.local` 并自动重启 Gateway。

此外，右上角还有两个和配置相关的入口：

- **🛠 调用设置**：打开 Tool Settings，可按工具维度查看与调整可用状态
- **System Doctor**：在设置面板中查看当前配置、端口、数据库与模型连通性诊断

> **补充**：前端推荐链接等静态文案仍可通过 `apps/web/public/config.js` 调整；这类前端资源修改通常无需改动运行时配置文件。

### 3.3 视觉与视频理解 (New!)

Star Sanctuary 现在支持**图片**和**视频**的理解能力（需配置支持视觉的模型，如 Kimi k2.5）。

#### 3.3.1 发送图片
1. 点击聊天输入框左侧的 `+` 号（或附件按钮）。
2. 选择本地图片文件（jpg, png, webp 等）。
3. 在输入框中输入你的问题（例如：“这张图里有什么？”）。
4. 发送消息，模型将能够“看到”图片并回答。

> **自动优化（新）**：WebChat 会在发送前自动尝试压缩/缩放较大的图片（优先转为 jpeg/webp），以降低 base64 后的请求体体积。  
> `gif/svg` 默认保持原样，不做压缩。

#### 3.3.2 发送视频 (Kimi K2.5 专属)
1. 同样点击附件按钮。
2. 选择本地视频文件（mp4, mov, avi 等，建议 < 100MB）。
3. 输入问题（例如："这个视频讲了什么故事？"）。
4. 发送消息。
   - **注意**：视频上传需要一定时间，界面会显示"上传视频中"的状态提示，请耐心等待。
   - **原理**：Agent 会自动将视频上传到 Moonshot AI 的云端文件服务，获取文件 ID 后通过 `ms://` 协议引用，模型直接读取云端文件进行分析。
   - **工具模式也支持**：无论是普通对话模式还是启用了工具调用（`BELLDANDY_TOOLS_ENABLED=true`）的模式，视频理解都能正常工作。

#### 3.3.3 视频上传独立配置（高级）

如果你的 AI 服务使用了代理/网关（如 API 中转站），而该代理不支持 Moonshot 的 `/files` 文件上传端点，你可以在 `models.json` 中为视频上传配置独立的直连地址：

```json
{
  "videoUpload": {
    "apiUrl": "https://api.moonshot.cn/v1",
    "apiKey": "sk-your-moonshot-key"
  },
  "fallbacks": [...]
}
```

这样，聊天请求走代理，视频上传直连 Moonshot，互不影响。

#### 3.3.4 配置要求
使用视觉能力前，请确保 `.env` 中配置了支持视觉的模型：
```bash
# 推荐配置 (Kimi K2.5)
BELLDANDY_OPENAI_BASE_URL="https://api.moonshot.cn/v1"
BELLDANDY_OPENAI_API_KEY="sk-xxxxxxxx"
BELLDANDY_OPENAI_MODEL="kimi-k2.5-preview"
```

#### 3.3.5 图片和视频消息显示（WebChat）

WebChat 界面支持以缩略图形式显示图片和视频：

**附件预览（发送前）：**
- 选择图片/视频附件后，会在输入框上方显示 80x60px 的缩略图
- 图片直接显示缩略图，视频显示第一帧缩略图 + 播放图标
- 点击缩略图右上角的 `×` 可以移除附件

**消息中的图片和视频（Agent 返回）：**
- 如果 Agent 返回的消息包含 `<img>` 或 `<video>` 标签，会自动转换为 200x150px 的缩略图
- 视频缩略图带有播放图标（▶）
- **点击缩略图**会弹出全屏查看器，显示原始尺寸的图片或播放视频
- 点击查看器外部或右上角的 `✕` 关闭

**示例场景：**
1. 你发送图片问"这是什么？"，图片以缩略图显示在你的消息旁
2. Agent 回复时如果引用图片（如生成的图表），也会以缩略图显示
3. 点击任意缩略图可以查看完整内容

#### 3.3.6 发送前体积保护（4MB）

为避免上游模型返回 `HTTP 400`（如 `total message size exceeds limit`），WebChat 在发送 `message.send` 前会做一次请求体积预估：

- 以完整 `message.send` JSON 进行估算（含文本、附件、上下文字段）。
- 当预估大小超过保护阈值（约上游 `4MB` 限制的 `90%`）时，前端会**本地拦截**并提示，不再发往模型。
- 拦截后会保留附件，并恢复输入框文本，便于你直接调整后重试。

推荐处理方式：
1. 减少图片数量或更换更小分辨率图片。
2. 降低单次发送文本长度，拆分为多条消息。
3. 先执行 `/compact` 压缩历史上下文，再重新发送。

### 3.4 语音交互配置 (STT & TTS)

为了让 Star Sanctuary 能听会说，你需要配置语音识别 (STT) 和语音合成 (TTS)。

#### 3.4.1 语音识别 (STT)

Star Sanctuary 支持多种 STT 服务商，你可以根据需要选择：

*   **OpenAI Whisper (默认)**：
    *   通用性强，准确率高。
    *   共用主 Agent 的配置 (`BELLDANDY_OPENAI_BASE_URL` / `API_KEY`)。
    *   配置：`BELLDANDY_STT_PROVIDER=openai`

*   **Groq (极速)**：
    *   速度极快（接近实时），适合追求低延迟的场景。
    *   需要单独申请 Groq API Key。
    *   配置：
        ```env
        BELLDANDY_STT_PROVIDER=groq
        BELLDANDY_STT_GROQ_API_KEY=gsk_your_key
        ```

*   **DashScope (通义听悟)**：
    *   中文识别效果极佳，支持 Paraformer 模型。
    *   共用 `DASHSCOPE_API_KEY`。
    *   配置：
        ```env
        BELLDANDY_STT_PROVIDER=dashscope
        DASHSCOPE_API_KEY=sk-your_dashscope_key
        ```

#### 3.4.2 语音合成 (TTS)

TTS 负责让 Star Sanctuary 开口说话。

*   **Edge TTS (推荐/默认)**：无需 API Key，免费且效果自然（晓晓/云希）。
*   **OpenAI TTS**：音质更逼真，消耗 Token。
*   **DashScope TTS**：中文韵律好，支持 Sambert 等模型。

启用方式见 **[10. 语音交互 (Voice Interaction)](#10-语音交互-voice-interaction)** 章节。

---

## 3.5 Docker 部署（推荐用于生产环境）

> **适用场景**：
> - 不想配置 Node.js 环境
> - 需要在服务器上长期运行
> - 希望环境隔离、易于维护
> - 需要快速部署和升级

### 前置要求

- Docker 20.10+
- Docker Compose 2.0+
- 至少 2GB 可用磁盘空间

### 快速部署

**1. 准备配置文件**

```bash
# Docker / Compose 场景仍建议在项目根目录准备 .env
cp .env.example .env
```

这里的仓库根目录 `.env` 是给 `docker compose` 和容器启动使用的部署配置文件；它与源码模式 / 桌面模式启动时自动补齐的运行时 `envDir/.env` 不是同一个概念。

**2. 编辑部署用 `.env` 文件**

填写必需的配置项：

```env
# 认证 Token（必填）
# 生成方法: openssl rand -hex 32
BELLDANDY_AUTH_TOKEN=your-secure-token-here

# OpenAI API 配置（必填）
BELLDANDY_OPENAI_BASE_URL=https://api.openai.com/v1
BELLDANDY_OPENAI_API_KEY=sk-your-api-key-here
BELLDANDY_OPENAI_MODEL=gpt-4

# 网络配置（可选）
BELLDANDY_HOST=127.0.0.1  # 仅本机访问
# BELLDANDY_HOST=0.0.0.0  # 允许局域网访问（需启用认证）
BELLDANDY_GATEWAY_PORT=28889
```

**3. 一键部署**

```bash
# 使用部署脚本（推荐）
./scripts/docker-deploy.sh
```

或手动部署：

```bash
# 构建镜像
./scripts/docker-build.sh

# 启动服务
docker-compose up -d belldandy-gateway

# 查看日志
docker-compose logs -f belldandy-gateway
```

**4. 访问 WebChat**

打开浏览器访问：`http://localhost:28889`

### 常用命令

```bash
# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f belldandy-gateway

# 停止服务
docker-compose down

# 重启服务
docker-compose restart belldandy-gateway

# 运行 CLI 命令
docker-compose run --rm belldandy-cli --help
docker-compose run --rm belldandy-cli pairing:list
docker-compose run --rm belldandy-cli doctor
```

### 数据备份

```bash
# 备份状态目录
tar -czf belldandy-backup-$(date +%Y%m%d).tar.gz ~/.star_sanctuary

# 恢复备份
tar -xzf belldandy-backup-20260220.tar.gz -C ~/
```

### 升级

```bash
# 1. 停止服务
docker-compose down

# 2. 拉取最新代码
git pull

# 3. 重新构建镜像
./scripts/docker-build.sh

# 4. 启动服务
docker-compose up -d belldandy-gateway
```

### 故障排查

**容器无法启动**：

```bash
# 查看日志
docker-compose logs belldandy-gateway

# 检查端口占用
netstat -tulpn | grep 28889

# 检查环境变量
cat .env | grep BELLDANDY_AUTH_TOKEN
```

**健康检查失败**：

```bash
# 进入容器测试
docker exec -it belldandy-gateway bash
curl http://127.0.0.1:28889/health
```

**WebChat 无法连接**：

1. 检查浏览器开发者工具（F12）→ Network 标签
2. 查找 WebSocket 连接错误
3. 确认认证 Token 是否匹配

### 详细文档

完整的 Docker 部署指南（配置说明、高级配置、安全建议）请参考：

📖 [Docker 部署指南](docs/DOCKER_DEPLOYMENT.md)

---

## 4. 启动与首次使用

### 4.1 极速启动 (推荐)

我们为 Windows 和 Linux/macOS 用户准备了“一键启动脚本”，它会自动完成以下所有工作：
1. 检查 Node.js 环境
2. 自动安装/更新依赖
3. 自动检查并构建工作区 `dist/` 产物
4. 启动 Gateway 服务
5. **自动打开浏览器**并登录
6. 如果服务意外崩溃，会自动尝试重启

**Windows 用户**:
双击项目根目录下的 `start.bat`。

**macOS / Linux 用户**:
在终端运行：
```bash
./start.sh
```

> **当前推荐的构建口径**：
> - 日常构建：`corepack pnpm build`
> - 构建异常恢复：`corepack pnpm rebuild`
>
> 其中：
> - `pnpm build` 会执行强制全量构建，并校验每个工作区包的 `dist` 入口文件是否完整
> - `pnpm rebuild` 会先清理 `dist/` 与 `tsconfig.tsbuildinfo`，再做一次完整重建
>
> 如果你遇到 `Cannot find module '@belldandy/*'`、`Could not find a declaration file` 或某些 `dist/index.js` / `dist/index.d.ts` 缺失，优先执行：`corepack pnpm rebuild`

### 4.2 使用 CLI 启动（推荐）

Star Sanctuary 提供了统一的 `bdd` 命令行工具，所有管理操作都通过它完成。

```bash
cd Star Sanctuary

# 日常构建（推荐）
corepack pnpm build

# 如果刚改过包配置、构建缓存异常或 dist 产物不完整，使用完整重建
corepack pnpm rebuild

# 生产模式：带进程守护，崩溃自动重启（等价于 start.bat / start.sh）
corepack pnpm bdd start

# 开发模式：直接启动 Gateway，适合调试
corepack pnpm bdd dev
```

看到类似 `[Gateway] Listening on http://localhost:28889` 的日志，说明启动成功。

> **💡 首次使用？** 推荐先运行 `corepack pnpm bdd setup` 交互式向导，它会引导你完成 AI 服务配置并写入当前实际 `envDir/.env.local`，详见下方 4.2.1 节。

#### 4.2.1 Setup 向导（首次配置推荐）

如果你还没有手动编辑过敏感配置，可以使用交互式向导快速完成配置：

```bash
corepack pnpm bdd setup
```

向导会依次引导你选择：
- AI 服务商（OpenAI / Gemini / Moonshot / Ollama / 自定义）
- API Base URL 和 API Key
- 模型名称
- 监听地址和端口
- 鉴权模式（none / token / password）

配置完成后自动写入当前实际 `envDir/.env.local`，无需手动编辑。

如果你想先确认当前路径，可执行：

```bash
corepack pnpm bdd config path
corepack pnpm bdd doctor
```

也支持非交互模式（适合脚本化部署）：

```bash
corepack pnpm bdd setup --provider openai --base-url https://api.openai.com/v1 --api-key sk-xxx --model gpt-4o
```

### 4.3 手动启动（兼容方式）

你也可以使用传统的 pnpm 脚本启动：

```bash
cd Star Sanctuary

# 开发模式（直接跑源码）
corepack pnpm dev:gateway

# 生产模式前建议先构建
corepack pnpm build
corepack pnpm start
```

> **说明**：`pnpm dev:gateway` 通过源码直接启动，适合开发调试；`pnpm start` / `pnpm bdd start` 依赖编译后的 `dist/`。如果启动前怀疑构建缓存或产物异常，请先执行 `corepack pnpm rebuild`。

### 4.4 访问界面

打开浏览器，访问：
http://localhost:28889/
或者
[http://127.0.0.1:28889/](http://127.0.0.1:28889/)

> **✨ 首次唤醒仪式**：
> 第一次由本机访问时，你可能会看到一段 **"Initializing..."** 的终端启动动画。这是 Star Sanctuary 的唤醒仪式，稍等其自我检查完毕即可进入聊天界面。

你会看到 WebChat 聊天界面。

### 4.5 首次配对（Pairing）

为了防止你家猫咪或邻居连上你的 AI，首次使用新设备（即使是本机浏览器）连接时，Star Sanctuary 会启动安全配对流程：

1.  在 WebChat 发送第一条消息（例如 "你好"）。
2.  界面会提示：`Pairing required. Code: ABC123XY`。
3.  **另开一个终端窗口（不要关掉运行 Gateway 的那个窗口）**，进入项目根目录，然后执行：

    ```bash
    # 确保你在 Star Sanctuary 项目根目录下执行此命令
    # Windows 示例：cd D:\gongzuo\xiangmu\Belldandy\Belldandy
    # macOS/Linux 示例：cd ~/Belldandy

    corepack pnpm bdd pairing approve ABC123XY
    ```

    > **⚠️ 注意**：
    > - 必须在 **Star Sanctuary 项目根目录**（即包含 `package.json` 的那层目录）下执行此命令。
    > - 将 `ABC123XY` 替换为界面上实际显示的配对码。
    > - 配对码有效期为 **1 小时**，过期需重新在 WebChat 发送消息以获取新码。

4.  看到 `✓ Client xxx approved` 即配对成功。回到 WebChat，再次发送消息，现在可以正常对话了。

### 4.6 更新检查与版本升级

Star Sanctuary 启动后会异步检查 GitHub 最新 Release；如果发现新版本，只会在日志中提醒，不会自动升级。

#### 启用 / 关闭更新检查

```env
BELLDANDY_UPDATE_CHECK=true
# BELLDANDY_UPDATE_CHECK_TIMEOUT_MS=3000
# BELLDANDY_UPDATE_CHECK_API_URL=https://api.github.com/repos/vrboyzero/star-sanctuary/releases/latest
```

关闭：

```env
BELLDANDY_UPDATE_CHECK=false
```

#### 如何确认当前版本

- 访问健康检查接口：`http://127.0.0.1:28889/health`
- 或查看启动日志中的 `Star Sanctuary Version: vX.Y.Z`

#### 常见升级路径

- **Portable / Single-Exe 用户**：下载新版本包，保留 `~/.star_sanctuary` 数据目录，按新包说明启动
- **Docker 用户**：更新镜像 tag 后执行 `docker compose up -d --remove-orphans`
- **源码用户**：执行 `git pull` / `git checkout <tag>`、`corepack pnpm install`、`corepack pnpm build`

更详细的升级说明见：`docs/用户版本升级手册.md`。

---

**第二部分：个性化定制**

## 5. 人格与记忆（让它变成你的专属 AI）

Star Sanctuary 的数据存储在你的用户主目录下的 `.star_sanctuary` 文件夹中（例如 Windows 下是 `C:\Users\YourName\.star_sanctuary`，Linux/Mac 下是 `~/.star_sanctuary`）。

### 5.1 塑造人格 (SOUL)

你可以通过编辑 `.star_sanctuary` 目录下的 Markdown 文件来定义 AI 的性格：

-   **`SOUL.md`**：核心性格文件。
    -   *例子*：`你是一个严谨的 TypeScript 专家，喜欢用代码解释问题...`
-   **`IDENTITY.md`**：身份设定。
    -   *例子*：`你的名字叫 Star Sanctuary，是一级神，喜欢红茶...`
-   **`USER.md`**：关于你的信息。
    -   *例子*：`用户叫 vrboyzero，全栈工程师，喜欢简洁的代码...`

修改这些文件后，**重启 Gateway** 即可生效。

#### 5.1.1 设置头像和名称（WebChat 显示）

WebChat 界面会自动从 `IDENTITY.md` 和 `USER.md` 中提取名称和头像信息，显示在聊天消息气泡旁边。

**在 `IDENTITY.md` 中设置 Agent 信息：**

```markdown
**名字：** 星辰圣所 (Star Sanctuary)
**Emoji：** 🌙
**头像：** /avatar/belldandy.png
```

**在 `USER.md` 中设置用户信息：**

```markdown
**名字：** 易
```

**头像支持的格式：**

1. **Emoji 字符**（推荐用于快速设置）
   ```markdown
   **Emoji：** 🌙
   ```

2. **本地图片路径**（需要放在 Web 根目录）
   ```markdown
   **头像：** /avatar/belldandy.png
   ```

   图片需要放在 `apps/web/public/avatar/` 目录下，例如：
   ```
   E:\project\belldandy\apps\web\public\avatar\belldandy.png
   ```

3. **在线图片 URL**
   ```markdown
   **头像：** https://example.com/avatar.png
   ```

**优先级规则：**
- `**头像：**` 字段优先级高于 `**Emoji：**` 字段
- 如果两者都存在，使用 `**头像：**` 的值
- 如果都不存在，使用默认值（Agent: 🤖，User: 👤）

**显示效果：**
- 头像显示为 36x36px 的圆形缩略图
- 名称显示在消息气泡上方
- Agent 消息显示在左侧（头像在左），用户消息显示在右侧（头像在右）

### 5.2 长期记忆 (Memory)

Star Sanctuary 会自动读取并索引 `.star_sanctuary/MEMORY.md` 和 `.star_sanctuary/memory/*.md` 文件。

-   **`MEMORY.md`**：存放你希望它永远记住的关键事实（`core` 类型，最高权重）。
-   **`memory/2026-01-31.md`**：你可以手动记录当天的笔记，Star Sanctuary 会自动索引并在相关对话中回忆起来（`daily` 类型）。
-   **`sessions/*.jsonl`**：对话历史会自动索引为 `session` 类型记忆，可被检索。

#### 5.2.1 记忆系统架构 (Phase M-Next)

Star Sanctuary 的记忆系统经过深度优化，提供了多层次的智能检索与自动记忆管理能力：

**核心特性：**

1. **混合检索**：关键词检索（FTS5 BM25）+ 向量语义检索（sqlite-vec KNN）+ RRF 融合
2. **Embedding Cache**：基于内容哈希的缓存，避免重复计算，节省 30-50% API 成本
3. **元数据过滤**：按渠道、主题、时间范围精确过滤
4. **规则重排序**：memory_type 权重 + 时间衰减 + 来源多样性
5. **L0 摘要层**：自动生成 chunk 摘要，检索时节省 80-90% token
6. **Session Digest + Durable Extraction**：先写会话摘要，再按规则沉淀长期记忆
7. **源路径聚合检索**：找到相关段落后自动拉取完整上下文

#### 5.2.2 记忆系统配置

在 `.env.local` 或 `.env` 中添加以下配置（按需开启）：

```env
# ========== 基础配置 ==========
# 启用向量检索（必须启用才能使用语义搜索）
BELLDANDY_EMBEDDING_ENABLED=true
BELLDANDY_EMBEDDING_MODEL=text-embedding-004

# ========== 会话开始前的记忆注入 ==========
# 打开后，会在每轮对话开始时自动注入最近的相关记忆
BELLDANDY_CONTEXT_INJECTION=true
BELLDANDY_CONTEXT_INJECTION_LIMIT=5
BELLDANDY_CONTEXT_INJECTION_INCLUDE_SESSION=false
BELLDANDY_CONTEXT_INJECTION_TASK_LIMIT=3
BELLDANDY_CONTEXT_INJECTION_ALLOWED_CATEGORIES=preference,fact,decision,entity

# ========== L0 摘要层 ==========
BELLDANDY_MEMORY_SUMMARY_ENABLED=true
# 摘要模型（可选，不设则继承主模型）
BELLDANDY_MEMORY_SUMMARY_MODEL=gemini-2.0-flash-exp

# ========== 长期记忆提取（Durable Extraction） ==========
# 这是“把值得长期保留的内容写进 memory/*.md”的主开关
BELLDANDY_MEMORY_EVOLUTION_ENABLED=true
# 基础最少消息数
BELLDANDY_MEMORY_EVOLUTION_MIN_MESSAGES=8
# 提取模型（可选，不设则继承主模型）
BELLDANDY_MEMORY_EVOLUTION_MODEL=gemini-2.0-flash-exp

# ========== Session Digest / Durable Extraction 节流 ==========
# 会话摘要（Session Digest）1 小时内最多刷新 24 次
BELLDANDY_MEMORY_SESSION_DIGEST_MAX_RUNS=24
BELLDANDY_MEMORY_SESSION_DIGEST_WINDOW_MS=3600000

# 长期记忆提取（Durable Extraction）1 小时内最多进入后台运行 6 次
BELLDANDY_MEMORY_DURABLE_EXTRACTION_MAX_RUNS=6
BELLDANDY_MEMORY_DURABLE_EXTRACTION_WINDOW_MS=3600000

# 更细的触发门槛
BELLDANDY_MEMORY_DURABLE_EXTRACTION_MIN_PENDING_MESSAGES=6
BELLDANDY_MEMORY_DURABLE_EXTRACTION_MIN_MESSAGE_DELTA=4
BELLDANDY_MEMORY_DURABLE_EXTRACTION_SUCCESS_COOLDOWN_MS=300000
BELLDANDY_MEMORY_DURABLE_EXTRACTION_FAILURE_BACKOFF_MS=5000
BELLDANDY_MEMORY_DURABLE_EXTRACTION_FAILURE_BACKOFF_MAX_MS=600000

# ========== 源路径聚合检索 (M-N4) ==========
# 找到相关段落后自动拉取完整上下文
BELLDANDY_MEMORY_DEEP_RETRIEVAL=true

# ========== Auto-Recall 底层隐式语义召回 ==========
# 开关默认 false，建议按需开启
BELLDANDY_AUTO_RECALL_ENABLED=true
BELLDANDY_AUTO_RECALL_LIMIT=3
BELLDANDY_AUTO_RECALL_MIN_SCORE=0.3

# ========== Team Shared Memory（当前仅本地前置条件） ==========
# 打开后会把 stateDir/team-memory 纳入同一记忆索引源
# 当前不包含远端同步，只包含 path / secret guard / readiness / index 挂接
BELLDANDY_TEAM_SHARED_MEMORY_ENABLED=true
```

当前这一套建议这样理解：

- `Session Digest`：更像“当前会话的小抄”，帮助长对话不断线。
- `Durable Extraction`：更像“长期归档”，只把更值得保留的内容写进长期记忆。
- `Auto-Recall / Context Injection`：负责“聊天开始前先把相关记忆带回来”。
- `Team Shared Memory`：当前还只是本地共享记忆前置条件，不是远端同步平台。

#### 5.2.3 检索增强与过滤

`memory_search` 工具支持多维度过滤，Agent 可以精确缩小检索范围：

| 过滤参数 | 说明 | 示例值 |
|----------|------|--------|
| `memory_type` | 记忆类型 | `core`（长期事实，权重 1.3x）<br>`daily`（日记，权重 1.0x）<br>`session`（对话历史，权重 0.9x）<br>`other`（其他，权重 0.8x） |
| `channel` | 来源渠道 | `webchat`、`feishu`、`heartbeat` |
| `topic` | 主题标签 | 自定义标签（需在 metadata 中设置） |
| `date_from` / `date_to` | 日期范围 | `2026-01-01` ~ `2026-02-01` |
| `detail_level` | 返回详细度 | `summary`（仅摘要，节省 token）<br>`full`（完整内容） |

**检索流程：**

1. **混合检索**：关键词 + 向量语义双路检索，RRF 融合
2. **元数据过滤**：SQL 级预过滤，只检索符合条件的 chunk
3. **规则重排序**：
   - Memory type 权重（core > daily > session > other）
   - 时间衰减（指数衰减，30 天半衰期）
   - 来源多样性惩罚（同一文件的多个 chunk 降权 15%）
4. **深度检索**（可选）：检测到热点 source 时自动拉取完整上下文

**使用示例：**

```
用户：搜索最近一周飞书上关于项目进度的讨论
Agent：调用 memory_search(query="项目进度", channel="feishu", date_from="2026-02-13", detail_level="summary")
```

#### 5.2.4 Session Digest 与 Durable Extraction

当前记忆主线不是“把整段对话原样存起来”，而是分成两层：

- **Session Digest**：给当前会话写一份简短摘要，方便后面继续聊。
- **Durable Extraction**：把更值得长期保留的内容沉淀到 `memory/YYYY-MM-DD.md`。

你可以把它们理解成：

- `Session Digest` = 当前聊天的“小抄”
- `Durable Extraction` = 值得长期保留的“正式笔记”

当前长期记忆提取会优先保留这几类内容：

- 用户偏好
- 反馈与约束
- 项目背景与长期决策
- 可长期复用的参考信息

当前会尽量不记这些内容：

- 纯代码片段模式
- 单纯文件路径
- git 变更流水
- 临时 debug 步骤
- 一次性的策略口令或执行规则

#### 5.2.5 什么时候会触发 / 不会触发（白话版）

| 机制 | 什么时候会触发 | 什么时候不会触发 |
|------|----------------|------------------|
| `Session Digest` | 你正常聊天时，系统会在回复完成后机会性刷新“会话小抄”；你手动触发摘要刷新时也会执行 | 当前小时内刷新次数已经用完；或者系统当前无法写入会话状态 |
| `Durable Extraction` | 已开启 `BELLDANDY_MEMORY_EVOLUTION_ENABLED=true`；对话内容已经积累到值得归档；离上次成功提取后又新增了足够多的新消息；当前不在冷却或失败退避期内 | 记忆提取总开关没开；对话太短；和上次相比新增内容不够；刚提取成功还在冷却中；最近连续失败还在退避等待；当前小时内后台提取次数已达上限 |

结合你当前 `.env` 的配置，可以直接按下面这张表理解：

| 项目 | 你当前的值 | 白话效果 |
|------|------------|----------|
| `BELLDANDY_MEMORY_SESSION_DIGEST_MAX_RUNS` | `24` | 1 小时内最多刷新 24 次会话摘要，够积极，但不会无限刷 |
| `BELLDANDY_MEMORY_SESSION_DIGEST_WINDOW_MS` | `3600000` | 上面的统计窗口是 1 小时 |
| `BELLDANDY_MEMORY_DURABLE_EXTRACTION_MAX_RUNS` | `6` | 1 小时内最多做 6 次长期记忆提取，明显比 digest 更克制 |
| `BELLDANDY_MEMORY_DURABLE_EXTRACTION_MIN_PENDING_MESSAGES` | `6` | 对话太短时，不急着归档 |
| `BELLDANDY_MEMORY_DURABLE_EXTRACTION_MIN_MESSAGE_DELTA` | `4` | 距离上次提取后，如果新增消息太少，就先不重复归档 |
| `BELLDANDY_MEMORY_DURABLE_EXTRACTION_SUCCESS_COOLDOWN_MS` | `300000` | 一次提取成功后，至少歇 5 分钟再考虑下一次 |
| `BELLDANDY_MEMORY_DURABLE_EXTRACTION_FAILURE_BACKOFF_MS` | `5000` | 失败后不会立刻重试，先等 5 秒 |
| `BELLDANDY_MEMORY_DURABLE_EXTRACTION_FAILURE_BACKOFF_MAX_MS` | `600000` | 如果连续失败，等待时间会越来越长，但最长不超过 10 分钟 |

日常使用时，你不需要主动操作这两套机制，它们会在后台自己工作。

如果你是做高级集成或排障的开发者，当前还可以使用：

- `conversation.digest.get`
- `conversation.digest.refresh`
- `conversation.memory.extraction.get`
- `conversation.memory.extract`

来查看或手动请求当前会话的摘要 / 长期记忆提取状态。

#### 5.2.6 L0 摘要层

启用 `BELLDANDY_MEMORY_SUMMARY_ENABLED=true` 后，Star Sanctuary 会在索引完成后自动为长 chunk（> 500 字符）生成简短摘要：

**优势：**
- **节省 token**：检索时默认返回摘要（50-100 token），而非完整内容（500-1000 token），节省 80-90%
- **快速浏览**：Agent 可以先浏览摘要，判断是否需要查看全文
- **渐进式加载**：需要时再用 `memory_get` 或 `detail_level="full"` 获取完整内容

**摘要生成：**
- 异步后台执行，不阻塞索引流程
- 批量处理（默认每批 5 个 chunk）
- 使用专用 prompt 生成一到两句话的核心要点
- 自动估算 token 数并存储

**使用示例：**
```
# 默认返回摘要（快速浏览）
memory_search(query="项目架构", detail_level="summary")

# 需要完整内容时
memory_search(query="项目架构", detail_level="full")
```

#### 5.2.7 Auto-Recall 使用与调参

Auto-Recall 是底层自动召回能力：每次对话开始前，系统会基于当前用户输入自动检索历史记忆，并静默注入上下文。你无需显式让 Agent 调 `memory_search`。

**启用方式：**

```env
BELLDANDY_AUTO_RECALL_ENABLED=true
BELLDANDY_AUTO_RECALL_LIMIT=3
BELLDANDY_AUTO_RECALL_MIN_SCORE=0.3
```

**推荐调优区间：**
- `BELLDANDY_AUTO_RECALL_LIMIT`：`2~5`（默认 `3`）
- `BELLDANDY_AUTO_RECALL_MIN_SCORE`：`0.25~0.45`（默认 `0.3`）

**推荐起步组合：**
1. 通用平衡：`limit=3`，`minScore=0.30`
2. 追求精准：`limit=2~3`，`minScore=0.35~0.45`
3. 追求覆盖：`limit=4~5`，`minScore=0.25~0.30`

**调优顺序（建议一次只改一个参数）：**
1. 固定 `limit=3`，先提高 `minScore`（`0.30 -> 0.35 -> 0.40`），观察是否出现“误召回减少但回忆缺失”。
2. 若相关记忆仍不足，再把 `limit` 从 `3` 提到 `4`（必要时到 `5`）。
3. 若上下文噪声或 token 压力变大，优先提高 `minScore`，其次下调 `limit`。

**建议验证步骤：**
1. 先积累几轮历史对话，再问一个与历史明显相关的问题，观察回复是否自然引用历史信息。
2. 发送问候语（如“你好”），确认不会产生无意义召回（由检索过滤器自动跳过）。
3. 将 `BELLDANDY_AUTO_RECALL_ENABLED=false`，确认可完全关闭并回退到原行为。

#### 5.2.8 Team Shared Memory（当前阶段）

`Team Shared Memory` 当前已经有了最小可用的本地前置条件，但还不是完整的“团队云同步”产品。

当前你可以这样用：

1. 打开 `BELLDANDY_TEAM_SHARED_MEMORY_ENABLED=true`
2. 在 `stateDir/team-memory/` 下维护共享记忆文件
3. 推荐结构：
   - `team-memory/MEMORY.md`
   - `team-memory/memory/YYYY-MM-DD.md`

当前系统已经提供：

- 本地路径规范
- 写入前的高置信 secret guard
- `doctor` / readiness 诊断
- 纳入同一 MemoryManager 索引源

当前系统**还不提供**：

- 远端同步
- watcher 驱动的同步闭环
- 服务端 team memory 平台
- 复杂冲突合并或远端删除传播

如果你往 `team-memory/...` 里写入明显像密钥、token、私密配置的内容，系统会优先阻断，而不是照单全收。

### 5.3 FACET 模组切换

FACET 是 Star Sanctuary 的"职能模组"系统——通过切换不同的模组文件，可以让同一个 Agent 在不同角色之间快速转换（例如"程序员模式"、"翻译模式"、"创意写作模式"等）。

**模组文件位置**：`~/.star_sanctuary/facets/` 目录下的 `.md` 文件。

**使用方法**：直接在对话中告诉 Star Sanctuary：

| 你说的话 | Star Sanctuary 做的事 |
|----------|------------------|
| "切换模组为 coder" | 调用 `switch_facet` 工具替换 SOUL.md 中的模组内容，然后自动重启服务 |
| "切换 FACET 为 translator" | 同上，切换到翻译模组 |

**工作原理**：

1. `switch_facet` 工具读取 `~/.star_sanctuary/facets/{模组名}.md` 文件
2. 在 SOUL.md 中找到锚点行，保留锚点行及之前的所有内容（人格核心不变）
3. 将锚点行之后的内容替换为新模组内容（原子写入，不会损坏文件）
4. Agent 随后调用 `service_restart` 重启服务，清空旧模组的推理惯性

**创建自定义模组**：

在 `~/.star_sanctuary/facets/` 目录下创建 `.md` 文件即可。文件内容会被完整追加到 SOUL.md 的锚点行之后。建议以 `## 【FACET | 模组 | 文件名】` 开头，保持格式一致。

> **💡 提示**：模组切换不会影响 SOUL.md 中的 TABOO、ETHOS、SYSTEM 等核心章节——这些内容位于锚点行之前，始终保持不变。

### 5.4 Memory Viewer、任务记忆与经验沉淀

当前 WebChat 左侧已经提供 **🧠 记忆查看** 面板，对应代码中的 `memory.stats / memory.task.list / memory.search / experience.*` 能力。它不只是“看记忆条目”，还是你复盘 Agent 工作质量的重要入口。

#### 5.4.1 你能看到什么

在 Memory Viewer 中，当前有两个主标签：

- **Tasks**：查看任务级运行记录、状态、来源、摘要、所用 Method / Skill、相关候选经验
- **Memories**：查看实际入库的记忆块、分类、可见性与命中详情

界面支持的常见筛选项：

- 任务状态：`running / success / failed / partial`
- 任务来源：`chat / sub_agent / cron / heartbeat / manual`
- Goal 过滤：按长期任务归属查看任务历史
- 记忆类型 / 可见性 / 分类过滤

此外，顶部还有两类和任务有关的可见信息：

- **系统 / 上下文 / 输入 / 输出 Token 面板**
- **最近任务 Token 历史**（便于你观察一次任务的 token 消耗）

#### 5.4.2 推荐开启的相关配置

```env
# 记录任务级记忆
BELLDANDY_TASK_MEMORY_ENABLED=true

# 是否自动为较大的任务生成摘要
# BELLDANDY_TASK_SUMMARY_ENABLED=true

# 自动把高价值任务沉淀为经验候选
BELLDANDY_EXPERIENCE_AUTO_PROMOTION_ENABLED=true
BELLDANDY_EXPERIENCE_AUTO_METHOD_ENABLED=true
BELLDANDY_EXPERIENCE_AUTO_SKILL_ENABLED=true
```

说明：

- **Task Memory** 打开后，系统会把任务级执行过程写入可检索记录
- **Task Summary** 适合长任务 / 多工具链路，便于后续复盘
- **Experience Auto Promotion** 会把高价值任务整理成 Method / Skill 候选，供你后续接受或发布

#### 5.4.3 适合怎么用

- 对一段复杂对话结束后，去 **Tasks** 看它用了哪些工具、消耗了多少 token
- 对长期迭代任务，先按 Goal 过滤，再看阶段性任务是否沉淀出 Method / Skill 候选
- 对“它为什么答出这个结论”这类问题，去 **Memories** 看具体命中的记忆块和分类

### 5.5 长期任务（Goals）与治理

Star Sanctuary 当前已经落地了完整的 **Long-term Goals / 长期任务** 体系，WebChat 左侧有独立的 **🎯 长期任务** 面板，对应 `goal.*` 与 `task_graph.*` 系列 RPC / 工具。

#### 5.5.1 创建后会生成什么

创建一个 Goal 后，系统通常会同时维护两类目录：

- **文档目录**：`~/.star_sanctuary/docs/long-tasks/<slug>/`
- **运行态目录**：`~/.star_sanctuary/goals/<goalId>/`

全局索引与治理文件主要位于：

- `~/.star_sanctuary/goals/index.json`
- `~/.star_sanctuary/governance/review-governance.json`
- `~/.star_sanctuary/cron-jobs.json`

#### 5.5.2 当前已完成的核心能力

- **Goal 创建 / 列表 / 恢复 / 暂停**
- **Task Graph**：节点创建、认领、阻塞、校验、完成、跳过
- **Capability Plan**：分析当前任务适合使用哪些 Method / Skill / MCP / Sub-Agent
- **Checkpoint 审批**：对关键节点发起审批、驳回、重开、升级
- **Suggestion Review**：对经验候选、Method 候选、Skill 候选进入治理流程
- **Publish**：将通过审核的建议发布到 `methods/` 或 `skills/`
- **Cross-goal Flow Patterns**：从多个 Goal 中归纳流程模式

#### 5.5.3 你该如何上手

最短路径建议：

1. 在 WebChat 的 **Goals** 面板中创建一个 Goal
2. 先补全目标、阶段和 Northstar，再拆 Task Graph
3. 对关键节点执行能力规划（Capability Plan）或编排（`goal_orchestrate`）
4. 对高风险节点启用 Checkpoint，必要时配置 reviewer / SLA
5. 在阶段结束后生成 retrospective、method candidates、skill candidates、flow patterns

#### 5.5.4 推荐配置

```env
BELLDANDY_TOOLS_ENABLED=true
BELLDANDY_CRON_ENABLED=true
BELLDANDY_EMBEDDING_ENABLED=true
BELLDANDY_MCP_ENABLED=true
```

可选但强烈建议配置组织级治理文件：

- `~/.star_sanctuary/governance/review-governance.json`

如果你只想快速体验，也可以不写治理文件，系统会按默认逻辑运行；但一旦你要长期协作、分阶段审批、做多角色 review，这个文件就非常重要。

#### 5.5.5 Web 前端里当前可以做什么

当前 Goals 面板已经可以用于：

- 创建 Goal
- 查看 Goal 概要、Task Graph、Checkpoint、Handoff
- 查看治理摘要（review governance summary）
- 执行 approval scan
- 处理 suggestion review / checkpoint action
- 查看 review notifications 与 dispatch outbox

> **说明**：目前没有“独立长期任务后台”，而是复用 WebChat 现有 Goals 面板、详情面板和弹窗工作流。

## 6. 定时任务

### 6.1 定时提醒 (Heartbeat)

让 Star Sanctuary 主动提醒你！编辑 `~/.star_sanctuary/HEARTBEAT.md`：

```markdown
# 定时任务

- [ ] 每天早上提醒我查看日程
- [ ] 喝水提醒
- [ ] 检查待办事项
```

当启用心跳功能后（`BELLDANDY_HEARTBEAT_ENABLED=true`），Star Sanctuary 会定期读取这个文件：

- **有任务内容**：执行检查并可能主动联系你
- **文件为空**：跳过，节省 API 调用
- **深夜时段**：如果设置了 `BELLDANDY_HEARTBEAT_ACTIVE_HOURS=08:00-23:00`，深夜不会打扰你

当前投递路径以运行态为准：

- **本地 WebChat**：会广播到当前 Web 客户端
- **飞书**：若已配置飞书渠道且用户与 Agent 建立过有效会话，可主动推送到飞书

> **注意**：如果飞书端没有建立过会话，Heartbeat / Cron 即使启用，也可能只能在本地 WebChat 中看到广播结果。

### 6.2 定时任务 (Cron)

比 Heartbeat 更灵活的精确定时任务系统。你可以让 Star Sanctuary 在特定时间或按固定间隔执行任务。

**启用方式**：在 `.env.local` 中添加：

```env
BELLDANDY_CRON_ENABLED=true
```

**使用方法**：直接在对话中告诉 Star Sanctuary，它会通过 `cron` 工具自动管理：

| 你说的话 | Star Sanctuary 做的事 |
|----------|------------------|
| "下午 3 点提醒我开会" | 创建一次性任务 (`at`)，到点推送提醒 |
| "每 4 小时提醒我喝水" | 创建周期任务 (`every`)，循环执行 |
| "每天早上 9 点汇报新闻" | 创建周期任务，24h 间隔 |
| "列出所有定时任务" | 显示任务列表 + 状态 |
| "删掉喝水提醒" | 移除指定任务 |
| "定时任务状态" | 查看调度器运行信息 |

**与 Heartbeat 的区别**：

| | Heartbeat | Cron |
|---|-----------|------|
| **用途** | 周期性“意识”检查 | 精确定时任务 |
| **配置** | 编辑 `HEARTBEAT.md` | 对话中自然语言创建 |
| **灵活性** | 固定间隔 | 一次性 / 任意间隔 |
| **任务管理** | 修改文件 | `cron list/add/remove` |

> **💡 提示**：即使未启用 `BELLDANDY_CRON_ENABLED`，你仍可以使用 `cron` 工具创建和管理任务列表。启用后调度器才会自动执行到期的任务。

**补充：长期任务治理扫描**

当前 Cron 除了普通提醒类任务，还支持结构化的 `goalApprovalScan` 任务，用于定期扫描长期任务中的：

- suggestion review 是否超时
- checkpoint 是否逾期
- 是否需要自动升级 / 提醒

这类任务的运行态会记录到 `~/.star_sanctuary/cron-jobs.json`，推荐配合 5.5 节的 Goals 治理能力一起使用。

## 7. 多 Agent 系统 (Multi-Agent)

Star Sanctuary 支持配置和运行多个 Agent，每个 Agent 可以拥有独立的模型、人格、工具权限和工作区。你可以在 WebChat 中切换不同 Agent 对话，也可以让 Agent 之间协作完成复杂任务。

### 7.1 配置 Agent Profile

在 `~/.star_sanctuary/` 目录下创建 `agents.json` 文件：

```json
{
  "agents": [
    {
      "id": "coder",
      "displayName": "代码专家",
      "model": "primary",
      "systemPromptOverride": "你是一个严谨的代码专家，擅长 TypeScript 和系统设计。",
      "toolsEnabled": true,
      "toolWhitelist": ["file_read", "file_write", "run_command", "web_fetch"]
    },
    {
      "id": "researcher",
      "displayName": "调研助手",
      "model": "deepseek-chat",
      "systemPromptOverride": "你是一个高效的调研助手，擅长信息检索和总结。",
      "toolsEnabled": true,
      "toolWhitelist": ["web_fetch", "web_search", "memory_search"]
    }
  ]
}
```

**字段说明**：

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | 是 | 唯一标识（如 `"coder"`, `"researcher"`） |
| `displayName` | 否 | 显示名称（用于 UI 和日志，默认等于 `id`） |
| `model` | 是 | 模型引用：`"primary"` 使用环境变量配置，其他值引用 `models.json` 中对应 `id` 的条目 |
| `systemPromptOverride` | 否 | 追加到系统提示词末尾的额外内容 |
| `workspaceDir` | 否 | Agent 专属 workspace 目录名（位于 `~/.star_sanctuary/agents/{workspaceDir}/`），默认等于 `id` |
| `toolsEnabled` | 否 | 是否启用工具（覆盖环境变量 `BELLDANDY_TOOLS_ENABLED`） |
| `toolWhitelist` | 否 | 可用工具白名单（仅列出的工具对该 Agent 可用） |
| `maxInputTokens` | 否 | 最大输入 token 数覆盖 |

> **💡 提示**：不创建 `agents.json` 时，系统只有一个 `"default"` Agent，使用环境变量中的配置，行为与之前完全一致。

#### 7.1.1 `toolWhitelist` 使用说明

`toolWhitelist` 用于限制某个 Agent **可见且可执行** 的工具集合。

当前版本中，它已经同时作用于两层：

- **工具下发阶段**：模型只能看到白名单中的工具定义
- **工具执行阶段**：即使模型尝试调用白名单外工具，也会被执行层拒绝

这意味着 `toolWhitelist` 现在是一个真正的 Agent 权限边界，而不只是提示用途。

#### 7.1.2 `toolWhitelist` 生效前提

要让 `toolWhitelist` 生效，需要满足以下条件：

1. 该 Agent 的 `toolsEnabled` 为 `true`
2. 目标工具已经在全局工具集中注册
3. 该工具没有被全局调用设置禁用
4. 该工具名存在于当前 Agent 的 `toolWhitelist` 中

判断顺序可以理解为：

1. 先看工具是否存在
2. 再看是否被全局禁用
3. 最后看当前 Agent 是否允许使用

只有三者都通过，工具才会真正可见、可执行。

#### 7.1.3 默认兼容策略

如果某个 Agent：

- 没有配置 `toolWhitelist`
- 或者配置了空数组

则当前实现按**不限制**处理，保持和旧版本兼容。

对 `default` Agent 也是同样规则：

- `default` 未配置 `toolWhitelist`：默认不限制
- `default` 配置了 `toolWhitelist`：严格按该列表限制

#### 7.1.4 推荐配置方式

建议按 Agent 职责拆分工具，而不是把所有工具都给每个 Agent。

例如：

- `coder`
  - 推荐保留：`file_read`、`file_write`、`apply_patch`、`run_command`、`log_read`
- `researcher`
  - 推荐保留：`web_fetch`、`web_search`、`memory_search`
- `default`
  - 可先不配 `toolWhitelist`，待职责稳定后再逐步收紧

这样可以降低模型误用工具的概率，也更利于后续安全控制。

#### 7.1.5 修改后如何生效

修改 `~/.star_sanctuary/agents.json` 后，需要**重启 Star Sanctuary Gateway / 主服务**，让 Agent Profile 重新加载。

如果你修改后没有看到效果，优先检查是不是还在使用旧进程。

#### 7.1.6 常见报错与排查

如果某个 Agent 调用了白名单外工具，通常会看到类似错误：

- `工具 file_write 不允许给 Agent "researcher" 使用`

如果工具被全局禁用，则通常会看到：

- `工具 file_write 已被禁用`

建议按以下顺序排查：

1. 该工具是否真的已经注册并启用
2. `toolsEnabled` 是否为 `true`
3. 工具是否被全局工具设置禁用
4. 工具名是否正确写入 `toolWhitelist`
5. 修改 `agents.json` 后是否已重启服务

#### 7.1.7 更完整示例

下面是一个更贴近实际使用的配置示例：

```json
{
  "agents": [
    {
      "id": "default",
      "displayName": "Star Sanctuary",
      "model": "primary",
      "toolsEnabled": true
    },
    {
      "id": "coder",
      "displayName": "代码专家",
      "model": "MiniMax-M2.5",
      "systemPromptOverride": "你是一个严谨的代码专家，专注于实现、调试和重构。",
      "toolsEnabled": true,
      "toolWhitelist": [
        "file_read",
        "file_write",
        "file_delete",
        "list_files",
        "apply_patch",
        "run_command",
        "log_read",
        "log_search",
        "memory_search"
      ]
    },
    {
      "id": "researcher",
      "displayName": "调研助手",
      "model": "kimi-k2.5-relay",
      "systemPromptOverride": "你是一个专业的调研助手，擅长搜索、整理和归纳信息。",
      "toolsEnabled": true,
      "toolWhitelist": [
        "web_fetch",
        "web_search",
        "memory_search"
      ]
    }
  ]
}
```

这个配置的效果是：

- `default` 继续保持通用模式
- `coder` 聚焦代码和文件操作
- `researcher` 聚焦检索和信息整理

### 7.2 Agent 专属工作区

每个非 default 的 Agent 可以拥有独立的人格文件。目录结构：

```
~/.star_sanctuary/
├── SOUL.md              # default Agent 的人格
├── IDENTITY.md
├── agents/
│   ├── coder/           # coder Agent 的专属目录
│   │   ├── SOUL.md      # 覆盖 default 的 SOUL
│   │   ├── IDENTITY.md  # 覆盖 default 的 IDENTITY
│   │   └── facets/      # coder 专属的 FACET 模组
│   │       └── strict.md
│   └── researcher/
│       └── SOUL.md
```

**继承规则**：对每个可继承文件（SOUL.md、IDENTITY.md、USER.md、AGENTS.md、TOOLS.md、MEMORY.md），优先从 `agents/{id}/` 读取；不存在则自动 fallback 到根目录的同名文件。

### 7.3 在 WebChat 中切换 Agent

配置了多个 Agent Profile 后，WebChat 界面顶部会出现 Agent 选择器。点击即可切换到不同的 Agent 进行对话，每个 Agent 的会话是隔离的。

也可以通过 WebSocket API 查询可用 Agent 列表：

```
方法: agents.list
返回: { agents: [{ id, displayName, model }, ...] }
```

### 7.4 飞书渠道绑定 Agent

可以为飞书渠道指定使用特定的 Agent Profile：

```env
# 飞书渠道使用 "researcher" Agent（默认使用 default）
BELLDANDY_FEISHU_AGENT_ID=researcher
```

### 7.5 子 Agent 编排 (Sub-Agent Orchestration)

当启用工具调用（`BELLDANDY_TOOLS_ENABLED=true`）且配置了 Agent Profile 后，Star Sanctuary 支持将复杂任务拆分并委托给子 Agent 执行。

**工作原理**：

1. 主 Agent 在 ReAct 循环中决定需要委托任务
2. 通过 `delegate_task` 或 `delegate_parallel` 工具发起委托
3. 子 Agent 在独立的会话中运行，完成后将结果返回给主 Agent
4. 主 Agent 汇总结果继续推理

**可用工具**：

| 工具 | 说明 |
|------|------|
| `delegate_task` | 委托单个任务给指定子 Agent。参数：`instruction`（必填）、`agent_id`（可选，默认 default）、`context`（可选） |
| `delegate_parallel` | 并行委托多个任务。参数：`tasks` 数组，每项包含 `instruction`、`agent_id`、`context` |
| `sessions_spawn` | 生成子 Agent 会话（底层工具，功能与 `delegate_task` 类似） |
| `sessions_history` | 查看当前会话的所有子 Agent 会话状态 |

**使用示例**（在对话中自然语言触发）：

| 你说的话 | Agent 做的事 |
|----------|-------------|
| "让 coder 帮我写一个排序算法" | 调用 `delegate_task`，委托给 coder Agent |
| "同时让 researcher 查资料、coder 写代码" | 调用 `delegate_parallel`，两个子 Agent 并行工作 |
| "查看子任务进度" | 调用 `sessions_history`，列出所有子 Agent 会话状态 |

**安全机制**：

- **并发限制**：同时运行的子 Agent 数量有上限（默认 3），超出的任务自动排队
- **队列限制**：排队任务数量有上限（默认 10），队列满时拒绝新任务
- **超时保护**：子 Agent 运行超时自动终止（默认 120 秒）
- **嵌套深度限制**：防止子 Agent 无限递归委托（默认最大深度 2）
- **生命周期钩子**：子 Agent 会话触发 `session_start` / `session_end` 钩子

### 7.6 子 Agent 环境变量

在 `.env.local` 中配置子 Agent 编排参数：

```env
# ------ 子 Agent 编排 ------

# 最大并发子 Agent 数量（默认 3）
BELLDANDY_SUB_AGENT_MAX_CONCURRENT=3

# 排队队列最大长度（默认 10，队列满时拒绝新任务）
BELLDANDY_SUB_AGENT_MAX_QUEUE_SIZE=10

# 子 Agent 运行超时（毫秒，默认 120000 即 2 分钟）
BELLDANDY_SUB_AGENT_TIMEOUT_MS=120000

# 最大嵌套深度（默认 2，防止无限递归）
BELLDANDY_SUB_AGENT_MAX_DEPTH=2

# 飞书渠道绑定的 Agent Profile ID（可选）
BELLDANDY_FEISHU_AGENT_ID=researcher
```

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `BELLDANDY_SUB_AGENT_MAX_CONCURRENT` | `3` | 同时运行的子 Agent 上限 |
| `BELLDANDY_SUB_AGENT_MAX_QUEUE_SIZE` | `10` | 排队等待的任务上限 |
| `BELLDANDY_SUB_AGENT_TIMEOUT_MS` | `120000` | 单个子 Agent 运行超时（ms） |
| `BELLDANDY_SUB_AGENT_MAX_DEPTH` | `2` | 子 Agent 嵌套委托最大深度 |
| `BELLDANDY_FEISHU_AGENT_ID` | — | 飞书渠道使用的 Agent Profile ID |

### 7.7 在对话中切换模型（运行时）

Star Sanctuary 支持在**不重启服务**的情况下，在 WebChat 对话中动态切换模型。该能力与 `models.json` 共用同一套模型配置。

#### 7.7.1 前置配置

1. 在 `.env.local` 配置主模型（Primary）：
```env
BELLDANDY_AGENT_PROVIDER=openai
BELLDANDY_OPENAI_BASE_URL=https://api.openai.com/v1
BELLDANDY_OPENAI_API_KEY=sk-xxxx
BELLDANDY_OPENAI_MODEL=gpt-5
```

2. 在 `~/.star_sanctuary/models.json` 配置可选模型（`id` 必须唯一）：
```json
{
  "fallbacks": [
    {
      "id": "kimi-k2.5",
      "displayName": "Kimi K2.5 (Moonshot)",
      "baseUrl": "https://api.moonshot.cn/v1",
      "apiKey": "sk-xxx",
      "model": "kimi-k2.5"
    },
    {
      "id": "claude-opus",
      "displayName": "Claude Opus 4.5",
      "baseUrl": "https://api.anthropic.com",
      "apiKey": "sk-ant-xxx",
      "model": "claude-opus-4-5",
      "protocol": "anthropic"
    }
  ]
}
```

3. 修改 `models.json` 后重启 Gateway（模型列表在启动时加载）：
```bash
corepack pnpm bdd restart
```

#### 7.7.2 WebChat 使用方式

1. 连接成功后，输入框区域会出现**模型下拉框**（仅有默认模型时会自动隐藏）。
2. 默认项显示为 `默认模型 (xxx)`，其中 `xxx` 来自当前 default Agent 的模型引用。
3. 选择目标模型后直接发送消息，本次请求将使用该模型。
4. 切回“默认模型”后，恢复使用 default Agent 自身配置的模型。

> 说明：模型切换是**按消息请求生效**的，不会要求重启，也不会影响其他已连接客户端。

#### 7.7.3 自定义客户端（WebSocket API）

查询模型列表：
```json
{ "type": "req", "id": "m1", "method": "models.list" }
```

返回示例：
```json
{
  "type": "res",
  "id": "m1",
  "ok": true,
  "payload": {
    "models": [
      { "id": "primary", "displayName": "gpt-5", "model": "gpt-5" },
      { "id": "kimi-k2.5", "displayName": "Kimi K2.5（默认）", "model": "kimi-k2.5" }
    ],
    "currentDefault": "kimi-k2.5"
  }
}
```

发送消息并指定模型：
```json
{
  "type": "req",
  "id": "msg-1",
  "method": "message.send",
  "params": {
    "text": "你好",
    "modelId": "kimi-k2.5"
  }
}
```

#### 7.7.4 回退与安全说明

- 当 `modelId` 不存在或为空时，会自动回退到默认模型。
- `models.list` 只返回 `id/displayName/model`，不会返回 `apiKey/baseUrl` 等敏感字段。


---

**第三部分：渠道与交互**

## 8. 管理命令（bdd CLI）

Star Sanctuary 提供了统一的 `bdd` 命令行工具，涵盖启动、配置、诊断、配对管理等所有操作。

```bash
# 查看完整命令树
corepack pnpm bdd --help

# 查看版本号
corepack pnpm bdd --version
```

所有命令支持以下全局选项：
- `--json` — 输出机器可读的 JSON 格式（适合脚本集成）
- `--state-dir <path>` — 覆盖默认的工作区目录（`~/.star_sanctuary`）
- `--verbose` — 显示详细输出

### 8.1 启动与运行

```bash
# 生产模式（带进程守护，崩溃自动重启）
cd E:\project\belldandy
corepack pnpm build
corepack pnpm bdd start

# 后台运行（Daemon 模式，适合服务器部署）
corepack pnpm build
corepack pnpm bdd start -d
# 或
corepack pnpm bdd start --daemon

# 开发模式（直接启动 Gateway，适合调试）
corepack pnpm bdd dev

# 查看 Gateway 运行状态
corepack pnpm bdd status

# 停止后台运行的 Gateway
corepack pnpm bdd stop

# 构建异常恢复（完整重建）
corepack pnpm rebuild
```

> **建议**：把 `pnpm build` 视为常规构建命令，把 `pnpm rebuild` 视为构建故障恢复命令。凡是出现模块找不到、声明文件缺失、工作区包入口异常，优先执行 `pnpm rebuild` 再继续排查。

#### 8.1.1 后台运行（Daemon 模式）

当你需要在服务器上长期运行 Star Sanctuary，或者希望关闭终端后服务继续运行时，可以使用 Daemon 模式。

**启动后台服务**：

```bash
corepack pnpm bdd start -d
```

启动成功后会显示：
```
✓ Gateway started in background (PID 12345)
  Log file: ~/.star_sanctuary/logs/gateway.log
  Stop with: bdd stop
```

**查看运行状态**：

```bash
corepack pnpm bdd status
```

输出示例：
```
Star Sanctuary Gateway Status

  ● Running
    PID:     12345
    Uptime:  2h 30m
    Log:     ~/.star_sanctuary/logs/gateway.log
    PID file: ~/.star_sanctuary/gateway.pid

  Stop with:  bdd stop
```

**停止后台服务**：

```bash
corepack pnpm bdd stop
```

**日志查看**：

Daemon 模式下，所有输出会重定向到日志文件：

```bash
# 实时查看日志
tail -f ~/.star_sanctuary/logs/gateway.log

# Windows PowerShell
Get-Content ~/.star_sanctuary/logs/gateway.log -Wait
```

**与前台模式的区别**：

| | 前台模式 (`bdd start`) | Daemon 模式 (`bdd start -d`) |
|---|----------------------|------------------------------|
| 终端关闭后 | 服务停止 | 服务继续运行 |
| 日志输出 | 直接显示在终端 | 写入 `~/.star_sanctuary/logs/gateway.log` |
| 适用场景 | 本地开发、调试 | 服务器部署、长期运行 |
| 停止方式 | `Ctrl+C` | `bdd stop` |

**跨平台说明**：

| 平台 | 行为 |
|------|------|
| Linux / macOS | 标准 daemon 进程，关闭终端后继续运行 |
| Windows | detached 模式可工作，但关闭终端窗口后进程可能被终止；生产部署建议使用 Windows Service 或 NSSM |

> **💡 提示**：如果你使用 Docker 部署，容器本身就是后台运行的，无需使用 Daemon 模式。详见 [3.5 Docker 部署](#35-docker-部署推荐用于生产环境)。

### 8.2 Setup 向导

首次使用或需要重新配置时，运行交互式向导：

```bash
# 交互式（推荐首次使用）
corepack pnpm bdd setup

# 非交互式（适合脚本化部署）
corepack pnpm bdd setup --provider openai --base-url <URL> --api-key <KEY> --model <MODEL>
```

### 8.3 健康诊断（Doctor）

检查系统环境和配置是否正常：

```bash
corepack pnpm bdd doctor
```

Doctor 会检查以下项目：
- Node.js 版本是否满我足要求
- pnpm 是否可用
- 工作区目录（`~/.star_sanctuary`）是否存在
- `.env.local` 是否存在且配置正确
- Agent Provider 配置（API Key、Base URL、Model）
- 端口是否可用
- Memory DB 是否可访问
- MCP 配置状态

```bash
# 额外测试模型连通性（会发送一个测试请求）
corepack pnpm bdd doctor --check-model
```

通过项显示绿色 ✓，失败项显示红色 ✗ 并附带修复建议，警告项显示黄色 ⚠。

#### 8.3.1 运行时诊断（高级）

`bdd doctor` 更像是“静态体检”，主要检查：

- 环境变量是否齐
- 目录、数据库、端口是否正常
- MCP 配置文件是否存在

如果你要排查“运行时为什么没生效”，当前还可以使用 WebSocket / RPC 里的 `system.doctor` 做“动态体检”。它会返回这些当前已经落地的运行态摘要：

- `memoryRuntime`
  - `Session Digest` 是否可用、是否被限流
  - `Durable Extraction` 是否可用、为什么不可用
  - `Team Shared Memory` 是否启用、secret guard 是否就绪
- `queryRuntime`
  - 最近 `message.send / api.message / webhook / workspace.* / tools.* / subtask.*` 的 lifecycle trace 摘要
- `mcpRuntime`
  - 最近失败、重连、恢复、大结果处理方式
- `extensionGovernance`
  - 安装账本层启用了多少扩展
  - 启动时实际加载了多少 marketplace 扩展
  - 运行时策略又禁用了多少 plugin / skill

简单理解：

- `bdd doctor`：看“配置有没有问题”
- `system.doctor`：看“现在这次运行到底发生了什么”

#### 8.3.2 会话调试与导出（P4 新增）

如果你要排查“某个具体会话为什么恢复成这样”、“压缩后到底保留了什么”、“最近导出过哪些 transcript / timeline”，当前可以直接使用 `bdd conversation` 这组命令：

```bash
# 列出当前可导出的会话
corepack pnpm bdd conversation list

# 按 conversationId 前缀筛选
corepack pnpm bdd conversation list --conversation-id-prefix conv- --limit 20

# 导出单会话 transcript bundle
corepack pnpm bdd conversation export --conversation-id <id> --output-dir ./artifacts

# 导出轻量 timeline
corepack pnpm bdd conversation timeline --conversation-id <id> --output-dir ./artifacts

# 查看最近真正落盘的导出记录
corepack pnpm bdd conversation exports --limit 20
```

当前这组命令适合做三件事：

- 看“有哪些会话可以导出”
- 看“最近导出了什么、导到哪里”
- 看“某个会话的 transcript / restore / timeline 调试投影”

补充说明：

- `conversation export` 支持 `internal / shareable / metadata_only` 三档导出模式
- `conversation timeline` 支持轻量 kind 过滤与文本/JSON 输出
- 最近导出索引只记录“真正写到文件”的导出，不记录 stdout 直接打印的内容

如果你走 RPC / WebSocket 集成，`system.doctor` 现在也支持按需挂载：

- `conversationDebug`
- `conversationCatalog`
- `recentConversationExports`

因此，`bdd doctor` 负责“系统体检”，`bdd conversation ...` 负责“具体会话复盘”，两者最好分开理解。

### 8.4 配置管理（Config）

无需手动编辑 `.env.local`，通过 CLI 直接读写当前实际 `envDir` 下的配置：

```bash
# 列出所有配置（敏感字段自动脱敏）
corepack pnpm bdd config list

# 显示明文（包含 API Key 等）
corepack pnpm bdd config list --show-secrets

# 读取单个配置项
corepack pnpm bdd config get BELLDANDY_OPENAI_MODEL

# 修改配置项（自动写入当前实际 envDir/.env.local）
corepack pnpm bdd config set BELLDANDY_PORT 28890

# 用编辑器打开当前实际 envDir/.env.local
corepack pnpm bdd config edit

# 显示当前实际 .env.local 文件路径
corepack pnpm bdd config path

# 预演迁移 legacy 根目录配置到状态目录
corepack pnpm bdd config migrate-to-state-dir --dry-run

# 正式迁移到状态目录
corepack pnpm bdd config migrate-to-state-dir
```

如果 `bdd doctor` 显示 `Legacy root env mode`，说明你当前仍在使用项目根目录旧配置，可以在合适时机使用上面的迁移命令。

### 8.5 配对管理（Pairing）

管理设备授权与配对：

```bash
# 查看已授权设备列表
corepack pnpm bdd pairing list

# 查看待批准的配对请求
corepack pnpm bdd pairing pending

# 批准配对请求
corepack pnpm bdd pairing approve <CODE>

# 撤销某设备的授权
corepack pnpm bdd pairing revoke <CLIENT_ID>

# 清理过期的配对请求
corepack pnpm bdd pairing cleanup
# 预览模式（不实际删除）
corepack pnpm bdd pairing cleanup --dry-run

# 导出配对数据（备份）
corepack pnpm bdd pairing export --out backup.json

# 导入配对数据（恢复）
corepack pnpm bdd pairing import --in backup.json
```

> **过渡兼容**：旧的 `corepack pnpm pairing:*` 写法仍可使用，内部已重定向到新 CLI。

### 8.6 浏览器 Relay

独立启动 WebSocket-CDP relay（用于浏览器自动化）：

```bash
# 使用默认端口 (28892)
corepack pnpm bdd relay start

# 指定端口
corepack pnpm bdd relay start --port 29000
```

## 9. 社区房间（多 Agent 协作）

Star Sanctuary 支持连接到官网社区服务（当前线上地址：`https://api.goddess-ai.top`），让多个 Agent 在同一个聊天室中协作交流。

### 9.1 配置社区连接

在 `~/.star_sanctuary/` 目录下创建 `community.json` 文件：

```json
{
  "endpoint": "https://api.goddess-ai.top",
  "agents": [
    {
      "name": "assistant",
      "apiKey": "your-api-key-here",
      "room": {
        "name": "room-123",
        "password": "optional-password"
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

**字段说明**：

| 字段 | 必填 | 说明 |
|------|------|------|
| `endpoint` | 是 | 社区服务地址（推荐填写 `https://api.goddess-ai.top`） |
| `agents` | 是 | Agent 配置列表，支持多个 Agent 同时连接不同房间 |
| `agents[].name` | 是 | Agent 名称（唯一标识） |
| `agents[].apiKey` | 是 | 社区服务的 API Key |
| `agents[].room` | 否 | 要加入的房间配置 |
| `agents[].room.name` | 是 | 房间名称 |
| `agents[].room.password` | 否 | 房间密码（如果房间需要） |
| `reconnect.enabled` | 否 | 是否启用自动重连（默认 true） |
| `reconnect.maxRetries` | 否 | 最大重连次数（默认 10） |
| `reconnect.backoffMs` | 否 | 重连间隔毫秒数（默认 5000） |

### 9.2 启动社区连接

配置完成后，重启 Gateway：

```bash
corepack pnpm bdd start
```

启动日志会显示：

```
[community] Starting community channel...
[community] Started with 1 agent(s)
[community] Agent 'assistant' connected to room room-123
```

### 9.3 多 Agent 同时连接

你可以配置多个 Agent 同时连接到不同的房间：

```json
{
  "endpoint": "https://api.goddess-ai.top",
  "agents": [
    {
      "name": "coder",
      "apiKey": "key-1",
      "room": {
        "name": "dev-room"
      }
    },
    {
      "name": "researcher",
      "apiKey": "key-2",
      "room": {
        "name": "research-room"
      }
    }
  ]
}
```

每个 Agent 会独立维护自己的 WebSocket 连接和会话状态，互不干扰。

### 9.4 动态加入房间

Agent 可以通过 `join_room` 工具在运行时动态加入社区房间，无需重启服务。

**使用方法**：直接在对话中告诉 Agent：

| 你说的话 | Agent 做的事 |
|----------|-------------|
| "加入房间 dev-room" | 调用 `join_room({ agent_name: "assistant", room_id: "dev-room" })` |
| "加入房间 secret-room，密码是 abc123" | 调用 `join_room({ agent_name: "assistant", room_id: "secret-room", password: "abc123" })` |

**工具参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `agent_name` | 是 | Agent 名称（必须在 `community.json` 中已配置且有 apiKey） |
| `room_name` | 是 | 要加入的房间名称 |
| `password` | 否 | 房间密码（如果房间需要） |

**加入房间的效果**：

1. **更新配置**：自动更新 `community.json` 中该 Agent 的 `room` 字段
2. **持久化保存**：配置写入磁盘，重启后自动重连该房间
3. **建立连接**：立即建立 WebSocket 连接到指定房间
4. **不影响其他 Agent**：其他已连接的 Agent 保持连接，不会断开

**与静态配置的区别**：

| | 静态配置（启动时） | 动态加入（运行时） |
|---|------------------|-------------------|
| **配置方式** | 手动编辑 `community.json` | 对话中自然语言指令 |
| **生效时机** | 需要重启 Gateway | 立即生效 |
| **影响范围** | 所有 Agent 重启 | 仅影响指定 Agent |
| **适用场景** | 初始配置 | 临时加入、测试房间 |

### 9.5 离开房间

Agent 可以通过 `leave_room` 工具主动离开当前房间。在对话中告诉 Agent：

| 你说的话 | Agent 做的事 |
|----------|-------------|
| "离开这个房间" | 调用 `leave_room` 工具，断开连接并清空房间配置 |
| "离开房间，告诉大家我要走了" | 调用 `leave_room({ farewell_message: "..." })`，发送告别消息后离开 |

**离开房间的效果**：

1. **发送告别消息**（可选）：在离开前向房间发送最后一条消息
2. **断开 WebSocket 连接**：关闭与社区服务的连接
3. **清空房间配置**：将 `community.json` 中该 Agent 的 `room` 字段设为空
4. **持久化配置**：保存到磁盘，重启后不会自动重连
5. **阻止自动重连**：即使网络波动也不会重新连接到该房间

**重新加入房间**：

离开后如需重新加入，可以使用 `join_room` 工具动态加入（见 9.4），或手动编辑 `~/.star_sanctuary/community.json` 重新配置 `room` 字段后重启 Gateway。

### 9.6 工作原理

- **连接管理**：每个 Agent 使用独立的 WebSocket 连接，连接状态以 `agentName` 为 key 存储
- **消息去重**：使用消息 ID 缓存（最近 1000 条）防止重复处理
- **自动重连**：网络断开时自动重连（可配置），使用指数退避策略
- **会话隔离**：每个房间的对话历史独立存储在 `~/.star_sanctuary/sessions/` 中

### 9.7 注意事项

- **API Key 安全**：`community.json` 包含敏感信息，请勿提交到版本控制系统
- **房间权限**：确保 API Key 有权限访问指定的房间
- **网络要求**：需要稳定的网络连接到社区服务端点
- **工具依赖**：`join_room` 和 `leave_room` 工具需要启用工具系统（`BELLDANDY_TOOLS_ENABLED=true`）

### 9.8 自部署 office server 转发 Gateway（`/api/message`）

如果你在本地部署了 `office.goddess.ai/server`，并由它把社区消息转发到 Star Sanctuary Gateway，现在需要使用 Bearer 鉴权。

> 说明：这是 **HTTP 转发 `/api/message`** 的兼容接入方式，适用于你自部署一套 `office.goddess.ai/server` 并反向调用本地 Gateway 的场景。
>
> 对于当前推荐的官网社区用法，Star Sanctuary 采用的是 **Gateway 主动连接官网社区服务** 的模式（见 9.1 ～ 9.7），不需要配置 `BELLDANDY_GATEWAY_URL`。
>
> token 消耗上传也与这里的 `/api/message` 转发解耦；token 上传请使用上面的 `BELLDANDY_TOKEN_USAGE_UPLOAD_*` 配置。

**Gateway 侧（当前实际 `envDir/.env` 或 `.env.local`；Docker / Compose 场景通常对应仓库根目录 `.env`）**：

```env
# 开启 /api/message 时，鉴权模式不能为 none
BELLDANDY_AUTH_MODE=token
# 开启 HTTP 社区入口
BELLDANDY_COMMUNITY_API_ENABLED=true
# 设置专用 token（推荐）
BELLDANDY_COMMUNITY_API_TOKEN=your-community-api-token
```

**office.goddess.ai server 侧（`office.goddess.ai/server/.env`）**：

```env
BELLDANDY_GATEWAY_URL=http://localhost:28889
BELLDANDY_COMMUNITY_API_TOKEN=your-community-api-token
```

要求两边 token 保持一致。`office.goddess.ai/server` 会自动在请求头携带：

```http
Authorization: Bearer <BELLDANDY_COMMUNITY_API_TOKEN>
```

如果 Gateway 未开启该接口，会返回 `API_DISABLED`；如果 token 不匹配，会返回 `401 UNAUTHORIZED`。
如果你把 `BELLDANDY_COMMUNITY_API_ENABLED=true` 与 `BELLDANDY_AUTH_MODE=none` 同时配置，Gateway 会在启动时直接拒绝启动。

### 9.9 Webhook API（外部系统触发）

Webhook API 允许外部系统（如 CI/CD、监控告警、定时任务）通过 HTTP POST 请求直接触发 Star Sanctuary Agent，无需 WebSocket 连接或聊天渠道。

#### 快速开始

**1. 创建配置文件**

在 `~/.star_sanctuary/webhooks.json` 创建配置：

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

**2. 生成安全 Token**

```bash
# Linux/macOS
openssl rand -hex 32

# Windows PowerShell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

**3. 重启 Gateway**

```bash
corepack pnpm bdd stop
corepack pnpm bdd start -d
```

#### 调用示例

```bash
curl -X POST http://127.0.0.1:28889/api/webhook/ci-alert \
  -H "Authorization: Bearer your-secure-token-here" \
  -H "Content-Type: application/json" \
  -H "X-Idempotency-Key: unique-event-id-12345" \
  -d '{
    "text": "CI 构建失败，请检查日志",
    "payload": {
      "project": "belldandy",
      "branch": "main",
      "status": "failed"
    }
  }'
```

**响应示例：**

```json
{
  "ok": true,
  "payload": {
    "webhookId": "ci-alert",
    "conversationId": "webhook:ci-alert:2026-03-01",
    "response": "收到，我来帮你分析这次构建失败。"
  }
}
```

### 9.10 官网生态工具

除了房间连接与 `/api/message`，当前项目还内置了一整套官网生态工具，适合已经接入社区生态的用户。

#### 9.10.1 前置条件

1. 先通过 `bdd community` 或手工维护 `~/.star_sanctuary/community.json`
2. 在 `community.json` 中为某个 Agent 配置有效的 `apiKey`
3. 如需下载 / 上传文件，可在该 Agent 的 `office` 字段里配置：
   - `downloadDir`
   - `uploadRoots`

#### 9.10.2 当前已落地的两类能力

**A. Workshop 工坊工具**

支持：

- 搜索作品
- 查看作品详情
- 下载作品到本地目录
- 发布作品
- 查看“我的作品”
- 更新作品信息
- 删除作品

**B. Homestead 家园工具**

支持：

- 查看家园详情
- 查看仓库物品
- 领取家园
- 放置物品
- 回收物品
- 挂载 / 拆卸装饰物
- 打开盲盒

#### 9.10.3 适合怎么用

- 让 Agent 帮你把本地技能 / 方法发布到工坊
- 在社区房间里直接驱动工坊内容下载与管理
- 管理与查看自己在 Town Square / Homestead 中的资产与摆放状态

> **说明**：这部分主要通过内置工具供 Agent 调用，并不等于 WebChat 中已经有完整的图形化后台；更适合“让 Agent 帮你完成操作”的工作流。

## 10. 飞书渠道（手机可用）

除了 WebChat，你还可以通过飞书与 Star Sanctuary 对话——无需公网 IP 或内网穿透！

### 10.1 配置飞书

详细配置步骤请参考 [飞书对接说明](./Star%20Sanctuary渠道对接说明.md)。

简要步骤：
1. 在 [飞书开放平台](https://open.feishu.cn/) 创建企业自建应用
2. 获取 App ID 和 App Secret
3. 开启机器人能力并配置权限
4. 设置事件订阅为"长连接模式"
5. 发布应用

### 10.2 配置 Star Sanctuary

在 `.env.local` 中添加：

```env
BELLDANDY_FEISHU_APP_ID=cli_xxxxxxxxxxxxxxxx
BELLDANDY_FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 10.3 使用

1. 启动 Gateway：`corepack pnpm dev:gateway`
2. 终端显示 `Feishu WebSocket Channel started.` 和 `ws client ready` 说明连接成功
3. 打开飞书，搜索你的应用名称，开始对话！

### 10.4 渠道架构说明

Star Sanctuary 当前已经落地统一的 Channel 架构：

- **统一接口**：飞书、QQ、Discord、Community 都通过统一的 Channel 抽象接入
- **Channel Router**：可按渠道、会话、发送者、关键词、是否被 @ 等条件路由到不同 Agent
- **ConversationStore 复用**：多渠道共享同一套对话 / 记忆 / 工具体系
- **Agent Resolver**：渠道侧可按命中的规则切换到不同 Agent Profile

**当前已实现的渠道**：

- ✅ Feishu
- ✅ QQ
- ✅ Discord
- ✅ Community（官网社区房间长连接）

> **开发者注意**：如果你要扩展新渠道，请参考 `packages/belldandy-channels/src/types.ts` 与现有 `feishu.ts / qq.ts / discord.ts / community.ts` 的实现方式。

### 10.5 Channels 路由引擎（Router MVP）

`Router MVP` 已落地，可用于：

- 群聊 mention gating（未被 @ 时不触发）
- 按关键词路由到不同 Agent
- 按渠道/会话/发送者规则做 allow/deny

#### 10.5.1 环境变量

在 `.env.local` 中添加：

```env
# 开启路由引擎（默认 false）
BELLDANDY_CHANNEL_ROUTER_ENABLED=true

# 路由配置文件路径
BELLDANDY_CHANNEL_ROUTER_CONFIG_PATH=~/.star_sanctuary/channels-routing.json

# 默认 Agent（规则未指定 agentId 时使用）
BELLDANDY_CHANNEL_ROUTER_DEFAULT_AGENT_ID=default
```

#### 10.5.2 路由配置文件

创建 `~/.star_sanctuary/channels-routing.json`：

```json
{
  "version": 1,
  "defaultAction": {
    "allow": true,
    "agentId": "default"
  },
  "rules": [
    {
      "id": "discord-mention-only",
      "enabled": true,
      "priority": 100,
      "match": {
        "channels": ["discord"],
        "chatKinds": ["channel"],
        "mentionRequired": true
      },
      "action": {
        "allow": true,
        "agentId": "default"
      }
    },
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

#### 10.5.3 当前渠道行为

- Discord：频道消息按 `message.mentions` 判断是否 @ 到 bot；DM 默认可触发
- QQ：`GROUP_AT_MESSAGE_CREATE` 视为已 mention；DM 默认可触发
- Feishu：DM 默认可触发；群聊按消息中的 mention 信息和文本 at 特征判断

#### 9.5.4 启用与验证

1. 保存 `.env.local` 与 `channels-routing.json`
2. 重启 Gateway：`corepack pnpm bdd start`（或 `corepack pnpm dev:gateway`）
3. 查看日志中的 `channel-router` 决策输出（`allow/reason/matchedRuleId/agentId`）

#### 9.5.5 回滚

- 立即回滚：`BELLDANDY_CHANNEL_ROUTER_ENABLED=false` 后重启 Gateway
- 软回滚：保留开关开启，但将 `rules` 置空，仅使用 `defaultAction`

> 详细字段说明见：[channels-routing.md](./docs/channels-routing.md)



### 10.6 QQ / Discord 最小配置

如果你要把 Star Sanctuary 接入 QQ 或 Discord，可使用以下最小配置：

#### QQ

```env
BELLDANDY_QQ_APP_ID=xxxxxxxx
BELLDANDY_QQ_APP_SECRET=xxxxxxxx
BELLDANDY_QQ_AGENT_ID=default
BELLDANDY_QQ_SANDBOX=true
```

说明：

- `BELLDANDY_QQ_AGENT_ID` 用于指定默认 Agent Profile
- `BELLDANDY_QQ_SANDBOX=true` 适合先在沙箱环境联调
- QQ 群聊中的 `GROUP_AT_MESSAGE_CREATE` 会被视作明确 @ 提及

#### Discord

```env
BELLDANDY_DISCORD_ENABLED=true
BELLDANDY_DISCORD_BOT_TOKEN=your-discord-bot-token
```

说明：

- Discord 频道消息支持按 mention 与 Router 规则做 gating
- DM 默认可直接触发
- 长消息会按 Discord 单条长度限制自动分段发送

如果你希望“群聊只在被 @ 时触发”或“报警消息自动路由到 ops Agent”，推荐同时开启 10.5 节的 Router 配置。

## 11. 语音交互 (Voice Interaction)

### 11.1 语音输入 (STT)

Star Sanctuary 支持双向语音交互：你可以直接对它说话，它也会用语音回复你。

#### 11.1.1 网页端 (WebChat)

在聊天输入框右侧，你会看到一个新的 **🎤 麦克风图标**。

1.  **点击麦克风**：图标变红并伴有脉冲动画，表示正在录音。
2.  **说话**：直接说出你的指令或问题。
3.  **再次点击**：结束录音。
4.  **发送**：
    *   系统会自动将录音上传到后台进行高精度转写 (STT)。
    *   转换后的文字会自动填入输入框（或直接发送）。
    *   Agent 接收到的是你的**语音 + 文字**，它会理解你的语调并回复。

> **🌟 双模引擎**：
> *   **Mode A (默认)**：录音上传服务器，使用 Whisper/Paraformer 转写。精度高，支持长语音。
> *   **Mode B (离线/备用)**：如果服务器 STT 未配置或断网，会自动降级使用浏览器原生的 Web Speech API 进行实时识别。

#### 11.1.2 飞书端 (Feishu)

在飞书手机 App 或桌面端，你可以像给朋友发微信语音一样给 Star Sanctuary 发消息：

1.  按住说话，发送语音条。
2.  Star Sanctuary 会自动识别语音内容（转写文字回显在日志中）。
3.  它会以文字（或语音，如果开启了 TTS）回复你。

> **注意**：飞书语音识别依赖 `stt-transcribe` 能力，请确保服务端已配置有效的 `BELLDANDY_STT_PROVIDER`。


### 11.2 语音输出 (TTS)

让 Star Sanctuary 开口说话！支持免费且高质量的 Edge TTS（微软晓晓/云希）。

#### 11.2.1 快速开启/关闭

无需配置复杂文件，直接在对话中对 Agent 说：

*   **开启语音**：对它说 "开启语音模式" 或 "我想听你说话"。
    *   Agent 会自动进入 TTS 模式，每条回复都会附带语音播放器。
*   **关闭语音**：对它说 "关闭语音" 或 "太吵了"。
    *   Agent 会立即停止生成音频。
*   **或是在.env文件中启用语音模式**：服务端自动将 Agent 回复转为语音，true/false，默认 false
    *   `BELLDANDY_TTS_ENABLED=false`

> **原理**：Agent 会在你的工作区目录创建/删除一个名为 `TTS_ENABLED` 的信号文件。

#### 11.2.2 进阶配置

默认使用 **Edge TTS**（免费）。如果你想使用 **OpenAI TTS**（付费但声线不同），可以通过调用工具时指定参数，或者让 Agent 帮你设置。

**支持的声音（Edge TTS - 推荐）**：
*   `zh-CN-XiaoxiaoNeural` (晓晓 - 温暖女声)
*   `zh-CN-YunxiNeural` (云希 - 干练男声)
*   `en-US-AriaNeural` (Aria - 通用女声)

---
## 12. 视觉感知 (Loopback Vision)

让 Star Sanctuary 拥有“眼睛”，可以看到你通过宿主机 webcam 看到的画面。

### 12.1 原理简介 (Loopback Vision)

这是一种“回环视觉”技术：
1.  Agent 指挥浏览器打开一个镜像页面（Mirror Page）。
2.  该页面调用你的本地摄像头显示画面。
3.  Agent 对该页面进行截图，从而“看到”了画面。

### 12.2 如何使用

**前提条件**：必须先完成 **14. 浏览器自动化** 的连接步骤（安装插件并连接）。

#### 方法 A：使用内置技能 (推荐)

直接对 Star Sanctuary 说：

> **"拍张照"** 或 **"看看我现在在哪"** 或 **"启动视觉"**

Agent 会自动调用 `camera_snap` 工具：
1.  自动打开 `/mirror.html` 页面。
2.  **关键步骤**：此时浏览器会弹窗提示“允许使用摄像头？”，**请务必点击【允许】**。
3.  等待 2 秒（你可以调整姿势）。
4.  完成拍摄并进行分析。

#### 方法 B：手动操作 (硬核模式)


如果你想体验控制感，可以手动指挥 Agent：

1.  **"打开镜像页"** -> Agent 导航至 `http://.../mirror.html`。
2.  **"允许摄像头"** -> 你手动在浏览器点击允许。
3.  **"现在截图"** -> Agent 截图并分析。


---

**第四部分：高级功能**

## 13. 高级配置

### 13.1 工具权限与策略

Star Sanctuary 的工具系统默认处于 **Safe Mode**，并可通过策略文件进行精细化控制：

- **文件读写范围**：默认只允许工作区内读写，敏感文件（如 `.env` / `SOUL.md`）受保护。
- **`file_write` 能力**：支持 `overwrite/append/replace/insert`，可按行号或正则替换；默认自动创建目录；在非 Windows 下写入 `.sh` 会自动 `chmod +x`。
- **多工作区**：可通过 `BELLDANDY_EXTRA_WORKSPACE_ROOTS` 追加可读写根目录，实现跨项目协作。
- **系统命令**：白名单执行 + 非交互参数注入 + 快速/构建命令分级超时（5s/300s）+ 超时强制 kill；危险参数（如 `rm -r/-rf`、`del /s /q`）会被拦截。
- **策略覆盖**：通过 `BELLDANDY_TOOLS_POLICY_FILE` 指定 JSON 策略文件，覆盖默认策略（示例见 `.env.example`）。**未设置该变量时，`extraSafelist` 不生效。**

推荐优先直接使用仓库内置的三挡策略示例：

- `config/tools-policy.strict.json`：最保守档
  适合只在本机使用、只希望保留极小写入面和少量外网访问的场景。
- `config/tools-policy.balanced.json`：平衡推荐档
  适合作为默认开发配置；允许常见代码/文档写入，仍保持对高风险命令和域名的收敛。
- `config/tools-policy.open.json`：受控开放档
  适合需要浏览器自动化、MCP、更多外部集成或更大执行面的场景，但仍保留黑名单与边界约束。

默认推荐：

- 如果你不确定选哪一个，先用 `balanced`
- 如果你准备开启 `BELLDANDY_DANGEROUS_TOOLS_ENABLED=true`、Community API、Webhook、浏览器自动化或跨目录工作区，再考虑 `open`
- 如果机器上有敏感资料，或者只是单机轻量使用，优先 `strict`

可选配置示例（添加到 `.env.local`或`.env`）：

```env
# 工具策略文件（JSON）
# 推荐直接指向仓库内置的三挡示例之一
BELLDANDY_TOOLS_POLICY_FILE=E:\project\star-sanctuary\config\tools-policy.balanced.json

# 工具分组加载（建议按需，不要长期 all）
# 当前运行时会默认先注入 core tools + tool_search；
# 已启用分组中的非核心工具会先以目录形式出现，Agent 需要通过 tool_search 选择后，完整 schema 才会在后续轮次进入上下文
# BELLDANDY_TOOL_GROUPS=browser,methodology,system

# 额外允许的工作区根目录（多项目协作）
BELLDANDY_EXTRA_WORKSPACE_ROOTS=E:\projects,D:\workspace
```

如果你同时开启了浏览器自动化，建议把浏览器访问范围也一起收紧：

```env
BELLDANDY_BROWSER_RELAY_ENABLED=true
BELLDANDY_RELAY_PORT=28892
BELLDANDY_BROWSER_ALLOWED_DOMAINS=github.com,developer.mozilla.org,docs.example.com
BELLDANDY_BROWSER_DENIED_DOMAINS=mail.google.com,drive.google.com,onedrive.live.com
```

> 说明：浏览器 Relay 默认只监听本机，但浏览器工具默认不限制目标站点；因此开启浏览器自动化时，建议同时配置 `BELLDANDY_BROWSER_ALLOWED_DOMAINS` / `BELLDANDY_BROWSER_DENIED_DOMAINS`。

进一步阅读建议：

- [安全变量配置建议方案.md](./docs/安全变量配置建议方案.md)
  用来确定 `HOST / AUTH / COMMUNITY_API / TOOLS_POLICY / EXTRA_WORKSPACE_ROOTS / 浏览器域名限制` 这些真正影响安全边界的变量。
- [记忆与token变量配置建议方案.md](./docs/记忆与token变量配置建议方案.md)
  用来确定 Embedding、自动召回、记忆摘要、压缩和 token 上限等运行成本与体验平衡。

建议顺序：

1. 先按“安全变量配置建议方案”选定安全档位
2. 再按“记忆与token变量配置建议方案”决定记忆与 token 档位
3. 最后把两套配置合并进 `.env.local` 或 `.env`

### 13.1.1 可视化工具管理 (Tool Settings)

除了通过环境变量和策略文件进行全局控制外，Star Sanctuary 还提供了**可视化的工具管理面板**，允许你在运行时动态启用或禁用特定的工具、MCP 服务器或插件。

1.  在 WebChat 界面顶部，点击 **工具设置图标** (🛠️)。
2.  面板分为三类：
    -   **Builtin Tools**：内置工具（如 `web_fetch`, `file_read`）。
    -   **MCP Servers**：已连接的 MCP 服务（如 `filesystem`, `github`）。
    -   **Plugins**：已加载的插件。
3.  点击开关即可实时启用/禁用。修改后的状态会自动持久化保存，重启后依然生效。

> **应用场景**：当你希望暂时禁止 Agent 联网，或者在调试某个 MCP 服务时通过禁用其他服务来排除干扰。

需要注意当前已经形成了“两层治理”：

- **安装账本层**
  - 由 `marketplace enable / disable` 控制
  - 决定某个 marketplace-installed extension 是否会在下次启动时进入宿主加载链
- **运行时策略层**
  - 由工具设置面板控制
  - 决定已经加载进来的 builtin / MCP / plugin / skill 当前是否对 Agent 可见

所以如果你遇到“明明安装了，为什么现在不能用”，建议按这个顺序排查：

1. 先看 marketplace 安装状态是不是 `enabled`
2. 再看运行时工具设置有没有把它禁掉
3. 最后再看 `system.doctor` 中的 `extensionGovernance` 是卡在安装层、宿主加载层，还是 runtime policy 层

### 13.1.2 Prompt 装配实验与附加 System Prompt

这组变量用于调整 Agent 最终看到的 system prompt 结构。它们都不是“必填基础配置”，更适合在你明确要做 prompt 实验、诊断或局部定制时使用。

如果你只是想稳定使用当前主线能力，当前推荐值是全部保持空值：

```env
BELLDANDY_PROMPT_EXPERIMENT_DISABLE_SECTIONS=
BELLDANDY_PROMPT_EXPERIMENT_SECTION_PRIORITY_OVERRIDES=
BELLDANDY_PROMPT_EXPERIMENT_DISABLE_TOOL_CONTRACTS=
BELLDANDY_OPENAI_SYSTEM_PROMPT=
```

为什么默认推荐留空：

- 这能保持当前仓库已经验证过的默认 prompt 结构
- 不会意外改变 section 排序、截断顺序或模型看到的工具行为指引
- 适合作为“稳定基线”，之后若要做 A/B 对比，也更容易回滚

#### `BELLDANDY_PROMPT_EXPERIMENT_DISABLE_SECTIONS`

作用：

- 按 `section.id` 禁用某些 system prompt 段落

填写格式：

- 多个值用英文逗号分隔
- 不要加引号
- 留空表示不禁用任何 section

示例：

```env
BELLDANDY_PROMPT_EXPERIMENT_DISABLE_SECTIONS=methodology,context
```

当前常见可用的 section id 包括：

- `core`
- `workspace-agents`
- `workspace-soul`
- `workspace-user`
- `workspace-identity`
- `workspace-tools`
- `workspace-memory`
- `skills`
- `workspace-bootstrap`
- `context`
- `extra`
- `methodology`
- `workspace-dir`
- 运行时附加段：
  - `tool-behavior-contracts`
  - `tts-mode`
  - `profile-override`

建议：

- 非实验场景下保持空值
- 不建议禁用 `core`
- 若你只是想临时观察某段对 prompt 体积或行为的影响，再短期开这个开关

#### `BELLDANDY_PROMPT_EXPERIMENT_SECTION_PRIORITY_OVERRIDES`

作用：

- 覆盖指定 section 的优先级
- 数字越小越靠前，越不容易在 `BELLDANDY_MAX_SYSTEM_PROMPT_CHARS` 截断时被丢掉

填写格式：

- `sectionId:priority`
- 多个条目用英文逗号分隔
- priority 使用整数

示例：

```env
BELLDANDY_PROMPT_EXPERIMENT_SECTION_PRIORITY_OVERRIDES=methodology:5,extra:150
```

含义：

- `methodology:5`
  - 把 `methodology` 提到更靠前的位置
- `extra:150`
  - 把 `extra` 放得更靠后，更容易在截断时被丢掉

建议：

- 默认保持空值
- 如果你没有在做 prompt 截断优化或优先级实验，不建议常开

#### `BELLDANDY_PROMPT_EXPERIMENT_DISABLE_TOOL_CONTRACTS`

作用：

- 禁用给模型看的 tool behavior contract

注意：

- 它影响的是“模型看到的工具行为提示”，不是底层安全策略本身
- 关闭后会同时影响：
  - 模型请求中的可见 tool definitions
  - prompt 中注入的 contract 摘要
  - `inspect` / `tools.list` / `doctor` 中的 contract observability

填写格式：

- 按工具名填写
- 多个工具用英文逗号分隔
- 留空表示不禁用任何 tool contract

当前已覆盖的 contract 名包括：

- `run_command`
- `apply_patch`
- `delegate_task`
- `file_write`
- `file_delete`
- `delegate_parallel`

示例：

```env
BELLDANDY_PROMPT_EXPERIMENT_DISABLE_TOOL_CONTRACTS=apply_patch,run_command
```

建议：

- 当前默认保持空值
- 只有在你明确要做“关闭某个 contract 观察行为变化”的实验时再填写

#### `BELLDANDY_OPENAI_SYSTEM_PROMPT`

作用：

- 在现有 workspace/system prompt 之后，额外追加一段 deployment 级 system prompt

适合填写的内容：

- 简短、稳定、不会频繁变化的附加规则
- 例如部署环境要求、回复语言约束、额外格式偏好

示例：

```env
BELLDANDY_OPENAI_SYSTEM_PROMPT=请默认使用简体中文回复，除非用户明确要求其他语言。
```

再比如：

```env
BELLDANDY_OPENAI_SYSTEM_PROMPT=输出优先给可执行结果，避免长篇方法论解释。
```

不建议这样使用：

- 把整份 `AGENTS.md` / `SOUL.md` 再复制进去
- 写很长、很多层的规则
- 填与现有 prompt 明显冲突的要求

当前推荐：

- 保持空值

原因：

- 当前仓库默认 prompt 体系已经比较完整
- 再追加一层容易重复、增 token、制造规则冲突

#### 推荐使用方式

1. 日常稳定使用：
   - 这 4 个变量全部留空
2. 想做 prompt 结构实验：
   - 优先只改一个变量
   - 改完后用 `agents.prompt.inspect`、`bdd conversation prompt-snapshot`、`bdd doctor` 对比效果
3. 想做部署级补充规则：
   - 优先只填 `BELLDANDY_OPENAI_SYSTEM_PROMPT`
   - 保持 1 到 3 句，避免写成长文
4. 想回滚：
   - 直接把值清空即可

### 13.2 模型容灾配置 (Model Failover)

当主模型因限流 (429)、余额不足 (402)、服务器故障 (5xx) 或超时等问题不可用时，Star Sanctuary 可以 **自动切换到备用模型**，保证不中断服务。

> `models.json` 不仅用于容灾，也用于 WebChat/WS 的**运行时模型切换**（见 [7.7 在对话中切换模型（运行时）](#77-在对话中切换模型运行时)）。

**快速开始**：在 `~/.star_sanctuary/` 目录下创建 `models.json` 文件：

```json
{
  "fallbacks": [
    {
      "id": "deepseek-backup",
      "baseUrl": "https://api.deepseek.com",
      "apiKey": "sk-your-deepseek-key",
      "model": "deepseek-chat"
    }
  ]
}
```

可在 `fallbacks` 数组中添加多个备用 Profile，系统会按顺序尝试。

**配置说明**：

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | 否 | 标识名称，用于日志显示（如 `deepseek-backup`） |
| `displayName` | 否 | 模型显示名（用于 WebChat 模型下拉展示） |
| `baseUrl` | 是 | API 服务地址（OpenAI 协议兼容） |
| `apiKey` | 是 | 该服务的 API Key |
| `model` | 是 | 模型名称（如 `deepseek-chat`、`gpt-4o`） |
| `protocol` | 否 | 协议类型（如 `openai`、`anthropic`），不填则继承全局配置 |

> 说明：`models.json` 当前用于模型路由/容灾/运行时切换，不用于声明多模态能力。无需添加 `modalities`、`supports` 或 `type=image_url` 之类字段。

**环境变量**：

```env
# 自定义配置文件路径（默认 ~/.star_sanctuary/models.json）
BELLDANDY_MODEL_CONFIG_FILE=E:\\config\\my-models.json
```

**工作原理**：

1. 每次 AI 调用时，先尝试 `.env` 中的 **主模型**。
2. 若主模型返回可重试错误（429/5xx/超时），自动切换到 `models.json` 中的 **第一个备用 Profile**。
3. 若该备用也失败，继续尝试 **下一个备用**，直到成功或全部失败。
4. 失败的 Profile 会进入 **冷却期**（限流 2 分钟，余额不足 10 分钟），冷却期间自动跳过。
5. **不可重试错误**（如 400 请求格式错误）不会触发切换——因为换 Provider 也解决不了。

**优先级顺序**：严格按 `fallbacks` 数组顺序，从上到下依次尝试：

```
.env 主模型 (Primary) → fallbacks[0] → fallbacks[1] → fallbacks[2] → ...
```

**多模型配置示例**：

```json
{
  "fallbacks": [
    { "id": "kimi-k2.5",     "baseUrl": "https://api.moonshot.cn/v1", "apiKey": "sk-...", "model": "kimi-k2.5" },
    { "id": "deepseek-chat", "baseUrl": "https://api.deepseek.com",   "apiKey": "sk-...", "model": "deepseek-chat" },
    { "id": "ollama-local",  "baseUrl": "http://127.0.0.1:11434/v1",  "apiKey": "ollama", "model": "llama3" }
  ]
}
```

> **⚡ Cooldown 机制**：已知故障的 Profile 会被标记冷却并自动跳过（不浪费时间重试），冷却结束后自动恢复参与轮询。

> **💡 提示**：不创建 `models.json` 时，Star Sanctuary 的行为与之前完全一致（仅使用 `.env` 中的单一配置），完全向后兼容。

### 13.3 对话压缩 (Context Compaction)

当你与 Star Sanctuary 进行长时间对话或让它执行复杂的自动化任务时，对话历史会不断增长，最终可能超出模型的上下文窗口限制。**对话压缩**功能会自动将旧消息摘要化，在保留关键信息的同时大幅减少 token 消耗。

#### 工作原理

Star Sanctuary 采用**三层渐进式压缩**架构：

```
┌─────────────────────────────────────────────┐
│  Tier 0: System Prompt（固定，不压缩）       │
├─────────────────────────────────────────────┤
│  Tier 1: Archival Summary（归档摘要）        │
│  ← 当 Rolling Summary 过大时进一步浓缩      │
├─────────────────────────────────────────────┤
│  Tier 2: Rolling Summary（滚动摘要）         │
│  ← 旧消息增量合入此摘要                     │
├─────────────────────────────────────────────┤
│  Tier 3: Working Memory（最近 N 条完整消息） │
│  ← 当前正在处理的"热"上下文                 │
└─────────────────────────────────────────────┘
```

- **Working Memory**：保留最近 N 条消息的完整内容（默认 10 条）。
- **Rolling Summary**：当 Working Memory 溢出时，溢出的消息不会丢弃，而是由模型生成增量摘要合入此层。每次只处理新溢出的消息，不会从头重新生成。
- **Archival Summary**：当 Rolling Summary 本身过大时（默认超过 2000 token），会被进一步压缩为超浓缩版本，只保留最终结论、用户偏好和关键决策。

**压缩在三个时机触发**：
1. **请求前**：每次你发送消息时，Gateway 检查历史 token 是否超过阈值。
2. **ReAct 循环内**：Agent 执行工具调用链时，每次调用模型前检查上下文使用比例，防止长工具链撑爆上下文。
3. **手动命令**：在 WebChat 中输入 `/compact`，立即执行压缩（跳过阈值检查）。

**降级策略**：如果模型摘要调用失败（超时、服务不可用等），会自动降级为文本截断摘要（每条消息取前 200 字符），确保不会因为压缩失败而阻塞对话。

#### 环境变量

在 `.env.local` 或 `.env` 中配置：

```env
# ------ 对话压缩（Compaction） ------

# 是否启用上下文自动压缩（默认 true）
# BELLDANDY_COMPACTION_ENABLED=true

# 触发压缩的 token 阈值（默认 12000）
# 当历史消息的估算 token 数超过此值时触发压缩
# 建议 Anthropic 模型设 8000，OpenAI 模型设 20000
BELLDANDY_COMPACTION_THRESHOLD=20000

# 压缩时保留最近几条消息原文（默认 10）
# 这些消息不会被摘要化，保持完整内容
BELLDANDY_COMPACTION_KEEP_RECENT=10

# ReAct 循环内压缩触发比例（默认 0.75）
# 当上下文使用量达到 MAX_INPUT_TOKENS 的 75% 时触发循环内压缩
# 需配合 BELLDANDY_MAX_INPUT_TOKENS 使用
# BELLDANDY_COMPACTION_TRIGGER_FRACTION=0.75

# Rolling Summary 归档阈值（默认 2000 token）
# 当滚动摘要超过此值时，触发归档压缩（进一步浓缩）
# BELLDANDY_COMPACTION_ARCHIVAL_THRESHOLD=2000

# 预警阈值（默认约为 compaction threshold 的 70%）
# 进入预警区后，doctor / runtime 观测会提示当前会话正在逼近压缩或阻断线
# BELLDANDY_COMPACTION_WARNING_THRESHOLD=

# 阻断阈值（默认约为 compaction threshold 的 90%）
# 用于高风险超长上下文保护，避免请求在明显不可恢复状态下继续硬冲
# BELLDANDY_COMPACTION_BLOCKING_THRESHOLD=

# 连续 compaction 失败熔断阈值（默认 3）
# 达到后会暂时熔断自动压缩，防止每轮都重复触发失败摘要请求
# BELLDANDY_COMPACTION_MAX_CONSECUTIVE_FAILURES=3

# Prompt-too-long 重试次数（默认 2）
# 当摘要请求自身因为输入过长失败时，允许 runtime 做有限次裁剪重试
# BELLDANDY_COMPACTION_MAX_PTL_RETRIES=2

# 摘要专用模型（可选，不设则复用主模型）
# 建议使用便宜/快速的模型以降低成本
# BELLDANDY_COMPACTION_MODEL=gpt-4o-mini

# 摘要专用 API 地址（可选，不设则复用主模型的 BASE_URL）
# 当摘要模型与主模型不在同一服务商时需要配置
# BELLDANDY_COMPACTION_BASE_URL=https://api.openai.com/v1

# 摘要专用 API 密钥（可选，不设则复用主模型的 API_KEY）
# BELLDANDY_COMPACTION_API_KEY=sk-xxx
```

#### 配置建议

| 场景 | 推荐配置 |
|------|----------|
| 日常对话 | 默认配置即可，无需修改 |
| 长时间自动化任务 | `THRESHOLD=20000`，`KEEP_RECENT=10`，配置专用摘要模型 |
| 使用中转代理（输入受限） | `THRESHOLD=8000`，`KEEP_RECENT=6`，`MAX_INPUT_TOKENS=20000` |
| 想减少失败重试和超长上下文抖动 | 补 `WARNING_THRESHOLD / BLOCKING_THRESHOLD / MAX_CONSECUTIVE_FAILURES / MAX_PTL_RETRIES` |
| 主模型是 Anthropic，想用 OpenAI 做摘要 | 设置 `COMPACTION_MODEL`、`COMPACTION_BASE_URL`、`COMPACTION_API_KEY` 三项 |
| 不想使用压缩 | `BELLDANDY_COMPACTION_ENABLED=false` |

#### 压缩状态持久化

每个会话的压缩状态（滚动摘要、归档摘要等）会自动保存到 `~/.star_sanctuary/sessions/{会话ID}.compaction.json`。这意味着即使 Star Sanctuary 重启，之前的摘要也不会丢失。

#### 手动触发压缩

除了自动压缩外，你也可以随时在 WebChat 输入框中输入斜杠命令手动触发：

```
/compact
```

执行后会立即对当前会话的上下文进行压缩（跳过 token 阈值检查），并显示压缩结果：

- 压缩成功时：显示压缩层级（rolling / archival）以及压缩前后的 token 数
- 历史过短时：提示"当前上下文较短，无需压缩"

适用场景：
- 对话已经很长，但还没触发自动压缩阈值，想主动释放上下文空间
- 即将开始一个需要大量上下文的复杂任务，先压缩腾出空间
- Agent 在执行工具链时上下文接近上限，手动干预

#### 13.3.1 新版压缩运行时补充说明

当前版本的压缩链已经不只是“超过阈值就写一段摘要”，还增加了几层治理：

- `Session Digest` 与 `Durable Extraction` 已与 compaction 解耦，摘要刷新不再只依赖 `/compact`
- 长工具链会优先走 `microcompact` 轻压缩，先清旧工具噪音，再决定是否做语义摘要
- `system.doctor` 里可以看到 compaction runtime 的命中率、回退、节省量、失败数和熔断状态
- 压缩边界（compact boundary）与 partial compact 已支持持久化，用于后续 transcript restore / debug

如果你只是普通使用者，通常不需要手动调这些变量；只有在你确实遇到“长会话频繁压缩失败”或“代理输入窗口很小”时，再考虑补 `WARNING / BLOCKING / 熔断 / PTL retry` 这组高级变量。

### 13.4 服务重启 (Service Restart)

Star Sanctuary 提供了 `service_restart` 工具，让 Agent 能够主动重启 Gateway 服务。这在 Agent 修改了配置文件后特别有用——它可以自主完成"改配置 → 重启生效"的完整流程。

**使用方法**：直接在对话中告诉 Star Sanctuary：

| 你说的话 | Star Sanctuary 做的事 |
|----------|------------------|
| "重启一下服务" | 调用 `service_restart` 工具，3 秒倒计时后重启 |
| "刚才改了配置，帮我重启" | 调用 `service_restart({ reason: "配置已更新" })`  |

**倒计时机制**：

重启不会立即执行，而是先进行 **3 秒倒计时**：
1. WebChat 界面会弹出全屏倒计时浮层（显示 3 → 2 → 1）
2. 倒计时结束后服务自动重启
3. WebChat 会自动重连，重连成功后浮层消失

> **💡 提示**：这与 `.env` 文件保存后的自动重启、以及设置面板的"保存并重启"使用的是同一套 launcher 重启机制（exit code 100）。区别在于 Agent 调用时会有 3 秒倒计时通知。

> **⚠️ 注意**：`service_restart` 需要通过 `pnpm start`（launcher 模式）启动服务才能自动重启。如果使用 `pnpm dev:gateway` 直接启动，exit code 100 会直接终止进程而不会重启。

### 13.5 日志系统 (Logs)

Star Sanctuary 的运行日志保存在 `~/.star_sanctuary/logs/` 目录，支持：

- **双输出**：同时输出到控制台和文件
- **按日期分文件**：如 `gateway-2025-02-05.log`
- **按大小轮转**：单文件超过设定大小（默认 10MB）自动切分
- **自动清理**：超过保留天数（默认 7 天）的日志自动删除
- **Agent 可读**：Agent 可通过 `log_read`、`log_search` 工具回溯日志，理解任务执行情况

如需调整日志行为，可在 `.env.local` 中配置 `BELLDANDY_LOG_*` 相关变量（参见 3.2 进阶配置）。


## 14. 浏览器自动化

让 Star Sanctuary 控制你的浏览器打开网页、截图或提取内容的黑科技功能！

### 14.1 启用方式

**推荐：自动启动**

在 `.env.local` 中添加：

```env
# 启用浏览器中继自动启动
BELLDANDY_BROWSER_RELAY_ENABLED=true
```

下次启动 Gateway 时，后台会自动运行 Relay Server。

**手动启动（备选）**

如果你想单独调试，可以手动运行：

```bash
cd Star Sanctuary
node packages/belldandy-browser/dist/bin/relay.js
```

### 14.2 安装浏览器扩展

1.  打开 Chrome 浏览器，进入 **扩展管理页面** (`chrome://extensions`)。
2.  开启右上角的 **"开发者模式" (Developer mode)**。
3.  点击 **"加载已解压的扩展程序" (Load unpacked)**。
4.  选择项目目录下的 `apps/browser-extension` 文件夹。

### 14.3 连接使用

1.  在浏览器右上角找到 **Star Sanctuary Relay** 的图标（一个紫色的小幽灵👻或 B 图标）。
2.  点击它，图标应该会变色或显示 "Connected"，表示已连接到 Relay Server。
3.  现在的 Agent 就可以通过 `browser_open` 等工具控制你的当前浏览器了！

## 15. 方法论系统 (Methodology System)

这是 Star Sanctuary 的"程序性记忆"核心。它允许 Agent 将一次性的经验沉淀为标准操作流程 (SOP)，并在后续任务中自动调用。

### 15.1 核心理念
- **查阅优先**: 在执行复杂任务前，Agent 会先检查是否有现成的方法 (`method_list/search`).
- **经验沉淀**: 任务成功或踩坑后，Agent 会将经验记录为 Markdown 文件 (`method_create`).
- **自我进化**: 随着使用时间的增加，`methods/` 目录下的 SOP 越多，Agent 越聪明。

### 15.2 常用工具
- `method_list`: 列出所有已沉淀的方法。
- `method_search`: 搜索特定关键词的方法。
- `method_read`: 读取方法的具体步骤。
- `method_create`: 创建或更新方法文档。

### 15.3 给用户的建议
- 您可以在对话中显式要求 Star Sanctuary："把刚才的操作总结为一个方法保存下来。"
- 您也可以手动在 `~/.star_sanctuary/methods/` 目录下编写 `.md` 文件，教 Star Sanctuary 做事。

## 16. 画布工作区 (Canvas)

画布工作区是一个可视化的无限画布，让你用节点和连线来组织想法、拆解任务、关联知识。Agent 也能直接在画布上操作——创建节点、建立连线、自动布局。

### 16.1 打开画布

在网页界面左侧边栏，点击 **「画布工作区」** 按钮，进入画布列表页。

- 点击 **「+ 新建画布」** 创建一个空画布
- 点击已有画布条目打开它

画布与聊天、编辑器之间可以自由切换（三态切换），点击工具栏右侧的 **✕** 按钮返回聊天。

### 16.2 节点类型

画布支持 8 种节点类型：

| 类型 | 图标 | 用途 |
|------|------|------|
| 任务 (task) | ☑ | 带状态流转的任务卡片（todo → doing → done） |
| 笔记 (note) | ✎ | 自由文本 / Markdown 笔记 |
| 方法 (method) | 📋 | 关联方法论文档（`methods/*.md`） |
| 知识 (knowledge) | 💡 | 关联记忆笔记（`memory/*.md`） |
| Agent 输出 (agent-output) | 🤖 | Agent 回复片段 |
| 截图 (screenshot) | 🖼 | 浏览器快照图片 |
| 会话 (session) | 💬 | 关联历史对话会话 |
| 分组 (group) | 📁 | 分组容器 |

### 16.3 基本操作

**添加节点**
- 工具栏点击 **「+ 任务」「+ 笔记」「+ 方法」** 按钮
- 或在画布空白处 **右键** 打开菜单选择节点类型
- 方法 / 知识 / 会话类型会弹出 **资源选择器**，列出工作区中可用的文件，选择后自动创建带关联的节点

**连线**
- 将鼠标移到节点边缘的 **端口**（上下左右四个小圆点），按住拖拽到另一个节点的端口即可建立连线

**拖拽与布局**
- 直接拖拽节点调整位置
- 点击工具栏 **「布局」** 按钮触发 dagre 自动布局（TB 方向）
- 点击 **「适应」** 按钮让视图自动缩放以显示所有节点

**缩放与平移**
- 鼠标滚轮缩放
- 在空白区域按住左键拖拽平移
- 工具栏 **+** / **−** 按钮精确缩放

**删除**
- 选中节点后按 `Delete` 键删除
- 或右键节点选择 **「删除节点」**

**撤销 / 重做**
- `Ctrl+Z` 撤销（最多 50 步）

**保存**
- 画布会在操作后 2 秒自动保存
- 也可以点击工具栏 **「保存」** 按钮手动保存
- 数据存储在 `~/.star_sanctuary/canvas/<boardId>.json`

### 16.4 节点关联与双击跳转

带有资源关联（ref）的节点会在标题栏显示 🔗 图标。双击节点的行为取决于关联类型：

| 关联类型 | 双击行为 |
|----------|----------|
| method | 跳转到编辑器，打开对应方法论文档 |
| memory | 跳转到编辑器，打开对应记忆笔记 |
| session | 切换到聊天模式，加载对应会话 |
| url | 在新窗口打开链接 |
| file | 跳转到编辑器，打开对应文件 |
| 无关联 | 弹出编辑对话框，可修改标题和内容 |

### 16.5 画布上下文注入

当你在画布视图中发送消息时，系统会自动将当前画布的摘要（节点列表 + 连线关系）注入到消息中，让 Agent 了解你正在看的画布内容。

你也可以点击工具栏的 **「分析画布」** 按钮，系统会切换到聊天模式并在输入框中预填画布摘要，方便你直接让 Agent 分析。

### 16.6 ReAct 可视化

点击工具栏的 **「ReAct」** 按钮开启 ReAct 可视化模式。开启后，Agent 的工具调用过程会实时映射为画布上的节点链：

1. Agent 调用工具时 → 画布出现黄色临时节点（带 pulse 动画），显示工具名和参数
2. 工具返回结果后 → 节点变为绿色（成功）或红色（失败），内容更新为结果摘要
3. Agent 最终回复时 → 出现紫色总结节点
4. 多个工具调用之间自动用虚线连接，形成调用链

**管理临时节点**：
- 右键节点选择 **「固定」** 可以将有价值的临时节点保留
- 关闭 ReAct 模式时，未固定的临时节点会自动清除
- 已固定的节点会保留在画布上

### 16.7 Agent 操作画布

Agent 可以通过工具直接操作画布。你可以用自然语言指挥它：

- "帮我创建一个画布，把这个需求拆解成任务"
- "在画布上添加一个方法论节点，关联 xxx.md"
- "把画布上的任务 A 和任务 B 连起来"
- "给画布做一个自动布局"
- "读一下当前画布的内容"

Agent 可用的画布工具：

| 工具 | 功能 |
|------|------|
| `canvas_list` | 列出所有画布 |
| `canvas_create` | 创建新画布 |
| `canvas_read` | 读取画布完整数据 |
| `canvas_add_node` | 添加节点（支持所有类型和关联） |
| `canvas_update_node` | 更新节点属性 |
| `canvas_remove_node` | 删除节点及关联连线 |
| `canvas_connect` | 连接两个节点 |
| `canvas_disconnect` | 删除连线 |
| `canvas_auto_layout` | 触发自动布局 |
| `canvas_snapshot` | 获取画布文本摘要 |

Agent 的写操作会通过 WebSocket 实时推送到前端，你能看到节点逐个出现、连线逐条建立。

---

## 17. MCP 支持 (Model Context Protocol)

MCP 是 Anthropic 提出的标准化协议，让 AI 助手能够连接外部数据源和工具。

### 17.1 启用 MCP

在 `.env.local` 中添加：

```env
# 启用 MCP 支持（需要同时启用工具系统）
BELLDANDY_TOOLS_ENABLED=true
BELLDANDY_MCP_ENABLED=true
```

### 17.2 配置 MCP 服务器

在 `~/.star_sanctuary/mcp.json` 中定义要连接的 MCP 服务器。Star Sanctuary 支持两种配置格式，可任选其一。

#### 格式一：通用格式（推荐）

与 Claude Desktop、Cursor、Windsurf、Cline 等工具通用的事实标准格式。从这些工具迁移时可直接复制粘贴，无需改写。

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user/documents"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_xxxxxxxxxxxx"
      }
    },
    "remote-api": {
      "url": "https://api.example.com/mcp",
      "headers": {
        "Authorization": "Bearer your-token"
      }
    }
  }
}
```

通用格式的字段说明：

| 字段 | 说明 | 适用 |
|------|------|------|
| `command` | 要执行的命令 | stdio 服务器 |
| `args` | 命令行参数 | stdio 服务器 |
| `env` | 环境变量 | stdio 服务器 |
| `cwd` | 工作目录 | stdio 服务器 |
| `url` / `baseUrl` | 服务器地址 | 远程 SSE 服务器 |
| `headers` | HTTP 请求头 | 远程 SSE 服务器 |
| `disabled` | 设为 `true` 可禁用该服务器 | 通用 |

> **💡 提示**：对象的 key（如 `"filesystem"`、`"github"`）会自动作为服务器 ID 和名称。

#### 格式二：Star Sanctuary 原生格式

提供更多控制选项（超时、重试、自动连接等）。

```json
{
  "version": "1.0.0",
  "servers": [
    {
      "id": "filesystem",
      "name": "文件系统",
      "description": "提供文件系统访问能力",
      "transport": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user/documents"]
      },
      "autoConnect": true,
      "enabled": true
    },
    {
      "id": "github",
      "name": "GitHub",
      "description": "GitHub API 访问",
      "transport": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-github"],
        "env": {
          "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_xxxxxxxxxxxx"
        }
      },
      "autoConnect": true,
      "enabled": true
    }
  ],
  "settings": {
    "defaultTimeout": 30000,
    "debug": false,
    "toolPrefix": true
  }
}
```

> **注意**：一个 `mcp.json` 文件只能使用一种格式。系统会自动检测格式并处理，无需手动指定。

### 17.3 传输类型

| 类型 | 说明 | 适用场景 |
|------|------|----------|
| `stdio` | 通过子进程的 stdin/stdout 通信 | 本地 MCP 服务器（推荐） |
| `sse` | 通过 HTTP Server-Sent Events 通信 | 远程 MCP 服务器 |

### 17.4 常用 MCP 服务器

| 服务器 | 命令 | 功能 |
|--------|------|------|
| `@modelcontextprotocol/server-filesystem` | `npx -y @modelcontextprotocol/server-filesystem /path` | 文件系统访问 |
| `@modelcontextprotocol/server-github` | `npx -y @modelcontextprotocol/server-github` | GitHub API |
| `@modelcontextprotocol/server-sqlite` | `npx -y @modelcontextprotocol/server-sqlite` | SQLite 数据库 |
| `@modelcontextprotocol/server-puppeteer` | `npx -y @modelcontextprotocol/server-puppeteer` | 浏览器自动化 |

### 17.5 工具命名

MCP 工具在 Star Sanctuary 中的命名格式为：`mcp_{serverId}_{toolName}`

例如：
- `mcp_filesystem_read_file` - 文件系统服务器的读取文件工具
- `mcp_github_create_issue` - GitHub 服务器的创建 Issue 工具

> **💡 提示**：启动 Gateway 后，日志会显示已连接的 MCP 服务器和注册的工具数量。

### 17.6 当前运行时行为与排障

这轮实现后，MCP 已经不只是“能不能连上”，还多了最小运行时诊断和保护：

- **连接异常 / session 过期**
  - 系统会记录最近失败原因
  - 对 `session_expired` 会尝试自动重连一次、再重试一次
- **大结果保护**
  - 如果 MCP 返回超长文本，系统会优先给摘要或引用，而不是把整段大文本直接塞回对话
  - 如果返回大块二进制或 base64，系统也会优先走摘要 / 落盘引用
- **诊断出口**
  - `system.doctor` 的 `mcpRuntime`
  - 会告诉你最近是否发生过失败、恢复、结果落盘或截断

通俗理解：

- 以前更像“连上就算完成”
- 现在更像“连上之后出了什么问题，也能解释出来”

如果你怀疑某个 MCP 服务不稳定，建议按这个顺序看：

1. 先看 `mcp.json` 配置是否正确
2. 再看 Gateway 启动日志里该 server 是否连接成功
3. 若仍异常，再看 `system.doctor` 的 `mcpRuntime`，确认是连接失败、session 过期，还是结果过大被截断/落盘


---

**第五部分：开发者扩展**

## 18. 插件与钩子系统 (Plugin & Hook System)

Star Sanctuary 提供了可落地的插件装载能力：插件可注册**工具**、**兼容版 AgentHooks**，以及**插件附带的技能目录**。

### 18.1 当前插件能力边界

插件上下文当前支持三类注册动作：

- `registerTool(tool)`：注册新工具
- `registerHooks(hooks)`：注册兼容版 Agent 钩子（`beforeRun / afterRun / beforeToolCall / afterToolCall`）
- `registerSkillDir(dir)`：声明一组由插件提供的技能目录

> **说明**：底层完整 HookRegistry 已支持更细粒度生命周期；但插件对外暴露的主入口仍是兼容版 `AgentHooks`，这样更适合稳定使用。

### 18.2 开发插件

插件文件需要默认导出一个实现了 `BelldandyPlugin` 接口的对象。最小示例：

```javascript
// ~/.star_sanctuary/plugins/my-plugin.mjs
export default {
  id: "my-plugin",
  name: "My Plugin",
  async activate(context) {
    context.registerHooks({
      beforeRun(event) {
        console.log("Agent input:", event.input.text);
      },
      beforeToolCall(event) {
        if (event.toolName === "run_command") {
          console.log("Tool called:", event.toolName);
        }
      }
    });

    context.registerTool({
      definition: {
        name: "my_tool",
        description: "返回一段插件自定义文本",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "要问候的名字" }
          },
          required: ["name"]
        }
      },
      async execute(args) {
        const name = String(args.name || "friend");
        return {
          id: "",
          name: "my_tool",
          success: true,
          output: `Hello, ${name}!`,
          durationMs: 0
        };
      }
    });

    context.registerSkillDir(new URL("./skills", import.meta.url).pathname);
  }
};
```

### 18.3 加载插件

将插件文件放到 `~/.star_sanctuary/plugins/` 目录下，Gateway 启动时会自动扫描并加载 `.js / .mjs` 文件。

建议：

- 一个插件只做一类能力，便于定位问题
- 工具名避免与内置工具重名
- 如需附带 Skill，请把插件技能放到独立目录，再通过 `registerSkillDir()` 注册

### 18.4 Marketplace 第一阶段（当前可用）

当前扩展线已经有了最小可用的 marketplace 安装链路，但它仍然是“轻量扩展分发层”，不是重平台。

你现在可以做的事：

- 列出已知 marketplace 与已安装扩展
- 安装扩展
- 启用 / 禁用扩展
- 更新扩展
- 卸载扩展

常用命令：

```bash
# 查看 marketplace 状态与安装账本
corepack pnpm bdd marketplace list

# 从本地目录源安装一个扩展
corepack pnpm bdd marketplace install local-dev --source directory --path E:\my-extension

# 启用 / 禁用已安装扩展
corepack pnpm bdd marketplace enable <extension-id>
corepack pnpm bdd marketplace disable <extension-id>

# 更新 / 卸载
corepack pnpm bdd marketplace update <extension-id>
corepack pnpm bdd marketplace uninstall <extension-id>
```

当前最稳妥、真正打通的是：

- `directory` 本地目录源

当前还只是保留骨架、没有真正实现远端抓取的是：

- `github`
- `git`
- `url`
- `npm`

安装完成后，当前宿主会在**启动时**自动消费已安装且启用的 marketplace extension：

- `plugin` 会进入 `PluginRegistry`
- `skill-pack` 会进入技能加载主链

但要注意，当前仍然**不是热加载**：

- 安装到账本里，不代表当前进程内立刻无缝生效
- 更稳妥的理解是：它会在下一次启动加载阶段纳入宿主

排障时可以这样看：

1. `bdd marketplace list`：确认它是否真的装上了、是否被标记为 enabled
2. 工具设置面板：确认运行时策略有没有把它禁掉
3. `system.doctor` 的 `extensionGovernance`：确认问题卡在安装账本层、宿主加载层，还是 runtime policy 层

---

## 19. 技能系统 (Skills)

技能（Skills）是 Star Sanctuary 的"经验库"——一套纯文本的操作指南，教 Agent **如何更好地使用已有工具完成特定任务**。

与工具（Tools）的区别：
- **工具**是"手和脚"——解决"能做什么"的问题（如读文件、搜索网页）
- **技能**是"经验和套路"——解决"怎么做更好"的问题（如如何写出规范的 commit、如何重构 TypeScript 代码）

技能的本质是 **prompt 注入**：符合条件的技能会被自动注入到 Agent 的系统提示词中，让 Agent "知道"自己有哪些专业能力可用。

### 19.1 技能目录

技能从三个位置加载（优先级递减）：

| 来源 | 路径 | 说明 |
|------|------|------|
| 用户技能 | `~/.star_sanctuary/skills/` | 你自己创建的技能，优先级最高 |
| 插件技能 | 由插件声明 | 插件附带的技能 |
| 内置技能 | 随项目发布 | Star Sanctuary 自带的通用技能 |

当多个来源存在同名技能时，用户技能覆盖插件技能，插件技能覆盖内置技能。

补充一点：当前通过 marketplace 安装的 `skill-pack`，也会在启动时并入同一技能加载主链。你可以把它理解成“可安装的技能目录包”，但它仍遵循当前宿主加载与运行时禁用策略，不是独立的平台体系。

### 19.2 创建自定义技能

每个技能是 `~/.star_sanctuary/skills/` 下的一个**目录**，包含一个 `SKILL.md` 文件。

#### 目录结构示例

```
~/.star_sanctuary/skills/
├── ts-refactor/
│   └── SKILL.md
├── docker-deploy/
│   └── SKILL.md
└── code-review/
    └── SKILL.md
```

#### SKILL.md 格式

文件由 **YAML frontmatter**（元数据）和 **Markdown body**（操作指令）两部分组成：

```yaml
---
name: ts-refactor
description: TypeScript 复杂类型重构 SOP
version: "1.0"
tags: [typescript, refactor]
priority: normal
eligibility:
  bin: [node, tsc]
  tools: [file_read, file_write]
  files: [tsconfig.json]
---

# Instructions

当你接收到 TypeScript 重构任务时，请遵循以下步骤：

1. 先用 file_read 读取目标文件，理解现有类型结构
2. 识别需要重构的类型定义和所有引用点
3. 制定重构方案，确保类型安全
4. 逐文件修改，每次修改后验证类型检查通过
5. 完成后运行 tsc --noEmit 确认无类型错误
```

#### 字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | 是 | 技能唯一名称 |
| `description` | 是 | 简短描述（会显示在技能列表中） |
| `version` | 否 | 版本号 |
| `tags` | 否 | 分类标签（用于搜索和过滤） |
| `priority` | 否 | 注入优先级，默认 `normal`（见下方说明） |
| `eligibility` | 否 | 准入条件（见下方说明） |

#### 优先级 (priority)

决定技能如何被注入到 Agent 的系统提示词中：

| 值 | 行为 |
|----|------|
| `always` | 始终直接注入系统提示词 |
| `high` | 直接注入系统提示词 |
| `normal` | 不直接注入，Agent 可通过 `skills_search` 按需查询 |
| `low` | 不直接注入，Agent 可通过 `skills_search` 按需查询 |

> **Token 控制**：直接注入的技能总字符数超过 4000 时，会自动降级为仅注入名称和描述摘要，完整指令通过 `skills_search` 获取。

### 19.3 准入条件 (Eligibility)

准入条件用于自动检测当前环境是否满足技能的前置要求。不满足条件的技能不会被注入，避免浪费 token。

在 `eligibility` 中可以声明以下 5 个维度：

| 维度 | 说明 | 示例 |
|------|------|------|
| `env` | 环境变量需存在且非空 | `[BELLDANDY_TOOLS_ENABLED]` |
| `bin` | PATH 上需存在的可执行文件 | `[node, tsc, docker]` |
| `mcp` | 需在线的 MCP 服务器名称 | `[filesystem, sqlite]` |
| `tools` | 需已注册的工具名称 | `[file_read, file_write]` |
| `files` | 工作区中需存在的文件（相对路径） | `[package.json, tsconfig.json]` |

不声明 `eligibility` 的技能默认视为可用。

### 19.4 Agent 中使用技能

Agent 有两个内置工具来发现和使用技能：

#### skills_list — 列出技能

在对话中让 Agent 查看可用技能：

> "列出所有可用的技能"
> "有哪些和 TypeScript 相关的技能？"

Agent 会调用 `skills_list` 工具，返回所有技能的名称、来源、标签和可用状态。不可用的技能会显示具体原因（如 `missing bin: docker`）。

支持的过滤参数：
- `filter`: `all`（全部）/ `eligible`（仅可用）/ `ineligible`（仅不可用）
- `tag`: 按标签过滤

#### skills_search — 搜索技能

当 Agent 遇到不熟悉的领域时，可以搜索技能库获取操作指南：

> "搜索一下有没有关于代码重构的技能"
> "查找 Docker 部署相关的技能"

Agent 会调用 `skills_search` 工具，按关键词匹配技能的名称、描述、标签和指令内容，返回最相关的技能及其完整操作指南。

### 19.5 完整示例

创建一个"代码审查"技能：

```bash
mkdir -p ~/.star_sanctuary/skills/code-review
```

编辑 `~/.star_sanctuary/skills/code-review/SKILL.md`：

```yaml
---
name: code-review
description: 代码审查 SOP，关注安全、性能和可维护性
version: "1.0"
tags: [review, quality]
priority: high
eligibility:
  tools: [file_read]
---

# Code Review Instructions

当用户要求你审查代码时，请按以下维度逐一检查：

## 安全性
- 是否存在 SQL 注入、XSS、命令注入等漏洞
- 敏感信息（密钥、密码）是否硬编码
- 输入校验是否充分

## 性能
- 是否有不必要的循环嵌套或重复计算
- 数据库查询是否有 N+1 问题
- 是否有内存泄漏风险

## 可维护性
- 命名是否清晰、一致
- 函数是否过长（建议 < 50 行）
- 是否有适当的错误处理

## 输出格式
按严重程度分类：🔴 严重 / 🟡 建议 / 🟢 良好
```

重启 Star Sanctuary 后，这个技能会自动加载。因为 `priority: high`，它会直接注入到 Agent 的系统提示词中，Agent 在审查代码时会自动遵循这套 SOP。

---


---

**附录**

## 20. 当前可用功能统一速查表

### 20.1 普通用户版

这张表优先回答一个问题：**你现在要完成某件事，应该先去哪里操作。**

| 你想做什么 | 最优先入口 | 备选入口 | 说明 |
|---|---|---|---|
| 和 Agent 正常聊天 | WebChat 聊天输入框 | `/api/message` | 日常使用直接在 WebChat 发消息即可。 |
| 改模型、改 API Key、开关能力 | WebChat `⚙️ 设置` | `bdd config set` | 普通用户优先用设置面板。 |
| 首次配对新设备 | WebChat 获取配对码 | `bdd pairing approve` | WebChat 负责触发，CLI 负责批准。 |
| 看记忆、任务记录、经验候选 | 左侧 `🧠 记忆查看` | — | 适合复盘“它为什么这么答、做过哪些事”。 |
| 管理长期任务 | 左侧 `🎯 长期任务` | — | 适合分阶段推进长期事项。 |
| 用画布拆任务、看 ReAct 过程 | 左侧 `画布工作区` | — | 适合做可视化整理和任务拆解。 |
| 临时禁用某些工具 / MCP / 插件 | 顶部 `🛠️ 工具设置` | — | 这是运行时临时禁用，不等于卸载。 |
| 看系统是否大体正常 | `corepack pnpm bdd doctor` | `system.doctor` | 普通检查优先 `bdd doctor`。 |
| 复盘某个会话 / 导出 transcript | `corepack pnpm bdd conversation ...` | `system.doctor conversationDebug` | 适合看会话恢复、压缩边界、timeline 和最近导出记录。 |
| 安装 / 更新 / 卸载扩展 | `bdd marketplace ...` | — | 当前扩展安装主入口仍是 CLI。 |
| 使用 MCP 能力 | 聊天中直接让 Agent 调用 | 工具设置查看可见性 | MCP 已能在对话里直接使用。 |

普通用户常用判断：

- 想“直接使用功能”，优先 `WebChat`
- 想“改配置或装扩展”，优先 `CLI`
- 只有在排障或做集成时，才需要直接接触 `RPC / HTTP`

### 20.2 开发集成版

这张表优先回答两个问题：

1. 某条能力的真实入口是什么。
2. 排障时应该先看哪一个接口或命令。

| 能力域 | 常用入口 | 主要排障口 | 当前说明 |
|---|---|---|---|
| 对话主链 | `message.send` / `/api/message` | `system.doctor -> queryRuntime` | `message.send / api.message / webhook.receive` 已纳入同一 lifecycle / trace 主链。 |
| 运行时体检 | `system.doctor` | `bdd doctor` + `system.doctor` | `bdd doctor` 看静态配置；`system.doctor` 看运行时状态。 |
| 会话摘要 | `conversation.digest.get` / `conversation.digest.refresh` | `memoryRuntime.sessionDigest` | `Session Digest` 是当前会话小抄，已接入 budget / rate-limit。 |
| 长期记忆提取 | `conversation.memory.extraction.get` / `conversation.memory.extract` | `memoryRuntime.durableExtraction` | 已有 availability / rate-limit / guidance / skip reason。 |
| 会话导出 / 时间轴复盘 | `bdd conversation export/timeline/list/exports` | `system.doctor -> conversationDebug / conversationCatalog / recentConversationExports` | 用于 transcript export、timeline projection、最近导出索引与会话目录排障。 |
| 工作区文件链路 | `workspace.list/read/readSource/write` | `queryRuntime` + 写入结果 | `workspace.write` 已接入 team-memory secret guard。 |
| 子任务治理 | `subtask.list/get/stop/archive` | `queryRuntime` | 适合多 Agent / 后台执行链路排障。 |
| 工具治理 | `tools.list` / `tool_settings.confirm` | `tools.list` + `extensionGovernance` | 已形成 builtin / MCP / plugin / skill 的统一解释口径。 |
| MCP 运行态 | `mcp_*` 工具 | `mcpRuntime` | 已可见最近失败、恢复、大结果截断/落盘。 |
| 扩展安装账本 | `bdd marketplace list/install/enable/disable/update/uninstall` | `bdd marketplace list` + `extensionGovernance` | 当前最稳的是 `directory` 本地目录源。 |
| Webhook / 外部触发 | `/api/webhook/<id>` / `/api/message` | `queryRuntime` + 服务日志 | 两条入口都已进入统一运行时观察口径。 |
| Team Shared Memory 前置条件 | `BELLDANDY_TEAM_SHARED_MEMORY_ENABLED=true` | `memoryRuntime.sharedMemory` | 当前只有 path / secret guard / readiness / index 挂接，没有远端同步。 |

开发/集成时的最小判断顺序：

1. 先确认入口是否对：`WebChat / CLI / RPC / HTTP`
2. 再确认是“配置问题”还是“运行时问题”
3. 配置问题先看 `bdd doctor`
4. 运行时问题优先看 `system.doctor`
5. 涉及扩展时，区分“安装账本层”和“运行时策略层”

补充说明：

- 这两张短表只保留当前高频、已落地、最适合作为主入口的能力。
- 只要你看到 `system.doctor`、`tools.list`、`conversation.*`、`workspace.*`、`subtask.*` 这些名字，基本都属于当前已经接入统一 Query Runtime / lifecycle / trace 口径的主链。
- 更低频的内部接口没有在这里展开，不代表不可用，只是暂时不作为速查主入口。

## 21. 常见问题 (FAQ)

**Q: 启动时提示 `EADDRINUSE` 端口被占用？**
A: 说明端口 28889 已经被占用了。你可以修改当前实际 `envDir/.env.local` 中的 `BELLDANDY_PORT=28890` 换一个端口，也可以直接用 `corepack pnpm bdd config set BELLDANDY_PORT 28890`。

**Q: 如何让其他设备访问？**
A: 默认情况下，Gateway 监听的是 `127.0.0.1`，也就是**仅本机可访问**。如果你要让局域网设备访问，请显式设置：

```env
BELLDANDY_HOST=0.0.0.0
BELLDANDY_AUTH_MODE=token
BELLDANDY_AUTH_TOKEN=your-secure-token
```

不建议使用 `0.0.0.0 + AUTH_MODE=none`；项目也会拒绝这种不安全组合。

**Q: 记忆检索有时候不准？**
A: 记忆系统使用混合检索（关键词 BM25 + 向量语义）+ 规则重排序。请确保当前实际 `envDir/.env.local` 中正确配置了 Embedding 模型且 `BELLDANDY_EMBEDDING_ENABLED=true`。

**Q: 我怎么知道当前到底在用根目录配置，还是状态目录配置？**
A: 执行 `corepack pnpm bdd doctor`。如果出现 `Legacy root env mode`，说明你当前仍在使用项目根目录旧配置；也可以用 `corepack pnpm bdd config path` 查看当前实际 `.env.local` 路径。

**Q: 我想把以前项目根目录里的 `.env/.env.local` 迁到状态目录，怎么做？**
A: 推荐按下面顺序操作：

```bash
corepack pnpm bdd doctor
corepack pnpm bdd config migrate-to-state-dir --dry-run
corepack pnpm bdd config migrate-to-state-dir
corepack pnpm bdd doctor
```

迁移命令不会自动执行；冲突时会中止，不会强覆盖目标文件。

**提升检索精准度的方法：**
1. **使用过滤参数**：在对话中让 Agent 使用过滤条件缩小范围，例如"搜索最近一周飞书上关于 XX 的记忆"，Agent 会自动使用 `channel`、`date_from` 等过滤条件。
2. **启用 L0 摘要层**：设置 `BELLDANDY_MEMORY_SUMMARY_ENABLED=true`，让 Agent 先浏览摘要快速定位相关内容。
3. **启用深度检索**：设置 `BELLDANDY_MEMORY_DEEP_RETRIEVAL=true`，找到相关段落后自动拉取完整上下文。
4. **启用会话记忆提取**：设置 `BELLDANDY_MEMORY_EVOLUTION_ENABLED=true`，让系统自动从对话中提取关键信息并去重。
5. **启用 Auto-Recall 并调参**：设置 `BELLDANDY_AUTO_RECALL_ENABLED=true`，建议从 `limit=3`、`minScore=0.30` 起步，再按 `minScore` 优先原则微调（建议区间：`limit 2~5`、`minScore 0.25~0.45`）。

详见 [5.2 长期记忆 (Memory)](#52-长期记忆-memory) 章节。

**Q: Windows 下可以执行 CMD 命令吗？**
A: 可以。Star Sanctuary 已对 Windows 原生命令（如 `copy`、`move`、`del`、`ipconfig`）做了兼容处理；但危险删除参数（如递归 / 静默大范围删除）仍会被拦截。

**Q: Portable / Single-Exe 升级后数据会丢吗？**
A: 常规升级不会清空 `~/.star_sanctuary`。但在发新版前，仍建议备份该目录；尤其是你已经有自定义 `SOUL.md`、技能、方法、社区配置和长期任务数据时。

**Q: 出现 `模型调用失败（HTTP 400）：Invalid request: total message size ... exceeds limit ...` 怎么办？**
A: 这是上游接口的请求体大小限制触发，不是 `models.json` 缺少模态字段导致。当前 WebChat 已内置发送前体积拦截、图片自动压缩与附件限制。若仍触发，请减少附件、降低图片分辨率、拆分消息，或先执行 `/compact` 再发送。

---
*Star Sanctuary - Your Personal AI Assistant*







