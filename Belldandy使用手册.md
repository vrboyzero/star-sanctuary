# Belldandy 使用手册

Belldandy 是一个运行在你本地电脑上的个人 AI 助手。它注重隐私、安全，并具备记忆与工具使用能力。

本手册将指引你完成安装、配置、启动以及日常使用。

---


**第一部分：快速上手**

## 1. 环境准备

在开始之前，请确保你的电脑满足以下要求：

- **操作系统**：Windows, macOS, 或 Linux
- **Node.js**：版本 **22.12.0** 或更高（推荐使用 LTS 版本）
    - [下载 Node.js](https://nodejs.org/)
- **包管理器**：推荐使用 `pnpm`（本项目已启用 corepack，可自动管理版本）

## 2. 安装步骤

1.  **获取代码**
    将项目代码下载到你的本地目录（例如 `Belldandy/`）。

2.  **安装依赖**
    在项目根目录下打开终端（Terminal 或 PowerShell），运行：

    ```bash
    cd Belldandy
    corepack pnpm install
    ```

    这就完成了所有的安装工作。

## 3. 基础配置

Belldandy 使用 **环境变量** 进行配置。为了方便管理，推荐在项目根目录创建一个名为 `.env.local` 的文件（Git 会自动忽略它，保护你的隐私）。

### 3.1 基础配置（必选）

决定你使用什么 AI 模型服务。

**方案 A：使用 OpenAI 协议兼容服务（推荐）**
如果你有 OpenAI、Gemini、DeepSeek 或本地 LLM（如 Ollama）的 API Key。

在 `.env.local` 中添加：

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
# 启用会话记忆自动提取（对话结束后自动提取用户偏好与经验教训）
BELLDANDY_MEMORY_EVOLUTION_ENABLED=true
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
# 日志目录，默认 ~/.belldandy/logs
# BELLDANDY_LOG_DIR=~/.belldandy/logs
# 单文件最大大小，超过则轮转 (如 10MB)
# BELLDANDY_LOG_MAX_SIZE=10MB
# 日志保留天数，超过自动清理
# BELLDANDY_LOG_RETENTION_DAYS=7
# 是否输出到控制台 / 是否写入文件
# BELLDANDY_LOG_CONSOLE=true
# BELLDANDY_LOG_FILE=true
```

### 3.2 可视化配置 (Settings UI)

如果你觉得编辑文本文件太麻烦，Belldandy 提供了全新的 Web 配置面板：

1.  启动 Belldandy (`start.bat` 或 `./start.sh`)。
2.  在 WebChat 界面右上角，点击 **⚙️ 设置图标**。
3.  在弹出的面板中，你可以：
    *   查看 **System Doctor** 诊断信息（检查 Node 版本、数据库状态、配置有效性）。
    *   修改 **OpenAI API Key**、**Base URL**、**Model**。
    *   修改 **心跳间隔**。
4.  点击 **Save**，系统会自动保存配置到 `.env.local` 并重启服务。

### 3.3 视觉与视频理解 (New!)

Belldandy 现在支持**图片**和**视频**的理解能力（需配置支持视觉的模型，如 Kimi k2.5）。

#### 3.3.1 发送图片
1. 点击聊天输入框左侧的 `+` 号（或附件按钮）。
2. 选择本地图片文件（jpg, png, webp 等）。
3. 在输入框中输入你的问题（例如：“这张图里有什么？”）。
4. 发送消息，模型将能够“看到”图片并回答。

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

### 3.4 语音交互配置 (STT & TTS)

为了让 Belldandy 能听会说，你需要配置语音识别 (STT) 和语音合成 (TTS)。

#### 3.4.1 语音识别 (STT)

Belldandy 支持多种 STT 服务商，你可以根据需要选择：

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

TTS 负责让 Belldandy 开口说话。

*   **Edge TTS (推荐/默认)**：无需 API Key，免费且效果自然（晓晓/云希）。
*   **OpenAI TTS**：音质更逼真，消耗 Token。
*   **DashScope TTS**：中文韵律好，支持 Sambert 等模型。

启用方式见 **[10. 语音交互 (Voice Interaction)](#10-语音交互-voice-interaction)** 章节。

## 4. 启动与首次使用

### 4.1 极速启动 (推荐)

我们为 Windows 和 Linux/macOS 用户准备了“一键启动脚本”，它会自动完成以下所有工作：
1. 检查 Node.js 环境
2. 自动安装/更新依赖
3. 启动 Gateway 服务
4. **自动打开浏览器**并登录
5. 如果服务意外崩溃，会自动尝试重启

**Windows 用户**:
双击项目根目录下的 `start.bat`。

**macOS / Linux 用户**:
在终端运行：
```bash
./start.sh
```

### 4.2 使用 CLI 启动（推荐）

Belldandy 提供了统一的 `bdd` 命令行工具，所有管理操作都通过它完成。

```bash
cd Belldandy

# 生产模式：带进程守护，崩溃自动重启（等价于 start.bat / start.sh）
corepack pnpm bdd start

# 开发模式：直接启动 Gateway，适合调试
corepack pnpm bdd dev
```

看到类似 `[Gateway] Listening on http://localhost:28889` 的日志，说明启动成功。

> **💡 首次使用？** 推荐先运行 `corepack pnpm bdd setup` 交互式向导，它会引导你完成 AI 服务配置并写入 `.env.local`，详见下方 4.2.1 节。

#### 4.2.1 Setup 向导（首次配置推荐）

如果你还没有手动编辑过 `.env.local`，可以使用交互式向导快速完成配置：

```bash
corepack pnpm bdd setup
```

向导会依次引导你选择：
- AI 服务商（OpenAI / Gemini / Moonshot / Ollama / 自定义）
- API Base URL 和 API Key
- 模型名称
- 监听地址和端口
- 鉴权模式（none / token / password）

配置完成后自动写入 `.env.local`，无需手动编辑。

也支持非交互模式（适合脚本化部署）：

```bash
corepack pnpm bdd setup --provider openai --base-url https://api.openai.com/v1 --api-key sk-xxx --model gpt-4o
```

### 4.3 手动启动（兼容方式）

你也可以使用传统的 pnpm 脚本启动：

```bash
cd Belldandy
corepack pnpm dev:gateway
```

### 4.4 访问界面

打开浏览器，访问：
http://localhost:28889/
或者
[http://127.0.0.1:28889/](http://127.0.0.1:28889/)

> **✨ 首次唤醒仪式**：
> 第一次由本机访问时，你可能会看到一段 **"Initializing..."** 的终端启动动画。这是 Belldandy 的唤醒仪式，稍等其自我检查完毕即可进入聊天界面。

你会看到 WebChat 聊天界面。

### 4.5 首次配对（Pairing）

为了防止你家猫咪或邻居连上你的 AI，首次使用新设备（即使是本机浏览器）连接时，Belldandy 会启动安全配对流程：

1.  在 WebChat 发送第一条消息（例如 "你好"）。
2.  界面会提示：`Pairing required. Code: ABC123XY`。
3.  回到**运行 Gateway 的终端**，开启一个新的终端窗口，执行批准命令：

    ```bash
    cd Belldandy
    corepack pnpm bdd pairing approve ABC123XY
    ```

    > 旧写法 `corepack pnpm pairing:approve ABC123XY` 仍可使用，但推荐使用 `bdd` 统一命令。

4.  回到 WebChat，再次发送消息，现在可以正常对话了。


---

**第二部分：个性化定制**

## 5. 人格与记忆（让它变成你的专属 AI）

Belldandy 的数据存储在你的用户主目录下的 `.belldandy` 文件夹中（例如 Windows 下是 `C:\Users\YourName\.belldandy`，Linux/Mac 下是 `~/.belldandy`）。

### 5.1 塑造人格 (SOUL)

你可以通过编辑 `.belldandy` 目录下的 Markdown 文件来定义 AI 的性格：

-   **`SOUL.md`**：核心性格文件。
    -   *例子*：`你是一个严谨的 TypeScript 专家，喜欢用代码解释问题...`
-   **`IDENTITY.md`**：身份设定。
    -   *例子*：`你的名字叫 Belldandy，是一级神，喜欢红茶...`
-   **`USER.md`**：关于你的信息。
    -   *例子*：`用户叫 vrboyzero，全栈工程师，喜欢简洁的代码...`

修改这些文件后，**重启 Gateway** 即可生效。

#### 5.1.1 设置头像和名称（WebChat 显示）

WebChat 界面会自动从 `IDENTITY.md` 和 `USER.md` 中提取名称和头像信息，显示在聊天消息气泡旁边。

**在 `IDENTITY.md` 中设置 Agent 信息：**

```markdown
**名字：** 贝露丹蒂 (Belldandy)
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

Belldandy 会自动读取并索引 `.belldandy/MEMORY.md` 和 `.belldandy/memory/*.md` 文件。

-   **`MEMORY.md`**：存放你希望它永远记住的关键事实（`core` 类型，最高权重）。
-   **`memory/2026-01-31.md`**：你可以手动记录当天的笔记，Belldandy 会自动索引并在相关对话中回忆起来（`daily` 类型）。
-   **`sessions/*.jsonl`**：对话历史会自动索引为 `session` 类型记忆，可被检索。

#### 5.2.1 记忆系统架构 (Phase M-Next)

Belldandy 的记忆系统经过深度优化，提供了多层次的智能检索与自动记忆管理能力：

**核心特性：**

1. **混合检索**：关键词检索（FTS5 BM25）+ 向量语义检索（sqlite-vec KNN）+ RRF 融合
2. **Embedding Cache**：基于内容哈希的缓存，避免重复计算，节省 30-50% API 成本
3. **元数据过滤**：按渠道、主题、时间范围精确过滤
4. **规则重排序**：memory_type 权重 + 时间衰减 + 来源多样性
5. **L0 摘要层**：自动生成 chunk 摘要，检索时节省 80-90% token
6. **会话记忆自动提取**：对话结束后自动提取用户偏好与经验教训
7. **源路径聚合检索**：找到相关段落后自动拉取完整上下文

#### 5.2.2 记忆系统配置

在 `.env.local` 中添加以下配置（可选）：

```env
# ========== 基础配置 ==========
# 启用向量检索（必须启用才能使用语义搜索）
BELLDANDY_EMBEDDING_ENABLED=true
BELLDANDY_EMBEDDING_MODEL=text-embedding-004

# ========== L0 摘要层 (M-N2) ==========
# 启用自动摘要生成（推荐）
BELLDANDY_MEMORY_SUMMARY_ENABLED=true
# 摘要生成用的模型（可选，默认继承主模型，建议用小模型降低成本）
BELLDANDY_MEMORY_SUMMARY_MODEL=gemini-2.0-flash-exp
# 摘要 API 配置（可选，默认继承主模型配置）
# BELLDANDY_MEMORY_SUMMARY_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
# BELLDANDY_MEMORY_SUMMARY_API_KEY=your-api-key
# 每批处理的 chunk 数（默认 5）
BELLDANDY_MEMORY_SUMMARY_BATCH_SIZE=5
# 触发摘要的最小内容长度（默认 500 字符）
BELLDANDY_MEMORY_SUMMARY_MIN_CONTENT_LENGTH=500

# ========== 会话记忆自动提取 (M-N3) ==========
# 启用会话结束时自动提取记忆（推荐）
BELLDANDY_MEMORY_EVOLUTION_ENABLED=true
# 触发提取的最少消息数（默认 4，过短的对话不提取）
BELLDANDY_MEMORY_EVOLUTION_MIN_MESSAGES=4
# 提取用的模型（可选，默认继承主模型）
BELLDANDY_MEMORY_EVOLUTION_MODEL=gemini-2.0-flash-exp
# 提取 API 配置（可选，默认继承主模型配置）
# BELLDANDY_MEMORY_EVOLUTION_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
# BELLDANDY_MEMORY_EVOLUTION_API_KEY=your-api-key

# ========== 源路径聚合检索 (M-N4) ==========
# 启用深度检索（找到相关段落后自动拉取完整上下文）
BELLDANDY_MEMORY_DEEP_RETRIEVAL=true
```

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

#### 5.2.4 会话记忆自动提取

启用 `BELLDANDY_MEMORY_EVOLUTION_ENABLED=true` 后，Belldandy 会在每次对话结束时自动分析会话内容，提取值得长期记住的信息：

**提取内容：**
- **用户偏好**：用户表达的喜好、习惯、工作方式、技术栈偏好等
- **经验教训**：解决问题的有效方法、踩过的坑、有用的工具/命令等

**工作流程：**
1. 会话消息数 ≥ 4 时触发（过滤掉过短的对话）
2. 调用 LLM 分析对话，提取关键信息
3. 相似度去重（score > 0.85 的相似记忆会被跳过）
4. 写入 `~/.belldandy/memory/YYYY-MM-DD.md`，格式：`- [类型] 内容 (来源: session-xxx)`
5. 自动触发增量索引（file watcher 机制）

**示例输出：**
```markdown
- [偏好] 用户喜欢使用 TypeScript 而非 JavaScript 开发项目 (来源: session-abc123)
- [经验] 使用 pnpm 的 workspace 功能可以更好地管理 monorepo 项目 (来源: session-abc123)
```

#### 5.2.5 L0 摘要层

启用 `BELLDANDY_MEMORY_SUMMARY_ENABLED=true` 后，Belldandy 会在索引完成后自动为长 chunk（> 500 字符）生成简短摘要：

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

### 5.3 FACET 模组切换

FACET 是 Belldandy 的"职能模组"系统——通过切换不同的模组文件，可以让同一个 Agent 在不同角色之间快速转换（例如"程序员模式"、"翻译模式"、"创意写作模式"等）。

**模组文件位置**：`~/.belldandy/facets/` 目录下的 `.md` 文件。

**使用方法**：直接在对话中告诉 Belldandy：

| 你说的话 | Belldandy 做的事 |
|----------|------------------|
| "切换模组为 coder" | 调用 `switch_facet` 工具替换 SOUL.md 中的模组内容，然后自动重启服务 |
| "切换 FACET 为 translator" | 同上，切换到翻译模组 |

**工作原理**：

1. `switch_facet` 工具读取 `~/.belldandy/facets/{模组名}.md` 文件
2. 在 SOUL.md 中找到锚点行，保留锚点行及之前的所有内容（人格核心不变）
3. 将锚点行之后的内容替换为新模组内容（原子写入，不会损坏文件）
4. Agent 随后调用 `service_restart` 重启服务，清空旧模组的推理惯性

**创建自定义模组**：

在 `~/.belldandy/facets/` 目录下创建 `.md` 文件即可。文件内容会被完整追加到 SOUL.md 的锚点行之后。建议以 `## 【FACET | 模组 | 文件名】` 开头，保持格式一致。

> **💡 提示**：模组切换不会影响 SOUL.md 中的 TABOO、ETHOS、SYSTEM 等核心章节——这些内容位于锚点行之前，始终保持不变。


## 6. 定时任务

### 6.1 定时提醒 (Heartbeat)

让 Belldandy 主动提醒你！编辑 `~/.belldandy/HEARTBEAT.md`：

```markdown
# 定时任务

- [ ] 每天早上提醒我查看日程
- [ ] 喝水提醒
- [ ] 检查待办事项
```

当启用心跳功能后（`BELLDANDY_HEARTBEAT_ENABLED=true`），Belldandy 会定期读取这个文件：

- **有任务内容**：执行检查并可能主动联系你
- **文件为空**：跳过，节省 API 调用
- **深夜时段**：如果设置了 `BELLDANDY_HEARTBEAT_ACTIVE_HOURS=08:00-23:00`，深夜不会打扰你

> **注意**：心跳推送功能目前输出到日志，飞书推送正在开发中。

### 6.2 定时任务 (Cron)

比 Heartbeat 更灵活的精确定时任务系统。你可以让 Belldandy 在特定时间或按固定间隔执行任务。

**启用方式**：在 `.env.local` 中添加：

```env
BELLDANDY_CRON_ENABLED=true
```

**使用方法**：直接在对话中告诉 Belldandy，它会通过 `cron` 工具自动管理：

| 你说的话 | Belldandy 做的事 |
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

## 7. 多 Agent 系统 (Multi-Agent)

Belldandy 支持配置和运行多个 Agent，每个 Agent 可以拥有独立的模型、人格、工具权限和工作区。你可以在 WebChat 中切换不同 Agent 对话，也可以让 Agent 之间协作完成复杂任务。

### 7.1 配置 Agent Profile

在 `~/.belldandy/` 目录下创建 `agents.json` 文件：

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
| `workspaceDir` | 否 | Agent 专属 workspace 目录名（位于 `~/.belldandy/agents/{workspaceDir}/`），默认等于 `id` |
| `toolsEnabled` | 否 | 是否启用工具（覆盖环境变量 `BELLDANDY_TOOLS_ENABLED`） |
| `toolWhitelist` | 否 | 可用工具白名单（仅列出的工具对该 Agent 可用） |
| `maxInputTokens` | 否 | 最大输入 token 数覆盖 |

> **💡 提示**：不创建 `agents.json` 时，系统只有一个 `"default"` Agent，使用环境变量中的配置，行为与之前完全一致。

### 7.2 Agent 专属工作区

每个非 default 的 Agent 可以拥有独立的人格文件。目录结构：

```
~/.belldandy/
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

当启用工具调用（`BELLDANDY_TOOLS_ENABLED=true`）且配置了 Agent Profile 后，Belldandy 支持将复杂任务拆分并委托给子 Agent 执行。

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


---

**第三部分：渠道与交互**

## 8. 管理命令（bdd CLI）

Belldandy 提供了统一的 `bdd` 命令行工具，涵盖启动、配置、诊断、配对管理等所有操作。

```bash
# 查看完整命令树
corepack pnpm bdd --help

# 查看版本号
corepack pnpm bdd --version
```

所有命令支持以下全局选项：
- `--json` — 输出机器可读的 JSON 格式（适合脚本集成）
- `--state-dir <path>` — 覆盖默认的工作区目录（`~/.belldandy`）
- `--verbose` — 显示详细输出

### 8.1 启动与运行

```bash
# 生产模式（带进程守护，崩溃自动重启）
cd E:\project\belldandy
corepack pnpm bdd start

# 开发模式（直接启动 Gateway，适合调试）
corepack pnpm bdd dev
```

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
- 工作区目录（`~/.belldandy`）是否存在
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

### 8.4 配置管理（Config）

无需手动编辑 `.env.local`，通过 CLI 直接读写配置：

```bash
# 列出所有配置（敏感字段自动脱敏）
corepack pnpm bdd config list

# 显示明文（包含 API Key 等）
corepack pnpm bdd config list --show-secrets

# 读取单个配置项
corepack pnpm bdd config get BELLDANDY_OPENAI_MODEL

# 修改配置项（自动写入 .env.local）
corepack pnpm bdd config set BELLDANDY_PORT 28890

# 用编辑器打开 .env.local
corepack pnpm bdd config edit

# 显示 .env.local 文件路径
corepack pnpm bdd config path
```

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

## 9. 飞书渠道（手机可用）

除了 WebChat，你还可以通过飞书与 Belldandy 对话——无需公网 IP 或内网穿透！

### 9.1 配置飞书

详细配置步骤请参考 [飞书对接说明](./Belldandy飞书对接说明.md)。

简要步骤：
1. 在 [飞书开放平台](https://open.feishu.cn/) 创建企业自建应用
2. 获取 App ID 和 App Secret
3. 开启机器人能力并配置权限
4. 设置事件订阅为"长连接模式"
5. 发布应用

### 9.2 配置 Belldandy

在 `.env.local` 中添加：

```env
BELLDANDY_FEISHU_APP_ID=cli_xxxxxxxxxxxxxxxx
BELLDANDY_FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 9.3 使用

1. 启动 Gateway：`corepack pnpm dev:gateway`
2. 终端显示 `Feishu WebSocket Channel started.` 和 `ws client ready` 说明连接成功
3. 打开飞书，搜索你的应用名称，开始对话！

### 9.4 渠道架构说明

Belldandy 采用了标准化的 **Channel 接口** 设计，使扩展新渠道变得简单：

- **统一接口**：所有渠道（飞书、Telegram、Discord 等）都实现相同的 `Channel` 接口
- **ChannelManager**：统一管理多个渠道的启动、停止和消息广播
- **易于扩展**：新增渠道只需实现 `start()`、`stop()`、`sendProactiveMessage()` 方法

**当前已支持的渠道**：
- ✅ 飞书 (FeishuChannel) - 已完整实现

**计划中的渠道**：
- ⏳ Telegram
- ⏳ Discord
- ⏳ Slack

> **开发者注意**：如果你想贡献新渠道实现，请参考 `packages/belldandy-channels/src/types.ts` 中的 `Channel` 接口定义。



## 10. 语音交互 (Voice Interaction)

### 10.1 语音输入 (STT)

Belldandy 支持双向语音交互：你可以直接对它说话，它也会用语音回复你。

#### 10.1.1 网页端 (WebChat)

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

#### 10.1.2 飞书端 (Feishu)

在飞书手机 App 或桌面端，你可以像给朋友发微信语音一样给 Belldandy 发消息：

1.  按住说话，发送语音条。
2.  Belldandy 会自动识别语音内容（转写文字回显在日志中）。
3.  它会以文字（或语音，如果开启了 TTS）回复你。

> **注意**：飞书语音识别依赖 `stt-transcribe` 能力，请确保服务端已配置有效的 `BELLDANDY_STT_PROVIDER`。


### 10.2 语音输出 (TTS)

让 Belldandy 开口说话！支持免费且高质量的 Edge TTS（微软晓晓/云希）。

#### 10.2.1 快速开启/关闭

无需配置复杂文件，直接在对话中对 Agent 说：

*   **开启语音**：对它说 "开启语音模式" 或 "我想听你说话"。
    *   Agent 会自动进入 TTS 模式，每条回复都会附带语音播放器。
*   **关闭语音**：对它说 "关闭语音" 或 "太吵了"。
    *   Agent 会立即停止生成音频。
*   **或是在.env文件中启用语音模式**：服务端自动将 Agent 回复转为语音，true/false，默认 false
    *   `BELLDANDY_TTS_ENABLED=false`

> **原理**：Agent 会在你的工作区目录创建/删除一个名为 `TTS_ENABLED` 的信号文件。

#### 10.2.2 进阶配置

默认使用 **Edge TTS**（免费）。如果你想使用 **OpenAI TTS**（付费但声线不同），可以通过调用工具时指定参数，或者让 Agent 帮你设置。

**支持的声音（Edge TTS - 推荐）**：
*   `zh-CN-XiaoxiaoNeural` (晓晓 - 温暖女声)
*   `zh-CN-YunxiNeural` (云希 - 干练男声)
*   `en-US-AriaNeural` (Aria - 通用女声)

---
## 11. 视觉感知 (Loopback Vision)

让 Belldandy 拥有“眼睛”，可以看到你通过宿主机 webcam 看到的画面。

### 11.1 原理简介 (Loopback Vision)

这是一种“回环视觉”技术：
1.  Agent 指挥浏览器打开一个镜像页面（Mirror Page）。
2.  该页面调用你的本地摄像头显示画面。
3.  Agent 对该页面进行截图，从而“看到”了画面。

### 11.2 如何使用

**前提条件**：必须先完成 **8. 浏览器自动化** 的连接步骤（安装插件并连接）。

#### 方法 A：使用内置技能 (推荐)

直接对 Belldandy 说：

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

## 12. 高级配置

### 12.1 工具权限与策略

Belldandy 的工具系统默认处于 **Safe Mode**，并可通过策略文件进行精细化控制：

- **文件读写范围**：默认只允许工作区内读写，敏感文件（如 `.env` / `SOUL.md`）受保护。
- **`file_write` 能力**：支持 `overwrite/append/replace/insert`，可按行号或正则替换；默认自动创建目录；在非 Windows 下写入 `.sh` 会自动 `chmod +x`。
- **多工作区**：可通过 `BELLDANDY_EXTRA_WORKSPACE_ROOTS` 追加可读写根目录，实现跨项目协作。
- **系统命令**：白名单执行 + 非交互参数注入 + 快速/构建命令分级超时（5s/300s）+ 超时强制 kill；危险参数（如 `rm -r/-rf`、`del /s /q`）会被拦截。
- **策略覆盖**：通过 `BELLDANDY_TOOLS_POLICY_FILE` 指定 JSON 策略文件，覆盖默认策略（示例见 `.env.example`）。**未设置该变量时，`extraSafelist` 不生效。**

可选配置示例（添加到 `.env.local`或`.env`）：

```env
# 工具策略文件（JSON）
BELLDANDY_TOOLS_POLICY_FILE=E:\project\belldandy\config\tools-policy.json

# 额外允许的工作区根目录（多项目协作）
BELLDANDY_EXTRA_WORKSPACE_ROOTS=E:\projects,D:\workspace
```

### 12.1.1 可视化工具管理 (Tool Settings)

除了通过环境变量和策略文件进行全局控制外，Belldandy 还提供了**可视化的工具管理面板**，允许你在运行时动态启用或禁用特定的工具、MCP 服务器或插件。

1.  在 WebChat 界面顶部，点击 **工具设置图标** (🛠️)。
2.  面板分为三类：
    -   **Builtin Tools**：内置工具（如 `web_fetch`, `file_read`）。
    -   **MCP Servers**：已连接的 MCP 服务（如 `filesystem`, `github`）。
    -   **Plugins**：已加载的插件。
3.  点击开关即可实时启用/禁用。修改后的状态会自动持久化保存，重启后依然生效。

> **应用场景**：当你希望暂时禁止 Agent 联网，或者在调试某个 MCP 服务时通过禁用其他服务来排除干扰。

### 12.2 模型容灾配置 (Model Failover)

当主模型因限流 (429)、余额不足 (402)、服务器故障 (5xx) 或超时等问题不可用时，Belldandy 可以 **自动切换到备用模型**，保证不中断服务。

**快速开始**：在 `~/.belldandy/` 目录下创建 `models.json` 文件：

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
| `baseUrl` | 是 | API 服务地址（OpenAI 协议兼容） |
| `apiKey` | 是 | 该服务的 API Key |
| `model` | 是 | 模型名称（如 `deepseek-chat`、`gpt-4o`） |

**环境变量**：

```env
# 自定义配置文件路径（默认 ~/.belldandy/models.json）
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

> **💡 提示**：不创建 `models.json` 时，Belldandy 的行为与之前完全一致（仅使用 `.env` 中的单一配置），完全向后兼容。

### 12.3 对话压缩 (Context Compaction)

当你与 Belldandy 进行长时间对话或让它执行复杂的自动化任务时，对话历史会不断增长，最终可能超出模型的上下文窗口限制。**对话压缩**功能会自动将旧消息摘要化，在保留关键信息的同时大幅减少 token 消耗。

#### 工作原理

Belldandy 采用**三层渐进式压缩**架构：

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
| 主模型是 Anthropic，想用 OpenAI 做摘要 | 设置 `COMPACTION_MODEL`、`COMPACTION_BASE_URL`、`COMPACTION_API_KEY` 三项 |
| 不想使用压缩 | `BELLDANDY_COMPACTION_ENABLED=false` |

#### 压缩状态持久化

每个会话的压缩状态（滚动摘要、归档摘要等）会自动保存到 `~/.belldandy/sessions/{会话ID}.compaction.json`。这意味着即使 Belldandy 重启，之前的摘要也不会丢失。

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

### 12.4 服务重启 (Service Restart)

Belldandy 提供了 `service_restart` 工具，让 Agent 能够主动重启 Gateway 服务。这在 Agent 修改了配置文件后特别有用——它可以自主完成"改配置 → 重启生效"的完整流程。

**使用方法**：直接在对话中告诉 Belldandy：

| 你说的话 | Belldandy 做的事 |
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

### 12.5 日志系统 (Logs)

Belldandy 的运行日志保存在 `~/.belldandy/logs/` 目录，支持：

- **双输出**：同时输出到控制台和文件
- **按日期分文件**：如 `gateway-2025-02-05.log`
- **按大小轮转**：单文件超过设定大小（默认 10MB）自动切分
- **自动清理**：超过保留天数（默认 7 天）的日志自动删除
- **Agent 可读**：Agent 可通过 `log_read`、`log_search` 工具回溯日志，理解任务执行情况

如需调整日志行为，可在 `.env.local` 中配置 `BELLDANDY_LOG_*` 相关变量（参见 3.2 进阶配置）。


## 13. 浏览器自动化

让 Belldandy 控制你的浏览器打开网页、截图或提取内容的黑科技功能！

### 13.1 启用方式

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
cd Belldandy
node packages/belldandy-browser/dist/bin/relay.js
```

### 13.2 安装浏览器扩展

1.  打开 Chrome 浏览器，进入 **扩展管理页面** (`chrome://extensions`)。
2.  开启右上角的 **"开发者模式" (Developer mode)**。
3.  点击 **"加载已解压的扩展程序" (Load unpacked)**。
4.  选择项目目录下的 `apps/browser-extension` 文件夹。

### 13.3 连接使用

1.  在浏览器右上角找到 **Belldandy Relay** 的图标（一个紫色的小幽灵👻或 B 图标）。
2.  点击它，图标应该会变色或显示 "Connected"，表示已连接到 Relay Server。
3.  现在的 Agent 就可以通过 `browser_open` 等工具控制你的当前浏览器了！

## 14. 方法论系统 (Methodology System)

这是 Belldandy 的"程序性记忆"核心。它允许 Agent 将一次性的经验沉淀为标准操作流程 (SOP)，并在后续任务中自动调用。

### 14.1 核心理念
- **查阅优先**: 在执行复杂任务前，Agent 会先检查是否有现成的方法 (`method_list/search`).
- **经验沉淀**: 任务成功或踩坑后，Agent 会将经验记录为 Markdown 文件 (`method_create`).
- **自我进化**: 随着使用时间的增加，`methods/` 目录下的 SOP 越多，Agent 越聪明。

### 14.2 常用工具
- `method_list`: 列出所有已沉淀的方法。
- `method_search`: 搜索特定关键词的方法。
- `method_read`: 读取方法的具体步骤。
- `method_create`: 创建或更新方法文档。

### 14.3 给用户的建议
- 您可以在对话中显式要求 Belldandy："把刚才的操作总结为一个方法保存下来。"
- 您也可以手动在 `~/.belldandy/methods/` 目录下编写 `.md` 文件，教 Belldandy 做事。

## 15. 画布工作区 (Canvas)

画布工作区是一个可视化的无限画布，让你用节点和连线来组织想法、拆解任务、关联知识。Agent 也能直接在画布上操作——创建节点、建立连线、自动布局。

### 15.1 打开画布

在网页界面左侧边栏，点击 **「画布工作区」** 按钮，进入画布列表页。

- 点击 **「+ 新建画布」** 创建一个空画布
- 点击已有画布条目打开它

画布与聊天、编辑器之间可以自由切换（三态切换），点击工具栏右侧的 **✕** 按钮返回聊天。

### 15.2 节点类型

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

### 15.3 基本操作

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
- 数据存储在 `~/.belldandy/canvas/<boardId>.json`

### 15.4 节点关联与双击跳转

带有资源关联（ref）的节点会在标题栏显示 🔗 图标。双击节点的行为取决于关联类型：

| 关联类型 | 双击行为 |
|----------|----------|
| method | 跳转到编辑器，打开对应方法论文档 |
| memory | 跳转到编辑器，打开对应记忆笔记 |
| session | 切换到聊天模式，加载对应会话 |
| url | 在新窗口打开链接 |
| file | 跳转到编辑器，打开对应文件 |
| 无关联 | 弹出编辑对话框，可修改标题和内容 |

### 15.5 画布上下文注入

当你在画布视图中发送消息时，系统会自动将当前画布的摘要（节点列表 + 连线关系）注入到消息中，让 Agent 了解你正在看的画布内容。

你也可以点击工具栏的 **「分析画布」** 按钮，系统会切换到聊天模式并在输入框中预填画布摘要，方便你直接让 Agent 分析。

### 15.6 ReAct 可视化

点击工具栏的 **「ReAct」** 按钮开启 ReAct 可视化模式。开启后，Agent 的工具调用过程会实时映射为画布上的节点链：

1. Agent 调用工具时 → 画布出现黄色临时节点（带 pulse 动画），显示工具名和参数
2. 工具返回结果后 → 节点变为绿色（成功）或红色（失败），内容更新为结果摘要
3. Agent 最终回复时 → 出现紫色总结节点
4. 多个工具调用之间自动用虚线连接，形成调用链

**管理临时节点**：
- 右键节点选择 **「固定」** 可以将有价值的临时节点保留
- 关闭 ReAct 模式时，未固定的临时节点会自动清除
- 已固定的节点会保留在画布上

### 15.7 Agent 操作画布

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

## 16. MCP 支持 (Model Context Protocol)

MCP 是 Anthropic 提出的标准化协议，让 AI 助手能够连接外部数据源和工具。

### 16.1 启用 MCP

在 `.env.local` 中添加：

```env
# 启用 MCP 支持（需要同时启用工具系统）
BELLDANDY_TOOLS_ENABLED=true
BELLDANDY_MCP_ENABLED=true
```

### 16.2 配置 MCP 服务器

在 `~/.belldandy/mcp.json` 中定义要连接的 MCP 服务器。Belldandy 支持两种配置格式，可任选其一。

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

#### 格式二：Belldandy 原生格式

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

### 16.3 传输类型

| 类型 | 说明 | 适用场景 |
|------|------|----------|
| `stdio` | 通过子进程的 stdin/stdout 通信 | 本地 MCP 服务器（推荐） |
| `sse` | 通过 HTTP Server-Sent Events 通信 | 远程 MCP 服务器 |

### 16.4 常用 MCP 服务器

| 服务器 | 命令 | 功能 |
|--------|------|------|
| `@modelcontextprotocol/server-filesystem` | `npx -y @modelcontextprotocol/server-filesystem /path` | 文件系统访问 |
| `@modelcontextprotocol/server-github` | `npx -y @modelcontextprotocol/server-github` | GitHub API |
| `@modelcontextprotocol/server-sqlite` | `npx -y @modelcontextprotocol/server-sqlite` | SQLite 数据库 |
| `@modelcontextprotocol/server-puppeteer` | `npx -y @modelcontextprotocol/server-puppeteer` | 浏览器自动化 |

### 16.5 工具命名

MCP 工具在 Belldandy 中的命名格式为：`mcp_{serverId}_{toolName}`

例如：
- `mcp_filesystem_read_file` - 文件系统服务器的读取文件工具
- `mcp_github_create_issue` - GitHub 服务器的创建 Issue 工具

> **💡 提示**：启动 Gateway 后，日志会显示已连接的 MCP 服务器和注册的工具数量。


---

**第五部分：开发者扩展**

## 17. 插件与钩子系统 (Plugin & Hook System)

Belldandy 提供了完整的插件系统，允许开发者扩展 Agent 的能力。

### 17.1 钩子系统

钩子是插件干预 Agent 行为的核心机制。Belldandy 支持 **13 种生命周期钩子**：

| 类别 | 钩子名称 | 用途 |
|------|---------|------|
| **Agent** | `before_agent_start` | 在 Agent 开始前注入系统提示词或上下文 |
| **Agent** | `agent_end` | Agent 完成后分析对话、记录日志 |
| **消息** | `message_received` | 收到消息时触发（日志/触发器） |
| **消息** | `message_sending` | 发送前修改或取消消息 |
| **消息** | `message_sent` | 消息发送后触发（日志） |
| **工具** | `before_tool_call` | 工具调用前修改参数或阻止执行 |
| **工具** | `after_tool_call` | 工具调用后结果审计 |
| **会话** | `session_start` / `session_end` | 会话开始/结束时触发 |
| **网关** | `gateway_start` / `gateway_stop` | 服务启动/停止时触发 |

### 17.2 开发插件

插件是一个导出 `activate(context)` 方法的 JS/MJS 文件：

```javascript
// my-plugin.mjs
export const id = "my-plugin";
export const name = "My Plugin";

export function activate(context) {
  // 注册钩子
  context.hooks.register({
    source: id,
    hookName: "before_tool_call",
    priority: 10, // 优先级越高越先执行
    handler: (event, ctx) => {
      console.log(`工具调用: ${event.toolName}`);
      // 返回 { block: true } 可阻止执行
      // 返回 { params: {...} } 可修改参数
    }
  });

  // 注册新工具
  context.tools.register({
    name: "my_tool",
    description: "我的自定义工具",
    execute: async (params) => {
      return { success: true, output: "Hello from my tool!" };
    }
  });
}
```

### 17.3 加载插件

将插件文件放到 `~/.belldandy/plugins/` 目录下，Gateway 启动时会自动加载。

---

## 18. 技能系统 (Skills)

技能（Skills）是 Belldandy 的"经验库"——一套纯文本的操作指南，教 Agent **如何更好地使用已有工具完成特定任务**。

与工具（Tools）的区别：
- **工具**是"手和脚"——解决"能做什么"的问题（如读文件、搜索网页）
- **技能**是"经验和套路"——解决"怎么做更好"的问题（如如何写出规范的 commit、如何重构 TypeScript 代码）

技能的本质是 **prompt 注入**：符合条件的技能会被自动注入到 Agent 的系统提示词中，让 Agent "知道"自己有哪些专业能力可用。

### 18.1 技能目录

技能从三个位置加载（优先级递减）：

| 来源 | 路径 | 说明 |
|------|------|------|
| 用户技能 | `~/.belldandy/skills/` | 你自己创建的技能，优先级最高 |
| 插件技能 | 由插件声明 | 插件附带的技能 |
| 内置技能 | 随项目发布 | Belldandy 自带的通用技能 |

当多个来源存在同名技能时，用户技能覆盖插件技能，插件技能覆盖内置技能。

### 18.2 创建自定义技能

每个技能是 `~/.belldandy/skills/` 下的一个**目录**，包含一个 `SKILL.md` 文件。

#### 目录结构示例

```
~/.belldandy/skills/
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

### 18.3 准入条件 (Eligibility)

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

### 18.4 Agent 中使用技能

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

### 18.5 完整示例

创建一个"代码审查"技能：

```bash
mkdir -p ~/.belldandy/skills/code-review
```

编辑 `~/.belldandy/skills/code-review/SKILL.md`：

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

重启 Belldandy 后，这个技能会自动加载。因为 `priority: high`，它会直接注入到 Agent 的系统提示词中，Agent 在审查代码时会自动遵循这套 SOP。

---


---

**附录**

## 19. 常见问题 (FAQ)

**Q: 启动时提示 `EADDRINUSE` 端口被占用？**
A: 说明端口 28889 已经被占用了。你可以修改 `.env.local` 中的 `BELLDANDY_PORT=28890` 换一个端口。

**Q: 如何让从外网访问？**
A: Belldandy 默认监听 `0.0.0.0`，在局域网内可以直接通过 IP 访问（需要配对）。若要公网访问，建议使用 Cloudflare Tunnel 或 Frp 等内网穿透工具，并务必开启 `BELLDANDY_AUTH_MODE=token` 增加安全性。

**Q: 记忆检索有时候不准？**
A: 记忆系统使用混合检索（关键词 BM25 + 向量语义）+ 规则重排序。请确保 `.env.local` 中正确配置了 Embedding 模型且 `BELLDANDY_EMBEDDING_ENABLED=true`。

**提升检索精准度的方法：**
1. **使用过滤参数**：在对话中让 Agent 使用过滤条件缩小范围，例如"搜索最近一周飞书上关于 XX 的记忆"，Agent 会自动使用 `channel`、`date_from` 等过滤条件。
2. **启用 L0 摘要层**：设置 `BELLDANDY_MEMORY_SUMMARY_ENABLED=true`，让 Agent 先浏览摘要快速定位相关内容。
3. **启用深度检索**：设置 `BELLDANDY_MEMORY_DEEP_RETRIEVAL=true`，找到相关段落后自动拉取完整上下文。
4. **启用会话记忆提取**：设置 `BELLDANDY_MEMORY_EVOLUTION_ENABLED=true`，让系统自动从对话中提取关键信息并去重。

详见 [5.2 长期记忆 (Memory)](#52-长期记忆-memory) 章节。

**Q: Windows 下可以执行 CMD 命令吗？**
A: 可以。Belldandy 已对 Windows 原生命令 (`copy`, `move`, `del`, `ipconfig` 等) 进行了特别支持。注意：为了安全起见，`del` 命令禁止使用 `/s` (递归) 或 `/q` (静默) 参数。

---
*Belldandy - Your Personal AI Assistant*
