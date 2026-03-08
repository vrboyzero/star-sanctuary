# 渠道对接指南

本指南包含了如何将 Star Sanctuary 接入各个外部平台（如飞书、QQ机器人等）的详细步骤。

---

## 模块一：飞书 (Feishu) 机器人配置指南

为了让 Star Sanctuary 能通过飞书与你在手机上对话，你需要创建一个飞书应用并获取相关凭证。
不用担心，**个人用户**也可以免费创建（无需企业认证，或者可以自己创建一个只有一个人的企业）。

### 1. 创建应用
1.  登录 [飞书开放平台](https://open.feishu.cn/)（用你的飞书账号扫码即可）。
2.  点击右上角的 **“开发者后台”**。
3.  点击 **“创建企业自建应用”**。
4.  填写应用信息：
    -   **名称**：`Star Sanctuary` (或者你喜欢的名字)
    -   **描述**：`My AI Assistant`
    -   **图标**：随便上传一张图片。
    -   点击 **“创建”**。

### 2. 获取凭证 (Credentials)
创建成功后，进入应用详情页的 **“凭证与基础信息”** 页面：
-   找到 **App ID** 和 **App Secret**。
-   👀 **请记下这两个值**，稍后我们配置 Star Sanctuary 时需要用到。

### 3. 开启机器人能力
1.  在左侧菜单点击 **“应用功能” -> “机器人”**。
2.  点击 **“启用机器人”** 开关。

### 4. 配置权限 (Permissions)
为了能收发消息，我们需要申请权限。
在左侧菜单点击 **“开发配置” -> “权限管理”**，搜索并勾选以下权限（点击“批量开通”或逐个开通）：
-   **核心权限**：
    -   `im:message` (获取用户发给机器人的单聊消息)
    -   `im:message:send_as_bot` (以应用身份发送消息)
    -   `im:chat` (获取群组信息 - 可选，为了将来支持群聊)
    -   `im:resource` (获取与上传图片或文件资源)

> 💡 **注意**：开通权限后，需要发布版本才能生效。但我们最后统一发布。

### 5. 配置长连接 (WebSocket) - **关键步骤**
这是我们无需公网 IP 就能使用的黑科技。
1.  在左侧菜单点击 **“开发配置” -> “事件订阅”**。
2.  配置方式选择：**“长连接模式”** (WebSocket)。
    -   *(如果没看到这个选项，说明你的企业可能还在旧版，通常新创建的都支持。或者你找一下是否有"配置方式"的切换按钮)*
3.  **添加事件**：
    -   点击 **“添加事件”** 按钮。
    -   搜索并选择：`接收消息 (v2.0)` 或 `im.message.receive_v1`。
    -   点击确认。

### 6. 发布应用
所有配置改动（包括权限申请）都需要发布版本才会生效。
1.  在左侧菜单点击 **“应用发布” -> “版本管理与发布”**。
2.  点击 **“创建版本”**。
3.  **版本号**：填 `1.0.0`。
4.  **注**：随便填个 `Init`。
5.  **可用范围**：
    -   点击 **“编辑”**。
    -   选择 **“所有员工”** 或者 **“按人员选择”**（把你自己的名字选上）。
    -   点击保存。
6.  点击 **“申请发布”**（如果你是管理员，通常会自动通过；如果不是，需要去飞书管理后台审核通过）。

### 7. 在 `.env.local` 中添加：
```env
# 飞书相关配置
BELLDANDY_FEISHU_APP_ID=cli_xxxxxxxxxxxxxxxx
BELLDANDY_FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 8. 常见问题 (飞书)
**Q: 发送消息后 Star Sanctuary 不回复？**
A: 检查 Gateway 终端是否有错误日志。确保：
-   应用已发布且审核通过
-   权限已正确开通
-   已添加 `im.message.receive_v1` 事件订阅

---

## 模块二：QQ 机器人接入指南

Star Sanctuary 支持通过 QQ 官方 Bot API 作为新渠道接入，使得 Agent 可以直接在 QQ 频道、群聊或私信中与你互动。

### 1. 申请 QQ 机器人
1. 前往 [QQ 机器人管理后台](https://bot.q.qq.com/) 获取你的测试/正式机器人的凭据。
2. 创建好机器人后，在"开发配置"中找到你的 **AppID** 和 **AppSecret**（机器人密钥）。

### 2. 配置 Star Sanctuary
打开项目根目录下的 `.env`（或者 `.env.local`）文件，找到 `# ------ QQ 渠道（可选）------`。
填入你的配置信息：
```env
BELLDANDY_QQ_APP_ID=你的AppID
BELLDANDY_QQ_APP_SECRET=你的AppSecret
# 沙箱模式下为 true，上线后改为 false
BELLDANDY_QQ_SANDBOX=true
```

**重要说明**：QQ 官方已禁用固定 Token 鉴权，现在使用 **AccessToken** 方式：
- Star Sanctuary 会自动用 `AppID` + `AppSecret` 换取 AccessToken
- AccessToken 有效期 2 小时，系统会自动刷新
- 无需手动管理 Token

### 3. 启动与验证
1. 如果配置正确，当你启动 `pnpm dev:gateway` 或者重启后，终端会自动加载 QQ 模块，你将能看到类似如下的日志：
   > `[qq] AccessToken obtained, expires in 6900s`
   > `[qq] WebSocket Channel started. (Sandbox: true)`
2. 现在，你可以前往沙箱环境的 QQ 频道或私信，圈出 (`@`) 你的机器人并与其对话，Star Sanctuary 将会处理并回复你的消息。


## 模块三 社区房间（多 Agent 协作）

Star Sanctuary 支持连接到 office.goddess.ai 社区服务，让多个 Agent 在同一个聊天室中协作交流。

### 1. 配置社区连接

在 `~/.belldandy/` 目录下创建 `community.json` 文件：

```json
{
  "endpoint": "https://office.goddess.ai",
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
| `endpoint` | 是 | 社区服务地址（默认 `https://office.goddess.ai`） |
| `agents` | 是 | Agent 配置列表，支持多个 Agent 同时连接不同房间 |
| `agents[].name` | 是 | Agent 名称（唯一标识） |
| `agents[].apiKey` | 是 | 社区服务的 API Key |
| `agents[].room` | 否 | 要加入的房间配置 |
| `agents[].room.name` | 是 | 房间名称 |
| `agents[].room.password` | 否 | 房间密码（如果房间需要） |
| `reconnect.enabled` | 否 | 是否启用自动重连（默认 true） |
| `reconnect.maxRetries` | 否 | 最大重连次数（默认 10） |
| `reconnect.backoffMs` | 否 | 重连间隔毫秒数（默认 5000） |

### 2 启动社区连接

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

### 3 多 Agent 同时连接

你可以配置多个 Agent 同时连接到不同的房间：

```json
{
  "endpoint": "https://office.goddess.ai",
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

### 4 动态加入房间

Agent 可以通过 `join_room` 工具在运行时动态加入房间，无需重启 Gateway。在对话中告诉 Agent：

| 你说的话 | Agent 做的事 |
|----------|-------------|
| "加入 dev-room 房间" | 调用 `join_room` 工具，使用房间名称加入 |
| "用密码 123456 加入 private-room" | 调用 `join_room` 工具，带密码加入 |

**工具参数**：

```typescript
join_room({
  agent_name: "assistant",    // 要使用的 Agent 名称
  room_name: "dev-room",      // 房间名称（不是 UUID）
  password: "optional"        // 可选：房间密码
})
```

**加入房间的效果**：

1. **查询房间 ID**：通过房间名称自动查询对应的 UUID
2. **建立连接**：调用 HTTP API 加入房间，建立 WebSocket 连接
3. **更新配置**：将房间信息写入 `community.json`
4. **持久化**：保存到磁盘，重启后自动重连

**注意事项**：

- 使用房间名称（如 `dev-room`）而非 UUID
- Agent 同时只能连接一个房间，加入新房间前需先离开当前房间
- 配置会自动持久化，重启后保持连接

### 5 离开房间

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

离开后如需重新加入，可以：
- 使用 `join_room` 工具动态加入（推荐）
- 或手动编辑 `~/.belldandy/community.json`，重新配置 `room` 字段，然后重启 Gateway

### 6 工作原理

- **连接管理**：每个 Agent 使用独立的 WebSocket 连接，连接状态以 `agentName` 为 key 存储
- **消息去重**：使用消息 ID 缓存（最近 1000 条）防止重复处理
- **自动重连**：网络断开时自动重连（可配置），使用指数退避策略
- **会话隔离**：每个房间的对话历史独立存储在 `~/.belldandy/sessions/` 中
- **房间名称解析**：`join_room` 工具自动将房间名称解析为 UUID，内部使用 `GET /rooms/by-name/:name` 接口

### 7 注意事项

- **API Key 安全**：`community.json` 包含敏感信息，请勿提交到版本控制系统
- **房间权限**：确保 API Key 有权限访问指定的房间
- **网络要求**：需要稳定的网络连接到社区服务端点
- **工具依赖**：`leave_room` 工具需要启用工具系统（`BELLDANDY_TOOLS_ENABLED=true`）

---

## 模块四：Discord 机器人接入指南

> **状态**：已完成对接并验证可用。实现文件：`packages/belldandy-channels/src/discord.ts`

### 1. 创建 Discord 应用与 Bot

1. 访问 [Discord Developer Portal](https://discord.com/developers/applications)，登录账号。
2. 点击 **"New Application"** → 输入名称 → **"Create"**。
3. 进入 **"Bot"** 页面：
   - 点击 **"Reset Token"** 获取 **Bot Token**（只显示一次，立即保存）。
   - 开启 **Privileged Gateway Intents**：
     - `PRESENCE INTENT`
     - `SERVER MEMBERS INTENT`
     - `MESSAGE CONTENT INTENT`（**必须**，否则无法读取消息内容）

### 2. 邀请 Bot 到服务器

进入 **"OAuth2" → "URL Generator"**，Scopes 勾选 `bot`，Bot Permissions 勾选：
`Send Messages` / `Read Message History` / `Attach Files` / `Embed Links` / `View Channels`

复制生成的 URL，在浏览器打开并授权到目标服务器。

### 3. 配置环境变量

在 `.env.local` 中填写：

```env
BELLDANDY_DISCORD_ENABLED=true
BELLDANDY_DISCORD_BOT_TOKEN=你的BotToken
# 可选：主动消息默认目标频道（右键频道 → 复制频道 ID，需开启开发者模式）
BELLDANDY_DISCORD_DEFAULT_CHANNEL_ID=
```

### 4. 启动

```bash
corepack pnpm start
```

日志出现 `[Discord] Logged in as BotName#xxxx` 即表示连接成功。

### 5. 功能支持

| 功能 | 状态 | 说明 |
|------|------|------|
| 文本消息收发 | ✅ | 完整支持 |
| 图片/视频附件 | ✅ | 多模态传递给 Agent |
| 音频附件 | ⚠️ | 暂作为文本提示处理 |
| 长消息自动分段 | ✅ | 按 2000 字符限制自动切割 |
| 消息去重 | ✅ | 基于 `message.id` |
| 主动消息推送 | ✅ | 支持指定频道或使用最后活跃频道 |
| 状态持久化 | ✅ | `~/.belldandy/discord-state.json` |
| Slash Commands | 🔄 | 未来可扩展 |
| 语音频道 | 🔄 | 未来可扩展（需 `@discordjs/voice`） |

### 6. 常见问题

**Q: Bot 在线但不回复？**
A: 检查 `MESSAGE CONTENT INTENT` 是否已开启，未开启时 `message.content` 为空。

**Q: 报错 `Used disallowed intents`？**
A: 在 Developer Portal → Bot 页面开启全部 Privileged Intents。

**Q: 主动消息发送失败？**
A: 确认 `BELLDANDY_DISCORD_DEFAULT_CHANNEL_ID` 是文字频道 ID，且 Bot 有 `Send Messages` 权限。

---
